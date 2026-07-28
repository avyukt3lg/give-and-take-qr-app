import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import {
  POLL_INTERVAL_MS,
  SAVE_DEBOUNCE_MS,
} from "../../domain/constants";
import type { SupabaseSessionRecord } from "../../domain/types";
import {
  SessionSyncController,
  type TimerScheduler,
} from "../../services/sync-controller";
import {
  SupabaseSessionRepository,
} from "../../services/supabase";
import { fixedDependencies, game, startedSession } from "./fixtures";

const recordId = "67e55044-10b1-426f-9247-bb680e5fe0c8";

function record(
  session = startedSession(),
  revision = 1,
): SupabaseSessionRecord {
  return {
    id: recordId,
    code: session.code,
    session,
    revision,
  };
}

describe("public Supabase RPC contract", () => {
  it("uses the exact four RPC names and argument keys", async () => {
    const session = startedSession();
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: record(session), error: null });
    const repository = new SupabaseSessionRepository({
      rpc,
    } as unknown as SupabaseClient);
    const identity = {
      clientId: "client-test",
      displayName: "Asha",
    };

    await repository.create(session.code, identity, session);
    await repository.update(recordId, identity, session, 3);
    await repository.get(recordId, identity.clientId);
    await repository.join(session.code, identity);

    expect(rpc.mock.calls).toEqual([
      [
        "create_game_session_public",
        {
          p_code: "GT-4827",
          p_client_id: "client-test",
          p_display_name: "Asha",
          p_session: session,
        },
      ],
      [
        "update_game_session_public",
        {
          p_session_id: recordId,
          p_client_id: "client-test",
          p_session: session,
          p_revision: 3,
        },
      ],
      [
        "get_game_session_public",
        {
          p_session_id: recordId,
          p_client_id: "client-test",
        },
      ],
      [
        "join_game_session_public",
        {
          p_code: "GT-4827",
          p_client_id: "client-test",
          p_display_name: "Asha",
        },
      ],
    ]);
  });
});

