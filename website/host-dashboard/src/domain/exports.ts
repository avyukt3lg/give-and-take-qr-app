import {
  calculateScores,
  missingEvidence,
  playerNotesText,
  portfolioValue,
  scoreStateLabel,
  uniqueHoldingCount,
} from "./scoring";
import { cloneSession } from "./session";
import type {
  ExportSummary,
  GameDefinition,
  GameSession,
  Player,
  ScoreResult,
} from "./types";

export function money(value: number): string {
  return `INR ${Math.round(value).toLocaleString("en-IN")}`;
}

export function exportSummary(
  session: GameSession,
  game: GameDefinition,
): ExportSummary {
  const notes = session.players.reduce(
    (sum, player) => sum + player.decisions.length,
    0,
  );
  const cardsDrawn = session.players.reduce(
    (sum, player) =>
      sum + player.decisions.filter((decision) => decision.cardId).length,
    0,
  );
  const totalTurns = session.players.reduce(
    (sum, player) => sum + player.turnsTaken,
    0,
  );

  return {
    code: session.code,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    playerCount: session.players.length,
    totalTurns,
    events: session.marketHistory.length,
    cardsDrawn,
    notes,
    scoreState: scoreStateLabel(session, game),
    saveMode: "Backend: Supabase",
  };
}

export function exportSessionSnapshot(session: GameSession): Omit<
  GameSession,
  "schema"
> {
  const snapshot = cloneSession(session);
  delete (snapshot as Partial<GameSession>).schema;
  return snapshot as Omit<GameSession, "schema">;
}

export function buildEvidencePayload(
  session: GameSession,
  game: GameDefinition,
  exportedAt: string,
): Record<string, unknown> {
  return {
    exportedAt,
    app: "Give And Take QR session app",
    accessModel:
      "Host and players use the table code shown on the physical board or shared by the host.",
    summary: exportSummary(session, game),
    session: exportSessionSnapshot(session),
    manualAdjustments: session.manualAdjustments,
    scorePreview: calculateScores(session, game).map((score) => ({
      playerId: score.player.id,
      name: score.player.name,
      portfolioValue: score.value,
      portfolioScore: score.portfolioScore,
      diversificationScore: score.diversificationScore,
      riskManagementScore: score.riskManagementScore,
      ethicsScore: score.ethicsScore,
      reflectionScore: score.reflectionScore,
      total: score.total,
    })),
    rulesLock: {
      movement: game.prototypeContract.movement,
      turnLimit: game.turnLimit,
      boardSpaces: game.boardSpaces.length,
      cardCounts: game.componentCounts,
      scoreWeights: game.scoreWeights,
    },
  };
}

export function exportEvidence(
  session: GameSession,
  game: GameDefinition,
  exportedAt = new Date().toISOString(),
): string {
  return JSON.stringify(buildEvidencePayload(session, game, exportedAt), null, 2);
}

export function csvEscape(value: unknown): string {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function holdingsSummaryText(
  player: Player,
  session: GameSession,
  game: GameDefinition,
): string {
  return game.assets
    .map((asset) => {
      const units = Number(player.holdings?.[asset.id] ?? 0);
      const index = Number(
        session.prices[asset.id] ?? asset.startIndex ?? 0,
      );
      const value = units * index * 1_000;
      return `${asset.name}: ${units} units, index ${index}, value ${money(value)}`;
    })
    .join(" | ");
}

export function scoreBreakdownText(score: ScoreResult): string {
  return `Portfolio ${score.portfolioScore}/25; Diversify ${score.diversificationScore}/20; Risk ${score.riskManagementScore}/15; Ethics ${score.ethicsScore}/20; Reflection ${score.reflectionScore}/20; Total ${score.total}/100`;
}

export function exportCsv(
  session: GameSession,
  game: GameDefinition,
): string {
  const scoresByPlayer = new Map(
    calculateScores(session, game).map((score) => [score.player.id, score]),
  );
  const rows: unknown[][] = [
    [
      "player",
      "turns_taken",
      "cash",
      "portfolio_value",
      "asset_categories",
      "risk_evidence",
      "ethics_position",
      "reflection_evidence",
      "notes",
      "player_notes",
      "holdings_summary",
      "portfolio_score",
      "diversification_score",
      "risk_score",
      "ethics_score",
      "reflection_score",
      "total_score",
      "score_breakdown",
      "missing_evidence",
    ],
  ];

  session.players.forEach((player) => {
    const score = scoresByPlayer.get(player.id);
    rows.push([
      player.name,
      `${player.turnsTaken}/${game.turnLimit}`,
      player.cash,
      score?.value ?? portfolioValue(player, session.prices),
      uniqueHoldingCount(player),
      player.riskEvidence,
      player.ethicsPosition,
      player.reflectionEvidence,
      player.decisions.length,
      playerNotesText(player),
      holdingsSummaryText(player, session, game),
      score?.portfolioScore ?? 0,
      score?.diversificationScore ?? 0,
      score?.riskManagementScore ?? 0,
      score?.ethicsScore ?? 0,
      score?.reflectionScore ?? 0,
      score?.total ?? 0,
      score ? scoreBreakdownText(score) : "",
      missingEvidence(player, session, game).join("; "),
    ]);
  });

  return rows.map((row) => row.map(csvEscape).join(",")).join("\n");
}
