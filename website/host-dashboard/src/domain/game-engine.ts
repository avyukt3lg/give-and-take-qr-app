import {
  DRAW_DECK_LABELS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  PHYSICAL_CHECK_LABELS,
  PLAYER_TOKEN_COLORS,
} from "./constants";
import {
  deckKeyForCardId,
  getAsset,
  getCard,
  getSpace,
  normaliseCardId,
} from "./game-config";
import { money } from "./exports";
import {
  clamp,
  isGameOver,
  portfolioValue,
  uniqueHoldingCount,
} from "./scoring";
import {
  advanceCurrentPlayer,
  cloneSession,
  currentPlayer,
  defaultDependencies,
  defaultPhysicalChecks,
  discardCard,
  drawCard,
  nextSyncedCardId,
  takePrintedCard,
} from "./session";
import type {
  ActionCard,
  AdjustablePlayerField,
  DomainResult,
  DrawDeckKey,
  GameDefinition,
  GameSession,
  MarketEventCard,
  PendingResolution,
  Player,
  PriceMap,
  RandomDependencies,
  StartPlayerInput,
} from "./types";

export interface RollResult extends DomainResult {
  undoSession?: GameSession;
}

export interface MarketEventResult extends DomainResult {
  beforePrices?: PriceMap;
  afterPrices?: PriceMap;
  appliedEffects?: PriceMap;
}

function result(
  session: GameSession,
  dependencies: RandomDependencies,
  values: Omit<DomainResult, "session"> = {},
): DomainResult {
  session.updatedAt = dependencies.now();
  return { session, ...values };
}

function unchanged(
  source: GameSession,
  values: Omit<DomainResult, "session">,
): DomainResult {
  return { session: source, ...values };
}

function signed(value: unknown): string {
  const number = Number(value ?? 0);
  return number > 0 ? `+${number}` : String(number);
}

function logActivity(
  session: GameSession,
  dependencies: RandomDependencies,
  text: string,
  detail: Record<string, unknown> = {},
): void {
  session.activity.unshift({
    at: dependencies.now(),
    text,
    ...detail,
  });
  session.activity = session.activity.slice(0, 80);
}

export function updateDraft(
  source: GameSession,
  playerCount: number,
  players: readonly StartPlayerInput[],
  dependencies: RandomDependencies = defaultDependencies(),
): DomainResult {
  const session = cloneSession(source);
  session.draft.playerCount = clamp(
    Number(playerCount),
    MIN_PLAYERS,
    MAX_PLAYERS,
  );
  for (let index = 0; index < MAX_PLAYERS; index += 1) {
    const existing = session.draft.players[index] ?? {
      name: `Player ${index + 1}`,
      profileId: "",
    };
    const next = players[index];
    session.draft.players[index] = {
      name: next?.name ?? existing.name,
      profileId: next?.profileId ?? existing.profileId,
    };
  }
  return result(session, dependencies);
}

export function startSession(
  source: GameSession,
  game: GameDefinition,
  playerInputs: readonly StartPlayerInput[],
  dependencies: RandomDependencies = defaultDependencies(),
): DomainResult {
  const session = cloneSession(source);
  const count = playerInputs.length;
  if (count < MIN_PLAYERS || count > MAX_PLAYERS) {
    return unchanged(source, { error: "Choose 2-5 players." });
  }

  const usedProfiles = new Set<string>();
  const usedNames = new Set<string>();
  const players: Player[] = [];

  for (let index = 0; index < count; index += 1) {
    const input = playerInputs[index];
    const name = input?.name.trim() ?? "";
    const profile = game.cards.starterProfiles.find(
      (item) => item.id === input?.profileId,
    );

    if (!name) {
      return unchanged(source, {
        error: `Seat ${index + 1} needs a player name.`,
      });
    }
    if (usedNames.has(name.toLowerCase())) {
      return unchanged(source, {
        error:
          "Two players have the same name. Use unique names before starting so the ledger and evidence export stay clear.",
      });
    }
    if (!profile) {
      return unchanged(source, {
        error: `Player ${index + 1} needs a Starter Profile.`,
      });
    }
    if (usedProfiles.has(profile.id)) {
      return unchanged(source, {
        error: "Starter Profiles must be unique in this prototype.",
      });
    }

    usedNames.add(name.toLowerCase());
    usedProfiles.add(profile.id);
    players.push({
      id: `P${index + 1}`,
      name,
      profileId: profile.id,
      profileTitle: profile.title,
      tokenColor: PLAYER_TOKEN_COLORS[index] ?? PLAYER_TOKEN_COLORS[0],
      cash: profile.cash,
      position: 0,
      turnsTaken: 0,
      holdings: {},
      riskEvidence: 0,
      ethicsPosition: profile.id === "SP03" ? 1 : 0,
      reflectionEvidence: 0,
      decisions: [
        {
          at: dependencies.now(),
          turn: 0,
          spaceId: "S00",
          note: `${profile.title}: ${profile.bonus}`,
          result: "Starter Profile assigned.",
        },
      ],
      finished: false,
      profileBonuses: {},
      pending: {},
    });
  }

  session.draft.playerCount = count;
  session.draft.players = [
    ...playerInputs.map((input) => ({ ...input })),
    ...session.draft.players.slice(count),
  ].slice(0, MAX_PLAYERS);
  session.players = players;
  session.started = true;
  session.gameOver = false;
  session.phase = "Roll";
  session.currentPlayerIndex = 0;
  session.pendingResolution = null;
  session.view = "play";
  logActivity(
    session,
    dependencies,
    `Session started with ${players.length} players.`,
  );
  return result(session, dependencies);
}

