import type {
  AuthRecord,
  CompanionMode,
  DomainResult,
  GameSession,
  StoredBackendState,
  ThemeId,
  ViewId,
} from "../domain/types";
import type { SyncStatus } from "../services/sync-controller";
import {
  applyDomainResult,
  mergeSyncStatus,
  type AppState,
  type AuthTab,
} from "./app-state";

export type AppAction =
  | { type: "AUTH_SET"; auth: AuthRecord | null }
  | { type: "AUTH_TAB_SET"; tab: AuthTab }
  | { type: "AUTH_PENDING_SET"; pending: boolean; error?: string }
  | { type: "SESSION_REPLACE"; session: GameSession }
  | { type: "SESSION_NEW"; session: GameSession }
  | { type: "DOMAIN_RESULT"; result: DomainResult }
  | { type: "UNDO_SNAPSHOT_SET"; session: GameSession | null }
  | { type: "VIEW_SET"; view: ViewId }
  | { type: "MESSAGE_SET"; message: string; assertive?: boolean }
  | { type: "ANNOUNCE"; message: string }
  | { type: "EXPORT_SET"; text: string }
  | { type: "BACKEND_STATUS"; status: SyncStatus }
  | { type: "BACKEND_METADATA"; metadata: StoredBackendState }
  | { type: "THEME_SET"; theme: ThemeId }
  | { type: "COMPANION_MODE_SET"; mode: CompanionMode }
  | { type: "REDUCED_MOTION_SET"; reduced: boolean }
  | { type: "BOARD_ZOOM_SET"; zoom: number }
  | { type: "DIE_DRAFT_SET"; die: number | null }
  | { type: "TURN_NOTE_SET"; note: string }
  | { type: "SETUP_CHECK_SET"; key: string; checked: boolean }
  | { type: "UI_PATCH"; patch: Partial<AppState["ui"]> }
  | { type: "STORAGE_DISABLED"; error: string };

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "AUTH_SET":
      return {
        ...state,
        auth: action.auth,
        ui: { ...state.ui, authError: "" },
      };
    case "AUTH_TAB_SET":
      return {
        ...state,
        authTab: action.tab,
        ui: { ...state.ui, authError: "" },
      };
    case "AUTH_PENDING_SET":
      return {
        ...state,
        ui: {
          ...state.ui,
          authPending: action.pending,
          authError: action.error ?? "",
        },
      };
    case "SESSION_REPLACE":
      return { ...state, session: action.session };
    case "SESSION_NEW":
      return {
        ...state,
        session: action.session,
        message: "",
        messageAssertive: false,
        exportText: "",
        ui: {
          ...state.ui,
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
        },
      };
    case "DOMAIN_RESULT":
      return applyDomainResult(state, action.result);
    case "UNDO_SNAPSHOT_SET":
      return {
        ...state,
        ui: { ...state.ui, undoRollSession: action.session },
      };
    case "VIEW_SET":
      return {
        ...state,
        session: { ...state.session, view: action.view },
      };
    case "MESSAGE_SET":
      return {
        ...state,
        message: action.message,
        messageAssertive: action.assertive ?? false,
      };
    case "ANNOUNCE":
      return {
        ...state,
        ui: { ...state.ui, announcement: action.message },
      };
    case "EXPORT_SET":
      return { ...state, exportText: action.text };
    case "BACKEND_STATUS":
      return {
        ...state,
        backend: mergeSyncStatus(state.backend, action.status),
      };
    case "BACKEND_METADATA":
      return {
        ...state,
        backend: {
          ...state.backend,
          sessionId: action.metadata.sessionId,
          revision: action.metadata.revision,
          clientRole: action.metadata.clientRole,
        },
      };
    case "THEME_SET":
      return {
        ...state,
        ui: { ...state.ui, theme: action.theme },
      };
    case "COMPANION_MODE_SET":
      return {
        ...state,
        ui: { ...state.ui, companionMode: action.mode },
      };
    case "REDUCED_MOTION_SET":
      return {
        ...state,
        ui: { ...state.ui, reducedMotion: action.reduced },
      };
    case "BOARD_ZOOM_SET":
      return {
        ...state,
        ui: {
          ...state.ui,
          boardZoom: Math.max(0.75, Math.min(1.75, action.zoom)),
        },
      };
    case "DIE_DRAFT_SET":
      return {
        ...state,
        ui: { ...state.ui, pendingPhysicalDie: action.die },
      };
    case "TURN_NOTE_SET":
      return {
        ...state,
        session: {
          ...state.session,
          physicalChecks: {
            ...state.session.physicalChecks,
            evidenceNote: Boolean(action.note.trim()),
          },
        },
        ui: { ...state.ui, turnNoteDraft: action.note },
      };
    case "SETUP_CHECK_SET": {
      const sessionKey = state.session.code || "unassigned";
      return {
        ...state,
        ui: {
          ...state.ui,
          setupChecklistBySession: {
            ...state.ui.setupChecklistBySession,
            [sessionKey]: {
              ...(state.ui.setupChecklistBySession[sessionKey] ?? {}),
              [action.key]: action.checked,
            },
          },
        },
      };
    }
    case "UI_PATCH":
      return {
        ...state,
        ui: { ...state.ui, ...action.patch },
      };
    case "STORAGE_DISABLED":
      return {
        ...state,
        persistenceEnabled: false,
        storageErrors: [...state.storageErrors, action.error],
      };
  }
}
