import { describe, expect, it } from "vitest";

import {
  buildEvidencePayload,
  exportCsv,
  exportEvidence,
} from "../../domain/exports";
import { calculateScores } from "../../domain/scoring";
import { game, startedSession } from "./fixtures";

describe("score parity", () => {
  it("uses portfolio normalization and the locked 25/20/15/20/20 weights", () => {
    const session = startedSession();
    const first = session.players[0];
    const second = session.players[1];
    if (!first || !second) throw new Error("Fixture players missing.");

    first.cash = 100_000;
    first.holdings = {};
    first.riskEvidence = 0;
    first.ethicsPosition = 0;
    first.reflectionEvidence = 0;

    second.cash = 50_000;
    second.holdings = {};
    second.riskEvidence = 0;
    second.ethicsPosition = 0;
    second.reflectionEvidence = 0;

    const scores = calculateScores(session, game);
    expect(scores.map((score) => ({
      id: score.player.id,
      portfolio: score.portfolioScore,
      risk: score.riskManagementScore,
      ethics: score.ethicsScore,
      total: score.total,
    }))).toEqual([
      { id: "P1", portfolio: 25, risk: 4, ethics: 10, total: 39 },
      { id: "P2", portfolio: 13, risk: 4, ethics: 10, total: 27 },
    ]);
  });

  it("caps risk, ethics and reflection while preserving diversification", () => {
    const session = startedSession();
    const player = session.players[0];
    if (!player) throw new Error("Fixture player missing.");
    player.cash = 25_000;
    player.holdings = {
      bond: 1,
      index: 1,
      growth: 1,
      crypto: 1,
      ethical: 1,
    };
    player.riskEvidence = 20;
    player.ethicsPosition = 20;
    player.reflectionEvidence = 50;
    const score = calculateScores(session, game).find(
      (candidate) => candidate.player.id === player.id,
    );
    expect(score).toMatchObject({
      diversificationScore: 20,
      riskManagementScore: 15,
      ethicsScore: 20,
      reflectionScore: 20,
    });
  });
});

describe("evidence export parity", () => {
  it("omits the local schema marker and locks the evidence envelope", () => {
    const session = startedSession();
    const payload = buildEvidencePayload(
      session,
      game,
      "2026-07-28T12:00:00.000Z",
    );
    expect(payload).toMatchObject({
      exportedAt: "2026-07-28T12:00:00.000Z",
      app: "Give And Take QR session app",
      summary: {
        code: "GT-4827",
        playerCount: 2,
        saveMode: "Backend: Supabase",
      },
      rulesLock: {
        turnLimit: 12,
        boardSpaces: 44,
        scoreWeights: {
          portfolioValue: 25,
          diversification: 20,
          riskManagement: 15,
          ethics: 20,
          reflection: 20,
        },
      },
    });
    expect((payload.session as Record<string, unknown>).schema).toBeUndefined();
    expect(() =>
      JSON.parse(
        exportEvidence(
          session,
          game,
          "2026-07-28T12:00:00.000Z",
        ),
      ),
    ).not.toThrow();
  });

  it("retains the exact CSV header and escapes evidence notes", () => {
    const session = startedSession();
    const player = session.players[0];
    if (!player) throw new Error("Fixture player missing.");
    player.decisions[0]!.note = 'Compared "risk", return';
    const csv = exportCsv(session, game);
    const [header, firstRow] = csv.split("\n");
    expect(header).toBe(
      "player,turns_taken,cash,portfolio_value,asset_categories,risk_evidence,ethics_position,reflection_evidence,notes,player_notes,holdings_summary,portfolio_score,diversification_score,risk_score,ethics_score,reflection_score,total_score,score_breakdown,missing_evidence",
    );
    expect(firstRow).toContain('""risk""');
  });
});