export function requiredPhysicalChecks(
  pending: PendingResolution | null,
): Array<keyof GameSession["physicalChecks"]> {
  const required: Array<keyof GameSession["physicalChecks"]> = [
    "pawnMoved",
    "playerBoardUpdated",
    "evidenceNote",
  ];
  if (pending?.cardId) required.push("cardDiscarded");
  if (pending?.cardDeck === "events") required.push("priceTrackerUpdated");
  return required;
}

export function missingPhysicalChecks(
  session: GameSession,
): Array<keyof GameSession["physicalChecks"]> {
  return requiredPhysicalChecks(session.pendingResolution).filter(
    (key) => !session.physicalChecks[key],
  );
}

export function setPhysicalCheck(
  source: GameSession,
  key: keyof GameSession["physicalChecks"],
  checked: boolean,
  dependencies: RandomDependencies = defaultDependencies(),
): DomainResult {
  const session = cloneSession(source);
  session.physicalChecks[key] = checked;
  return result(session, dependencies);
}

export function confirmPawnPosition(
  source: GameSession,
  dependencies: RandomDependencies = defaultDependencies(),
): DomainResult {
  const session = cloneSession(source);
  const pending = session.pendingResolution;
  if (!pending) {
    return unchanged(source, { error: "There is no pawn move to confirm." });
  }
  pending.physicalPawnConfirmed = true;
  session.physicalChecks.pawnMoved = true;
  if (session.lastPhysicalMove) session.lastPhysicalMove.confirmed = true;
  return result(session, dependencies, {
    announcement: `Pawn confirmed on ${pending.spaceId}. Continue with the printed space instruction.`,
  });
}

function completeResolutionMutable(
  session: GameSession,
  extraText = "",
): void {
  const pending = session.pendingResolution;
  if (!pending) return;
  if (extraText) pending.result.push(extraText);
  pending.completed = true;
  session.phase = "Log";
  if (!pending.cardId) session.physicalChecks.cardDiscarded = true;
  if (pending.cardDeck !== "events") {
    session.physicalChecks.priceTrackerUpdated = true;
  }
}

export function completeResolution(
  source: GameSession,
  extraText = "",
  dependencies: RandomDependencies = defaultDependencies(),
): DomainResult {
  const session = cloneSession(source);
  if (!session.pendingResolution) {
    return unchanged(source, { error: "There is no space to resolve." });
  }
  completeResolutionMutable(session, extraText);
  return result(session, dependencies, {
    announcement:
      "Space resolved. Add an evidence note and finish the physical checklist before ending the turn.",
  });
}

function beginResolutionMutable(
  session: GameSession,
  game: GameDefinition,
  player: Player,
  fromPosition: number,
  die: number,
): void {
  const spaceId = `S${String(player.position).padStart(2, "0")}`;
  const space = getSpace(game, spaceId);
  if (!space) {
    throw new Error(`Board configuration is missing ${spaceId}.`);
  }

  const pending: PendingResolution = {
    playerId: player.id,
    fromSpaceId: `S${String(fromPosition).padStart(2, "0")}`,
    spaceId: space.id,
    die,
    type: space.type,
    completed: false,
    cardDeck: null,
    cardId: null,
    expectedCardId: null,
    deckConflict: "",
    physicalPawnConfirmed: false,
    cashBefore: null,
    cashAfter: null,
    priceBefore: null,
    priceAfter: null,
    appliedEffects: null,
    result: [],
  };
  session.pendingResolution = pending;

  if (space.cash) {
    pending.cashBefore = player.cash;
    player.cash += Number(space.cash);
    pending.cashAfter = player.cash;
    pending.result.push(
      `${space.label}: ${space.cash > 0 ? "gained" : "paid"} ${money(
        Math.abs(space.cash),
      )}.`,
    );
    completeResolutionMutable(session);
    return;
  }

  switch (space.type) {
    case "Start":
      pending.result.push(
        "Starting cash is already assigned from the Starter Profile.",
      );
      completeResolutionMutable(session);
      break;
    case "Finish":
      player.finished = true;
      pending.result.push(
        "Reached Finish Review and waits for final scoring.",
      );
      completeResolutionMutable(session);
      break;
    case "Market Pulse":
      pending.cardDeck = "events";
      pending.expectedCardId = session.decks.events[0] ?? null;
      break;
    case "Invest":
      pending.cardDeck = "investments";
      pending.expectedCardId = session.decks.investments[0] ?? null;
      if (
        !pending.expectedCardId &&
        !session.discards.investments.length
      ) {
        pending.result.push(
          "Investment deck is empty. Player may pass and keep cash.",
        );
        completeResolutionMutable(session);
      }
      break;
    case "Ethics Crossroad":
      pending.cardDeck = "ethics";
      pending.expectedCardId = session.decks.ethics[0] ?? null;
      if (!pending.expectedCardId && !session.discards.ethics.length) {
        pending.result.push(
          "Ethics deck is empty. Gain +1 ethics for discussing the printed space instruction.",
        );
        player.ethicsPosition += 1;
        completeResolutionMutable(session);
      }
      break;
    case "Research/Action":
      pending.cardDeck = "actions";
      pending.expectedCardId = session.decks.actions[0] ?? null;
      if (!pending.expectedCardId && !session.discards.actions.length) {
        player.riskEvidence += 1;
        pending.result.push(
          "Action deck is empty. Printed space instruction applied: +1 risk-management evidence.",
        );
        completeResolutionMutable(session);
      }
      break;
    case "Reflection":
      pending.cardDeck = "reflection";
      pending.expectedCardId = session.decks.reflection[0] ?? null;
      if (
        !pending.expectedCardId &&
        !session.discards.reflection.length
      ) {
        pending.result.push(
          "Reflection deck is empty. Host may ask a finance explanation question.",
        );
      }
      break;
    case "Choice":
    case "Rebalance":
      break;
    default:
      pending.result.push(`${space.type} resolved by host.`);
      completeResolutionMutable(session);
  }
}

