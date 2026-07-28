import {
  POLL_INTERVAL_MS,
  SAVE_DEBOUNCE_MS,
} from "../domain/constants";
import { ensureSessionShape } from "../domain/session";
import type {
  ClientRole,
  GameDefinition,
  GameSession,
  RandomDependencies,
  StoredBackendState,
  SupabaseSessionRecord,
} from "../domain/types";
import { defaultDependencies } from "../domain/session";
import {
  SupabaseSessionRepository,
  type PublicSessionIdentity,
} from "./supabase";

export type SyncSaveState =
  | "connecting"
  | "connected"
  | "saving"
  | "synced"
  | "failed";

export interface SyncStatus {
  online: boolean;
  saveState: SyncSaveState;
  saving: boolean;
  unavailableReason: string;
  lastSavedAt: string | null;
}

export interface SyncControllerCallbacks {
  getSession: () => GameSession | null;
  getIdentity: () => PublicSessionIdentity | null;
  onRemoteSession: (session: GameSession) => void;
  onMetadata: (metadata: StoredBackendState) => void;
  onStatus: (status: SyncStatus) => void;
  onAnnouncement?: (message: string) => void;
}

export interface TimerScheduler {
  setTimeout: typeof setTimeout;
  clearTimeout: typeof clearTimeout;
  setInterval: typeof setInterval;
  clearInterval: typeof clearInterval;
}

const defaultScheduler: TimerScheduler = {
  setTimeout: globalThis.setTimeout.bind(globalThis),
  clearTimeout: globalThis.clearTimeout.bind(globalThis),
  setInterval: globalThis.setInterval.bind(globalThis),
  clearInterval: globalThis.clearInterval.bind(globalThis),
};

export class SessionSyncController {
  private sessionId: string | null = null;
  private revision = 0;
  private clientRole: ClientRole = null;
  private lastSyncedJson = "";
  private syncTimer: ReturnType<typeof setTimeout> | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private saving = false;
  private needsSave = false;
  private status: SyncStatus = {
    online: true,
    saveState: "connected",
    saving: false,
    unavailableReason: "",
    lastSavedAt: null,
  };

  constructor(
    private readonly repository: SupabaseSessionRepository,
    private readonly game: GameDefinition,
    private readonly callbacks: SyncControllerCallbacks,
    private readonly dependencies: RandomDependencies = defaultDependencies(),
    private readonly scheduler: TimerScheduler = defaultScheduler,
  ) {}

  restore(
    stored: StoredBackendState | null,
    session: GameSession | null,
  ): void {
    if (
      !stored ||
      !session ||
      stored.code !== session.code ||
      stored.provider !== "supabase"
    ) {
      return;
    }
    this.sessionId = stored.sessionId;
    this.revision = Number(stored.revision ?? 0);
    this.clientRole = stored.clientRole;
  }

  metadata(session: GameSession | null): StoredBackendState | null {
    if (!session) return null;
    return {
      code: session.code,
      provider: "supabase",
      sessionId: this.sessionId,
      revision: this.revision,
      clientRole: this.clientRole,
    };
  }

  role(): ClientRole {
    return this.clientRole;
  }

  hasUnsyncedHostChanges(): boolean {
    return (
      this.clientRole === "host" &&
      (this.saving ||
        this.needsSave ||
        this.status.saveState === "saving" ||
        this.status.saveState === "failed")
    );
  }

  getStatus(): SyncStatus {
    return { ...this.status };
  }

