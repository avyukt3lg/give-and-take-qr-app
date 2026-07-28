import { buildGameIndexes } from "../domain/game-config";
import {
  createSession,
  defaultDependencies,
  ensureSessionShape,
} from "../domain/session";
import type {
  AuthRecord,
  ClientRole,
  CompanionMode,
  DomainResult,
  GameDefinition,
  GameIndexes,
  GameSession,
  RandomDependencies,
  StoredBackendState,
  ThemeId,
} from "../domain/types";
import type { StorageHydration } from "../services/storage";
import type {
  SyncSaveState,
  SyncStatus,
} from "../services/sync-controller";

export type AuthTab = "guest" | "join" | "login" | "signup";

export interface BackendState {
  online: boolean;
  provider: "supabase";
  label: "Supabase";
  sessionId: string | null;
  revision: number;
  saving: boolean;
  clientRole: ClientRole;
  unavailableReason: string;
  saveState: SyncSaveState;
  lastSavedAt: string | null;
}

export interface UiState {
  theme: ThemeId;
  companionMode: CompanionMode;
  reducedMotion: boolean;
  boardExpanded: boolean;
  boardZoom: number;
  ledgerEditMode: boolean;
  rulesQuery: string;
  cardLookupId: string;
  boardLookupId: string;
  selectedBoardSpaceId: string;
  selectedAssistPlayerId: string;
  pendingPhysicalDie: number | null;
  setupChecklistBySession: Record<string, Record<string, boolean>>;
  announcement: string;
  marketFilters: {
    sentiment: string;
    asset: string;
    bias: string;
  };
  selectedMarketEventId: string;
  turnNoteDraft: string;
  undoRollSession: GameSession | null;
  dialog: Record<string, unknown> | null;
  authPending: boolean;
  backendRetryPending: boolean;
  settingsOpen: boolean;
  mobileReferenceOpen: boolean;
  authError: string;
  authDraft: {
    name: string;
    email: string;
    password: string;
    code: string;
  };
}

export interface AppState {
  game: GameDefinition;
  indexes: GameIndexes;
  auth: AuthRecord | null;
  authTab: AuthTab;
  session: GameSession;
  backend: BackendState;
  ui: UiState;
  message: string;
  messageAssertive: boolean;
  exportText: string;
  configError: Error | null;
  hydrationComplete: boolean;
  persistenceEnabled: boolean;
  storageErrors: string[];
}

function matchingBackend(
  stored: StoredBackendState | null,
  session: GameSession,
  hasAuth: boolean,
): BackendState {
  const valid =
    stored?.provider === "supabase" && stored.code === session.code;
  const sessionId = valid ? stored.sessionId : null;
  const clientRole = valid
    ? stored.clientRole
    : hasAuth
      ? "host"
      : null;
  return {
    online: false,
    provider: "supabase",
    label: "Supabase",
    sessionId,
    revision: valid ? Number(stored.revision ?? 0) : 0,
    saving: false,
    clientRole: clientRole ?? (hasAuth && !sessionId ? "host" : null),
    unavailableReason: "",
    saveState: "connecting",
    lastSavedAt: null,
  };
}

export function createInitialAppState(
  game: GameDefinition,
  hydration: StorageHydration,
  dependencies: RandomDependencies = defaultDependencies(),
): AppState {
  const session = hydration.auth
    ? ensureSessionShape(
        hydration.session ?? createSession(game, dependencies),
        game,
        dependencies,
      )
    : createSession(game, dependencies);
  const preferences = hydration.ui;

  return {
    game,
    indexes: buildGameIndexes(game),
    auth: hydration.auth,
    authTab: "guest",
    session,
    backend: matchingBackend(
      hydration.backend,
      session,
      Boolean(hydration.auth),
    ),
    ui: {
      theme: preferences.theme ?? "table",
      companionMode: preferences.companionMode ?? "host",
      reducedMotion: Boolean(preferences.reducedMotion ?? false),
      boardExpanded: false,
      boardZoom: Number(preferences.boardZoom ?? 1),
      ledgerEditMode: false,
      rulesQuery: "",
      cardLookupId: "",
      boardLookupId: "",
      selectedBoardSpaceId: "S00",
      selectedAssistPlayerId: "",
      pendingPhysicalDie: null,
      setupChecklistBySession:
        preferences.setupChecklistBySession ?? {},
      announcement: "",
      marketFilters: {
        sentiment: "all",
        asset: "all",
        bias: "all",
      },
      selectedMarketEventId: "",
      turnNoteDraft: "",
      undoRollSession: null,
      dialog: null,
      authPending: false,
      backendRetryPending: false,
      settingsOpen: false,
      mobileReferenceOpen: false,
      authError: "",
      authDraft: {
        name: "",
        email: "",
        password: "",
        code: "GT-",
      },
    },
    message: "",
    messageAssertive: false,
    exportText: "",
    configError: null,
    hydrationComplete: hydration.ok,
    persistenceEnabled: hydration.ok,
    storageErrors: [...hydration.errors],
  };
}

export function applyDomainResult(
  state: AppState,
  domainResult: DomainResult,
): AppState {
  return {
    ...state,
    session: domainResult.session,
    message:
      domainResult.error ??
      domainResult.message ??
      state.message,
    messageAssertive: domainResult.error
      ? true
      : domainResult.message
        ? false
        : state.messageAssertive,
    ui: {
      ...state.ui,
      announcement:
        domainResult.announcement ?? state.ui.announcement,
    },
  };
}

export function mergeSyncStatus(
  backend: BackendState,
  status: SyncStatus,
): BackendState {
  return {
    ...backend,
    online: status.online,
    saving: status.saving,
    saveState: status.saveState,
    unavailableReason: status.unavailableReason,
    lastSavedAt: status.lastSavedAt,
  };
}
