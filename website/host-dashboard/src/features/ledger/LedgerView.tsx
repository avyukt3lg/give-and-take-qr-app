import {
  Banknote,
  Landmark,
  Pencil,
  RotateCcw,
  Scale,
  ShieldCheck,
} from "lucide-react";
import { useState, type FormEvent } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getAsset } from "@/domain/game-config";
import { portfolioValue, uniqueHoldingCount } from "@/domain/scoring";
import type {
  AdjustablePlayerField,
  GameDefinition,
  GameSession,
  Player,
} from "@/domain/types";
import {
  EmptyState,
  Metric,
  SurfaceIntro,
} from "@/features/shared/SurfacePrimitives";
import { formatMoney } from "@/features/shared/format";

export interface LedgerViewProps {
  game: GameDefinition;
  session: GameSession;
  canEdit: boolean;
  onAdjust(
    playerId: string,
    field: AdjustablePlayerField,
    delta: number,
    reason: string,
  ): void;
  onSell(playerId: string, assetId: string): void;
  onUndoAdjustment(): void;
}

const correctionFields: ReadonlyArray<{
  id: AdjustablePlayerField;
  label: string;
  unit: string;
}> = [
  { id: "cash", label: "Cash", unit: "rupees" },
  { id: "riskEvidence", label: "Risk evidence", unit: "points" },
  { id: "ethicsPosition", label: "Ethics position", unit: "points" },
  {
    id: "reflectionEvidence",
    label: "Reflection evidence",
    unit: "points",
  },
];

function LedgerCorrectionEditor({
  player,
  onAdjust,
  onDone,
}: {
  player: Player;
  onAdjust(
    playerId: string,
    field: AdjustablePlayerField,
    delta: number,
    reason: string,
  ): void;
  onDone(): void;
}) {
  const [field, setField] = useState<AdjustablePlayerField>("cash");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const delta = Number(amount);
  const reasonValid = reason.trim().length >= 6;
  const amountValid = Number.isFinite(delta) && delta !== 0;
  const valid = amountValid && reasonValid;
  const selectedField = correctionFields.find((item) => item.id === field);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!valid) return;
    onAdjust(player.id, field, delta, reason.trim());
    setAmount("");
    setReason("");
  };

  return (
    <form className="ledger-correction-editor" onSubmit={submit}>
      <header>
        <div>
          <p className="eyebrow">Edit mode · {player.name}</p>
          <h5>Record a verified correction</h5>
        </div>
        <Button type="button" variant="ghost" onClick={onDone}>
          Exit edit mode
        </Button>
      </header>
      <p>
        Enter the signed difference, not the new total. Every correction keeps
        the reason in the evidence archive.
      </p>
      <div className="ledger-correction-fields">
        <Label>
          Record
          <select
            value={field}
            onChange={(event) =>
              setField(event.target.value as AdjustablePlayerField)
            }
          >
            {correctionFields.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </Label>
        <Label>
          Signed amount
          <Input
            type="number"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder={field === "cash" ? "e.g. -2000" : "e.g. +1"}
            aria-invalid={amount.length > 0 && !amountValid}
            aria-describedby={`correction-help-${player.id}`}
          />
        </Label>
      </div>
      <Label>
        Human reason
        <Textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="What did you verify on the physical player board?"
          required
          minLength={6}
          aria-invalid={reason.length > 0 && !reasonValid}
          aria-describedby={`correction-help-${player.id}`}
        />
      </Label>
      <small id={`correction-help-${player.id}`}>
        {selectedField?.label} is recorded in {selectedField?.unit}. Use a plus
        or minus sign. A specific reason of at least six characters is required.
      </small>
      <Button type="submit" disabled={!valid}>
        Apply signed correction
      </Button>
    </form>
  );
}