describe("session synchronization timing", () => {
  it("queues host saves with the locked 450ms debounce", async () => {
    let timeoutCallback: (() => void) | null = null;
    const setTimeoutSpy = vi.fn((callback: () => void) => {
      timeoutCallback = callback;
      return 1 as unknown as ReturnType<typeof setTimeout>;
    });
    const scheduler = {
      setTimeout: setTimeoutSpy,
      clearTimeout: vi.fn(),
      setInterval: vi.fn(),
      clearInterval: vi.fn(),
    } as unknown as TimerScheduler;
    const session = startedSession();
    const create = vi.fn().mockResolvedValue(record(session, 1));
    const repository = {
      create,
      update: vi.fn(),
      get: vi.fn(),
      join: vi.fn(),
    } as unknown as SupabaseSessionRepository;
    const onMetadata = vi.fn();
    const controller = new SessionSyncController(
      repository,
      game,
      {
        getSession: () => session,
        getIdentity: () => ({
          clientId: "client-test",
          displayName: "Host",
        }),
        onRemoteSession: vi.fn(),
        onMetadata,
        onStatus: vi.fn(),
      },
      fixedDependencies(),
      scheduler,
    );

    controller.setRole("host");
    controller.queueSave();
    expect(controller.hasUnsyncedHostChanges()).toBe(true);
    expect(setTimeoutSpy).toHaveBeenCalledWith(
      expect.any(Function),
      SAVE_DEBOUNCE_MS,
    );
    expect(create).not.toHaveBeenCalled();
    const scheduledSave = timeoutCallback as (() => void) | null;
    if (!scheduledSave) throw new Error("Debounced callback missing.");
    scheduledSave();
    await vi.waitFor(() => expect(create).toHaveBeenCalledOnce());
    await vi.waitFor(() =>
      expect(controller.hasUnsyncedHostChanges()).toBe(false),
    );
    expect(controller.getStatus().saveState).toBe("synced");
    expect(onMetadata).toHaveBeenCalledWith({
      code: "GT-4827",
      provider: "supabase",
      sessionId: recordId,
      revision: 1,
      clientRole: "host",
    });
  });

  it("polls player sessions every 2500ms and applies newer revisions", async () => {
    let intervalCallback: (() => void) | null = null;
    const setIntervalSpy = vi.fn((callback: () => void) => {
      intervalCallback = callback;
      return 1 as unknown as ReturnType<typeof setInterval>;
    });
    const scheduler = {
      setTimeout: vi.fn(),
      clearTimeout: vi.fn(),
      setInterval: setIntervalSpy,
      clearInterval: vi.fn(),
    } as unknown as TimerScheduler;
    const session = startedSession();
    const remote = structuredClone(session);
    remote.phase = "Resolve";
    const repository = {
      create: vi.fn(),
      update: vi.fn(),
      get: vi.fn().mockResolvedValue(record(remote, 2)),
      join: vi.fn(),
    } as unknown as SupabaseSessionRepository;
    const onRemoteSession = vi.fn();
    const controller = new SessionSyncController(
      repository,
      game,
      {
        getSession: () => session,
        getIdentity: () => ({
          clientId: "client-test",
          displayName: "Player",
        }),
        onRemoteSession,
        onMetadata: vi.fn(),
        onStatus: vi.fn(),
      },
      fixedDependencies(),
      scheduler,
    );
    controller.restore(
      {
        code: session.code,
        provider: "supabase",
        sessionId: recordId,
        revision: 1,
        clientRole: "player",
      },
      session,
    );
    controller.startPolling();

    expect(setIntervalSpy).toHaveBeenCalledWith(
      expect.any(Function),
      POLL_INTERVAL_MS,
    );
    const scheduledPoll = intervalCallback as (() => void) | null;
    if (!scheduledPoll) throw new Error("Poll callback missing.");
    scheduledPoll();
    await vi.waitFor(() => expect(onRemoteSession).toHaveBeenCalledOnce());
    expect(onRemoteSession.mock.calls[0]?.[0].phase).toBe("Resolve");
  });

  it("never starts the poll timer for a host", () => {
    const scheduler = {
      setTimeout: vi.fn(),
      clearTimeout: vi.fn(),
      setInterval: vi.fn(),
      clearInterval: vi.fn(),
    } as unknown as TimerScheduler;
    const session = startedSession();
    const controller = new SessionSyncController(
      {
        create: vi.fn(),
        update: vi.fn(),
        get: vi.fn(),
        join: vi.fn(),
      } as unknown as SupabaseSessionRepository,
      game,
      {
        getSession: () => session,
        getIdentity: () => ({
          clientId: "client-test",
          displayName: "Host",
        }),
        onRemoteSession: vi.fn(),
        onMetadata: vi.fn(),
        onStatus: vi.fn(),
      },
      fixedDependencies(),
      scheduler,
    );
    controller.setRole("host");
    controller.startPolling();
    expect(scheduler.setInterval).not.toHaveBeenCalled();
  });

  it("starts a host table with fresh sync metadata and stops player polling", () => {
    const scheduler = {
      setTimeout: vi.fn(),
      clearTimeout: vi.fn(),
      setInterval: vi.fn(
        () => 1 as unknown as ReturnType<typeof setInterval>,
      ),
      clearInterval: vi.fn(),
    } as unknown as TimerScheduler;
    const previous = startedSession();
    const next = structuredClone(previous);
    next.code = "GT-9001";
    const onMetadata = vi.fn();
    const controller = new SessionSyncController(
      {
        create: vi.fn(),
        update: vi.fn(),
        get: vi.fn(),
        join: vi.fn(),
      } as unknown as SupabaseSessionRepository,
      game,
      {
        getSession: () => previous,
        getIdentity: () => ({
          clientId: "client-test",
          displayName: "Host",
        }),
        onRemoteSession: vi.fn(),
        onMetadata,
        onStatus: vi.fn(),
      },
      fixedDependencies(),
      scheduler,
    );
    controller.restore(
      {
        code: previous.code,
        provider: "supabase",
        sessionId: recordId,
        revision: 8,
        clientRole: "player",
      },
      previous,
    );
    controller.startPolling();
    expect(scheduler.setInterval).toHaveBeenCalledOnce();

    controller.beginHostSession(next);
    expect(scheduler.clearInterval).toHaveBeenCalledOnce();
    expect(onMetadata).toHaveBeenLastCalledWith({
      code: "GT-9001",
      provider: "supabase",
      sessionId: null,
      revision: 0,
      clientRole: "host",
    });
    controller.startPolling();
    expect(scheduler.setInterval).toHaveBeenCalledOnce();
  });

  it("cancels a queued old-session save when beginning a confirmed replacement", () => {
    const scheduler = {
      setTimeout: vi.fn(
        () => 1 as unknown as ReturnType<typeof setTimeout>,
      ),
      clearTimeout: vi.fn(),
      setInterval: vi.fn(),
      clearInterval: vi.fn(),
    } as unknown as TimerScheduler;
    const previous = startedSession();
    const next = structuredClone(previous);
    next.code = "GT-9001";
    const onMetadata = vi.fn();
    const controller = new SessionSyncController(
      {
        create: vi.fn(),
        update: vi.fn(),
        get: vi.fn(),
        join: vi.fn(),
      } as unknown as SupabaseSessionRepository,
      game,
      {
        getSession: () => previous,
        getIdentity: () => ({
          clientId: "client-test",
          displayName: "Host",
        }),
        onRemoteSession: vi.fn(),
        onMetadata,
        onStatus: vi.fn(),
      },
      fixedDependencies(),
      scheduler,
    );

    controller.setRole("host");
    controller.queueSave();
    expect(controller.hasUnsyncedHostChanges()).toBe(true);
    controller.beginHostSession(next);

    expect(scheduler.clearTimeout).toHaveBeenCalledOnce();
    expect(controller.hasUnsyncedHostChanges()).toBe(false);
    expect(onMetadata).toHaveBeenLastCalledWith({
      code: "GT-9001",
      provider: "supabase",
      sessionId: null,
      revision: 0,
      clientRole: "host",
    });
  });

  it("does not replace or clear a session while its host write is in flight", async () => {
    let timeoutCallback: (() => void) | null = null;
    let resolveCreate!: (value: SupabaseSessionRecord) => void;
    const create = vi.fn(
      () =>
        new Promise<SupabaseSessionRecord>((resolve) => {
          resolveCreate = resolve;
        }),
    );
    const scheduler = {
      setTimeout: vi.fn((callback: () => void) => {
        timeoutCallback = callback;
        return 1 as unknown as ReturnType<typeof setTimeout>;
      }),
      clearTimeout: vi.fn(),
      setInterval: vi.fn(),
      clearInterval: vi.fn(),
    } as unknown as TimerScheduler;
    const session = startedSession();
    const controller = new SessionSyncController(
      {
        create,
        update: vi.fn(),
        get: vi.fn(),
        join: vi.fn(),
      } as unknown as SupabaseSessionRepository,
      game,
      {
        getSession: () => session,
        getIdentity: () => ({
          clientId: "client-test",
          displayName: "Host",
        }),
        onRemoteSession: vi.fn(),
        onMetadata: vi.fn(),
        onStatus: vi.fn(),
      },
      fixedDependencies(),
      scheduler,
    );
    controller.beginHostSession(session);
    controller.queueSave();
    const scheduledSave = timeoutCallback as (() => void) | null;
    if (!scheduledSave) throw new Error("Debounced callback missing.");
    scheduledSave();
    await vi.waitFor(() =>
      expect(controller.getStatus().saving).toBe(true),
    );

    expect(() => controller.beginHostSession(freshReplacement())).toThrow(
      /current host save/i,
    );
    expect(() => controller.clearSession()).toThrow(/current host save/i);

    resolveCreate(record(session, 1));
    await vi.waitFor(() =>
      expect(controller.getStatus().saving).toBe(false),
    );
  });

  it("retries a queued host save immediately and cancels its debounce", async () => {
    const scheduler = {
      setTimeout: vi.fn(
        () => 1 as unknown as ReturnType<typeof setTimeout>,
      ),
      clearTimeout: vi.fn(),
      setInterval: vi.fn(),
      clearInterval: vi.fn(),
    } as unknown as TimerScheduler;
    const session = startedSession();
    const create = vi.fn().mockResolvedValue(record(session, 1));
    const controller = new SessionSyncController(
      {
        create,
        update: vi.fn(),
        get: vi.fn(),
        join: vi.fn(),
      } as unknown as SupabaseSessionRepository,
      game,
      {
        getSession: () => session,
        getIdentity: () => ({
          clientId: "client-test",
          displayName: "Host",
        }),
        onRemoteSession: vi.fn(),
        onMetadata: vi.fn(),
        onStatus: vi.fn(),
      },
      fixedDependencies(),
      scheduler,
    );
    controller.beginHostSession(session);
    controller.queueSave();

    await controller.retrySave();

    expect(scheduler.clearTimeout).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledOnce();
    expect(controller.getStatus().saveState).toBe("synced");
    expect(controller.hasUnsyncedHostChanges()).toBe(false);
  });
});

function freshReplacement() {
  const next = structuredClone(startedSession());
  next.code = "GT-9001";
  return next;
}
