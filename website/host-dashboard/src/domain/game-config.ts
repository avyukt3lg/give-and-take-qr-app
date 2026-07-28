import { z } from "zod";

import {
  BOARD_SPACE_COUNT,
  CARD_COUNT,
  GAME_TURN_LIMIT,
  SCORE_DEFAULTS,
} from "./constants";
import type {
  ActionCard,
  AssetDefinition,
  BoardSpace,
  DrawDeckKey,
  EthicsCard,
  GameDefinition,
  GameIndexes,
  InvestmentCard,
  MarketEventCard,
  ReflectionCard,
} from "./types";

const assetSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    color: z.string().min(1),
    pattern: z.string().optional(),
    risk: z.coerce.number(),
    startIndex: z.coerce.number(),
  })
  .passthrough();

const boardSpaceSchema = z
  .object({
    id: z.string().regex(/^S(?:0[0-9]|[1-3][0-9]|4[0-3])$/),
    type: z.string().min(1),
    label: z.string().min(1),
    effect: z.string().optional(),
    cash: z.coerce.number().optional(),
    choices: z.array(z.string()).optional(),
  })
  .passthrough();

const starterProfileSchema = z
  .object({
    id: z.string().regex(/^SP[0-9]{2}$/),
    title: z.string().min(1),
    cash: z.coerce.number(),
    trait: z.string(),
    bonus: z.string(),
  })
  .passthrough();

const investmentSchema = z
  .object({
    id: z.string().regex(/^I[0-9]{2}$/),
    title: z.string().min(1),
    asset: z.string().min(1),
    units: z.coerce.number(),
    costIndex: z.coerce.number(),
    text: z.string(),
  })
  .passthrough();

const eventSchema = z
  .object({
    id: z.string().regex(/^M[0-9]{2}$/),
    title: z.string().min(1),
    sentiment: z.string(),
    bias: z.string(),
    priceEffects: z.record(z.string(), z.coerce.number()),
  })
  .passthrough();

const ethicsEffectSchema = z
  .object({
    cash: z.coerce.number().optional(),
    ethics: z.coerce.number().optional(),
    action: z.coerce.number().optional(),
  })
  .passthrough();

const ethicsSchema = z
  .object({
    id: z.string().regex(/^E[0-9]{2}$/),
    title: z.string().min(1),
    profit: ethicsEffectSchema,
    responsible: ethicsEffectSchema,
    prompt: z.string(),
  })
  .passthrough();

const actionSchema = z
  .object({
    id: z.string().regex(/^A[0-9]{2}$/),
    title: z.string().min(1),
    type: z.string().min(1),
    text: z.string(),
  })
  .passthrough();

const reflectionSchema = z
  .object({
    id: z.string().regex(/^R[0-9]{2}$/),
    title: z.string().min(1),
    prompt: z.string(),
  })
  .passthrough();

const referenceSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    text: z.string(),
  })
  .passthrough();

const scoreWeightsSchema = z
  .object({
    portfolioValue: z.coerce.number().default(SCORE_DEFAULTS.portfolioValue),
    diversification: z.coerce.number().default(SCORE_DEFAULTS.diversification),
    riskManagement: z.coerce.number().default(SCORE_DEFAULTS.riskManagement),
    ethics: z.coerce.number().default(SCORE_DEFAULTS.ethics),
    reflection: z.coerce.number().default(SCORE_DEFAULTS.reflection),
  })
  .default(SCORE_DEFAULTS);

export const gameConfigSchema = z
  .object({
    meta: z
      .object({
        title: z.string().optional(),
        version: z.string().optional(),
        turnLimit: z.coerce.number().optional(),
      })
      .passthrough()
      .default({}),
    prototypeContract: z
      .object({
        movement: z.string().optional(),
        turnLimit: z.coerce.number().optional(),
      })
      .passthrough()
      .default({}),
    componentCounts: z
      .record(z.string(), z.union([z.string(), z.coerce.number()]))
      .default({}),
    rules: z.record(z.string(), z.unknown()).default({}),
    assets: z.array(assetSchema),
    boardSpaces: z.array(boardSpaceSchema),
    cards: z.object({
      starterProfiles: z.array(starterProfileSchema),
      investments: z.array(investmentSchema),
      events: z.array(eventSchema),
      ethics: z.array(ethicsSchema),
      actions: z.array(actionSchema),
      reflection: z.array(reflectionSchema),
      quickReference: z.array(referenceSchema),
      qr: z.array(referenceSchema).default([]),
    }),
    scoreWeights: scoreWeightsSchema,
  })
  .passthrough();

function assertUniqueIds(
  label: string,
  items: readonly { id: string }[],
): void {
  const ids = items.map((item) => item.id);
  if (new Set(ids).size !== ids.length) {
    throw new Error(`${label} contains duplicate printed IDs.`);
  }
}

function assertPrototypeContract(game: GameDefinition): void {
  if (game.boardSpaces.length !== BOARD_SPACE_COUNT) {
    throw new Error(
      `Expected ${BOARD_SPACE_COUNT} board spaces, received ${game.boardSpaces.length}.`,
    );
  }

  const expectedSpaces = Array.from(
    { length: BOARD_SPACE_COUNT },
    (_, index) => `S${String(index).padStart(2, "0")}`,
  );
  const actualSpaces = game.boardSpaces.map((space) => space.id);
  if (expectedSpaces.some((id, index) => actualSpaces[index] !== id)) {
    throw new Error("Board spaces must be the ordered S00-S43 route.");
  }

  const cardArrays = Object.values(game.cards);
  const totalCards = cardArrays.reduce((total, cards) => total + cards.length, 0);
  if (totalCards !== CARD_COUNT) {
    throw new Error(
      `Expected the locked ${CARD_COUNT}-card prototype, received ${totalCards} cards.`,
    );
  }

  assertUniqueIds("Assets", game.assets);
  assertUniqueIds("Board", game.boardSpaces);
  assertUniqueIds("Cards", cardArrays.flat());
}