export function rollDie(
  source: GameSession,
  game: GameDefinition,
  dieValue?: number | null,
  dependencies: RandomDependencies = defaultDependencies(),
): RollResult {
  const session = cloneSession(source);
  const player = currentPlayer(session);
  if (!session.started || !player || session.gameOver) {
    return {
      ...unchanged(source, { error: "Start a session before rolling." }),
    };
  }
  if (session.pendingResolution) {
    return {
      ...unchanged(source, {
        error: "Resolve the current space before rolling again.",
      }),
    };
  }
  if (player.finished || player.turnsTaken >= game.turnLimit) {
    return {
      ...unchanged(source, {
        error: `${player.name} is already waiting for scoring.`,
      }),
    };
  }

  const die =
    dieValue == null
      ? Math.floor(1 + dependencies.random() * 6)
      : Number(dieValue);
  if (!Number.isInteger(die) || die < 1 || die > 6) {
    return {
      ...unchanged(source, {
        error: "Enter a physical D6 result from 1 to 6.",
      }),
    };
  }

  const undoSession = cloneSession(source);
  const fromPosition = player.position;
  const nextPosition = Math.min(43, fromPosition + die);
  player.position = nextPosition;
  player.finished = nextPosition >= 43;
  session.die = die;
  session.phase = "Resolve";
  session.physicalChecks = defaultPhysicalChecks();
  session.lastPhysicalMove = {
    playerId: player.id,
    fromSpaceId: `S${String(fromPosition).padStart(2, "0")}`,
    die,
    expectedSpaceId: `S${String(nextPosition).padStart(2, "0")}`,
    confirmed: false,
  };
  beginResolutionMutable(session, game, player, fromPosition, die);
  session.updatedAt = dependencies.now();

  return {
    session,
    undoSession,
    announcement: `${player.name} rolled ${die} and moves to S${String(
      nextPosition,
    ).padStart(2, "0")}. Confirm the physical pawn position.`,
  };
}

export function cancelRoll(
  source: GameSession,
  undoSession: GameSession | null,
  dependencies: RandomDependencies = defaultDependencies(),
): DomainResult {
  if (
    !undoSession ||
    !source.pendingResolution ||
    source.pendingResolution.completed
  ) {
    return unchanged(source, {
      error: "There is no unresolved roll to undo.",
    });
  }
  const session = cloneSession(undoSession);
  return result(session, dependencies, {
    message: "Roll cancelled. Pawn and deck state restored.",
  });
}

function cardForDeck(
  game: GameDefinition,
  deckKey: DrawDeckKey,
  cardId: string,
) {
  switch (deckKey) {
    case "investments":
      return getCard(game, "investments", cardId);
    case "events":
      return getCard(game, "events", cardId);
    case "ethics":
      return getCard(game, "ethics", cardId);
    case "actions":
      return getCard(game, "actions", cardId);
    case "reflection":
      return getCard(game, "reflection", cardId);
  }
}

