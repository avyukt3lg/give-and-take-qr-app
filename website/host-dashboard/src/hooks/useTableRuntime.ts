import { useCallback, useEffect, useRef } from "react";
import { flushSync } from "react-dom";

import type { AuthSubmission } from "@/app/contracts";
import { PRODUCTION_APP_URL } from "@/domain/constants";
import { createSession } from "@/domain/session";
import type { AuthRecord } from "@/domain/types";
import {
  getOrCreateClientId,
  createClientId,
  getSupabaseClient,
  persistAuth,
  persistBackendState,
  persistSession,
  persistUiPreferences,
  SessionSyncController,
  SupabaseAuthService,
  SupabaseSessionRepository,
  type StorageHydration,
} from "@/services";
import {
  selectHostHasUnsyncedChanges,
  selectHostUnsyncedState,
  selectSessionReplacementGuard,
  type AppAction,
  type AppState,
  type HostUnsyncedState,
} from "@/state";

interface RuntimeRefs {
  authService: SupabaseAuthService;
  sync: SessionSyncController;
  clientId: string;
}

export type RuntimeFailureReason =
  | "backend-unavailable"
  | "not-authenticated"
  | "player"
  | "unsynced";

export interface RuntimeActionResult {
  ok: boolean;
  reason?: RuntimeFailureReason;
  requiresConfirmation?: boolean;
  message?: string;
}

export interface DiscardSessionOptions {
  /**
   * Confirms loss of a queued or failed host save. An active network write
   * remains non-discardable and returns `requiresConfirmation: false`.
   */
  discardUnsynced?: boolean;
}

export interface TableRuntime {
  submitAuth(input: AuthSubmission): Promise<void>;
  /** Leaves authentication and the current session together. */
  signOut(options?: DiscardSessionOptions): Promise<RuntimeActionResult>;
  /** Replaces only the host session; the authenticated identity is retained. */
  newSession(options?: DiscardSessionOptions): Promise<RuntimeActionResult>;
  /** Reconnects if needed, then pulls as player or flushes as host. */
  retrySync(): Promise<RuntimeActionResult>;
  /** Rebuilds the public backend client and is safe to call before auth. */
  reinitializeBackend(): Promise<RuntimeActionResult>;
  hasUnsyncedHostChanges: boolean;
  hostUnsyncedState: HostUnsyncedState;
}

function publicConfiguration() {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabasePublishableKey =
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error(
      "Shared table configuration is missing. Set the public Supabase repository variables.",
    );
  }
  const appUrl = import.meta.env.VITE_APP_URL || PRODUCTION_APP_URL;
  return { supabaseUrl, supabasePublishableKey, appUrl };
}

interface ViewTransitionCapableDocument {
  startViewTransition?: (update: () => void) => unknown;
}

function commitAuthenticatedSurface(
  dispatch: React.Dispatch<AppAction>,
  auth: AuthRecord,
  reducedMotion: boolean,
): void {
  const commit = () => {
    dispatch({ type: "AUTH_SET", auth });
    dispatch({ type: "AUTH_PENDING_SET", pending: false });
  };

  if (typeof document === "undefined" || typeof window === "undefined") {
    commit();
    return;
  }

  const startViewTransition = (document as unknown as ViewTransitionCapableDocument)
    .startViewTransition;
  const systemReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  if (!startViewTransition || reducedMotion || systemReducedMotion) {
    commit();
    return;
  }

  try {
    startViewTransition.call(document, () => {
      flushSync(commit);
    });
  } catch {
    commit();
  }
}

