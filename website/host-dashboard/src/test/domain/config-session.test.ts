import { describe, expect, it } from "vitest";

import {
  BOARD_SPACE_COUNT,
  CARD_COUNT,
  DRAW_DECK_KEYS,
  STORAGE_KEYS,
} from "../../domain/constants";
import {
  normaliseCardId,
  normaliseSessionCode,
  normaliseSpaceId,
} from "../../domain/game-config";
import {
  createSession,
  ensureSessionShape,
  shuffled,
} from "../../domain/session";
import { fixedDependencies, game } from "./fixtures";

describe("locked game configuration", () => {
  it("keeps the S00-S43 route and complete 81-card set", () => {
    expect(game.boardSpaces).toHaveLength(BOARD_SPACE_COUNT);
    expect(game.boardSpaces[0]?.id).toBe("S00");
    expect(game.boardSpaces[43]?.id).toBe("S43");
    expect(Object.values(game.cards).flat()).toHaveLength(CARD_COUNT);
    expect(game.turnLimit).toBe(12);
    expect(game.scoreWeights).toEqual({
      portfolioValue: 25,
      diversification: 20,
      riskManagement: 15,
      ethics: 20,
      reflection: 20,
    });
  });

  it("retains all five draw decks", () => {
    expect(DRAW_DECK_KEYS).toEqual([
      "investments",
      "events",
      "ethics",
      "actions",
      "reflection",
    ]);
    expect(game.cards.investments).toHaveLength(18);
    expect(game.cards.events).toHaveLength(18);
    expect(game.cards.ethics).toHaveLength(12);
    expect(game.cards.actions).toHaveLength(12);
    expect(game.cards.reflection).toHaveLength(10);
  });
});

describe("legacy identifiers and session hydration", () => {
  it("locks the exact v1/v5 storage keys", () => {
    expect(STORAGE_KEYS).toEqual({
      auth: "give-and-take:auth:v1",
      backend: "give-and-take:backend:v1",
      client: "give-and-take:client:v1",
      session: "give-and-take:table:v5",
      ui: "give-and-take:ui:v1",
    });
  });

  it("normalises printed IDs exactly like the legacy application", () => {
    expect(normaliseCardId(" i-1 ")).toBe("I01");
    expect(normaliseCardId("M0008")).toBe("M08");
    expect(normaliseSpaceId("s99")).toBe("S43");
    expect(normaliseSpaceId("-3")).toBe("S03");
    expect(normaliseSessionCode("gt4827")).toBe("GT-4827");
    expect(normaliseSessionCode(" 4827 ")).toBe("GT-4827");
  });

  it("creates deterministic sessions without sharing mutable structures", () => {
    const dependencies = fixedDependencies([0]);
    const first = createSession(game, dependencies, "GT-1000");
    const second = createSession(
      game,
      fixedDependencies([0]),
      "GT-1000",
    );
    expect(first).toEqual(second);
    expect(first.schema).toBe(STORAGE_KEYS.session);
    expect(first.players).toEqual([]);
    expect(first.draft.playerCount).toBe(2);
    expect(first.priceHistory).toHaveLength(1);
    first.decks.actions.shift();
    expect(second.decks.actions).toHaveLength(12);
  });

  it("uses the legacy Fisher-Yates shuffle with an injected RNG", () => {
    expect(shuffled([1, 2, 3, 4], () => 0)).toEqual([2, 3, 4, 1]);
  });

  it("tolerantly fills missing v5 fields and preserves unknown session keys", () => {
    const hydrated = ensureSessionShape(
      {
        schema: STORAGE_KEYS.session,
        code: "GT-4827",
        createdAt: "old",
        players: [
          {
            id: "P1",
            name: "Asha",
            profileId: "SP01",
            cash: "1000",
          },
        ],
        customFutureField: { retained: true },
      },
      game,
      fixedDependencies(),
    );
    expect(hydrated.code).toBe("GT-4827");
    expect(hydrated.players[0]?.cash).toBe(1_000);
    expect(hydrated.players[0]?.pending).toEqual({});
    expect(hydrated.physicalChecks).toEqual({
      pawnMoved: false,
      cardDiscarded: false,
      playerBoardUpdated: false,
      evidenceNote: false,
      priceTrackerUpdated: false,
    });
    expect(hydrated.customFutureField).toEqual({ retained: true });
  });
});