  setRole(role: ClientRole): void {
    this.clientRole = role;
    if (role !== "player" && this.pollTimer) {
      this.scheduler.clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.emitMetadata();
  }

  beginHostSession(session: GameSession): void {
    if (this.saving) {
      throw new Error(
        "Wait for the current host save to finish before starting a new session.",
      );
    }
    if (this.syncTimer) this.scheduler.clearTimeout(this.syncTimer);
    if (this.pollTimer) this.scheduler.clearInterval(this.pollTimer);
    this.syncTimer = null;
    this.pollTimer = null;
    this.needsSave = false;
    this.sessionId = null;
    this.revision = 0;
    this.clientRole = "host";
    this.lastSyncedJson = "";
    this.status = {
      ...this.status,
      saveState: this.status.online ? "connected" : "failed",
      saving: false,
      unavailableReason: this.status.online
        ? ""
        : this.status.unavailableReason,
    };
    this.emitMetadata(session);
    this.emitStatus();
  }

  clearSession(): void {
    if (this.saving) {
      throw new Error(
        "Wait for the current host save to finish before leaving the session.",
      );
    }
    this.sessionId = null;
    this.revision = 0;
    this.clientRole = null;
    this.lastSyncedJson = "";
    this.needsSave = false;
    if (this.syncTimer) this.scheduler.clearTimeout(this.syncTimer);
    if (this.pollTimer) this.scheduler.clearInterval(this.pollTimer);
    this.syncTimer = null;
    this.pollTimer = null;
  }

  setOnline(online: boolean, reason = ""): void {
    this.status = {
      ...this.status,
      online,
      saveState: online ? "connected" : "failed",
      unavailableReason: online ? "" : reason,
    };
    this.emitStatus();
  }

  startPolling(): void {
    if (this.clientRole !== "player" || this.pollTimer) return;
    this.pollTimer = this.scheduler.setInterval(
      () => void this.pullNow(),
      POLL_INTERVAL_MS,
    );
  }

  stop(): void {
    if (this.syncTimer) this.scheduler.clearTimeout(this.syncTimer);
    if (this.pollTimer) this.scheduler.clearInterval(this.pollTimer);
    this.syncTimer = null;
    this.pollTimer = null;
  }

  queueSave(): void {
    const session = this.callbacks.getSession();
    const identity = this.callbacks.getIdentity();
    if (!this.status.online || !session || !identity) {
      this.fail(
        "Supabase connection is required before saving this table.",
      );
      return;
    }
    if (this.clientRole === "player") return;
    if (this.saving) {
      this.needsSave = true;
      return;
    }

    this.status = {
      ...this.status,
      saveState: "saving",
      unavailableReason: "",
    };
    this.emitStatus();
    if (this.syncTimer) this.scheduler.clearTimeout(this.syncTimer);
    this.syncTimer = this.scheduler.setTimeout(
      () => void this.flush(),
      SAVE_DEBOUNCE_MS,
    );
  }

  async flush(): Promise<void> {
    this.syncTimer = null;
    const session = this.callbacks.getSession();
    const identity = this.callbacks.getIdentity();
    if (
      !this.status.online ||
      !session ||
      !identity ||
      this.saving ||
      this.clientRole === "player"
    ) {
      if (this.saving) this.needsSave = true;
      if (!this.status.online) {
        this.fail(
          "Supabase connection is required before saving this table.",
        );
      }
      return;
    }

    const localJson = JSON.stringify(session);
    if (localJson === this.lastSyncedJson) {
      this.status = {
        ...this.status,
        saveState: "synced",
        lastSavedAt: this.dependencies.now(),
      };
      this.emitStatus();
      return;
    }

    this.saving = true;
    this.status = {
      ...this.status,
      saving: true,
      saveState: "saving",
    };
    this.emitStatus();
    try {
      const record = this.sessionId
        ? await this.repository.update(
            this.sessionId,
            identity,
            session,
            this.revision,
          )
        : await this.repository.create(session.code, identity, session);
      this.sessionId = record.id;
      this.revision = Number(record.revision ?? this.revision);
      this.clientRole = "host";
      this.lastSyncedJson = localJson;
      this.status = {
        online: true,
        saving: false,
        saveState: "synced",
        unavailableReason: "",
        lastSavedAt: this.dependencies.now(),
      };
      this.emitMetadata();
      this.emitStatus();
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Online save failed.";
      this.fail(message);
      this.callbacks.onAnnouncement?.(
        "Shared sync is offline. This device kept the current table; retry before switching devices.",
      );
    } finally {
      this.saving = false;
      this.status = { ...this.status, saving: false };
      this.emitStatus();
      if (this.needsSave) {
        this.needsSave = false;
        this.queueSave();
      }
    }
  }

  async retrySave(): Promise<void> {
    if (this.syncTimer) {
      this.scheduler.clearTimeout(this.syncTimer);
      this.syncTimer = null;
    }
    this.setOnline(true);
    await this.flush();
  }

  async join(
    code: string,
    identity: PublicSessionIdentity,
  ): Promise<GameSession> {
    const record = await this.repository.join(code, identity);
    this.clientRole = "player";
    return this.applyRecord(record);
  }

  async pullNow(): Promise<void> {
    const identity = this.callbacks.getIdentity();
    if (
      !this.status.online ||
      !identity ||
      !this.sessionId ||
      this.saving ||
      this.clientRole === "host"
    ) {
      return;
    }
    try {
      const record = await this.repository.get(
        this.sessionId,
        identity.clientId,
      );
      if (Number(record.revision ?? 0) <= this.revision) return;

      const previous = this.callbacks.getSession();
      const previousPhase = previous?.phase ?? "";
      const previousPlayerId =
        previous?.players[previous.currentPlayerIndex]?.id ?? "";
      const remote = this.applyRecord(record);
      const remotePlayer = remote.players[remote.currentPlayerIndex];
      if (previousPlayerId !== (remotePlayer?.id ?? "")) {
        this.callbacks.onAnnouncement?.(
          `Table updated. Turn moved to ${
            remotePlayer?.name ?? "the next player"
          }. Phase ${remote.phase}.`,
        );
      } else if (previousPhase !== remote.phase) {
        this.callbacks.onAnnouncement?.(
          `Table updated. ${
            remotePlayer?.name ?? "The current player"
          } is now in phase ${remote.phase}.`,
        );
      }
    } catch (cause) {
      this.fail(
        cause instanceof Error ? cause.message : "Supabase refresh failed.",
      );
    }
  }

  private applyRecord(record: SupabaseSessionRecord): GameSession {
    this.sessionId = record.id;
    this.revision = Number(record.revision ?? 0);
    this.lastSyncedJson = JSON.stringify(record.session ?? {});
    const session = ensureSessionShape(
      record.session,
      this.game,
      this.dependencies,
    );
    this.emitMetadata(session);
    this.callbacks.onRemoteSession(session);
    return session;
  }

  private fail(message: string): void {
    this.status = {
      ...this.status,
      saveState: "failed",
      unavailableReason: message,
      saving: false,
    };
    this.emitStatus();
  }

  private emitStatus(): void {
    this.callbacks.onStatus({ ...this.status });
  }

  private emitMetadata(
    session = this.callbacks.getSession(),
  ): void {
    const metadata = this.metadata(session);
    if (metadata) this.callbacks.onMetadata(metadata);
  }
}
