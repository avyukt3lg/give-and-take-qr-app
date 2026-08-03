import {
  RadioTower,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { useMemo, useState } from "react";

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
import { NumberTicker } from "@/components/ui/number-ticker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { GameDefinition, GameSession } from "@/domain/types";
import { EmptyState, SurfaceIntro } from "@/features/shared/SurfacePrimitives";

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

export function MarketView({
  game,
  session,
  canEdit,
  reducedMotion = false,
  onReveal,
}: {
  game: GameDefinition;
  session: GameSession;
  canEdit: boolean;
  reducedMotion?: boolean;
  onReveal(): void;
}) {
  const latest = session.marketHistory[0] ?? null;
  const [sentimentFilter, setSentimentFilter] = useState("all");
  const [biasFilter, setBiasFilter] = useState("all");
  const [assetFilter, setAssetFilter] = useState("all");
  const sentiments = useMemo(
    () =>
      [...new Set(session.marketHistory.map((event) => event.sentiment))].sort(),
    [session.marketHistory],
  );
  const biases = useMemo(
    () => [...new Set(session.marketHistory.map((event) => event.bias))].sort(),
    [session.marketHistory],
  );
  const filteredHistory = useMemo(
    () =>
      session.marketHistory.filter(
        (event) =>
          (sentimentFilter === "all" ||
            event.sentiment === sentimentFilter) &&
          (biasFilter === "all" || event.bias === biasFilter) &&
          (assetFilter === "all" ||
            Number(event.appliedEffects[assetFilter] ?? 0) !== 0),
      ),
    [assetFilter, biasFilter, sentimentFilter, session.marketHistory],
  );
  const filtersActive =
    sentimentFilter !== "all" || biasFilter !== "all" || assetFilter !== "all";
  const availableEvents =
    session.decks.events.length + session.discards.events.length;

  return (
    <div className="surface market-surface">
      <SurfaceIntro
        eyebrow="03 · Shared market tape"
        title="Reveal the shared event, then update the physical tracker."
        description="The resulting indexes synchronize immediately and can never fall below one."
        aside={
          <div className="market-intro-actions">
            <span className="market-live">
              <RadioTower aria-hidden="true" />
              Shared indexes
            </span>
            {canEdit && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button disabled={availableEvents === 0}>
                    <Sparkles aria-hidden="true" />
                    Reveal Market/Life
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Reveal the next Market/Life event?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      This draws from the synchronized event deck and applies
                      its price changes immediately to every connected screen.
                      Confirm that the matching physical card will be revealed
                      at the table.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel reveal</AlertDialogCancel>
                    <AlertDialogAction onClick={onReveal}>
                      Reveal and apply event
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        }
      />

      <section className="latest-event" aria-labelledby="latest-event-title">
        <div className="latest-event__headline">
          <p className="eyebrow">Latest reveal</p>
          <span className="latest-event__id">
            {latest?.id ?? "Awaiting event"}
          </span>
          <h3 id="latest-event-title" className="display-serif">
            {latest?.title ?? "No market event yet."}
          </h3>
          <p>
            {latest?.sentiment ??
              "A Market Pulse space or the host reveal will turn the next printed card."}
          </p>
        </div>
        {latest && (
          <div className="latest-event__evidence">
            <dl>
              <div>
                <dt>Behaviour watch</dt>
                <dd>{latest.bias}</dd>
              </div>
              <div>
                <dt>Triggered by</dt>
                <dd>
                  {latest.playerName
                    ? `${latest.playerName}, turn ${latest.turn ?? "—"}`
                    : latest.source}
                </dd>
              </div>
            </dl>
            <div className="event-deltas" aria-label="Latest price changes">
              {Object.entries(latest.appliedEffects).map(([assetId, delta]) => (
                <span
                  key={assetId}
                  data-tone={delta > 0 ? "up" : delta < 0 ? "down" : "flat"}
                >
                  {game.assets.find((asset) => asset.id === assetId)?.name ??
                    assetId}{" "}
                  <strong>{signed(Number(delta))}</strong>
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="market-tape" aria-label="Current asset indexes">
        {game.assets.map((asset, index) => {
          const value = Number(session.prices[asset.id] ?? asset.startIndex);
          const previous =
            Number(session.priceHistory[1]?.prices[asset.id]) || value;
          const change = value - previous;
          return (
            <article key={asset.id} data-risk={asset.risk}>
              <header>
                <span>
                  {String(index + 1).padStart(2, "0")} · {asset.id.toUpperCase()}
                </span>
                <span>Risk {asset.risk}</span>
              </header>
              <strong>
                {/* NumberTicker now announces the settled value itself, so the
                    hand-rolled aria-hidden/sr-only pair is gone. */}
                <NumberTicker
                  value={value}
                  startValue={previous}
                  className="market-ticker"
                  reducedMotion={reducedMotion}
                />
              </strong>
              <p>{asset.name}</p>
              <small data-tone={change > 0 ? "up" : change < 0 ? "down" : "flat"}>
                Latest change {signed(change)}
              </small>
            </article>
          );
        })}
      </section>

      <section className="market-log" aria-labelledby="market-log-title">
          <header>
            <div>
              <p className="eyebrow">Stable history</p>
              <h3 id="market-log-title">Market event ledger</h3>
            </div>
            <span>
              {filteredHistory.length} of {session.marketHistory.length} events
            </span>
          </header>
          <div className="market-filters" aria-label="Filter market history">
            <div>
              <SlidersHorizontal aria-hidden="true" />
              <strong>Filter tape</strong>
            </div>
            <label>
              <span>Sentiment</span>
              <Select
                value={sentimentFilter}
                onValueChange={setSentimentFilter}
              >
                <SelectTrigger aria-label="Filter market events by sentiment">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sentiments</SelectItem>
                  {sentiments.map((sentiment) => (
                    <SelectItem key={sentiment} value={sentiment}>
                      {sentiment}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label>
              <span>Bias</span>
              <Select value={biasFilter} onValueChange={setBiasFilter}>
                <SelectTrigger aria-label="Filter market events by bias">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All biases</SelectItem>
                  {biases.map((bias) => (
                    <SelectItem key={bias} value={bias}>
                      {bias}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label>
              <span>Asset</span>
              <Select value={assetFilter} onValueChange={setAssetFilter}>
                <SelectTrigger aria-label="Filter market events by asset">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All assets</SelectItem>
                  {game.assets.map((asset) => (
                    <SelectItem key={asset.id} value={asset.id}>
                      {asset.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <Button
              variant="ghost"
              disabled={!filtersActive}
              onClick={() => {
                setSentimentFilter("all");
                setBiasFilter("all");
                setAssetFilter("all");
              }}
            >
              Clear filters
            </Button>
          </div>
          {filteredHistory.length ? (
            <div className="table-scroll" tabIndex={0}>
              <table>
                <caption className="sr-only">
                  Filtered market events in reverse chronological order
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Event</th>
                    <th scope="col">Player</th>
                    <th scope="col">Bias</th>
                    <th scope="col">Applied changes</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHistory.map((event) => (
                    <tr key={`${event.at}-${event.id}`}>
                      <th scope="row">
                        <span>{event.id}</span>
                        <strong>{event.title}</strong>
                      </th>
                      <td>{event.playerName ?? "Table"}</td>
                      <td>{event.bias}</td>
                      <td>
                        {Object.entries(event.appliedEffects)
                          .map(([assetId, delta]) => `${assetId} ${signed(Number(delta))}`)
                          .join(" · ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : session.marketHistory.length ? (
            <EmptyState title="No events match these filters">
              Clear one or more filters to restore the market history.
            </EmptyState>
          ) : (
            <EmptyState title="The tape is clean">
              No Market/Life card has changed the shared indexes.
            </EmptyState>
          )}
      </section>
      <p className="surface-footnote">
        Prices are fictional index points for this board game. They are not
        quotes, recommendations, or financial advice.
      </p>
    </div>
  );
}
