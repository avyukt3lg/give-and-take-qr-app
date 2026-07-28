import { describe, expect, it } from "vitest";

import {
  adjustPlayer,
  applyPrintedCard,
  buyInvestment,
  confirmPawnPosition,
  endTurn,
  rollDie,
  setPhysicalCheck,
  startSession,
  undoManualAdjustment,
} from "../../domain/game-engine";
import {
  fixedDependencies,
  freshSession,
  game,
  startedSession,
} from "./fixtures";

describe("session start", () => {
  it("rejects duplicate names and duplicate profiles", () => {
    const dependencies = fixedDependencies();
    const session = freshSession(dependencies);
    expect(
      startSession(
        session,
        game,
        [
          { name: "Same", profileId: "SP01" },
          { name: "same", profileId: "SP02" },
        ],
        dependencies,
      ).error,
    ).toContain("same name");
    expect(
      startSession(
        session,
        game,
        [
          { name: "A", profileId: "SP01" },
          { name: "B", profileId: "SP01" },
        ],
        dependencies,
      ).error,
    ).toContain("unique");
  });

  it("assigns the selected profile cash and SP03 ethics bonus", () => {
    const session = startedSession();
    expect(session.started).toBe(true);
    expect(session.phase).toBe("Roll");
    expect(session.players[0]).toMatchObject({
      name: "Asha",
      cash: 105_000,
      ethicsPosition: 0,
    });
    expect(session.players[1]).toMatchObject({
      name: "Dev",
      cash: 98_000,
      ethicsPosition: 1,
    });
  });
});

describe("physical turn engine", () => {
  it("moves using the physical die and resolves cash spaces", () => {
    const dependencies = fixedDependencies();
    const source = startedSession(dependencies);
    const rolled = rollDie(source, game, 1, dependencies);
    expect(rolled.error).toBeUndefined();
    expect(rolled.undoSession).toEqual(source);
    expect(rolled.session.players[0]?.position).toBe(1);
    expect(rolled.session.players[0]?.cash).toBe(113_000);
    expect(rolled.session.phase).toBe("Log");
    expect(rolled.session.pendingResolution).toMatchObject({
      fromSpaceId: "S00",
      spaceId: "S01",
      die: 1,
      completed: true,
      cashBefore: 105_000,
      cashAfter: 113_000,
    });
  });

  it("reconciles a printed investment and applies the exact purchase cost", () => {
    const dependencies = fixedDependencies();
    const source = startedSession(dependencies);
    source.decks.investments = [
      "I01",
      ...source.decks.investments.filter((id) => id !== "I01"),
    ];
    const rolled = rollDie(source, game, 2, dependencies);
    const card = applyPrintedCard(
      rolled.session,
      game,
      "i1",
      dependencies,
    );
    expect(card.warnings).toEqual([]);
    expect(card.session.pendingResolution).toMatchObject({
      cardDeck: "investments",
      cardId: "I01",
      completed: false,
    });
    const bought = buyInvestment(
      card.session,
      game,
      "I01",
      dependencies,
    );
    expect(bought.session.players[0]?.cash).toBe(95_000);
    expect(bought.session.players[0]?.holdings.cash).toBe(1);
    expect(bought.session.phase).toBe("Log");
    expect(bought.session.discards.investments).toContain("I01");
  });

  it("gates turn completion on the physical checklist and evidence note", () => {
    const dependencies = fixedDependencies();
    let session = rollDie(
      startedSession(dependencies),
      game,
      1,
      dependencies,
    ).session;
    expect(endTurn(session, game, "", dependencies).error).toContain(
      "Record one",
    );
    expect(endTurn(session, game, "Compared risk.", dependencies).error).toContain(
      "physical checklist",
    );
    session = confirmPawnPosition(session, dependencies).session;
    session = setPhysicalCheck(
      session,
      "playerBoardUpdated",
      true,
      dependencies,
    ).session;
    const ended = endTurn(
      session,
      game,
      "Compared risk and kept cash liquid.",
      dependencies,
    );
    expect(ended.error).toBeUndefined();
    expect(ended.session.players[0]?.turnsTaken).toBe(1);
    expect(ended.session.players[0]?.riskEvidence).toBe(1);
    expect(ended.session.currentPlayerIndex).toBe(1);
    expect(ended.session.phase).toBe("Roll");
    expect(ended.session.pendingResolution).toBeNull();
  });
});

describe("ledger corrections", () => {
  it("clamps evidence/ethics corrections and restores the latest value", () => {
    const dependencies = fixedDependencies();
    const source = startedSession(dependencies);
    const reduced = adjustPlayer(
      source,
      "P1",
      "riskEvidence",
      -5,
      "Corrected transcription.",
      dependencies,
    );
    expect(reduced.session.players[0]?.riskEvidence).toBe(0);
    expect(reduced.session.manualAdjustments[0]).toMatchObject({
      field: "riskEvidence",
      before: 0,
      after: 0,
      reason: "Corrected transcription.",
    });
    const ethics = adjustPlayer(
      reduced.session,
      "P1",
      "ethicsPosition",
      99,
      "Track correction.",
      dependencies,
    );
    expect(ethics.session.players[0]?.ethicsPosition).toBe(5);
    const undone = undoManualAdjustment(ethics.session, dependencies);
    expect(undone.session.players[0]?.ethicsPosition).toBe(0);
  });
});