function applyMarketEventMutable(
  session: GameSession,
  game: GameDefinition,
  event: MarketEventCard,
  source: string,
  dependencies: RandomDependencies,
): {
  beforePrices: PriceMap;
  afterPrices: PriceMap;
  appliedEffects: PriceMap;
} {
  const beforeValues = new Map(
    session.players.map((player) => [
      player.id,
      portfolioValue(player, session.prices),
    ]),
  );
  const beforePrices = { ...session.prices };
  const appliedEffects: PriceMap = {};

  Object.entries(event.priceEffects ?? {}).forEach(([assetId, delta]) => {
    const previous = Number(session.prices[assetId] ?? 1);
    const next = Math.max(1, previous + Number(delta));
    appliedEffects[assetId] = next - previous;
    session.prices[assetId] = next;
  });

  session.players.forEach((player) => {
    const trendDelta = Number(event.priceEffects?.trend ?? 0);
    if (
      player.profileId === "SP05" &&
      trendDelta < 0 &&
      Number(player.holdings.trend ?? 0) > 0 &&
      !player.profileBonuses.trendLossCharged
    ) {
      player.riskEvidence = Math.max(0, player.riskEvidence - 1);
      player.profileBonuses.trendLossCharged = true;
      logActivity(
        session,
        dependencies,
        `${player.name} triggered Trend Chaser risk penalty.`,
      );
    }

    const insuranceAsset = player.pending.insuranceAsset;
    if (
      insuranceAsset &&
      Number(event.priceEffects?.[insuranceAsset] ?? 0) < 0
    ) {
      player.cash += 3_000;
      logActivity(
        session,
        dependencies,
        `${player.name} collected ${money(3_000)} from Insurance Hedge.`,
      );
    }
    if (insuranceAsset) delete player.pending.insuranceAsset;

    const stopLossAsset = player.pending.stopLossAsset;
    if (
      stopLossAsset &&
      Number(event.priceEffects?.[stopLossAsset] ?? 0) < 0
    ) {
      const units = Number(player.holdings[stopLossAsset] ?? 0);
      if (units > 0) {
        const compensation =
          Math.ceil(Math.abs(Number(event.priceEffects[stopLossAsset])) / 2) *
          units *
          1_000;
        player.cash += compensation;
        logActivity(
          session,
          dependencies,
          `${player.name} used Stop-Loss for ${money(compensation)} protection.`,
        );
      }
    }
    if (stopLossAsset) delete player.pending.stopLossAsset;

    if (player.pending.reserveReady) {
      const after = portfolioValue(player, session.prices);
      if (
        Number(player.holdings.cash ?? 0) > 0 &&
        after < Number(beforeValues.get(player.id) ?? after)
      ) {
        player.cash += 4_000;
        logActivity(
          session,
          dependencies,
          `${player.name} used Emergency Reserve for ${money(4_000)}.`,
        );
      }
      delete player.pending.reserveReady;
    }
  });

  const activePlayer = currentPlayer(session);
  session.activeEvent = event;
  session.priceHistory.unshift({
    at: dependencies.now(),
    source,
    eventId: event.id,
    appliedEffects,
    prices: { ...session.prices },
  });
  session.priceHistory = session.priceHistory.slice(0, 40);
  session.marketHistory.unshift({
    at: dependencies.now(),
    source,
    playerId: activePlayer?.id ?? null,
    playerName: activePlayer?.name ?? null,
    turn: activePlayer ? activePlayer.turnsTaken + 1 : null,
    id: event.id,
    title: event.title,
    sentiment: event.sentiment,
    bias: event.bias,
    priceEffects: event.priceEffects,
    appliedEffects,
    prices: { ...session.prices },
  });
  session.marketHistory = session.marketHistory.slice(0, 30);
  logActivity(
    session,
    dependencies,
    `Reveal Event: ${event.id} ${event.title}.`,
  );

  return {
    beforePrices,
    afterPrices: { ...session.prices },
    appliedEffects,
  };
}

export function applyMarketEvent(
  sourceSession: GameSession,
  game: GameDefinition,
  event: MarketEventCard,
  eventSource: string,
  dependencies: RandomDependencies = defaultDependencies(),
): MarketEventResult {
  const session = cloneSession(sourceSession);
  const values = applyMarketEventMutable(
    session,
    game,
    event,
    eventSource,
    dependencies,
  );
  session.updatedAt = dependencies.now();
  return { session, ...values };
}

export function revealMarketEvent(
  source: GameSession,
  game: GameDefinition,
  eventSource: string,
  dependencies: RandomDependencies = defaultDependencies(),
): MarketEventResult {
  const session = cloneSession(source);
  const cardId = drawCard(session, "events", dependencies.random);
  const event = getCard(game, "events", cardId);
  const pending = session.pendingResolution;

  if (!event) {
    if (pending) {
      pending.result.push(
        "Market/Life deck is empty and no discard is available. No price change this turn.",
      );
      completeResolutionMutable(session);
    }
    return {
      session,
      message:
        "Market/Life deck is empty and no discard is available. No price change this turn.",
    };
  }

  const values = applyMarketEventMutable(
    session,
    game,
    event,
    eventSource,
    dependencies,
  );
  discardCard(session, "events", event.id);
  if (pending) {
    pending.cardDeck = "events";
    pending.cardId = event.id;
    pending.priceBefore = values.beforePrices;
    pending.priceAfter = values.afterPrices;
    pending.appliedEffects = values.appliedEffects;
    pending.result.push(
      `${event.id} ${event.title} revealed. Price floor of 1 enforced.`,
    );
    completeResolutionMutable(session);
  }
  session.updatedAt = dependencies.now();
  return { session, ...values };
}

export function takeNextSyncedCard(
  source: GameSession,
  game: GameDefinition,
  dependencies: RandomDependencies = defaultDependencies(),
): DomainResult {
  const deckKey = source.pendingResolution?.cardDeck;
  if (!deckKey) {
    return unchanged(source, {
      error: "The current space does not need a printed card.",
    });
  }
  const session = cloneSession(source);
  const cardId = nextSyncedCardId(session, deckKey, dependencies.random);
  if (!cardId) {
    return {
      session,
      error: `${DRAW_DECK_LABELS[deckKey]} deck has no app-synced card available.`,
    };
  }
  return applyPrintedCard(session, game, cardId, dependencies);
}

