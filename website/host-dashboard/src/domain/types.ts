import type {
  DRAW_DECK_KEYS,
  PHYSICAL_CHECK_KEYS,
  VIEW_IDS,
} from "./constants";

export type DrawDeckKey = (typeof DRAW_DECK_KEYS)[number];
export type PhysicalCheckKey = (typeof PHYSICAL_CHECK_KEYS)[number];
export type ViewId = (typeof VIEW_IDS)[number];

export type AssetId = string;

export type BoardSpaceType =
  | "Start"
  | "Income"
  | "Invest"
  | "Research/Action"
  | "Choice"
  | "Market Pulse"
  | "Life Expense"
  | "Ethics Crossroad"
  | "Rebalance"
  | "Reflection"
  | "Finish"
  | (string & {});

export type ActionCardType =
  | "research"
  | "discount-risky"
  | "loss-limit"
  | "hedge"
  | "cash-buffer"
  | "reserve"
  | "rebalance"
  | "risk-check"
  | "explain"
  | "hold"
  | "ethics-boost"
  | "diversify"
  | (string & {});

export type SessionPhase = "Setup" | "Roll" | "Resolve" | "Log" | "Scoring";
export type ClientRole = "host" | "player" | null;
export type AuthMode = "guest" | "account";
export type ThemeId = "table" | "classroom" | "contrast";
export type CompanionMode = "host" | "table" | "player";

export interface AssetDefinition {
  id: AssetId;
  name: string;
  color: string;
  pattern?: string;
  risk: number;
  startIndex: number;
}

export interface BoardSpace {
  id: string;
  type: BoardSpaceType;
  label: string;
  effect?: string;
  cash?: number;
  choices?: string[];
}

export interface StarterProfile {
  id: string;
  title: string;
  cash: number;
  trait: string;
  bonus: string;
}

export interface InvestmentCard {
  id: string;
  title: string;
  asset: AssetId;
  units: number;
  costIndex: number;
  text: string;
}

export interface MarketEventCard {
  id: string;
  title: string;
  sentiment: string;
  bias: string;
  priceEffects: Record<AssetId, number>;
}

export interface EthicsEffect {
  cash?: number;
  ethics?: number;
  action?: number;
}

export interface EthicsCard {
  id: string;
  title: string;
  profit: EthicsEffect;
  responsible: EthicsEffect;
  prompt: string;
}

export interface ActionCard {
  id: string;
  title: string;
  type: ActionCardType;
  text: string;
}

export interface ReflectionCard {
  id: string;
  title: string;
  prompt: string;
}

export interface ReferenceCard {
  id: string;
  title: string;
  text: string;
}

export interface GameCards {
  starterProfiles: StarterProfile[];
  investments: InvestmentCard[];
  events: MarketEventCard[];
  ethics: EthicsCard[];
  actions: ActionCard[];
  reflection: ReflectionCard[];
  quickReference: ReferenceCard[];
  qr: ReferenceCard[];
}

export interface ScoreWeights {
  portfolioValue: number;
  diversification: number;
  riskManagement: number;
  ethics: number;
  reflection: number;
}

export interface GameMeta {
  title?: string;
  version?: string;
  turnLimit?: number;
  [key: string]: unknown;
}

export interface PrototypeContract {
  movement?: string;
  turnLimit?: number;
  [key: string]: unknown;
}

export interface GameDefinition {
  title: string;
  version: string;
  turnLimit: number;
  meta: GameMeta;
  prototypeContract: PrototypeContract;
  componentCounts: Record<string, number | string>;
  rules: Record<string, unknown>;
  assets: AssetDefinition[];
  boardSpaces: BoardSpace[];
  cards: GameCards;
  scoreWeights: ScoreWeights;
}

export interface GameIndexes {
  assets: Map<string, AssetDefinition>;
  spaces: Map<string, BoardSpace>;
  cards: {
    investments: Map<string, InvestmentCard>;
    events: Map<string, MarketEventCard>;
    ethics: Map<string, EthicsCard>;
    actions: Map<string, ActionCard>;
    reflection: Map<string, ReflectionCard>;
  };
}

export interface PlayerDraft {
  name: string;
  profileId: string;
}

export interface SessionDraft {
  playerCount: number;
  players: PlayerDraft[];
}

export type PriceMap = Record<AssetId, number>;
export type HoldingMap = Record<AssetId, number>;
export type DeckState = Record<DrawDeckKey, string[]>;

export interface PlayerDecision {
  at: string;
  turn: number;
  spaceId: string;
  note: string;
  result?: string;
  die?: number;
  type?: string;
  cardId?: string | null;
}

export interface PlayerPendingEffects {
  insuranceAsset?: AssetId;
  stopLossAsset?: AssetId;
  reserveReady?: boolean;
  riskyDiscount?: number;
  diversifyDiscount?: number;
  freeRebalance?: boolean;
  ethicsAudit?: boolean;
  [key: string]: unknown;
}