export function LedgerView({
  game,
  session,
  canEdit,
  onAdjust,
  onSell,
  onUndoAdjustment,
}: LedgerViewProps) {
  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null);
  const latestAdjustment = session.manualAdjustments[0] ?? null;

  return (
    <div className="surface ledger-surface">
      <SurfaceIntro
        eyebrow="04 · Player evidence"
        title="A ledger, not a stack of dashboard cards."
        description="Each dossier connects cash, holdings and evidence to the decisions that produced them."
        aside={
          <span className="ledger-count">
            {session.players.length} registered players
          </span>
        }
      />

      {canEdit && (
        <section className="ledger-edit-bar" aria-label="Host ledger editing">
          <div>
            <Pencil aria-hidden="true" />
            <span>
              <strong>
                {editingPlayerId ? "Ledger edit mode is active" : "Ledger is read only"}
              </strong>
              <small>
                {latestAdjustment
                  ? `Latest: ${latestAdjustment.playerName} · ${latestAdjustment.field} ${latestAdjustment.delta > 0 ? "+" : ""}${latestAdjustment.delta} · ${latestAdjustment.reason}`
                  : "Choose one player dossier to make a verified correction."}
              </small>
            </span>
          </div>
          <Button
            variant="outline"
            disabled={!latestAdjustment}
            onClick={onUndoAdjustment}
          >
            <RotateCcw aria-hidden="true" />
            Undo latest correction
          </Button>
        </section>
      )}

      {session.players.length ? (
        <div className="player-dossiers">
          {session.players.map((player, index) => {
            const holdings = Object.entries(player.holdings).filter(
              ([, units]) => Number(units) > 0,
            );
            return (
              <article
                key={player.id}
                className="player-dossier"
                style={
                  {
                    "--player": player.tokenColor,
                    "--dossier-index": index,
                  } as React.CSSProperties
                }
              >
                <header className="dossier-header">
                  <span className="dossier-number">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <p className="eyebrow">
                      {player.profileId} · {player.profileTitle}
                    </p>
                    <h3 className="display-serif">{player.name}</h3>
                  </div>
                  <div className="dossier-header-actions">
                    <span className="position-stamp">
                      S{String(player.position).padStart(2, "0")}
                    </span>
                    {canEdit && (
                      <Button
                        variant={
                          editingPlayerId === player.id ? "default" : "outline"
                        }
                        aria-pressed={editingPlayerId === player.id}
                        onClick={() =>
                          setEditingPlayerId((current) =>
                            current === player.id ? null : player.id,
                          )
                        }
                      >
                        <Pencil aria-hidden="true" />
                        {editingPlayerId === player.id
                          ? "Editing ledger"
                          : "Edit ledger"}
                      </Button>
                    )}
                  </div>
                </header>

                <div className="dossier-metrics">
                  <Metric label="Cash" value={formatMoney(player.cash)} />
                  <Metric
                    label="Portfolio"
                    value={formatMoney(portfolioValue(player, session.prices))}
                  />
                  <Metric
                    label="Asset categories"
                    value={uniqueHoldingCount(player)}
                  />
                  <Metric
                    label="Turns"
                    value={`${player.turnsTaken}/${game.turnLimit}`}
                  />
                </div>

                <div className="dossier-body">
                  <section aria-labelledby={`holdings-${player.id}`}>
                    <header>
                      <Landmark aria-hidden="true" />
                      <h4 id={`holdings-${player.id}`}>Holdings register</h4>
                    </header>
                    {holdings.length ? (
                      <div className="table-scroll" tabIndex={0}>
                        <table>
                          <caption className="sr-only">
                            {player.name} holdings
                          </caption>
                          <thead>
                            <tr>
                              <th scope="col">Asset</th>
                              <th scope="col">Units</th>
                              <th scope="col">Index</th>
                              <th scope="col">Value</th>
                              {editingPlayerId === player.id && (
                                <th scope="col">Correction</th>
                              )}
                            </tr>
                          </thead>
                          <tbody>
                            {holdings.map(([assetId, units]) => {
                              const asset = getAsset(game, assetId);
                              const price = Number(session.prices[assetId] ?? 0);
                              return (
                                <tr key={assetId}>
                                  <th scope="row">
                                    <i
                                      style={
                                        { "--asset": asset.color } as React.CSSProperties
                                      }
                                    />
                                    {asset.name}
                                  </th>
                                  <td>{units}</td>
                                  <td>{price}</td>
                                  <td>
                                    {formatMoney(Number(units) * price * 1_000)}
                                  </td>
                                  {editingPlayerId === player.id && (
                                    <td>
                                      <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                          <Button variant="ghost">Sell one</Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                          <AlertDialogHeader>
                                            <AlertDialogTitle>
                                              Sell one {asset.name} unit?
                                            </AlertDialogTitle>
                                            <AlertDialogDescription>
                                              Confirm only after the physical
                                              player board shows this sale. The
                                              current index is {price}, worth{" "}
                                              {formatMoney(price * 1_000)}.
                                            </AlertDialogDescription>
                                          </AlertDialogHeader>
                                          <AlertDialogFooter>
                                            <AlertDialogCancel>
                                              Keep holding
                                            </AlertDialogCancel>
                                            <AlertDialogAction
                                              onClick={() =>
                                                onSell(player.id, assetId)
                                              }
                                            >
                                              Confirm sale
                                            </AlertDialogAction>
                                          </AlertDialogFooter>
                                        </AlertDialogContent>
                                      </AlertDialog>
                                    </td>
                                  )}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <EmptyState title="No holdings yet">
                        Investment purchases appear here.
                      </EmptyState>
                    )}
                  </section>

                  <section aria-labelledby={`evidence-${player.id}`}>
                    <header>
                      <ShieldCheck aria-hidden="true" />
                      <h4 id={`evidence-${player.id}`}>Evidence register</h4>
                    </header>
                    <dl className="evidence-register">
                      <div>
                        <dt>Risk management</dt>
                        <dd>{player.riskEvidence}</dd>
                      </div>
                      <div>
                        <dt>Ethics position</dt>
                        <dd>{player.ethicsPosition}</dd>
                      </div>
                      <div>
                        <dt>Reflection</dt>
                        <dd>{player.reflectionEvidence}</dd>
                      </div>
                      <div>
                        <dt>Decision notes</dt>
                        <dd>{player.decisions.length}</dd>
                      </div>
                    </dl>

                    {editingPlayerId === player.id && (
                      <LedgerCorrectionEditor
                        player={player}
                        onAdjust={onAdjust}
                        onDone={() => setEditingPlayerId(null)}
                      />
                    )}
                  </section>
                </div>

                <details className="decision-journal">
                  <summary>
                    <Banknote aria-hidden="true" />
                    Decision journal · {player.decisions.length} entries
                  </summary>
                  {player.decisions.length ? (
                    <ol>
                      {player.decisions.map((decision, decisionIndex) => (
                        <li key={`${decision.at}-${decisionIndex}`}>
                          <span>
                            T{decision.turn} · {decision.spaceId}
                          </span>
                          <p>{decision.note}</p>
                          {decision.result && <small>{decision.result}</small>}
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p>No decision notes recorded.</p>
                  )}
                </details>
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState title="No player ledger yet">
          Start the game to convert setup seats into player dossiers.
        </EmptyState>
      )}
      <p className="surface-footnote">
        <Scale aria-hidden="true" /> Corrections change the digital evidence
        record. Confirm the printed board before using them.
      </p>
    </div>
  );
}
