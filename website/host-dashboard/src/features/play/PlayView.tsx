import {
  BookOpenCheck,
  Check,
  ChevronRight,
  Dice5,
  MoveRight,
  RotateCcw,
  Search,
  Volume2,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { MetalButton } from "@/components/actions/MetalButton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  DRAW_DECK_LABELS,
  PHYSICAL_CHECK_KEYS,
  PHYSICAL_CHECK_LABELS,
} from "@/domain/constants";
import { getCard, getSpace } from "@/domain/game-config";
import { missingPhysicalChecks } from "@/domain/game-engine";
import { portfolioValue } from "@/domain/scoring";
import type {
  ActionCard,
  DrawDeckKey,
  EthicsCard,
  GameDefinition,
  GameSession,
  InvestmentCard,
  MarketEventCard,
  ReflectionCard,
} from "@/domain/types";
import {
  EmptyState,
  Metric,
  SurfaceIntro,
} from "@/features/shared/SurfacePrimitives";
import { formatMoney } from "@/features/shared/format";
import { BoardRoute } from "./BoardRoute";

const phases = ["Roll", "Resolve", "Log", "End"] as const;

type PrintedCard =
  | InvestmentCard
  | MarketEventCard
  | EthicsCard
  | ActionCard
  | ReflectionCard;

function cardBody(card: PrintedCard): ReactNode {
  if ("sentiment" in card) return `${card.sentiment} · ${card.bias}`;
  if ("text" in card) return card.text;
  if ("prompt" in card) return card.prompt;
  return null;
}

