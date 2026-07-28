import { z } from "zod";

import { STORAGE_KEYS } from "../domain/constants";
import type {
  AuthRecord,
  GameSession,
  StoredBackendState,
  StoredUiPreferences,
} from "../domain/types";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export interface StorageHydration {
  ok: boolean;
  auth: AuthRecord | null;
  backend: StoredBackendState | null;
  session: unknown;
  ui: StoredUiPreferences;
  clientId: string | null;
  errors: string[];
}

export interface StorageWriteResult {
  ok: boolean;
  error?: Error;
}

const authSchema = z.object({
  mode: z.enum(["guest", "account"]),
  id: z.string().min(1),
  name: z.string(),
  email: z.string().nullable(),
});

const backendSchema = z.object({
  code: z.string(),
  provider: z.literal("supabase"),
  sessionId: z.string().nullable(),
  revision: z.coerce.number(),
  clientRole: z.enum(["host", "player"]).nullable(),
});

const uiSchema = z
  .object({
    theme: z.enum(["table", "classroom", "contrast"]).optional(),
    boardZoom: z.coerce.number().optional(),
    companionMode: z.enum(["host", "table", "player"]).optional(),
    reducedMotion: z.boolean().optional(),
    setupChecklistBySession: z
      .record(z.string(), z.record(z.string(), z.boolean()))
      .optional(),
  })
  .passthrough();

function parseJson(
  storage: StorageLike,
  key: string,
  errors: string[],
): unknown {
  const raw = storage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    errors.push(`${key} contains invalid JSON.`);
    return null;
  }
}

/**
 * Reads every legacy key before returning. It never writes or repairs storage;
 * callers may persist only after this function returns `ok: true`.
 */
export function hydrateStorage(storage: StorageLike): StorageHydration {
  const errors: string[] = [];
  let auth: AuthRecord | null = null;
  let backend: StoredBackendState | null = null;
  let ui: StoredUiPreferences = {};

  try {
    const authValue = parseJson(storage, STORAGE_KEYS.auth, errors);
    if (authValue !== null) {
      const parsed = authSchema.safeParse(authValue);
      if (parsed.success) auth = parsed.data;
      else errors.push(`${STORAGE_KEYS.auth} has an invalid auth envelope.`);
    }

    const backendValue = parseJson(storage, STORAGE_KEYS.backend, errors);
    if (backendValue !== null) {
      const parsed = backendSchema.safeParse(backendValue);
      if (parsed.success) backend = parsed.data;
      else {
        errors.push(`${STORAGE_KEYS.backend} has an invalid sync envelope.`);
      }
    }

    const uiValue = parseJson(storage, STORAGE_KEYS.ui, errors);
    if (uiValue !== null) {
      const parsed = uiSchema.safeParse(uiValue);
      if (parsed.success) ui = parsed.data;
      else errors.push(`${STORAGE_KEYS.ui} has invalid preferences.`);
    }

    const session = parseJson(storage, STORAGE_KEYS.session, errors);
    const clientValue = parseJson(storage, STORAGE_KEYS.client, errors);
    const clientId =
      typeof clientValue === "string" && clientValue ? clientValue : null;

    return {
      ok: errors.length === 0,
      auth,
      backend,
      session,
      ui,
      clientId,
      errors,
    };
  } catch (cause) {
    const error = cause instanceof Error ? cause.message : String(cause);
    return {
      ok: false,
      auth: null,
      backend: null,
      session: null,
      ui: {},
      clientId: null,
      errors: [...errors, `Storage could not be read: ${error}`],
    };
  }
}

export function writeJson(
  storage: StorageLike,
  key: string,
  value: unknown,
): StorageWriteResult {
  try {
    storage.setItem(key, JSON.stringify(value));
    return { ok: true };
  } catch (cause) {
    return {
      ok: false,
      error:
        cause instanceof Error ? cause : new Error(String(cause)),
    };
  }
}

export function persistAuth(
  storage: StorageLike,
  auth: AuthRecord | null,
): StorageWriteResult {
  return writeJson(storage, STORAGE_KEYS.auth, auth);
}

export function persistSession(
  storage: StorageLike,
  session: GameSession,
): StorageWriteResult {
  return writeJson(storage, STORAGE_KEYS.session, session);
}

export function persistBackendState(
  storage: StorageLike,
  backend: StoredBackendState | null,
): StorageWriteResult {
  return writeJson(storage, STORAGE_KEYS.backend, backend);
}

export function persistUiPreferences(
  storage: StorageLike,
  preferences: StoredUiPreferences,
): StorageWriteResult {
  return writeJson(storage, STORAGE_KEYS.ui, {
    theme: preferences.theme,
    boardZoom: preferences.boardZoom,
    companionMode: preferences.companionMode,
    reducedMotion: preferences.reducedMotion,
    setupChecklistBySession:
      preferences.setupChecklistBySession ?? {},
  });
}

export function createClientId(): string {
  const suffix =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `client-${suffix}`;
}

export function getOrCreateClientId(
  storage: StorageLike,
  hydratedClientId: string | null,
  options: { persist?: boolean } = {},
): string {
  if (hydratedClientId) return hydratedClientId;
  const clientId = createClientId();
  if (options.persist === false) return clientId;
  const stored = writeJson(storage, STORAGE_KEYS.client, clientId);
  if (!stored.ok) {
    throw stored.error ?? new Error("Client identity could not be retained.");
  }
  return clientId;
}
