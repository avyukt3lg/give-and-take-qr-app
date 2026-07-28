import { act, renderHook, waitFor } from "@testing-library/react";
import { useReducer } from "react";
import { describe, expect, it } from "vitest";

import { useTableRuntime } from "../../hooks/useTableRuntime";
import {
  appReducer,
  createInitialAppState,
  type AppAction,
} from "../../state";
import type { AppState } from "../../state/app-state";
import type { StorageHydration } from "../../services/storage";
import { fixedDependencies, freshSession, game } from "./fixtures";

const hostAuth = {
  mode: "guest" as const,
  id: "client-host",
  name: "Host",
  email: null,
};

function hydrationWithHost(): StorageHydration {
  return {
    ok: true,
    auth: hostAuth,
    backend: {
      code: "GT-4827",
      provider: "supabase",
      sessionId: null,
      revision: 0,
      clientRole: "host",
    },
    session: freshSession(),
    ui: {},
    clientId: "client-host",
    errors: [],
  };
}

function useRuntimeHarness(
  initialState: AppState,
  hydration: StorageHydration,
) {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const runtime = useTableRuntime(state, dispatch, hydration, true);
  return { state, dispatch, runtime };
}

async function dispatchStatus(
  dispatch: React.Dispatch<AppAction>,
  saveState: "saving" | "failed",
  saving: boolean,
) {
  await act(async () => {
    dispatch({
      type: "BACKEND_STATUS",
      status: {
        online: saveState !== "failed",
        saveState,
        saving,
        unavailableReason:
          saveState === "failed" ? "Network unavailable." : "",
        lastSavedAt: null,
      },
    });
  });
}

describe("table runtime lifecycle", () => {
  it("creates a new host session without clearing authentication", async () => {
    const hydration = hydrationWithHost();
    const initialState = createInitialAppState(
      game,
      hydration,
      fixedDependencies(),
    );
    const { result } = renderHook(() =>
      useRuntimeHarness(initialState, hydration),
    );
    await waitFor(() =>
      expect(result.current.state.backend.saveState).toBe("synced"),
    );
    const previousSession = result.current.state.session;

    let outcome:
      | Awaited<ReturnType<typeof result.current.runtime.newSession>>
      | undefined;
    await act(async () => {
      outcome = await result.current.runtime.newSession();
    });

    expect(outcome).toEqual({ ok: true });
    expect(result.current.state.auth).toEqual(hostAuth);
    expect(result.current.state.session).not.toBe(previousSession);
    expect(result.current.state.session.code).toMatch(/^GT-\d{4}$/);
    expect(result.current.state.backend.clientRole).toBe("host");
    expect(result.current.state.message).toContain("created");
  });

  it("requires confirmation for failed work and never bypasses an in-flight save", async () => {
    const hydration = hydrationWithHost();
    const initialState = createInitialAppState(
      game,
      hydration,
      fixedDependencies(),
    );
    const { result } = renderHook(() =>
      useRuntimeHarness(initialState, hydration),
    );
    await dispatchStatus(result.current.dispatch, "failed", false);

    let failedOutcome:
      | Awaited<ReturnType<typeof result.current.runtime.newSession>>
      | undefined;
    await act(async () => {
      failedOutcome = await result.current.runtime.newSession();
    });
    expect(failedOutcome).toMatchObject({
      ok: false,
      reason: "unsynced",
      requiresConfirmation: true,
    });

    await act(async () => {
      failedOutcome = await result.current.runtime.newSession({
        discardUnsynced: true,
      });
    });
    expect(failedOutcome).toEqual({ ok: true });

    await dispatchStatus(result.current.dispatch, "saving", true);
    let savingOutcome:
      | Awaited<ReturnType<typeof result.current.runtime.signOut>>
      | undefined;
    await act(async () => {
      savingOutcome = await result.current.runtime.signOut({
        discardUnsynced: true,
      });
    });
    expect(savingOutcome).toMatchObject({
      ok: false,
      reason: "unsynced",
      requiresConfirmation: false,
    });
    expect(result.current.state.auth).toEqual(hostAuth);
  });

  it("reinitializes before authentication without requiring an identity", async () => {
    const hydration: StorageHydration = {
      ok: true,
      auth: null,
      backend: null,
      session: null,
      ui: {},
      clientId: null,
      errors: [],
    };
    const initialState = createInitialAppState(
      game,
      hydration,
      fixedDependencies(),
    );
    const { result } = renderHook(() =>
      useRuntimeHarness(initialState, hydration),
    );

    let outcome:
      | Awaited<ReturnType<typeof result.current.runtime.retrySync>>
      | undefined;
    await act(async () => {
      outcome = await result.current.runtime.retrySync();
    });

    expect(outcome).toEqual({
      ok: true,
      message: "Fixture table service reset.",
    });
    expect(result.current.state.auth).toBeNull();
    expect(result.current.state.backend.saveState).toBe("synced");
  });
});
