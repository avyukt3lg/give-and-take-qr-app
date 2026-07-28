import {
  DRAW_DECK_KEYS,
  PLAYER_TOKEN_COLORS,
  STORAGE_KEYS,
} from "./constants";
import type {
  DeckState,
  DrawDeckKey,
  GameDefinition,
  GameSession,
  PhysicalChecks,
  Player,
  RandomDependencies,
} from "./types";

export function defaultDependencies(): RandomDependencies {
  return {
    now: () => new Date().toISOString(),
    random: () => Math.random(),
    createId: () =>
      globalThis.crypto?.randomUUID?.() ??
      `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  };
}

export function cloneSession(session: GameSession): GameSession {
  if (typeof structuredClone === "function") {
    return structuredClone(session);
  }
  return JSON.parse(JSON.stringify(session)) as GameSession;
}

export function shuffled<T>(
  items: readonly T[],
  random: () => number = Math.random,
): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const candidate = Math.floor(random() * (index + 1));
    const swapIndex = Math.max(0, Math.min(index, candidate));
    const value = copy[index];
    copy[index] = copy[swapIndex] as T;
    copy[swapIndex] = value as T;
  }
  return copy;
}

export function makeSessionCode(random: () => number = Math.random): string {
  const value = Math.max(0, Math.min(0.9999999999999999, random()));
  return `GT-${Math.floor(1000 + value * 9000)}`;
}

export function defaultPhysicalChecks(): PhysicalChecks {
  return {
    pawnMoved: false,
    cardDiscarded: false,
    playerBoardUpdated: false,
    evidenceNote: false,
    priceTrackerUpdated: false,
  };
}

function createDeckState(
  game: GameDefinition,
  random: () => number,
): DeckState {
  return {
    investments: shuffled(
      game.cards.investments.map((card) => card.id),
      random,
    ),
    events: shuffled(
      game.cards.events.map((card) => card.id),
      random,
    ),
    ethics: shuffled(
      game.cards.ethics.map((card) => card.id),
      random,
    ),
    actions: shuffled(
      game.cards.actions.map((card) => card.id),
      random,
    ),
    reflection: shuffled(
      game.cards.reflection.map((card) => card.id),
      random,
    ),
  };
}

export function emptyDeckState(): DeckState {
  return {
    investments: [],
    events: [],
    ethics: [],
    actions: [],
    reflection: [],
  };
}

export function createSession(
  game: GameDefinition,
  dependencies: RandomDependencies = defaultDependencies(),
  code = makeSessionCode(dependencies.random),
): GameSession {
  const createdAt = dependencies.now();
  const initialPrices = Object.fromEntries(
    game.assets.map((asset) => [asset.id, asset.startIndex]),
  );

  return {
    schema: STORAGE_KEYS.session,
    code,
    createdAt,
    updatedAt: dependencies.now(),
    view: "setup",
    started: false,
    gameOver: false,
    phase: "Setup",
    die: null,
    currentPlayerIndex: 0,
    draft: {
      playerCount: 2,
      players: game.cards.starterProfiles.slice(0, 5).map((profile, index) => ({
        name: `Player ${index + 1}`,
        profileId: profile.id,
      })),
    },
    prices: initialPrices,
    decks: createDeckState(game, dependencies.random),
    discards: emptyDeckState(),
    players: [],
    pendingResolution: null,
    physicalChecks: defaultPhysicalChecks(),
    lastPhysicalCard: null,
    lastPhysicalMove: null,
    activeEvent: null,
    peekedEventId: null,
    priceHistory: [
      {
        at: dependencies.now(),
        source: "setup",
        prices: { ...initialPrices },
      },
    ],
    marketHistory: [],
    manualAdjustments: [],
    activity: [],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asNumber(value: unknown, fallback = 0): number {
  const number = Number(value ?? fallback);
  return Number.isFinite(number) ? number : fallback;
}

export function ensurePlayerShape(playerValue: unknown): Player {
  const player = isRecord(playerValue) ? playerValue : {};
  const numericId = Number(String(player.id ?? "P1").replace(/\D/g, ""));
  const tokenColor =
    typeof player.tokenColor === "string"
      ? player.tokenColor
      : (PLAYER_TOKEN_COLORS[numericId - 1] ?? PLAYER_TOKEN_COLORS[0]);

  return {
    id: String(player.id ?? ""),
    name: String(player.name ?? ""),
    profileId: String(player.profileId ?? ""),
    profileTitle:
      typeof player.profileTitle === "string" ? player.profileTitle : undefined,
    tokenColor,
    cash: asNumber(player.cash),
    position: asNumber(player.position),
    turnsTaken: asNumber(player.turnsTaken),
    holdings: isRecord(player.holdings)
      ? ({ ...player.holdings } as Player["holdings"])
      : {},
    riskEvidence: asNumber(player.riskEvidence),
    ethicsPosition: asNumber(player.ethicsPosition),
    reflectionEvidence: asNumber(player.reflectionEvidence),
    decisions: Array.isArray(player.decisions)
      ? (player.decisions as Player["decisions"])
      : [],
    finished: Boolean(player.finished),
    profileBonuses: isRecord(player.profileBonuses)
      ? { ...player.profileBonuses }
      : {},
    pending: isRecord(player.pending) ? { ...player.pending } : {},
  };
}

function mergeDeckState(
  fresh: DeckState,
  storedValue: unknown,
): DeckState {
  const stored = isRecord(storedValue) ? storedValue : {};
  return Object.fromEntries(
    DRAW_DECK_KEYS.map((key) => [
      key,
      Array.isArray(stored[key]) ? [...stored[key]] : fresh[key],
    ]),
  ) as DeckState;
}

/**
 * Tolerant v5 hydration. It mirrors the legacy spread semantics: known nested
 * collections get safe defaults while unknown top-level keys remain intact.
 */
export function ensureSessionShape(
  sessionValue: unknown,
  game: GameDefinition,
  dependencies: RandomDependencies = defaultDependencies(),
): GameSession {
  const fresh = createSession(game, dependencies);
  if (!isRecord(sessionValue)) return fresh;

  const session = sessionValue;
  const draft = isRecord(session.draft) ? session.draft : {};
  const rawDraftPlayers = Array.isArray(draft.players)
    ? draft.players
    : fresh.draft.players;
  const rawPrices = isRecord(session.prices) ? session.prices : {};
  const rawChecks = isRecord(session.physicalChecks)
    ? session.physicalChecks
    : {};

  return {
    ...fresh,
    ...session,
    draft: {
      ...fresh.draft,
      ...draft,
      playerCount: asNumber(draft.playerCount, fresh.draft.playerCount),
      players: rawDraftPlayers.map((player, index) => {
        const item = isRecord(player) ? player : {};
        return {
          name: String(item.name ?? `Player ${index + 1}`),
          profileId: String(item.profileId ?? ""),
        };
      }),
    },
    prices: { ...fresh.prices, ...rawPrices } as GameSession["prices"],
    decks: mergeDeckState(fresh.decks, session.decks),
    discards: mergeDeckState(fresh.discards, session.discards),
    players: Array.isArray(session.players)
      ? session.players.map(ensurePlayerShape)
      : [],
    priceHistory: Array.isArray(session.priceHistory)
      ? (session.priceHistory as GameSession["priceHistory"])
      : fresh.priceHistory,
    marketHistory: Array.isArray(session.marketHistory)
      ? (session.marketHistory as GameSession["marketHistory"])
      : [],
    manualAdjustments: Array.isArray(session.manualAdjustments)
      ? (session.manualAdjustments as GameSession["manualAdjustments"])
      : [],
    activity: Array.isArray(session.activity)
      ? (session.activity as GameSession["activity"])
      : [],
    physicalChecks: {
      ...defaultPhysicalChecks(),
      ...rawChecks,
    } as PhysicalChecks,
    lastPhysicalCard:
      (session.lastPhysicalCard as GameSession["lastPhysicalCard"]) ?? null,
    lastPhysicalMove:
      (session.lastPhysicalMove as GameSession["lastPhysicalMove"]) ?? null,
  } as GameSession;
}

export const normalizeSession = ensureSessionShape;

export function currentPlayer(session: GameSession): Player | null {
  return session.players[session.currentPlayerIndex] ?? null;
}

export function advanceCurrentPlayer(
  session: GameSession,
  turnLimit: number,
): void {
  for (let offset = 1; offset <= session.players.length; offset += 1) {
    const index =
      (session.currentPlayerIndex + offset) % session.players.length;
    const candidate = session.players[index];
    if (
      candidate &&
      !candidate.finished &&
      candidate.turnsTaken < turnLimit
    ) {
      session.currentPlayerIndex = index;
      return;
    }
  }
}

export function drawCard(
  session: GameSession,
  deckKey: DrawDeckKey,
  random: () => number,
): string | null {
  const deck = session.decks[deckKey];
  const discard = session.discards[deckKey];
  if (!deck.length && discard.length) {
    session.decks[deckKey] = shuffled(discard, random);
    session.discards[deckKey] = [];
  }
  return session.decks[deckKey].shift() ?? null;
}

export function discardCard(
  session: GameSession,
  deckKey: DrawDeckKey,
  cardId: string | null | undefined,
): void {
  if (cardId && !session.discards[deckKey].includes(cardId)) {
    session.discards[deckKey].push(cardId);
  }
}

export function nextSyncedCardId(
  session: GameSession,
  deckKey: DrawDeckKey,
  random: () => number,
): string | null {
  if (
    !session.decks[deckKey].length &&
    session.discards[deckKey].length
  ) {
    session.decks[deckKey] = shuffled(
      session.discards[deckKey],
      random,
    );
    session.discards[deckKey] = [];
  }
  return session.decks[deckKey][0] ?? null;
}

export function takePrintedCard(
  session: GameSession,
  deckKey: DrawDeckKey,
  cardId: string,
  random: () => number,
): string[] {
  const warnings: string[] = [];
  const nextId = nextSyncedCardId(session, deckKey, random);
  const deck = session.decks[deckKey];
  const discard = session.discards[deckKey];

  if (nextId && nextId !== cardId) {
    warnings.push(
      `App deck expected ${nextId}; physical card entered was ${cardId}. Check whether the physical deck was shuffled or a card was missed.`,
    );
  }

  const deckIndex = deck.indexOf(cardId);
  if (deckIndex >= 0) {
    deck.splice(deckIndex, 1);
    return warnings;
  }

  const discardIndex = discard.indexOf(cardId);
  if (discardIndex >= 0) {
    discard.splice(discardIndex, 1);
    warnings.push(
      `${cardId} was already in the app discard pile. The host should check the physical discard pile.`,
    );
    return warnings;
  }

  warnings.push(
    `${cardId} was not found in the app draw or discard state. Continuing with the printed card ID, but the deck state needs host attention.`,
  );
  return warnings;
}
