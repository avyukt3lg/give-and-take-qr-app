import {
  CheckCircle2,
  Download,
  FileJson2,
  FileSpreadsheet,
  Printer,
  RefreshCw,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  exportEvidence,
  exportSummary,
} from "@/domain/exports";
import { calculateScores, missingEvidence } from "@/domain/scoring";
import type { GameDefinition, GameSession } from "@/domain/types";
import {
  Metric,
  SurfaceIntro,
} from "@/features/shared/SurfacePrimitives";
import { CopyButton } from "@/components/ui/copy-button";
import { formatMoney, formatTime } from "@/features/shared/format";

export interface ExportViewProps {
  game: GameDefinition;
  session: GameSession;
  exportText: string;
  lastSavedAt: string | null;
  onRefresh(): void;
  /** Resolves true when the write landed, so the control can confirm inline. */
  onCopy(): Promise<boolean> | boolean;
  onDownload(kind: "json" | "csv" | "print"): void;
}

export function ExportView({
  game,
  session,
  exportText,
  lastSavedAt,
  onRefresh,
  onCopy,
  onDownload,
}: ExportViewProps) {
  const summary = exportSummary(session, game);
  const preview = exportText || exportEvidence(session, game);
  const scores = calculateScores(session, game);
  const generatedLabel = new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(session.updatedAt));

  return (
    <div className="surface export-surface">
      <SurfaceIntro
        eyebrow="06 · Evidence archive"
        title="Download the complete evidence record."
        description="Players, decisions, market events, corrections, holdings and the full scoring calculation."
        aside={
          <Button onClick={() => onDownload("json")}>
            <Download aria-hidden="true" />
            Download JSON
          </Button>
        }
      />

      <section className="archive-status" aria-label="Evidence archive status">
        <div className="archive-stack" aria-hidden="true">
          <span />
          <span />
          <FileJson2 />
        </div>
        <div>
          <p className="eyebrow">Session archive</p>
          <h3>{session.code}</h3>
          <p>Last synced {formatTime(lastSavedAt)}</p>
        </div>
        <CheckCircle2 aria-label="Archive is ready to export" />
      </section>

      <section className="export-metrics" aria-label="Export summary">
        <Metric label="Players" value={summary.playerCount} />
        <Metric label="Turns recorded" value={summary.totalTurns} />
        <Metric label="Market events" value={summary.events} />
        <Metric label="Cards drawn" value={summary.cardsDrawn} />
        <Metric label="Decision notes" value={summary.notes} />
        <Metric label="Score state" value={summary.scoreState} signal />
      </section>

      <div className="export-layout">
        <section className="evidence-audit" aria-labelledby="evidence-audit-title">
          <header>
            <p className="eyebrow">Before export</p>
            <h3 id="evidence-audit-title">Evidence completeness</h3>
          </header>
          <ol>
            {session.players.map((player) => {
              const missing = missingEvidence(player, session, game);
              return (
                <li key={player.id} data-warning={missing.length > 0 || undefined}>
                  <span>{missing.length ? "!" : "OK"}</span>
                  <div>
                    <strong>{player.name}</strong>
                    <p>
                      Notes {player.decisions.length} · Risk {player.riskEvidence} ·
                      Ethics {player.ethicsPosition} · Reflection{" "}
                      {player.reflectionEvidence}
                    </p>
                    <small>
                      {missing.length
                        ? missing.join(", ")
                        : "Evidence record complete"}
                    </small>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        <section className="export-actions" aria-labelledby="export-actions-title">
          <header>
            <p className="eyebrow">Output formats</p>
            <h3 id="export-actions-title">Choose the record you need.</h3>
          </header>
          <button type="button" onClick={() => onDownload("json")}>
            <FileJson2 aria-hidden="true" />
            <span>
              <strong>Complete JSON</strong>
              <small>Lossless session and scoring evidence.</small>
            </span>
            <Download aria-hidden="true" />
          </button>
          <button type="button" onClick={() => onDownload("csv")}>
            <FileSpreadsheet aria-hidden="true" />
            <span>
              <strong>Analysis CSV</strong>
              <small>Player totals, holdings and score columns.</small>
            </span>
            <Download aria-hidden="true" />
          </button>
          <button type="button" onClick={() => onDownload("print")}>
            <Printer aria-hidden="true" />
            <span>
              <strong>Printable review</strong>
              <small>Teacher-friendly browser print layout.</small>
            </span>
            <Printer aria-hidden="true" />
          </button>
        </section>
      </div>

      <section
        className="teacher-review-sheet"
        aria-labelledby="teacher-review-title"
      >
        <header className="teacher-review-header">
          <div>
            <p>Give And Take · Teacher review record</p>
            <h2 id="teacher-review-title">Table {session.code}</h2>
          </div>
          <dl>
            <div>
              <dt>Score state</dt>
              <dd>{summary.scoreState}</dd>
            </div>
            <div>
              <dt>Updated</dt>
              <dd>{generatedLabel}</dd>
            </div>
            <div>
              <dt>Session</dt>
              <dd>{session.started ? "In progress" : "Setup"}</dd>
            </div>
          </dl>
        </header>

        <section className="teacher-review-section" aria-labelledby="print-scores">
          <header>
            <span>01</span>
            <div>
              <p>Assessment overview</p>
              <h3 id="print-scores">Score calculation</h3>
            </div>
          </header>
          {scores.length ? (
            <div
              className="teacher-table-scroll"
              tabIndex={0}
              aria-label="Scrollable player score calculation"
            >
              <table>
                <caption className="sr-only">
                  Provisional or final score calculation for each player
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Rank / player</th>
                    <th scope="col">Portfolio</th>
                    <th scope="col">Diversify</th>
                    <th scope="col">Risk</th>
                    <th scope="col">Ethics</th>
                    <th scope="col">Reflection</th>
                    <th scope="col">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {scores.map((score, index) => (
                    <tr key={score.player.id}>
                      <th scope="row">
                        {index + 1}. {score.player.name}
                        <small>{score.player.profileTitle}</small>
                      </th>
                      <td>{score.portfolioScore}/25</td>
                      <td>{score.diversificationScore}/20</td>
                      <td>{score.riskManagementScore}/15</td>
                      <td>{score.ethicsScore}/20</td>
                      <td>{score.reflectionScore}/20</td>
                      <td>
                        <strong>{score.total}/100</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="teacher-review-empty">
              Player scores will appear after setup is complete.
            </p>
          )}
        </section>

        <section
          className="teacher-review-section"
          aria-labelledby="print-player-records"
        >
          <header>
            <span>02</span>
            <div>
              <p>Evidence by learner</p>
              <h3 id="print-player-records">Holdings and decision notes</h3>
            </div>
          </header>
          <div className="teacher-player-records">
            {scores.map((score) => {
              const player = score.player;
              const holdings = game.assets.filter(
                (asset) => Number(player.holdings[asset.id] ?? 0) > 0,
              );
              const missing = missingEvidence(player, session, game);
              return (
                <article key={player.id} className="teacher-player-record">
                  <header>
                    <div>
                      <p>
                        {player.profileId} ·{" "}
                        {player.profileTitle ?? "Player profile"}
                      </p>
                      <h4>{player.name}</h4>
                    </div>
                    <strong>{score.total}/100</strong>
                  </header>
                  <dl className="teacher-player-metrics">
                    <div>
                      <dt>Portfolio value</dt>
                      <dd>{formatMoney(score.value)}</dd>
                    </div>
                    <div>
                      <dt>Cash</dt>
                      <dd>{formatMoney(player.cash)}</dd>
                    </div>
                    <div>
                      <dt>Turns</dt>
                      <dd>{player.turnsTaken}/{game.turnLimit}</dd>
                    </div>
                    <div>
                      <dt>Evidence</dt>
                      <dd>
                        R{player.riskEvidence} · E{player.ethicsPosition} · F
                        {player.reflectionEvidence}
                      </dd>
                    </div>
                  </dl>

                  <div className="teacher-player-columns">
                    <section aria-labelledby={`print-holdings-${player.id}`}>
                      <h5 id={`print-holdings-${player.id}`}>
                        Holdings
                        <span className="sr-only"> for {player.name}</span>
                      </h5>
                      {holdings.length ? (
                        <table>
                          <thead>
                            <tr>
                              <th scope="col">Asset</th>
                              <th scope="col">Units</th>
                              <th scope="col">Index</th>
                              <th scope="col">Value</th>
                            </tr>
                          </thead>
                          <tbody>
                            {holdings.map((asset) => {
                              const units = Number(
                                player.holdings[asset.id] ?? 0,
                              );
                              const price = Number(
                                session.prices[asset.id] ?? asset.startIndex,
                              );
                              return (
                                <tr key={asset.id}>
                                  <th scope="row">{asset.name}</th>
                                  <td>{units}</td>
                                  <td>{price}</td>
                                  <td>{formatMoney(units * price * 1_000)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      ) : (
                        <p>No investment holdings recorded.</p>
                      )}
                    </section>
                    <section aria-labelledby={`print-notes-${player.id}`}>
                      <h5 id={`print-notes-${player.id}`}>
                        Decision notes · {player.decisions.length}
                        <span className="sr-only"> for {player.name}</span>
                      </h5>
                      {player.decisions.length ? (
                        <ol>
                          {player.decisions.map((decision, index) => (
                            <li key={`${decision.at}-${index}`}>
                              <span>
                                T{decision.turn} · {decision.spaceId}
                                {decision.cardId
                                  ? ` · ${decision.cardId}`
                                  : ""}
                              </span>
                              <p>{decision.note}</p>
                              {decision.result && (
                                <small>{decision.result}</small>
                              )}
                            </li>
                          ))}
                        </ol>
                      ) : (
                        <p>No decision notes recorded.</p>
                      )}
                    </section>
                  </div>
                  <footer data-warning={missing.length > 0 || undefined}>
                    {missing.length
                      ? `Evidence to resolve: ${missing.join(", ")}.`
                      : "Evidence record complete."}
                  </footer>
                </article>
              );
            })}
          </div>
        </section>

        <section
          className="teacher-review-section"
          aria-labelledby="print-market-history"
        >
          <header>
            <span>03</span>
            <div>
              <p>Shared conditions</p>
              <h3 id="print-market-history">Market history</h3>
            </div>
          </header>
          {session.marketHistory.length ? (
            <div
              className="teacher-table-scroll"
              tabIndex={0}
              aria-label="Scrollable market event history"
            >
              <table>
                <caption className="sr-only">
                  Complete session market event history
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Event</th>
                    <th scope="col">Triggered by</th>
                    <th scope="col">Sentiment / bias</th>
                    <th scope="col">Applied changes</th>
                  </tr>
                </thead>
                <tbody>
                  {session.marketHistory.map((event) => (
                    <tr key={`${event.at}-${event.id}`}>
                      <th scope="row">
                        {event.id} · {event.title}
                      </th>
                      <td>{event.playerName ?? "Table"}</td>
                      <td>
                        {event.sentiment} · {event.bias}
                      </td>
                      <td>
                        {Object.entries(event.appliedEffects)
                          .map(
                            ([assetId, delta]) =>
                              `${assetId.toUpperCase()} ${Number(delta) > 0 ? "+" : ""}${delta}`,
                          )
                          .join(" · ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="teacher-review-empty">
              No Market/Life event has changed the shared indexes.
            </p>
          )}
        </section>

        <footer className="teacher-review-footer">
          <p>
            Manual corrections recorded: {session.manualAdjustments.length}.
            Review the downloadable JSON for timestamps, reasons, and before /
            after values.
          </p>
          <p>
            Fictional financial education simulation · Generated from table{" "}
            {session.code}
          </p>
        </footer>
      </section>

      <details className="json-preview">
        <summary>Inspect raw JSON</summary>
        <div className="json-preview__actions">
          <Button variant="outline" onClick={onRefresh}>
            <RefreshCw aria-hidden="true" />
            Refresh
          </Button>
          {/* Same defect as the table code: the only confirmation was a message
              elsewhere on screen. */}
          <CopyButton onCopy={onCopy} label="Copy" confirmedLabel="Copied" />
        </div>
        <pre>{preview}</pre>
      </details>
    </div>
  );
}