export function useTableRuntime(
  state: AppState,
  dispatch: React.Dispatch<AppAction>,
  hydration: StorageHydration,
  fixtureMode: boolean,
): TableRuntime {
  const stateRef = useRef(state);
  const runtimeRef = useRef<RuntimeRefs | null>(null);
  const clientIdRef = useRef(hydration.clientId);
  const activeRef = useRef(true);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    document.documentElement.dataset.theme = state.ui.theme;
    document.documentElement.dataset.motion = state.ui.reducedMotion
      ? "reduced"
      : "full";
    document.documentElement.style.colorScheme =
      state.ui.theme === "classroom" ? "light" : "dark";
  }, [state.ui.reducedMotion, state.ui.theme]);

  const reinitializeBackend = useCallback(
    async (): Promise<RuntimeActionResult> => {
      const current = stateRef.current;
      if (
        current.backend.saving ||
        runtimeRef.current?.sync.getStatus().saving
      ) {
        const message =
          "Wait for the current host save to finish before reconnecting.";
        dispatch({ type: "MESSAGE_SET", message });
        return {
          ok: false,
          reason: "unsynced",
          requiresConfirmation: false,
          message,
        };
      }

      runtimeRef.current?.sync.stop();
      runtimeRef.current = null;
      if (fixtureMode) {
        dispatch({
          type: "BACKEND_STATUS",
          status: {
            online: true,
            saveState: "synced",
            saving: false,
            unavailableReason: "",
            lastSavedAt: new Date().toISOString(),
          },
        });
        return { ok: true };
      }

      try {
        const config = publicConfiguration();
        const clientId =
          hydration.ok && current.persistenceEnabled
            ? getOrCreateClientId(
                window.localStorage,
                clientIdRef.current,
              )
            : clientIdRef.current ?? createClientId();
        clientIdRef.current = clientId;
        const client = getSupabaseClient(config);
        const repository = new SupabaseSessionRepository(client);
        const authService = new SupabaseAuthService(
          client,
          config.appUrl ?? PRODUCTION_APP_URL,
        );
        const sync = new SessionSyncController(
          repository,
          current.game,
          {
            getSession: () => stateRef.current.session,
            getIdentity: () => {
              const auth = stateRef.current.auth;
              if (!auth) return null;
              return { clientId, displayName: auth.name };
            },
            onRemoteSession: (session) => {
              if (activeRef.current) {
                dispatch({ type: "SESSION_REPLACE", session });
              }
            },
            onMetadata: (metadata) => {
              if (activeRef.current) {
                dispatch({ type: "BACKEND_METADATA", metadata });
              }
            },
            onStatus: (status) => {
              if (activeRef.current) {
                dispatch({ type: "BACKEND_STATUS", status });
              }
            },
            onAnnouncement: (message) => {
              if (activeRef.current) {
                dispatch({ type: "ANNOUNCE", message });
              }
            },
          },
        );
        sync.restore(
          {
            code: current.session.code,
            provider: "supabase",
            sessionId: current.backend.sessionId,
            revision: current.backend.revision,
            clientRole: current.backend.clientRole,
          },
          current.session,
        );
        runtimeRef.current = { authService, sync, clientId };
        sync.setOnline(true);
        if (current.backend.clientRole === "player") {
          sync.startPolling();
        } else if (
          current.auth &&
          selectHostHasUnsyncedChanges(current)
        ) {
          sync.queueSave();
        }
        return { ok: true };
      } catch (cause) {
        const message =
          cause instanceof Error
            ? cause.message
            : "Shared table setup failed.";
        if (activeRef.current) {
          dispatch({
            type: "BACKEND_STATUS",
            status: {
              online: false,
              saveState: "failed",
              saving: false,
              unavailableReason: message,
              lastSavedAt: null,
            },
          });
        }
        return {
          ok: false,
          reason: "backend-unavailable",
          message,
        };
      }
    },
    [dispatch, fixtureMode, hydration],
  );

  useEffect(() => {
    activeRef.current = true;
    void reinitializeBackend();
    return () => {
      activeRef.current = false;
      runtimeRef.current?.sync.stop();
      runtimeRef.current = null;
    };
  }, [reinitializeBackend]);

  useEffect(() => {
    if (
      !state.hydrationComplete ||
      !state.persistenceEnabled ||
      fixtureMode
    ) {
      return;
    }
    const writes = [
      persistAuth(window.localStorage, state.auth),
      persistSession(window.localStorage, state.session),
      persistBackendState(window.localStorage, {
        code: state.session.code,
        provider: "supabase",
        sessionId: state.backend.sessionId,
        revision: state.backend.revision,
        clientRole: state.backend.clientRole,
      }),
      persistUiPreferences(window.localStorage, {
        theme: state.ui.theme,
        boardZoom: state.ui.boardZoom,
        companionMode: state.ui.companionMode,
        reducedMotion: state.ui.reducedMotion,
        setupChecklistBySession: state.ui.setupChecklistBySession,
      }),
    ];
    const failed = writes.find((write) => !write.ok);
    if (failed?.error) {
      dispatch({ type: "STORAGE_DISABLED", error: failed.error.message });
    }
  }, [
    dispatch,
    fixtureMode,
    state.auth,
    state.backend.clientRole,
    state.backend.revision,
    state.backend.sessionId,
    state.hydrationComplete,
    state.persistenceEnabled,
    state.session,
    state.ui.boardZoom,
    state.ui.companionMode,
    state.ui.reducedMotion,
    state.ui.setupChecklistBySession,
    state.ui.theme,
  ]);

  useEffect(() => {
    if (!state.auth || fixtureMode) return;
    runtimeRef.current?.sync.queueSave();
  }, [fixtureMode, state.auth, state.session]);

  const submitAuth = useCallback(
    async (input: AuthSubmission) => {
      dispatch({ type: "AUTH_PENDING_SET", pending: true });
      try {
        const runtime = runtimeRef.current;
        if (!runtime && !fixtureMode) {
          throw new Error(
            "The shared table service is unavailable. Check the public configuration and retry.",
          );
        }

        let auth: AuthRecord;
        if (fixtureMode) {
          auth = {
            mode: "guest",
            id: "fixture-client",
            name: input.name || "Fixture Host",
            email: null,
          };
        } else if (input.mode === "guest") {
          auth = runtime!.authService.guest(input.name, runtime!.clientId);
          runtime!.sync.beginHostSession(stateRef.current.session);
        } else if (input.mode === "join") {
          auth = runtime!.authService.guest(input.name, runtime!.clientId);
          const joined = await runtime!.sync.join(input.code ?? "", {
            clientId: runtime!.clientId,
            displayName: auth.name,
          });
          dispatch({ type: "SESSION_REPLACE", session: joined });
          dispatch({ type: "COMPANION_MODE_SET", mode: "player" });
          runtime!.sync.startPolling();
        } else if (input.mode === "signup") {
          auth = await runtime!.authService.signUp(
            input.name,
            input.email ?? "",
            input.password ?? "",
          );
          runtime!.sync.beginHostSession(stateRef.current.session);
        } else {
          auth = await runtime!.authService.signIn(
            input.email ?? "",
            input.password ?? "",
          );
          runtime!.sync.beginHostSession(stateRef.current.session);
        }

        commitAuthenticatedSurface(
          dispatch,
          auth,
          stateRef.current.ui.reducedMotion,
        );
      } catch (cause) {
        dispatch({
          type: "AUTH_PENDING_SET",
          pending: false,
          error:
            cause instanceof Error ? cause.message : "Table entry failed.",
        });
      }
    },
    [dispatch, fixtureMode],
  );

  const signOut = useCallback(
    async (
      options: DiscardSessionOptions = {},
    ): Promise<RuntimeActionResult> => {
      const current = stateRef.current;
      const guard = selectSessionReplacementGuard(current);
      const sync = runtimeRef.current?.sync;
      const controllerInFlight = Boolean(sync?.getStatus().saving);
      const controllerUnsynced = Boolean(
        sync?.hasUnsyncedHostChanges(),
      );
      if (guard.reason === "unsynced" || controllerUnsynced) {
        const inFlight = guard.inFlight || controllerInFlight;
        const message = inFlight
          ? "Wait for the current host save to finish before signing out."
          : "This table has changes that are not saved to Supabase. Confirm that you want to discard them before signing out.";
        if (inFlight || !options.discardUnsynced) {
          dispatch({ type: "MESSAGE_SET", message });
          return {
            ok: false,
            reason: "unsynced",
            requiresConfirmation: !inFlight,
            message,
          };
        }
      }

      try {
        if (current.auth?.mode === "account") {
          await runtimeRef.current?.authService.signOut();
        }
      } catch (cause) {
        const message =
          cause instanceof Error
            ? cause.message
            : "Account sign-out failed.";
        dispatch({ type: "MESSAGE_SET", message });
        return {
          ok: false,
          reason: "backend-unavailable",
          message,
        };
      }

      try {
        runtimeRef.current?.sync.stop();
        runtimeRef.current?.sync.clearSession();
      } catch (cause) {
        const message =
          cause instanceof Error
            ? cause.message
            : "The current table is still saving.";
        dispatch({ type: "MESSAGE_SET", message });
        return {
          ok: false,
          reason: "unsynced",
          requiresConfirmation: false,
          message,
        };
      }

      const fresh = createSession(current.game);
      if (current.persistenceEnabled) {
        persistAuth(window.localStorage, null);
      }
      dispatch({ type: "SESSION_NEW", session: fresh });
      dispatch({
        type: "BACKEND_METADATA",
        metadata: {
          code: fresh.code,
          provider: "supabase",
          sessionId: null,
          revision: 0,
          clientRole: null,
        },
      });
      dispatch({ type: "COMPANION_MODE_SET", mode: "host" });
      dispatch({ type: "AUTH_SET", auth: null });
      dispatch({ type: "MESSAGE_SET", message: "" });
      return { ok: true };
    },
    [dispatch],
  );

  const newSession = useCallback(
    async (
      options: DiscardSessionOptions = {},
    ): Promise<RuntimeActionResult> => {
      const current = stateRef.current;
      if (!current.auth) {
        const message =
          "Enter as a host before creating a new table session.";
        dispatch({ type: "MESSAGE_SET", message });
        return {
          ok: false,
          reason: "not-authenticated",
          message,
        };
      }

      const guard = selectSessionReplacementGuard(current);
      const sync = runtimeRef.current?.sync;
      if (guard.reason === "player" || sync?.role() === "player") {
        const message =
          "Player companions cannot replace the host table. Leave this session and enter as a host instead.";
        dispatch({ type: "MESSAGE_SET", message });
        return { ok: false, reason: "player", message };
      }
      const controllerInFlight = Boolean(sync?.getStatus().saving);
      const controllerUnsynced = Boolean(
        sync?.hasUnsyncedHostChanges(),
      );
      if (guard.reason === "unsynced" || controllerUnsynced) {
        const inFlight = guard.inFlight || controllerInFlight;
        const message = inFlight
          ? "Wait for the current host save to finish before starting a new session."
          : "This table has changes that are not saved to Supabase. Confirm that you want to discard them before starting a new session.";
        if (inFlight || !options.discardUnsynced) {
          dispatch({ type: "MESSAGE_SET", message });
          return {
            ok: false,
            reason: "unsynced",
            requiresConfirmation: !inFlight,
            message,
          };
        }
      }

      let runtime = runtimeRef.current;
      if (!runtime && !fixtureMode) {
        const initialized = await reinitializeBackend();
        if (!initialized.ok) return initialized;
        runtime = runtimeRef.current;
      }
      if (!runtime && !fixtureMode) {
        const message =
          "The shared table service could not be initialized.";
        dispatch({ type: "MESSAGE_SET", message });
        return {
          ok: false,
          reason: "backend-unavailable",
          message,
        };
      }

      const fresh = createSession(current.game);
      try {
        if (fixtureMode) {
          dispatch({
            type: "BACKEND_STATUS",
            status: {
              online: true,
              saveState: "synced",
              saving: false,
              unavailableReason: "",
              lastSavedAt: new Date().toISOString(),
            },
          });
          dispatch({
            type: "BACKEND_METADATA",
            metadata: {
              code: fresh.code,
              provider: "supabase",
              sessionId: null,
              revision: 0,
              clientRole: "host",
            },
          });
        } else {
          runtime!.sync.beginHostSession(fresh);
        }
      } catch (cause) {
        const message =
          cause instanceof Error
            ? cause.message
            : "The current table is still saving.";
        dispatch({ type: "MESSAGE_SET", message });
        return {
          ok: false,
          reason: "unsynced",
          requiresConfirmation: false,
          message,
        };
      }

      dispatch({ type: "SESSION_NEW", session: fresh });
      dispatch({ type: "COMPANION_MODE_SET", mode: "host" });
      dispatch({
        type: "MESSAGE_SET",
        message: `${fresh.code} created. Set up the players before starting.`,
      });
      return { ok: true };
    },
    [dispatch, fixtureMode, reinitializeBackend],
  );

  const retrySync =
    useCallback(async (): Promise<RuntimeActionResult> => {
      let runtime = runtimeRef.current;
      if (!runtime) {
        const initialized = await reinitializeBackend();
        if (!initialized.ok) {
          if (initialized.message) {
            dispatch({
              type: "MESSAGE_SET",
              message: initialized.message,
            });
          }
          return initialized;
        }
        runtime = runtimeRef.current;
      }
      if (!runtime && fixtureMode) {
        const message = "Fixture table service reset.";
        dispatch({ type: "MESSAGE_SET", message });
        return { ok: true, message };
      }
      if (!runtime) {
        const message =
          "Shared table configuration is unavailable.";
        dispatch({ type: "MESSAGE_SET", message });
        return {
          ok: false,
          reason: "backend-unavailable",
          message,
        };
      }

      const current = stateRef.current;
      if (!current.auth) {
        runtime.sync.setOnline(true);
        const message = "Shared table service reinitialized.";
        dispatch({ type: "MESSAGE_SET", message });
        return { ok: true, message };
      }

      if (current.backend.clientRole === "player") {
        runtime.sync.setOnline(true);
        await runtime.sync.pullNow();
      } else {
        await runtime.sync.retrySave();
      }

      const status = runtime.sync.getStatus();
      if (status.saveState === "failed") {
        const message =
          status.unavailableReason ||
          "The shared table service is still unavailable.";
        dispatch({ type: "MESSAGE_SET", message });
        return {
          ok: false,
          reason: "backend-unavailable",
          message,
        };
      }
      if (runtime.sync.hasUnsyncedHostChanges()) {
        const message =
          "The table still has changes waiting to be saved.";
        dispatch({ type: "MESSAGE_SET", message });
        return {
          ok: false,
          reason: "unsynced",
          message,
        };
      }

      const message =
        current.backend.clientRole === "player"
          ? "Table refreshed."
          : "Table saved to Supabase.";
      dispatch({ type: "MESSAGE_SET", message });
      return { ok: true, message };
    }, [dispatch, fixtureMode, reinitializeBackend]);

  return {
    submitAuth,
    signOut,
    newSession,
    retrySync,
    reinitializeBackend,
    hasUnsyncedHostChanges: selectHostHasUnsyncedChanges(state),
    hostUnsyncedState: selectHostUnsyncedState(state),
  };
}