export function applyPrintedCard(
  source: GameSession,
  game: GameDefinition,
  rawCardId: unknown,
  dependencies: RandomDependencies = defaultDependencies(),
): DomainResult {
  const cardId = normaliseCardId(rawCardId);
  const deckKey = deckKeyForCardId(cardId);
  const card = deckKey ? cardForDeck(game, deckKey, cardId) : null;
  if (!deckKey || !card) {
    return unchanged(source, {
      error: `No printed card found for ${cardId}.`,
    });
  }

  const session = cloneSession(source);
  const pending = session.pendingResolution;
  if (!pending) {
    return {
      session,
      message: `${card.id} ${card.title}`,
    };
  }

  const warnings: string[] = [];
  if (pending.cardDeck && pending.cardDeck !== deckKey) {
    warnings.push(
      `Current space expects ${DRAW_DECK_LABELS[pending.cardDeck]}, but ${card.id} is a ${DRAW_DECK_LABELS[deckKey]} card.`,
    );
  }
  warnings.push(
    ...takePrintedCard(session, deckKey, card.id, dependencies.random),
  );
  session.lastPhysicalCard = {
    at: dependencies.now(),
    deckKey,
    cardId: card.id,
    title: card.title,
    warnings,
  };
  pending.cardDeck = deckKey;
  pending.cardId = card.id;
  pending.deckConflict = warnings.join(" ");

  if (deckKey === "events") {
    const event = card as MarketEventCard;
    const before = { ...session.prices };
    const applied = applyMarketEventMutable(
      session,
      game,
      event,
      "physical-card",
      dependencies,
    );
    pending.priceBefore = before;
    pending.priceAfter = { ...session.prices };
    pending.appliedEffects = applied.appliedEffects;
    discardCard(session, deckKey, event.id);
    pending.result.push(
      `${event.id} ${event.title} applied from the printed Market/Life deck. Price floor of 1 enforced.`,
    );
    completeResolutionMutable(session);
  }

  return result(session, dependencies, { warnings });
}

export function investmentCost(player: Player, card: {
  asset: string;
  costIndex: number;
}): number {
  let cost = Number(card.costIndex ?? 0) * 1_000;
  if (
    player.profileId === "SP02" &&
    !player.profileBonuses.firstGrowthIndexDiscount &&
    ["growth", "index"].includes(card.asset)
  ) {
    cost -= 2_000;
  }
  if (player.profileId === "SP05" && card.asset === "trend") cost -= 1_000;
  if (
    player.pending.riskyDiscount &&
    ["growth", "crypto", "trend"].includes(card.asset)
  ) {
    cost -= Number(player.pending.riskyDiscount);
  }
  if (
    player.pending.diversifyDiscount &&
    uniqueHoldingCount(player) >= 1 &&
    uniqueHoldingCount(player) <= 2 &&
    Number(player.holdings[card.asset] ?? 0) === 0
  ) {
    cost -= Number(player.pending.diversifyDiscount);
  }
  return Math.max(1_000, cost);
}

function consumeInvestmentDiscounts(
  player: Player,
  card: { asset: string },
): void {
  if (
    player.profileId === "SP02" &&
    ["growth", "index"].includes(card.asset)
  ) {
    player.profileBonuses.firstGrowthIndexDiscount = true;
  }
  if (
    player.pending.riskyDiscount &&
    ["growth", "crypto", "trend"].includes(card.asset)
  ) {
    delete player.pending.riskyDiscount;
  }
  if (
    player.pending.diversifyDiscount &&
    Number(player.holdings[card.asset] ?? 0) === 1
  ) {
    delete player.pending.diversifyDiscount;
  }
}

export function buyInvestment(
  source: GameSession,
  game: GameDefinition,
  cardId: string,
  dependencies: RandomDependencies = defaultDependencies(),
): DomainResult {
  const session = cloneSession(source);
  const pending = session.pendingResolution;
  const player = currentPlayer(session);
  const card = getCard(game, "investments", cardId);
  if (!pending || !player || !card) {
    return unchanged(source, { error: "No investment is ready to buy." });
  }
  const cost = investmentCost(player, card);
  if (player.cash < cost) {
    return unchanged(source, {
      error: `${player.name} cannot afford ${card.title}.`,
    });
  }
  player.cash -= cost;
  player.holdings[card.asset] =
    Number(player.holdings[card.asset] ?? 0) + Number(card.units ?? 1);
  consumeInvestmentDiscounts(player, card);
  discardCard(session, "investments", card.id);
  completeResolutionMutable(
    session,
    `${player.name} bought ${card.title} for ${money(cost)}.`,
  );
  return result(session, dependencies);
}

export function passInvestment(
  source: GameSession,
  game: GameDefinition,
  cardId: string,
  dependencies: RandomDependencies = defaultDependencies(),
): DomainResult {
  const session = cloneSession(source);
  const card = getCard(game, "investments", cardId);
  if (card) discardCard(session, "investments", card.id);
  completeResolutionMutable(session, "Investment passed. Cash kept liquid.");
  return result(session, dependencies);
}

