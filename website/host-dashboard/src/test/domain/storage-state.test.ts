import { describe, expect, it, vi } from "vitest";

import { STORAGE_KEYS } from "../../domain/constants";
import { startSession } from "../../domain/game-engine";
import {
  appReducer,
  createInitialAppState,
  selectCanEditSession,
  selectCurrentPlayer,
  selectHostHasUnsyncedChanges,
  selectHostUnsyncedState,
  selectSessionReplacementGuard,
} from "../../state";
import {
  getOrCreateClientId,
  hydrateStorage,
  type StorageLike,
} from "../../services/storage";
import {
  fixedDependencies,
  freshSession,
  game,
  startedSession,
} from "./fixtures";

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>();
  readonly setItem = vi.fn((key: string, value: string) => {
    this.values.set(key, value);
  });

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
}

describe("storage hydration boundary", () => {
  it("reads all legacy envelopes without writing during hydration", () => {
    const storage = new MemoryStorage();
    storage.values.set(
      STORAGE_KEYS.auth,
      JSON.stringify({
        mode: "guest",
        id: "client-old",
        name: "Host",
        email: null,
      }),
    );
    storage.values.set(
      STORAGE_KEYS.backend,
      JSON.stringify({
        code: "GT-4827",
        provider: "supabase",
        sessionId: null,
        revision: 0,
        clientRole: "host",
      }),
    );
    storage.values.set(
      STORAGE_KEYS.session,
      JSON.stringify(freshSession()),
    );
    storage.values.set(
      STORAGE_KEYS.ui,
      JSON.stringify({
        theme: "classroom",
        companionMode: "host",
        reducedMotion: true,
      }),
    );
    storage.values.set(STORAGE_KEYS.client, JSON.stringify("client-old"));

    const hydrated = hydrateStorage(storage);
    expect(hydrated.ok).toBe(true);
    expect(hydrated.auth?.name).toBe("Host");
    expect(hydrated.backend?.code).toBe("GT-4827");
    expect(hydrated.ui.theme).toBe("classroom");
    expect(hydrated.clientId).toBe("client-old");
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("disables persistence when any stored envelope is corrupt", () => {
    const storage = new MemoryStorage();
    storage.values.set(STORAGE_KEYS.session, "{broken");
    const hydrated = hydrateStorage(storage);
    const state = createInitialAppState(
      game,
      hydrated,
      fixedDependencies(),
    );
    expect(hydrated.ok).toBe(false);
    expect(state.hydrationComplete).toBe(false);
    expect(state.persistenceEnabled).toBe(false);
    expect(state.storageErrors[0]).toContain(STORAGE_KEYS.session);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("retains the legacy client ID or writes exactly one generated ID", () => {
    const storage = new MemoryStorage();
    expect(getOrCreateClientId(storage, "client-existing")).toBe(
      "client-existing",
    );
    expect(storage.setItem).not.toHaveBeenCalled();

    const generated = getOrCreateClientId(storage, null);
    expect(generated).toMatch(/^client-/);
    expect(storage.setItem).toHaveBeenCalledOnce();
    expect(JSON.parse(storage.values.get(STORAGE_KEYS.client)!)).toBe(
      generated,
    );
  });

  it("can create an ephemeral client identity without repairing failed storage", () => {
    const storage = new MemoryStorage();
    const generated = getOrCreateClientId(storage, null, {
      persist: false,
    });
    expect(generated).toMatch(/^client-/);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.values.has(STORAGE_KEYS.client)).toBe(false);
  });
});

describe("React reducer contract", () => {
  it("applies domain results without hiding errors or announcements", () => {
    const state = createInitialAppState(
      game,
      {
        ok: true,
        auth: null,
        backend: null,
        session: null,
        ui: {},
        clientId: null,
        errors: [],
      },
      fixedDependencies(),
    );
    const result = startSession(
      state.session,
      game,
      [
        { name: "Asha", profileId: "SP01" },
        { name: "Dev", profileId: "SP03" },
      ],
      fixedDependencies(),
    );
    const next = appReducer(state, {
      type: "DOMAIN_RESULT",
      result: { ...result, announcement: "Ready." },
    });
    expect(selectCurrentPlayer(next)?.name).toBe("Asha");
    expect(next.ui.announcement).toBe("Ready.");
    expect(selectCanEditSession(next)).toBe(true);
  });

  it("forces player clients into a read-only role", () => {
    const state = createInitialAppState(
      game,
      {
        ok: true,
        auth: null,
        backend: null,
        session: null,
        ui: {},
        clientId: null,
        errors: [],
      },
      fixedDependencies(),
    );
    const next = appReducer(state, {
      type: "BACKEND_METADATA",
      metadata: {
        code: state.session.code,
        provider: "supabase",
        sessionId: "67e55044-10b1-426f-9247-bb680e5fe0c8",
        revision: 4,
        clientRole: "player",
      },
    });
    expect(selectCanEditSession(next)).toBe(false);
  });

  it("marks domain errors for assertive announcement", () => {
    const state = createInitialAppState(
      game,
      {
        ok: true,
        auth: null,
        backend: null,
        session: null,
        ui: {},
        clientId: null,
        errors: [],
      },
      fixedDependencies(),
    );
    const failed = appReducer(state, {
      type: "DOMAIN_RESULT",
      result: {
        session: state.session,
        error: "The physical card ID does not match this deck.",
      },
    });
    expect(failed.message).toContain("does not match");
    expect(failed.messageAssertive).toBe(true);

    const cleared = appReducer(failed, {
      type: "MESSAGE_SET",
      message: "",
    });
    expect(cleared.messageAssertive).toBe(false);
  });

  it("classifies host save risk without treating player failures as discardable host work", () => {
    const state = createInitialAppState(
      game,
      {
        ok: true,
        auth: {
          mode: "guest",
          id: "client-host",
          name: "Host",
          email: null,
        },
        backend: null,
        session: freshSession(),
        ui: {},
        clientId: "client-host",
        errors: [],
      },
      fixedDependencies(),
    );
    const queued = appReducer(state, {
      type: "BACKEND_STATUS",
      status: {
        online: true,
        saveState: "saving",
        saving: false,
        unavailableReason: "",
        lastSavedAt: null,
      },
    });
    expect(selectHostUnsyncedState(queued)).toBe("saving");
    expect(selectHostHasUnsyncedChanges(queued)).toBe(true);
    expect(selectSessionReplacementGuard(queued)).toEqual({
      allowed: false,
      requiresConfirmation: true,
      inFlight: false,
      reason: "unsynced",
    });

    const inFlight = appReducer(queued, {
      type: "BACKEND_STATUS",
      status: {
        online: true,
        saveState: "saving",
        saving: true,
        unavailableReason: "",
        lastSavedAt: null,
      },
    });
    expect(selectSessionReplacementGuard(inFlight)).toEqual({
      allowed: false,
      requiresConfirmation: false,
      inFlight: true,
      reason: "unsynced",
    });

    const failed = appReducer(inFlight, {
      type: "BACKEND_STATUS",
      status: {
        online: false,
        saveState: "failed",
        saving: false,
        unavailableReason: "Network unavailable.",
        lastSavedAt: null,
      },
    });
    expect(selectHostUnsyncedState(failed)).toBe("failed");
    expect(selectSessionReplacementGuard(failed).requiresConfirmation).toBe(
      true,
    );

    const player = appReducer(failed, {
      type: "BACKEND_METADATA",
      metadata: {
        code: failed.session.code,
        provider: "supabase",
        sessionId: "67e55044-10b1-426f-9247-bb680e5fe0c8",
        revision: 4,
        clientRole: "player",
      },
    });
    expect(selectHostUnsyncedState(player)).toBe("none");
    expect(selectHostHasUnsyncedChanges(player)).toBe(false);
    expect(selectSessionReplacementGuard(player)).toEqual({
      allowed: false,
      requiresConfirmation: false,
      inFlight: false,
      reason: "player",
    });
  });

  it("starts a new session without signing out and clears stale session UI", () => {
    const initial = createInitialAppState(
      game,
      {
        ok: true,
        auth: {
          mode: "guest",
          id: "client-host",
          name: "Host",
          email: null,
        },
        backend: null,
        session: startedSession(),
        ui: {},
        clientId: "client-host",
        errors: [],
      },
      fixedDependencies(),
    );
    const state = {
      ...initial,
      message: "Old error",
      messageAssertive: true,
      exportText: "old export",
      ui: {
        ...initial.ui,
        announcement: "Old announcement",
        pendingPhysicalDie: 6,
        turnNoteDraft: "Old note",
        undoRollSession: initial.session,
        cardLookupId: "OP01",
        boardLookupId: "S12",
        selectedBoardSpaceId: "S12",
        selectedAssistPlayerId: "P1",
        selectedMarketEventId: "ME01",
        ledgerEditMode: true,
        dialog: { kind: "end-turn" },
      },
    };
    const nextSession = freshSession();
    nextSession.code = "GT-9001";
    const next = appReducer(state, {
      type: "SESSION_NEW",
      session: nextSession,
    });

    expect(next.auth).toEqual(initial.auth);
    expect(next.session.code).toBe("GT-9001");
    expect(next.message).toBe("");
    expect(next.messageAssertive).toBe(false);
    expect(next.exportText).toBe("");
    expect(next.ui).toMatchObject({
      announcement: "",
      pendingPhysicalDie: null,
      turnNoteDraft: "",
      undoRollSession: null,
      cardLookupId: "",
      boardLookupId: "",
      selectedBoardSpaceId: "S00",
      selectedAssistPlayerId: "",
      selectedMarketEventId: "",
      ledgerEditMode: false,
      dialog: null,
    });
  });
});