function pendingCard(
  game: GameDefinition,
  deck: DrawDeckKey,
  cardId: string,
): PrintedCard | null {
  switch (deck) {
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

export interface PlayViewProps {
  game: GameDefinition;
  session: GameSession;
  noteDraft: string;
  dieDraft: number | null;
  cardLookup: string;
  spaceLookup: string;
  canEdit: boolean;
  onDieChange(value: number | null): void;
  onRoll(): void;
  onConfirmMove(): void;
  onUndoRoll(): void;
  onResolve(choice?: string): void;
  onNoteChange(note: string): void;
  onChecklistChange(key: string, checked: boolean): void;
  onEndTurn(): void;
  onCardLookupChange(id: string): void;
  onSpaceLookupChange(id: string): void;
  onPreviewCard(id: string): void;
  onSpeak(text: string): void;
}

export function PlayView({
  game,
  session,
  noteDraft,
  dieDraft,
  cardLookup,
  spaceLookup,
  canEdit,
  onDieChange,
  onRoll,
  onConfirmMove,
  onUndoRoll,
  onResolve,
  onNoteChange,
  onChecklistChange,
  onEndTurn,
  onCardLookupChange,
  onSpaceLookupChange,
  onPreviewCard,
  onSpeak,
}: PlayViewProps) {
  const current = session.players[session.currentPlayerIndex] ?? null;
  const pending = session.pendingResolution;
  const currentSpace = getSpace(
    game,
    pending?.spaceId ?? `S${String(current?.position ?? 0).padStart(2, "0")}`,
  );
  const card =
    pending?.cardDeck && pending.cardId
      ? pendingCard(game, pending.cardDeck, pending.cardId)
      : null;
  const allChecks = missingPhysicalChecks(session).length === 0;
  const [choiceToConfirm, setChoiceToConfirm] = useState<string | null>(null);
  const physicalStageRef = useRef<HTMLDivElement>(null);
  const transitionKey = [
    current?.id,
    session.phase,
    pending?.spaceId,
    pending?.physicalPawnConfirmed,
    pending?.cardId,
    pending?.completed,
  ].join(":");

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const stage = physicalStageRef.current;
      if (!stage) return;
      const focused = document.activeElement;
      if (
        focused &&
        focused !== document.body &&
        document.documentElement.contains(focused)
      ) {
        return;
      }
      const target = stage.querySelector<HTMLElement>(
        [
          ".pawn-confirmation button:not(:disabled)",
          ".resolution-actions input:not(:disabled)",
          ".resolution-actions button:not(:disabled)",
          ".die-selector button:not(:disabled)",
          "#turn-note:not(:disabled)",
        ].join(","),
      );
      target?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [transitionKey]);

  if (!session.started || !current) {
    return (
      <div className="surface play-surface">
        <SurfaceIntro
          eyebrow="02 · Run the table"
          title="The first turn begins after setup."
          description="Seat the players and start the physical game before entering a die result."
        />
        <EmptyState title="No active turn">Return to Setup to start this table.</EmptyState>
      </div>
    );
  }

  return (
    <div ref={physicalStageRef} className="surface play-surface">
      <SurfaceIntro
        eyebrow={`02 · Turn ${Math.min(current.turnsTaken + 1, game.turnLimit)} of ${game.turnLimit}`}
        title={`${current.name} owns the table.`}
        description="Read the Now zone aloud, complete the physical action, and record only what actually happened."
        aside={
          <Button
            variant="outline"
            onClick={() =>
              onSpeak(
                `${current.name}'s turn. ${session.phase} phase. Current space ${currentSpace?.id ?? "unknown"}, ${currentSpace?.label ?? ""}.`,
              )
            }
          >
            <Volume2 aria-hidden="true" />
            Read turn
          </Button>
        }
      />

      <section className="phase-rail" aria-label="Turn phases">
        {phases.map((phase, index) => {
          const currentPhaseIndex =
            session.phase === "Roll"
              ? 0
              : session.phase === "Resolve"
                ? 1
                : session.phase === "Log"
                  ? 2
                  : 3;
          return (
            <div
              key={phase}
              data-active={index === currentPhaseIndex || undefined}
              data-complete={index < currentPhaseIndex || undefined}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{phase}</strong>
              {index < phases.length - 1 && <ChevronRight aria-hidden="true" />}
            </div>
          );
        })}
      </section>

      <section className="now-zone" aria-labelledby="now-zone-title">
        <div className="now-zone__signal">
          <span>Now</span>
          <strong>{session.phase}</strong>
        </div>
        <div className="now-zone__instruction">
          <p className="eyebrow">
            {currentSpace?.id ?? "S—"} · {currentSpace?.type ?? "Board space"}
          </p>
          <h3 id="now-zone-title" className="display-serif">
            {session.phase === "Roll"
              ? "Roll the physical D6."
              : session.phase === "Resolve"
                ? currentSpace?.label ?? "Resolve the printed space."
                : session.phase === "Log"
                  ? "Record one useful evidence note."
                  : "Check the table, then pass the turn."}
          </h3>
          <p>
            {session.phase === "Roll"
              ? "Enter the face shown on the real die. The app predicts the destination; move the pawn yourself."
              : currentSpace?.effect ??
                "Follow the printed instruction and confirm the physical result."}
          </p>
        </div>
        <div className="now-zone__metrics">
          <Metric label="Cash" value={formatMoney(current.cash)} />
          <Metric
            label="Portfolio"
            value={formatMoney(portfolioValue(current, session.prices))}
          />
          <Metric
            label="Position"
            value={`S${String(current.position).padStart(2, "0")}`}
            signal
          />
        </div>
      </section>

      <BoardRoute game={game} session={session} />

      <div className="turn-workbench">
        <section className="physical-stage" aria-labelledby="physical-stage-title">
          <header>
            <div>
              <p className="eyebrow">Physical action</p>
              <h3 id="physical-stage-title">
                {session.phase === "Roll"
                  ? "Enter the real die"
                  : pending
                    ? `Confirm ${pending.spaceId}`
                    : "Resolve this space"}
              </h3>
            </div>
            <Dice5 aria-hidden="true" />
          </header>

          {pending && !pending.completed && (
            <Button
              type="button"
              variant="ghost"
              className="undo-roll-action"
              disabled={!canEdit}
              onClick={onUndoRoll}
            >
              <RotateCcw aria-hidden="true" />
              Undo roll and restore the previous table state
            </Button>
          )}

          {session.phase === "Roll" && (
            <>
              <div className="die-selector" role="group" aria-label="Physical die result">
                {[1, 2, 3, 4, 5, 6].map((value) => (
                  <button
                    type="button"
                    key={value}
                    aria-pressed={dieDraft === value}
                    disabled={!canEdit}
                    onClick={() => onDieChange(value)}
                  >
                    <span aria-hidden="true">{value}</span>
                    <span className="sr-only">Die result {value}</span>
                  </button>
                ))}
              </div>
              <Button
                type="button"
                className="record-die-action"
                disabled={!canEdit || dieDraft == null}
                onClick={onRoll}
              >
                Record die and show destination
                <MoveRight aria-hidden="true" />
              </Button>
              <p className="physical-note">
                The companion never rolls for you. It records the face visible
                on the table.
              </p>
            </>
          )}

          {pending && !pending.physicalPawnConfirmed && (
            <div className="pawn-confirmation">
              <div>
                <span>{pending.fromSpaceId}</span>
                <MoveRight aria-hidden="true" />
                <strong>{pending.spaceId}</strong>
              </div>
              <p>
                Move {current.name}’s pawn {pending.die} spaces on the printed
                route, then confirm it is on {pending.spaceId}.
              </p>
              <MetalButton disabled={!canEdit} onClick={onConfirmMove}>
                <Check aria-hidden="true" />
                Confirm physical move
              </MetalButton>
            </div>
          )}

          {pending?.physicalPawnConfirmed && !pending.completed && (
            <div className="resolution-sheet">
              <p className="eyebrow">{currentSpace?.type}</p>
              <h4 className="display-serif">{currentSpace?.label}</h4>
              <p>{currentSpace?.effect ?? "Follow the instruction on the board."}</p>
              {card && (
                <article className="printed-card">
                  <span>
                    {pending.cardDeck
                      ? DRAW_DECK_LABELS[pending.cardDeck]
                      : "Printed card"}
                  </span>
                  <strong>
                    {card.id} · {card.title}
                  </strong>
                  <p>{cardBody(card)}</p>
                </article>
              )}
              <div className="resolution-actions">
                {pending.cardDeck && !card && (
                  <div className="pending-card-entry">
                    <div className="field">
                      <Label htmlFor="pending-card-id">Actual printed card ID</Label>
                      <Input
                        id="pending-card-id"
                        value={cardLookup}
                        placeholder={pending.expectedCardId ?? "I04, M07, E02…"}
                        disabled={!canEdit}
                        onChange={(event) =>
                          onCardLookupChange(event.target.value.toUpperCase())
                        }
                      />
                      <small>
                        Expected next synced card:{" "}
                        <strong>{pending.expectedCardId ?? "none available"}</strong>.
                        Enter what was actually drawn from the physical deck.
                      </small>
                    </div>
                    <div>
                      <Button
                        type="button"
                        disabled={!canEdit || !cardLookup.trim()}
                        onClick={() => onResolve(`card:${cardLookup}`)}
                      >
                        Use entered printed card
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={!canEdit}
                        onClick={() => onResolve("draw")}
                      >
                        Use next synced card
                      </Button>
                    </div>
                  </div>
                )}
                {pending.cardDeck === "investments" && card && (
                  <>
                    <Button
                      type="button"
                      disabled={!canEdit}
                      onClick={() => onResolve("buy")}
                    >
                      Buy this investment
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!canEdit}
                      onClick={() => onResolve("pass")}
                    >
                      Pass and keep cash
                    </Button>
                  </>
                )}
                {pending.cardDeck === "ethics" && card && (
                  <>
                    <Button
                      type="button"
                      disabled={!canEdit}
                      onClick={() => onResolve("responsible")}
                    >
                      Responsible option
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!canEdit}
                      onClick={() => onResolve("profit")}
                    >
                      Profit option
                    </Button>
                  </>
                )}
                {pending.cardDeck === "actions" && card && (
                  "type" in card &&
                  (card.type === "loss-limit" || card.type === "hedge") ? (
                    <>
                      {game.assets
                        .filter((asset) => asset.id !== "cash")
                        .map((asset) => (
                          <Button
                            type="button"
                            variant="outline"
                            key={asset.id}
                            disabled={!canEdit}
                            onClick={() => onResolve(`action:${asset.id}`)}
                          >
                            {card.type === "hedge" ? "Hedge" : "Limit"}{" "}
                            {asset.name}
                          </Button>
                        ))}
                    </>
                  ) : (
                    <Button
                      type="button"
                      disabled={!canEdit}
                      onClick={() => onResolve("action")}
                    >
                      Apply printed action
                    </Button>
                  )
                )}
                {pending.cardDeck === "reflection" && card && (
                  <>
                    {[0, 2, 4, 6, 8, 10].map((score) => (
                      <Button
                        type="button"
                        variant={score === 6 ? "default" : "outline"}
                        key={score}
                        disabled={!canEdit}
                        onClick={() => onResolve(`reflection:${score}`)}
                      >
                        Reflection +{score}
                      </Button>
                    ))}
                  </>
                )}
                {!pending.cardDeck &&
                  (currentSpace?.choices ?? []).map((choice) => (
                    <Button
                      type="button"
                      key={choice}
                      variant="outline"
                      disabled={!canEdit}
                      onClick={() => setChoiceToConfirm(choice)}
                    >
                      {choice}
                    </Button>
                  ))}
                {!pending.cardDeck &&
                  currentSpace?.type === "Rebalance" && (
                    <>
                      {Object.entries(current.holdings)
                        .filter(([, units]) => Number(units) > 0)
                        .map(([assetId]) => (
                          <Button
                            type="button"
                            variant="outline"
                            key={assetId}
                            disabled={!canEdit}
                            onClick={() =>
                              onResolve(`rebalance-sell:${assetId}`)
                            }
                          >
                            Sell one{" "}
                            {game.assets.find((asset) => asset.id === assetId)
                              ?.name ?? assetId}
                          </Button>
                        ))}
                      <Button
                        type="button"
                        disabled={!canEdit}
                        onClick={() => onResolve("rebalance")}
                      >
                        Complete physical rebalance
                      </Button>
                    </>
                  )}
                {!pending.cardDeck &&
                  !currentSpace?.choices?.length &&
                  currentSpace?.type !== "Rebalance" && (
                  <Button
                    type="button"
                    disabled={!canEdit}
                    onClick={() => onResolve()}
                  >
                    Mark space resolved
                  </Button>
                  )}
              </div>
              {(pending.deckConflict ||
                session.lastPhysicalCard?.warnings.length) && (
                <div className="deck-warning" role="alert">
                  <strong>Printed deck mismatch</strong>
                  <p>
                    {pending.deckConflict ||
                      session.lastPhysicalCard?.warnings.join(" ")}
                  </p>
                  <small>
                    Check the physical draw and discard piles with the host
                    before continuing.
                  </small>
                </div>
              )}
            </div>
          )}

          {pending?.completed && (
            <div className="resolution-result" aria-live="polite">
              <BookOpenCheck aria-hidden="true" />
              <div>
                <strong>Space resolved</strong>
                {(pending.result ?? []).map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
            </div>
          )}
        </section>

        <aside className="turn-evidence" aria-labelledby="turn-evidence-title">
          <header>
            <p className="eyebrow">Evidence and handoff</p>
            <h3 id="turn-evidence-title">Prove the physical turn.</h3>
          </header>
          <div className="field">
            <Label htmlFor="turn-note">Decision or finance note</Label>
            <Textarea
              id="turn-note"
              value={noteDraft}
              disabled={!canEdit}
              rows={4}
              placeholder="What did the player decide, and why?"
              onChange={(event) => onNoteChange(event.target.value)}
            />
            <small>
              Record what happened, not what the card could have caused.
            </small>
          </div>

          <fieldset className="physical-checklist">
            <legend>Physical checklist</legend>
            {PHYSICAL_CHECK_KEYS.map((key) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={session.physicalChecks[key]}
                  disabled={!canEdit}
                  onChange={(event) =>
                    onChecklistChange(key, event.target.checked)
                  }
                />
                <span>{PHYSICAL_CHECK_LABELS[key]}</span>
              </label>
            ))}
          </fieldset>

          <MetalButton
            intent="finish"
            disabled={
              !canEdit ||
              !pending?.completed ||
              !noteDraft.trim() ||
              !allChecks
            }
            onClick={onEndTurn}
          >
            End turn
            <MoveRight aria-hidden="true" />
          </MetalButton>
        </aside>
      </div>

      <details className="lookup-drawer">
        <summary>
          <Search aria-hidden="true" />
          Printed card and board lookup
        </summary>
        <div className="lookup-grid">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              onPreviewCard(cardLookup);
            }}
          >
            <Label htmlFor="card-lookup">Printed card ID</Label>
            <div>
              <Input
                id="card-lookup"
                value={cardLookup}
                placeholder="I04, M07, E02…"
                onChange={(event) =>
                  onCardLookupChange(event.target.value.toUpperCase())
                }
              />
              <Button type="submit" variant="outline">
                Show card
              </Button>
            </div>
          </form>
          <div>
            <Label htmlFor="space-lookup">Board space</Label>
            <Input
              id="space-lookup"
              value={spaceLookup}
              placeholder="S00–S43"
              onChange={(event) =>
                onSpaceLookupChange(event.target.value.toUpperCase())
              }
            />
            {getSpace(game, spaceLookup) && (
              <p>
                <strong>{getSpace(game, spaceLookup)?.label}</strong>
                <br />
                {getSpace(game, spaceLookup)?.effect}
              </p>
            )}
          </div>
        </div>
      </details>

      <AlertDialog
        open={choiceToConfirm !== null}
        onOpenChange={(open) => {
          if (!open) setChoiceToConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm the physical board choice</AlertDialogTitle>
            <AlertDialogDescription>
              This changes {current.name}’s recorded cash, evidence, ethics, or
              board position. Confirm only after the player has made the same
              choice at {currentSpace?.id ?? "the current space"}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <p className="choice-confirmation-copy">{choiceToConfirm}</p>
          <AlertDialogFooter>
            <AlertDialogCancel>Go back</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const confirmedChoice = choiceToConfirm;
                setChoiceToConfirm(null);
                if (confirmedChoice) onResolve(confirmedChoice);
              }}
            >
              Record this choice
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
