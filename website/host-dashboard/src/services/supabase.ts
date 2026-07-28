import {
  createClient,
  type AuthChangeEvent,
  type Session,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { z } from "zod";

import {
  PRODUCTION_APP_URL,
  REMOTE_REQUEST_TIMEOUT_MS,
} from "../domain/constants";
import { normaliseSessionCode } from "../domain/game-config";
import type {
  AuthRecord,
  GameSession,
  SupabaseSessionRecord,
} from "../domain/types";

export interface SupabasePublicConfig {
  supabaseUrl: string;
  supabasePublishableKey: string;
  appUrl?: string;
  authRedirectUrl?: string;
}

export interface PublicSessionIdentity {
  clientId: string;
  displayName: string;
}

const configSchema = z.object({
  supabaseUrl: z.string().url(),
  supabasePublishableKey: z.string().min(1),
  appUrl: z.string().url().optional(),
  authRedirectUrl: z.string().url().optional(),
});

const recordSchema = z
  .object({
    id: z.string().uuid(),
    code: z.string(),
    session: z.unknown(),
    revision: z.coerce.number(),
    created_at: z.string().optional(),
    updated_at: z.string().optional(),
  })
  .passthrough();

let singletonClient: SupabaseClient | null = null;
let singletonSignature = "";

export function normaliseAppUrl(value: unknown): string {
  try {
    const url = new URL(String(value ?? ""), PRODUCTION_APP_URL);
    return url.href.endsWith("/") ? url.href : `${url.href}/`;
  } catch {
    return PRODUCTION_APP_URL;
  }
}

export function getSupabaseClient(
  rawConfig: SupabasePublicConfig,
): SupabaseClient {
  const config = configSchema.parse(rawConfig);
  const signature = `${config.supabaseUrl}\0${config.supabasePublishableKey}`;
  if (singletonClient && singletonSignature === signature) {
    return singletonClient;
  }
  singletonClient = createClient(
    config.supabaseUrl,
    config.supabasePublishableKey,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    },
  );
  singletonSignature = signature;
  return singletonClient;
}

export function resetSupabaseClientForTests(): void {
  singletonClient = null;
  singletonSignature = "";
}

async function withTimeout<T>(
  promise: PromiseLike<T>,
  timeoutMessage: string,
  timeoutMs = REMOTE_REQUEST_TIMEOUT_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
  });
  try {
    return await Promise.race([Promise.resolve(promise), deadline]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function unwrapRecord(value: unknown): SupabaseSessionRecord {
  const candidate = Array.isArray(value) ? value[0] : value;
  return recordSchema.parse(candidate) as SupabaseSessionRecord;
}

export class SupabaseSessionRepository {
  constructor(private readonly client: SupabaseClient) {}

  async create(
    code: string,
    identity: PublicSessionIdentity,
    session: GameSession,
  ): Promise<SupabaseSessionRecord> {
    const response = await withTimeout(
      this.client.rpc("create_game_session_public", {
        p_code: normaliseSessionCode(code),
        p_client_id: identity.clientId,
        p_display_name: identity.displayName || "Host",
        p_session: session,
      }),
      "Live table save timed out.",
    );
    if (response.error) throw response.error;
    return unwrapRecord(response.data);
  }

  async update(
    sessionId: string,
    identity: PublicSessionIdentity,
    session: GameSession,
    revision: number,
  ): Promise<SupabaseSessionRecord> {
    const response = await withTimeout(
      this.client.rpc("update_game_session_public", {
        p_session_id: sessionId,
        p_client_id: identity.clientId,
        p_session: session,
        p_revision: revision,
      }),
      "Live table save timed out.",
    );
    if (response.error) throw response.error;
    return unwrapRecord(response.data);
  }

  async get(
    sessionId: string,
    clientId: string,
  ): Promise<SupabaseSessionRecord> {
    const response = await withTimeout(
      this.client.rpc("get_game_session_public", {
        p_session_id: sessionId,
        p_client_id: clientId,
      }),
      "Live table refresh timed out.",
    );
    if (response.error) throw response.error;
    return unwrapRecord(response.data);
  }

  async join(
    code: string,
    identity: PublicSessionIdentity,
  ): Promise<SupabaseSessionRecord> {
    const response = await withTimeout(
      this.client.rpc("join_game_session_public", {
        p_code: normaliseSessionCode(code),
        p_client_id: identity.clientId,
        p_display_name: identity.displayName || "Player",
      }),
      "Live table join timed out.",
    );
    if (response.error) throw response.error;
    return unwrapRecord(response.data);
  }
}

export class SupabaseAuthService {
  constructor(
    private readonly client: SupabaseClient,
    private readonly redirectUrl: string,
  ) {}

  guest(name: string, clientId: string): AuthRecord {
    const displayName = name.trim();
    if (!displayName) throw new Error("Enter a host name.");
    return {
      mode: "guest",
      id: clientId,
      name: displayName,
      email: null,
    };
  }

  async signUp(
    name: string,
    email: string,
    password: string,
  ): Promise<AuthRecord> {
    if (!name.trim() || password.length < 6) {
      throw new Error("Use a name and a password of at least 6 characters.");
    }
    const { data, error } = await this.client.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        data: { name: name.trim() },
        emailRedirectTo: normaliseAppUrl(this.redirectUrl),
      },
    });
    if (error) throw error;
    if (!data.session && data.user) {
      throw new Error(
        "Email confirmation is required before this account can be used.",
      );
    }
    if (!data.user) throw new Error("Supabase did not return an account.");
    return {
      mode: "account",
      id: data.user.id,
      name: name.trim(),
      email: email.trim().toLowerCase(),
    };
  }

  async signIn(email: string, password: string): Promise<AuthRecord> {
    const normalisedEmail = email.trim().toLowerCase();
    if (!normalisedEmail || !password) {
      throw new Error("Email and password are required.");
    }
    const { data, error } = await this.client.auth.signInWithPassword({
      email: normalisedEmail,
      password,
    });
    if (error) throw error;
    return {
      mode: "account",
      id: data.user.id,
      name:
        typeof data.user.user_metadata?.name === "string"
          ? data.user.user_metadata.name
          : normalisedEmail,
      email: normalisedEmail,
    };
  }

  async signOut(): Promise<void> {
    const { error } = await this.client.auth.signOut();
    if (error) throw error;
  }

  onAuthStateChange(
    callback: (event: AuthChangeEvent, session: Session | null) => void,
  ): () => void {
    const { data } = this.client.auth.onAuthStateChange(callback);
    return () => data.subscription.unsubscribe();
  }
}
