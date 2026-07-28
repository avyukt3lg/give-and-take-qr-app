export const CONFIG_VERSION = "20260727-v4d";

export const STORAGE_KEYS = {
  auth: "give-and-take:auth:v1",
  backend: "give-and-take:backend:v1",
  client: "give-and-take:client:v1",
  session: "give-and-take:table:v5",
  ui: "give-and-take:ui:v1",
} as const;

export const SAVE_DEBOUNCE_MS = 450;
export const POLL_INTERVAL_MS = 2_500;
export const REMOTE_REQUEST_TIMEOUT_MS = 12_000;
export const GAME_TURN_LIMIT = 12;
export const BOARD_SPACE_COUNT = 44;
export const CARD_COUNT = 81;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 5;

export const PRODUCTION_APP_URL =
  "https://avyukt3lg.github.io/give-and-take-qr-app/website/host-dashboard/";

export const DRAW_DECK_KEYS = [
  "investments",
  "events",
  "ethics",
  "actions",
  "reflection",
] as const;

export const PLAYER_TOKEN_COLORS = [
  "#d7b45b",
  "#3fb6a6",
  "#da6b4f",
  "#7d6bd6",
  "#5aa36f",
] as const;

export const PHYSICAL_CHECK_KEYS = [
  "pawnMoved",
  "cardDiscarded",
  "playerBoardUpdated",
  "evidenceNote",
  "priceTrackerUpdated",
] as const;

export const PHYSICAL_CHECK_LABELS = {
  pawnMoved: "Pawn moved on physical board",
  cardDiscarded: "Physical card placed in correct discard pile",
  playerBoardUpdated: "Cash/holdings updated on player board",
  evidenceNote: "Evidence note added",
  priceTrackerUpdated: "Price tracker updated if applicable",
} as const;

export const SCORE_DEFAULTS = {
  portfolioValue: 25,
  diversification: 20,
  riskManagement: 15,
  ethics: 20,
  reflection: 20,
} as const;

export const DRAW_DECK_LABELS = {
  investments: "Investment",
  events: "Market/Life",
  ethics: "Ethics",
  actions: "Action",
  reflection: "Reflection",
} as const;

export const VIEW_IDS = [
  "setup",
  "play",
  "market",
  "players",
  "scoring",
  "export",
  "rules",
] as const;
