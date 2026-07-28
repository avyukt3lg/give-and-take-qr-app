import type {
  CompanionMode,
  GameDefinition,
  GameSession,
  ThemeId,
  ViewId,
} from "@/domain/types";

export type AccessMode = "guest" | "join" | "login" | "signup";
export type SaveState =
  | "idle"
  | "connecting"
  | "saving"
  | "saved"
  | "offline"
  | "error";

export interface AuthDraft {
  name: string;
  email: string;
  password: string;
  code: string;
}

export interface UiSnapshot {
  accessMode: AccessMode;
  authDraft: AuthDraft;
  authPending: boolean;
  authError: string | null;
  theme: ThemeId;
  companionMode: CompanionMode;
  reducedMotion: boolean;
  view: ViewId;
  rulesQuery: string;
  message: string | null;
  selectedPlayerId: string | null;
  cardLookup: string;
  spaceLookup: string;
  noteDraft: string;
}

export interface BackendSnapshot {
  state: SaveState;
  detail: string;
  revision: number;
  lastSavedAt: string | null;
  role: "host" | "player" | null;
}

export interface TableSnapshot {
  ready: boolean;
  game: GameDefinition | null;
  session: GameSession | null;
  ui: UiSnapshot;
  backend: BackendSnapshot;
}

export interface AuthSubmission {
  mode: AccessMode;
  name: string;
  code?: string;
  email?: string;
  password?: string;
}

export interface TableActions {
  setAccessMode(mode: AccessMode): void;
  patchAuthDraft(patch: Partial<AuthDraft>): void;
  submitAuth(input: AuthSubmission): void | Promise<void>;
  setTheme(theme: ThemeId): void;
  setCompanionMode(mode: CompanionMode): void;
  setReducedMotion(reduced: boolean): void;
  setView(view: ViewId): void;
  dismissMessage(): void;
  signOut(): void | Promise<void>;
  retrySave(): void | Promise<void>;
  setPlayerCount(count: number): void;
  updatePlayerDraft(
    index: number,
    patch: { name?: string; profileId?: string },
  ): void;
  startGame(): void;
  setPhysicalDie(value: number | null): void;
  confirmMove(): void;
  resolveSpace(choice?: string): void;
  setNoteDraft(note: string): void;
  completeChecklist(key: string, checked: boolean): void;
  endTurn(): void;
  previewCard(id: string): void;
  setCardLookup(id: string): void;
  setSpaceLookup(id: string): void;
  adjustPlayer(
    playerId: string,
    field: "cash" | "riskEvidence" | "ethicsPosition" | "reflectionEvidence",
    delta: number,
  ): void;
  sellHolding(playerId: string, assetId: string): void;
  refreshExport(): void;
  copyExport(): void | Promise<void>;
  downloadExport(kind: "json" | "csv" | "print"): void;
  setRulesQuery(query: string): void;
  setSelectedPlayer(playerId: string): void;
  speak(text: string): void;
}

export interface TableAppController {
  snapshot: TableSnapshot;
  actions: TableActions;
}
