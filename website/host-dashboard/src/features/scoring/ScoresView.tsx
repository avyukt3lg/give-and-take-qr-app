import { Award, Download, Info } from "lucide-react";

import { Button } from "@/components/ui/button";
import { NumberTicker } from "@/components/ui/number-ticker";
import { calculateScores, missingEvidence } from "@/domain/scoring";
import type { GameDefinition, GameSession, ScoreResult } from "@/domain/types";
import {
  EmptyState,
  SurfaceIntro,
} from "@/features/shared/SurfacePrimitives";
import { formatMoney } from "@/features/shared/format";

const categoryRows = (score: ScoreResult) => [
  ["Portfolio", score.portfolioScore, 25],
  ["Diversification", score.diversificationScore, 20],
  ["Risk management", score.riskManagementScore, 15],
  ["Ethics", score.ethicsScore, 20],
  ["Reflection", score.reflectionScore, 20],
] as const;

export function ScoresView({
  game,
  session,
  onExport,
  onSpeak,
}: {
  game: GameDefinition;
  session: GameSession;
  onExport(): void;
  onSpeak(text: string): void;
}) {
  const scores = calculateScores(session, game);
  const final = session.gameOver;

  return (
    <div className="surface scoring-surface">
      <SurfaceIntro
        eyebrow={`05 · ${final ? "Final review" : "Provisional scoreboard"}`}
        title={
          final ? "The table has reached its result." : "A score still in motion."
        }
        description={
          final
            ? "Review the evidence behind every category before exporting the result."
            : "These values will change until every player finishes or completes twelve turns."
        }
        aside={
          <Button onClick={onExport}>
            <Download aria-hidden="true" />
            Export evidence
          </Button>
        }
      />

      <details className="score-method">
        <summary>
          <Info aria-hidden="true" />
          How the 100 points are calculated
        </summary>
        <p>
          Portfolio 25, diversification 20, risk management 15, ethics 20 and
          reflection 20. Portfolio value is normalized against the highest
          current player value.
        </p>
      </details>

      {scores.length ? (
        <ol className="scoreboard">
          {scores.map((score, index) => {
            const missing = missingEvidence(score.player, session, game);
            return (
              <li
                key={score.player.id}
                className="score-sheet"
                data-winner={index === 0 || undefined}
              >
                <header>
                  <span className="score-rank">
                    {index === 0 ? <Award aria-hidden="true" /> : null}
                    Rank {index + 1}
                  </span>
                  <div>
                    <p className="eyebrow">{score.player.profileTitle}</p>
                    <h3 className="display-serif">{score.player.name}</h3>
                    <p>
                      Portfolio value {formatMoney(score.value)} ·{" "}
                      {score.player.turnsTaken}/{game.turnLimit} turns
                    </p>
                  </div>
                  <strong className="score-total">
                    {final ? (
                      <NumberTicker
                        value={score.total}
                        aria-label={`${score.total} out of 100`}
                      />
                    ) : (
                      score.total
                    )}
                    <span>/100</span>
                  </strong>
                </header>

                <div className="score-bars">
                  {categoryRows(score).map(([label, value, maximum]) => (
                    <div key={label}>
                      <span>{label}</span>
                      <div
                        role="progressbar"
                        aria-label={`${label}: ${value} out of ${maximum}`}
                        aria-valuemin={0}
                        aria-valuemax={maximum}
                        aria-valuenow={value}
                      >
                        <i style={{ width: `${(value / maximum) * 100}%` }} />
                      </div>
                      <strong>
                        {value}/{maximum}
                      </strong>
                    </div>
                  ))}
                </div>

                <footer>
                  <p data-complete={missing.length === 0 || undefined}>
                    {missing.length
                      ? `Evidence to resolve: ${missing.join(", ")}.`
                      : "Evidence record is complete."}
                  </p>
                  <Button
                    variant="ghost"
                    onClick={() =>
                      onSpeak(
                        `${score.player.name} has ${score.total} out of 100. ${categoryRows(
                          score,
                        )
                          .map(
                            ([label, value, maximum]) =>
                              `${label} ${value} out of ${maximum}`,
                          )
                          .join(". ")}.`,
                      )
                    }
                  >
                    Read score
                  </Button>
                </footer>
              </li>
            );
          })}
        </ol>
      ) : (
        <EmptyState title="No scores to calculate">
          Start the game and record player evidence first.
        </EmptyState>
      )}
    </div>
  );
}