export function chooseEthics(
  source: GameSession,
  game: GameDefinition,
  choice: "profit" | "responsible",
  dependencies: RandomDependencies = defaultDependencies(),
): DomainResult {
  const session = cloneSession(source);
  const pending = session.pendingResolution;
  const player = currentPlayer(session);
  const card = pending ? getCard(game, "ethics", pending.cardId) : null;
  if (!pending || !player || !card) {
    return unchanged(source, { error: "No ethics choice is ready." });
  }
  const effect = card[choice];
  if (!effect) {
    return unchanged(source, { error: "That ethics choice is unavailable." });
  }

  player.cash += Number(effect.cash ?? 0);
  player.ethicsPosition += Number(effect.ethics ?? 0);
  let choiceResult = `${
    choice === "responsible" ? "Responsible" : "Profit"
  } option: ${money(effect.cash ?? 0)}, ethics ${signed(
    effect.ethics ?? 0,
  )}.`;

  if (choice === "responsible" && player.pending.ethicsAudit) {
    player.ethicsPosition += 1;
    delete player.pending.ethicsAudit;
    choiceResult += " Ethics Audit added +1 extra ethics.";
  }
  if (choice === "responsible" && effect.action) {
    const actionId = drawCard(session, "actions", dependencies.random);
    if (actionId) {
      discardCard(session, "actions", actionId);
      choiceResult += ` Bonus Action drawn and logged: ${actionId}.`;
    }
  }
  discardCard(session, "ethics", card.id);
  completeResolutionMutable(session, choiceResult);
  return result(session, dependencies);
}

function bestHolding(player: Player): string | undefined {
  return Object.entries(player.holdings)
    .filter(([, units]) => Number(units) > 0)
    .sort((left, right) => Number(right[1]) - Number(left[1]))[0]?.[0];
}

function bestRiskyHolding(player: Player): string | undefined {
  return Object.entries(player.holdings)
    .filter(
      ([assetId, units]) =>
        Number(units) > 0 &&
        ["growth", "crypto", "trend"].includes(assetId),
    )
    .sort((left, right) => Number(right[1]) - Number(left[1]))[0]?.[0];
}

function applyActionCardMutable(
  session: GameSession,
  game: GameDefinition,
  player: Player,
  card: ActionCard,
  assetId: string,
): string {
  let actionResult = `${card.id} ${card.title}: ${card.text}`;
  switch (card.type) {
    case "research": {
      session.peekedEventId = session.decks.events[0] ?? null;
      const nextEvent = getCard(game, "events", session.peekedEventId);
      actionResult += nextEvent
        ? ` Peeked next event: ${nextEvent.id} ${nextEvent.title}.`
        : " No event available to peek.";
      break;
    }
    case "discount-risky":
      player.pending.riskyDiscount = 2_000;
      actionResult +=
        " Next Growth/Crypto/Trend buy gets INR 2000 discount.";
      break;
    case "loss-limit":
      player.pending.stopLossAsset =
        assetId || bestRiskyHolding(player) || "growth";
      actionResult += ` Stop-Loss armed for ${
        getAsset(game, player.pending.stopLossAsset).name
      }.`;
      break;
    case "hedge":
      player.pending.insuranceAsset =
        assetId || bestHolding(player) || "growth";
      actionResult += ` Insurance Hedge armed for ${
        getAsset(game, player.pending.insuranceAsset).name
      }.`;
      break;
    case "cash-buffer":
      if (player.cash >= 20_000) {
        player.riskEvidence += 2;
        actionResult += " Cash condition met: +2 risk evidence.";
      } else {
        actionResult += " Cash below INR 20000: no evidence bonus yet.";
      }
      break;
    case "reserve":
      player.pending.reserveReady = true;
      actionResult +=
        " Emergency Reserve armed for the next portfolio fall while holding Cash.";
      break;
    case "rebalance":
      player.pending.freeRebalance = true;
      player.riskEvidence += 1;
      actionResult +=
        " Free rebalance armed and +1 risk evidence added.";
      break;
    case "risk-check":
      player.riskEvidence += 1;
      actionResult += " Second Opinion completed: +1 risk evidence.";
      break;
    case "explain":
      player.reflectionEvidence += 2;
      actionResult += " Peer Review completed: +2 reflection evidence.";
      break;
    case "hold":
      player.cash += 1_000;
      player.riskEvidence += 1;
      actionResult +=
        " Market Patience applied: INR 1000 and +1 risk evidence.";
      break;
    case "ethics-boost":
      player.pending.ethicsAudit = true;
      actionResult +=
        " Next responsible ethics choice gains +1 extra ethics.";
      break;
    case "diversify":
      player.pending.diversifyDiscount = 2_000;
      actionResult +=
        " Next new category buy can receive INR 2000 discount.";
      break;
    default:
      actionResult += " Host logged the action.";
  }
  return actionResult;
}

export function resolveActionCard(
  source: GameSession,
  game: GameDefinition,
  assetId = "",
  dependencies: RandomDependencies = defaultDependencies(),
): DomainResult {
  const session = cloneSession(source);
  const pending = session.pendingResolution;
  const player = currentPlayer(session);
  const card = pending ? getCard(game, "actions", pending.cardId) : null;
  if (!pending || !player || !card) {
    return unchanged(source, { error: "No action card is ready." });
  }
  const actionResult = applyActionCardMutable(
    session,
    game,
    player,
    card,
    assetId,
  );
  discardCard(session, "actions", card.id);
  completeResolutionMutable(session, actionResult);
  return result(session, dependencies);
}

