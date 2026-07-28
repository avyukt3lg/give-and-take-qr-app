import { SCORE_DEFAULTS } from "./constants";
import type {
  GameDefinition,
  GameSession,
  Player,
  ScoreResult,
} from "./types";

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export function portfolioValue(
  player: Player,
  prices: GameSession["prices"],
): number {
  const holdingValue = Object.entries(player.holdings ?? {}).reduce(
    (sum, [assetId, units]) =>
      sum + Number(units || 0) * Number(prices[assetId] || 0) * 1_000,
    0,
  );
  return Number(player.cash || 0) + holdingValue;
}

export function uniqueHoldingCount(player: Player): number {
  return Object.values(player.holdings ?? {}).filter(
    (units) => Number(units) > 0,
  ).length;
}

export function isGameOver(
  session: GameSession,
  game: GameDefinition,
): boolean {
  return (
    session.players.length > 0 &&
    session.players.every(
      (player) => player.finished || player.turnsTaken >= game.turnLimit,
    )
  );
}

export function scoreStateLabel(
  session: GameSession,
  game: GameDefinition,
): "Final Review" | "Provisional Scoreboard" {
  return session.gameOver || isGameOver(session, game)
    ? "Final Review"
    : "Provisional Scoreboard";
}

export function calculateScores(
  session: GameSession,
  game: GameDefinition,
): ScoreResult[] {
  const values = session.players.map((player) =>
    portfolioValue(player, session.prices),
  );
  const highest = Math.max(1, ...values);
  const weights = {
    portfolioValue: Number(
      game.scoreWeights.portfolioValue ?? SCORE_DEFAULTS.portfolioValue,
    ),
    diversification: Number(
      game.scoreWeights.diversification ??
        SCORE_DEFAULTS.diversification,
    ),
    riskManagement: Number(
      game.scoreWeights.riskManagement ?? SCORE_DEFAULTS.riskManagement,
    ),
    ethics: Number(game.scoreWeights.ethics ?? SCORE_DEFAULTS.ethics),
    reflection: Number(
      game.scoreWeights.reflection ?? SCORE_DEFAULTS.reflection,
    ),
  };

  return session.players
    .map((player, index) => {
      const unique = uniqueHoldingCount(player);
      const value = values[index] ?? 0;
      const portfolioScore = Math.round(
        (value / highest) * weights.portfolioValue,
      );
      const diversificationScore = Math.min(
        weights.diversification,
        unique * 4,
      );
      const riskBase =
        player.riskEvidence * 2 +
        (player.cash >= 20_000 ? 4 : 0) +
        (unique >= 3 ? 3 : 0);
      const riskManagementScore = Math.min(
        weights.riskManagement,
        riskBase,
      );
      const ethicsScore = clamp(
        10 + player.ethicsPosition * 2,
        0,
        weights.ethics,
      );
      const reflectionScore = clamp(
        player.reflectionEvidence,
        0,
        weights.reflection,
      );
      const total =
        portfolioScore +
        diversificationScore +
        riskManagementScore +
        ethicsScore +
        reflectionScore;

      return {
        player,
        value,
        portfolioScore,
        diversificationScore,
        riskManagementScore,
        ethicsScore,
        reflectionScore,
        total,
      };
    })
    .sort((left, right) => right.total - left.total || right.value - left.value);
}

export function missingEvidence(
  player: Player,
  session: GameSession,
  game: GameDefinition,
): string[] {
  const missing: string[] = [];
  const notes = playerNotesText(player).toLowerCase();
  if (!player.decisions.length) missing.push("no turn notes");
  if (player.reflectionEvidence <= 0 && !notes.includes("reflect")) {
    missing.push("missing reflection note");
  }
  if (player.riskEvidence <= 0 && !notes.includes("risk")) {
    missing.push("missing risk note");
  }
  if (player.ethicsPosition <= 0 && !notes.includes("ethic")) {
    missing.push("missing ethics note");
  }
  if (
    player.turnsTaken < game.turnLimit &&
    !player.finished &&
    !session.gameOver
  ) {
    missing.push("incomplete turns");
  }
  return missing;
}

export function playerNotesText(player: Player): string {
  return player.decisions
    .map((decision) => {
      const turn = Number(decision.turn ?? 0);
      const prefix = turn ? `Turn ${turn}` : "Setup";
      return `${prefix} ${decision.spaceId ?? ""}: ${decision.note ?? ""}${
        decision.result ? ` (${decision.result})` : ""
      }`.trim();
    })
    .join(" | ");
}