export interface PlayerProfileBonuses {
  trendLossCharged?: boolean;
  firstGrowthIndexDiscount?: boolean;
  budgetBuilderRisk?: boolean;
  balancedPlannerReflection?: boolean;
  [key: string]: unknown;
}

export interface Player {
  id: string;
  name: string;
  profileId: string;
  profileTitle?: string;
  tokenColor: string;
  cash: number;
  position: number;
  turnsTaken: number;
  holdings: HoldingMap;
  riskEvidence: number;
  ethicsPosition: number;
  reflectionEvidence: number;
  decisions: PlayerDecision[];
  finished: boolean;
  profileBonuses: PlayerProfileBonuses;
  pending: PlayerPendingEffects;
}

export interface PendingResolution {
  playerId: string;
  fromSpaceId: string;
  spaceId: string;
  die: number;
  type: BoardSpaceType;
  completed: boolean;
  cardDeck: DrawDeckKey | null;
  cardId: string | null;
  expectedCardId: string | null;
  deckConflict: string;
  physicalPawnConfirmed: boolean;
  cashBefore: number | null;
  cashAfter: number | null;
  priceBefore: PriceMap | null;
  priceAfter: PriceMap | null;
  appliedEffects: PriceMap | null;
  result: string[];
}

export type PhysicalChecks = Record<PhysicalCheckKey, boolean>;

export interface LastPhysicalCard {
  at: string;
  deckKey: DrawDeckKey;
  cardId: string;
  title: string;
  warnings: string[];
}

export interface LastPhysicalMove {
  playerId: string;
  fromSpaceId: string;
  die: number;
  expectedSpaceId: string;
  confirmed: boolean;
}

export interface PriceHistoryEntry {
  at: string;
  source: string;
  eventId?: string;
  appliedEffects?: PriceMap;
  prices: PriceMap;
}

export interface MarketHistoryEntry {
  at: string;
  source: string;
  playerId: string | null;
  playerName: string | null;
  turn: number | null;
  id: string;
  title: string;
  sentiment: string;
  bias: string;
  priceEffects: PriceMap;
  appliedEffects: PriceMap;
  prices: PriceMap;
}

export type AdjustablePlayerField =
  | "cash"
  | "riskEvidence"
  | "ethicsPosition"
  | "reflectionEvidence";

export interface ManualAdjustment {
  id: string;
  at: string;
  playerId: string;
  playerName: string;
  field: AdjustablePlayerField;
  delta: number;
  before: number;
  after: number;
  reason: string;
}

export interface ActivityEntry {
  at: string;
  text: string;
  [key: string]: unknown;
}

export interface GameSession {
  schema: string;
  code: string;
  createdAt: string;
  updatedAt: string;
  view: ViewId;
  started: boolean;
  gameOver: boolean;
  phase: SessionPhase;
  die: number | null;
  currentPlayerIndex: number;
  draft: SessionDraft;
  prices: PriceMap;
  decks: DeckState;
  discards: DeckState;
  players: Player[];
  pendingResolution: PendingResolution | null;
  physicalChecks: PhysicalChecks;
  lastPhysicalCard: LastPhysicalCard | null;
  lastPhysicalMove: LastPhysicalMove | null;
  activeEvent: MarketEventCard | null;
  peekedEventId: string | null;
  priceHistory: PriceHistoryEntry[];
  marketHistory: MarketHistoryEntry[];
  manualAdjustments: ManualAdjustment[];
  activity: ActivityEntry[];
  [key: string]: unknown;
}

export interface ScoreResult {
  player: Player;
  value: number;
  portfolioScore: number;
  diversificationScore: number;
  riskManagementScore: number;
  ethicsScore: number;
  reflectionScore: number;
  total: number;
}

export interface ExportSummary {
  code: string;
  createdAt: string;
  updatedAt: string;
  playerCount: number;
  totalTurns: number;
  events: number;
  cardsDrawn: number;
  notes: number;
  scoreState: "Final Review" | "Provisional Scoreboard";
  saveMode: "Backend: Supabase";
}

export interface AuthRecord {
  mode: AuthMode;
  id: string;
  name: string;
  email: string | null;
}

export interface StoredBackendState {
  code: string;
  provider: "supabase";
  sessionId: string | null;
  revision: number;
  clientRole: ClientRole;
}

export interface StoredUiPreferences {
  theme?: ThemeId;
  boardZoom?: number;
  companionMode?: CompanionMode;
  reducedMotion?: boolean;
  setupChecklistBySession?: Record<string, Record<string, boolean>>;
}

export interface RandomDependencies {
  now: () => string;
  random: () => number;
  createId: () => string;
}

export interface DomainResult {
  session: GameSession;
  error?: string;
  message?: string;
  announcement?: string;
  warnings?: string[];
}

export interface StartPlayerInput {
  name: string;
  profileId: string;
}

export interface SupabaseSessionRecord {
  id: string;
  code: string;
  session: unknown;
  revision: number;
  created_at?: string;
  updated_at?: string;
}