export function scoreReflection(
  source: GameSession,
  game: GameDefinition,
  score: number,
  dependencies: RandomDependencies = defaultDependencies(),
): DomainResult {
  const session = cloneSession(source);
  const pending = session.pendingResolution;
  const player = currentPlayer(session);
  const card = pending ? getCard(game, "reflection", pending.cardId) : null;
  if (!pending || !player) {
    return unchanged(source, { error: "No reflection is ready to score." });
  }
  const value = clamp(Number(score), 0, 10);
  player.reflectionEvidence += value;
  if (card) discardCard(session, "reflection", card.id);
  completeResolutionMutable(
    session,
    `Reflection evidence scored +${value}.`,
  );
  return result(session, dependencies);
}

export function applyChoice(
  source: GameSession,
  game: GameDefinition,
  choiceIndex: number,
  dependencies: RandomDependencies = defaultDependencies(),
): DomainResult {
  const session = cloneSession(source);
  const pending = session.pendingResolution;
  const player = currentPlayer(session);
  const space = pending ? getSpace(game, pending.spaceId) : null;
  if (!pending || !player || !space) {
    return unchanged(source, { error: "No board choice is ready." });
  }

  let choiceResult: string;
  if (space.id === "S04") {
    if (choiceIndex === 0) {
      player.riskEvidence += 1;
      choiceResult = "Safe choice: +1 risk-management evidence.";
    } else {
      player.position = Math.min(43, player.position + 1);
      choiceResult =
        "Risky choice: advanced +1 space. New space will not resolve until next turn.";
    }
  } else if (space.id === "S14") {
    if (choiceIndex === 0) {
      player.ethicsPosition += 1;
      choiceResult = "Responsible choice: +1 ethics.";
    } else {
      choiceResult = "Profit-first choice: no ethics bonus.";
    }
  } else if (space.id === "S26") {
    if (choiceIndex === 0) {
      player.riskEvidence += 1;
      choiceResult = "Held cash: +1 risk-management evidence.";
    } else {
      player.position = Math.min(43, player.position + 1);
      choiceResult =
        "Chased return: advanced +1 space. New space will not resolve until next turn.";
    }
  } else if (space.id === "S38") {
    if (choiceIndex === 0) {
      player.ethicsPosition += 1;
      choiceResult = "Impact choice: +1 ethics.";
    } else {
      player.position = Math.min(43, player.position + 1);
      choiceResult =
        "Profit sprint: advanced +1 space. New space will not resolve until next turn.";
    }
  } else {
    choiceResult = space.choices?.[choiceIndex] ?? "Choice logged.";
  }

  completeResolutionMutable(session, choiceResult);
  return result(session, dependencies);
}

function sellHoldingMutable(
  session: GameSession,
  game: GameDefinition,
  player: Player,
  assetId: string,
  silent: boolean,
  dependencies: RandomDependencies,
): boolean {
  const units = Number(player.holdings[assetId] ?? 0);
  if (units <= 0) return false;
  const remaining = units - 1;
  if (remaining <= 0) delete player.holdings[assetId];
  else player.holdings[assetId] = remaining;
  const saleValue = Number(session.prices[assetId] ?? 0) * 1_000;
  player.cash += saleValue;
  if (!silent) {
    logActivity(
      session,
      dependencies,
      `${player.name} sold 1 ${getAsset(game, assetId).name} for ${money(
        saleValue,
      )}.`,
    );
  }
  return true;
}

export function sellHolding(
  source: GameSession,
  game: GameDefinition,
  playerId: string,
  assetId: string,
  silent = false,
  dependencies: RandomDependencies = defaultDependencies(),
): DomainResult {
  const session = cloneSession(source);
  const player = session.players.find((candidate) => candidate.id === playerId);
  if (
    !player ||
    !sellHoldingMutable(
      session,
      game,
      player,
      assetId,
      silent,
      dependencies,
    )
  ) {
    return unchanged(source, { error: "That holding is not available to sell." });
  }
  return result(session, dependencies);
}

export function completeRebalance(
  source: GameSession,
  dependencies: RandomDependencies = defaultDependencies(),
): DomainResult {
  const session = cloneSession(source);
  const player = currentPlayer(session);
  if (!player) {
    return unchanged(source, { error: "No player is ready to rebalance." });
  }
  player.riskEvidence += 1;
  if (player.pending.freeRebalance) delete player.pending.freeRebalance;
  completeResolutionMutable(
    session,
    "Rebalance completed: +1 risk-management evidence.",
  );
  return result(session, dependencies);
}

function applyProfileEndTurnBonuses(
  session: GameSession,
  player: Player,
  dependencies: RandomDependencies,
): void {
  if (
    player.profileId === "SP01" &&
    player.turnsTaken === 1 &&
    player.cash >= 20_000 &&
    !player.profileBonuses.budgetBuilderRisk
  ) {
    player.riskEvidence += 1;
    player.profileBonuses.budgetBuilderRisk = true;
    logActivity(
      session,
      dependencies,
      `${player.name} earned Budget Builder +1 risk evidence.`,
    );
  }
  if (
    player.profileId === "SP04" &&
    player.turnsTaken <= 3 &&
    uniqueHoldingCount(player) >= 3 &&
    !player.profileBonuses.balancedPlannerReflection
  ) {
    player.reflectionEvidence += 2;
    player.profileBonuses.balancedPlannerReflection = true;
    logActivity(
      session,
      dependencies,
      `${player.name} earned Balanced Planner +2 reflection evidence.`,
    );
  }
}