export function normaliseGame(rawConfig: unknown): GameDefinition {
  const config = gameConfigSchema.parse(rawConfig);
  const game: GameDefinition = {
    title: config.meta.title ?? "Give And Take",
    version: config.meta.version ?? "local",
    turnLimit: Number(
      config.prototypeContract.turnLimit ??
        config.meta.turnLimit ??
        GAME_TURN_LIMIT,
    ),
    meta: config.meta,
    prototypeContract: config.prototypeContract,
    componentCounts: config.componentCounts,
    rules: config.rules,
    assets: config.assets as AssetDefinition[],
    boardSpaces: config.boardSpaces as BoardSpace[],
    cards: {
      starterProfiles: config.cards.starterProfiles,
      investments: config.cards.investments as InvestmentCard[],
      events: config.cards.events as MarketEventCard[],
      ethics: config.cards.ethics as EthicsCard[],
      actions: config.cards.actions as ActionCard[],
      reflection: config.cards.reflection as ReflectionCard[],
      quickReference: config.cards.quickReference,
      qr: config.cards.qr,
    },
    scoreWeights: config.scoreWeights,
  };

  assertPrototypeContract(game);
  return game;
}

export const normalizeGame = normaliseGame;

export function buildGameIndexes(game: GameDefinition): GameIndexes {
  return {
    assets: new Map(game.assets.map((asset) => [asset.id, asset])),
    spaces: new Map(game.boardSpaces.map((space) => [space.id, space])),
    cards: {
      investments: new Map(
        game.cards.investments.map((card) => [card.id, card]),
      ),
      events: new Map(game.cards.events.map((card) => [card.id, card])),
      ethics: new Map(game.cards.ethics.map((card) => [card.id, card])),
      actions: new Map(game.cards.actions.map((card) => [card.id, card])),
      reflection: new Map(
        game.cards.reflection.map((card) => [card.id, card]),
      ),
    },
  };
}

export function getCard(
  game: GameDefinition,
  deckKey: "investments",
  cardId: string | null | undefined,
): InvestmentCard | null;
export function getCard(
  game: GameDefinition,
  deckKey: "events",
  cardId: string | null | undefined,
): MarketEventCard | null;
export function getCard(
  game: GameDefinition,
  deckKey: "ethics",
  cardId: string | null | undefined,
): EthicsCard | null;
export function getCard(
  game: GameDefinition,
  deckKey: "actions",
  cardId: string | null | undefined,
): ActionCard | null;
export function getCard(
  game: GameDefinition,
  deckKey: "reflection",
  cardId: string | null | undefined,
): ReflectionCard | null;
export function getCard(
  game: GameDefinition,
  deckKey: DrawDeckKey,
  cardId: string | null | undefined,
):
  | InvestmentCard
  | MarketEventCard
  | EthicsCard
  | ActionCard
  | ReflectionCard
  | null {
  if (!cardId) return null;
  return game.cards[deckKey].find((card) => card.id === cardId) ?? null;
}

export function getAsset(
  game: GameDefinition,
  assetId: string,
): AssetDefinition {
  return (
    game.assets.find((asset) => asset.id === assetId) ?? {
      id: assetId,
      name: assetId,
      color: "#d4af37",
      risk: 0,
      startIndex: 0,
    }
  );
}

export function getSpace(
  game: GameDefinition,
  spaceId: string,
): BoardSpace | null {
  return game.boardSpaces.find((space) => space.id === spaceId) ?? null;
}

export function normaliseCardId(value: unknown): string {
  const raw = String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  const match = raw.match(/^([IMEAR])0*([0-9]{1,2})$/);
  return match
    ? `${match[1]}${String(Number(match[2])).padStart(2, "0")}`
    : raw;
}

export const normalizeCardId = normaliseCardId;

export function normaliseSpaceId(value: unknown): string {
  const raw = String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^S0-9]/g, "");
  const digits = raw.replace(/[^0-9]/g, "");
  if (!digits) return raw;
  const index = Math.max(0, Math.min(43, Number(digits)));
  return `S${String(index).padStart(2, "0")}`;
}

export const normalizeSpaceId = normaliseSpaceId;

export function normaliseSessionCode(value: unknown): string {
  const raw = String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  const digits = raw.replace(/[^0-9]/g, "");
  if (/^GT-[0-9]{4}$/.test(raw)) return raw;
  if (/^GT[0-9]{4}$/.test(raw)) return `GT-${raw.slice(2)}`;
  if (digits.length === 4) return `GT-${digits}`;
  return raw;
}

export const normalizeSessionCode = normaliseSessionCode;

export function deckKeyForCardId(cardId: unknown): DrawDeckKey | null {
  const prefix = String(cardId ?? "")
    .trim()
    .toUpperCase()[0];
  return (
    {
      I: "investments",
      M: "events",
      E: "ethics",
      A: "actions",
      R: "reflection",
    } satisfies Record<string, DrawDeckKey>
  )[prefix ?? ""] ?? null;
}

export function findCardByPrintedId(
  game: GameDefinition,
  value: unknown,
): {
  deckKey: DrawDeckKey;
  card:
    | InvestmentCard
    | MarketEventCard
    | EthicsCard
    | ActionCard
    | ReflectionCard;
} | null {
  const cardId = normaliseCardId(value);
  const deckKey = deckKeyForCardId(cardId);
  if (!deckKey) return null;
  const card = game.cards[deckKey].find((item) => item.id === cardId);
  return card ? { deckKey, card } : null;
}