export function endTurn(
  source: GameSession,
  game: GameDefinition,
  noteValue: string,
  dependencies: RandomDependencies = defaultDependencies(),
): DomainResult {
  const session = cloneSession(source);
  const pending = session.pendingResolution;
  const player = currentPlayer(session);
  if (!player || !pending?.completed) {
    return unchanged(source, {
      error: "Resolve the space before ending the turn.",
    });
  }

  const note = noteValue.trim();
  if (!note) {
    return unchanged(source, {
      error:
        "Record one decision, finance term, or evidence note before ending the turn.",
    });
  }

  session.physicalChecks.evidenceNote = true;
  const missing = missingPhysicalChecks(session);
  if (missing.length) {
    return unchanged(source, {
      error: `Finish the physical checklist first: ${missing
        .map((key) => PHYSICAL_CHECK_LABELS[key])
        .join(", ")}.`,
    });
  }

  player.decisions.unshift({
    at: dependencies.now(),
    turn: player.turnsTaken + 1,
    die: pending.die,
    spaceId: pending.spaceId,
    type: pending.type,
    cardId: pending.cardId,
    result: pending.result.join(" "),
    note,
  });
  player.decisions = player.decisions.slice(0, 30);
  player.turnsTaken += 1;
  player.finished =
    player.finished ||
    player.position >= 43 ||
    player.turnsTaken >= game.turnLimit;
  applyProfileEndTurnBonuses(session, player, dependencies);
  logActivity(
    session,
    dependencies,
    `${player.name} ended turn ${player.turnsTaken} at S${String(
      player.position,
    ).padStart(2, "0")}.`,
  );

  session.pendingResolution = null;
  session.physicalChecks = defaultPhysicalChecks();
  session.die = null;
  session.peekedEventId = null;
  if (isGameOver(session, game)) {
    session.gameOver = true;
    session.phase = "Scoring";
    session.view = "scoring";
    return result(session, dependencies, {
      announcement: "All players have finished. Final scoring is ready.",
    });
  }

  advanceCurrentPlayer(session, game.turnLimit);
  session.phase = "Roll";
  return result(session, dependencies, {
    announcement: `Turn ended. ${
      currentPlayer(session)?.name ?? "The next player"
    } is ready to roll.`,
  });
}

export function adjustPlayer(
  source: GameSession,
  playerId: string,
  field: AdjustablePlayerField,
  delta: number,
  reason = "Manual correction.",
  dependencies: RandomDependencies = defaultDependencies(),
): DomainResult {
  const session = cloneSession(source);
  const player = session.players.find((candidate) => candidate.id === playerId);
  if (!player) {
    return unchanged(source, { error: "The selected player is missing." });
  }
  if (!Number.isFinite(delta)) {
    return unchanged(source, { error: "Enter a valid correction amount." });
  }

  const before = Number(player[field] ?? 0);
  player[field] = before + Number(delta);
  if (field === "riskEvidence" || field === "reflectionEvidence") {
    player[field] = Math.max(0, player[field]);
  }
  if (field === "ethicsPosition") {
    player[field] = clamp(player[field], -5, 5);
  }
  const after = Number(player[field] ?? 0);
  const entry = {
    id: `adj-${dependencies.createId()}`,
    at: dependencies.now(),
    playerId: player.id,
    playerName: player.name,
    field,
    delta: after - before,
    before,
    after,
    reason,
  };
  session.manualAdjustments.unshift(entry);
  session.manualAdjustments = session.manualAdjustments.slice(0, 50);
  player.decisions.unshift({
    at: entry.at,
    turn: player.turnsTaken,
    spaceId: `S${String(player.position).padStart(2, "0")}`,
    type: "Manual adjustment",
    result: `${field} changed by ${signed(entry.delta)}.`,
    note: reason,
  });
  player.decisions = player.decisions.slice(0, 30);
  logActivity(
    session,
    dependencies,
    `${player.name} correction: ${field} ${signed(entry.delta)}.`,
  );
  return result(session, dependencies);
}

export function undoManualAdjustment(
  source: GameSession,
  dependencies: RandomDependencies = defaultDependencies(),
): DomainResult {
  const session = cloneSession(source);
  const entry = session.manualAdjustments.shift();
  if (!entry) {
    return unchanged(source, { error: "No manual correction to undo." });
  }
  const player = session.players.find(
    (candidate) => candidate.id === entry.playerId,
  );
  if (!player) {
    return unchanged(source, {
      error: "Original player is missing; undo was not applied.",
    });
  }
  player[entry.field] = entry.before;
  logActivity(
    session,
    dependencies,
    `Undid correction for ${player.name}: ${entry.field}.`,
  );
  return result(session, dependencies);
}

export function isHostEditable(role: "host" | "player" | null): boolean {
  return role !== "player";
}
