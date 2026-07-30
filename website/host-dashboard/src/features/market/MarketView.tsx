import {
  ArrowDownRight,
  ArrowUpRight,
  Minus,
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
import { PriceSparkline } from "./PriceSparkline";

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

export function MarketView({
  game,
  session,
  canEdit,
  onReveal,
}: {
  game: GameDefinition;
  session: GameSession;
  canEdit: boolean;
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
        title="Read the current index, then update the physical tracker."
        description="No value can fall below one."
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

      <section className="market-tape" aria-label="Current asset indexes">
        {game.assets.map((asset) => {
          const value = Number(session.prices[asset.id] ?? asset.startIndex);
          const history = [...session.priceHistory]
            .reverse()
            .map((entry) => Number(entry.prices[asset.id] ?? value))
            .slice(-12);
          const previous =
            Number(session.priceHistory[1]?.prices[asset.id]) || value;
          const change = value - previous;
          const Direction =
            change > 0 ? ArrowUpRight : change < 0 ? ArrowDownRight : Minus;
          return (
            <article key={asset.id} style={{ "--asset": asset.color } as React.CSSProperties}>
              <header>
                <span>{asset.id.toUpperCase()}</span>
                <Direction aria-hidden="true" />
              </header>
              <strong>
                <NumberTicker
                  value={value}
                  startValue={previous}
                  aria-hidden="true"
                  className="market-ticker"
                />
                <span className="sr-only">{value}</span>
              </strong>
              <p>{asset.name}</p>
              <small>
                Risk {asset.risk} · {signed(change)} latest
              </small>
              <PriceSparkline values={history} label={`${asset.name} price history`} />
            </article>
          );
        })}
      </section>

      <div className="market-layout">
        <section className="latest-event" aria-labelledby="latest-event-title">
          <p className="eyebrow">Latest reveal</p>
          {latest ? (
            <>
              <span className="latest-event__id">{latest.id}</span>
              <h3 id="latest-event-title" className="display-serif">
                {latest.title}
              </h3>
              <p>{latest.sentiment}</p>
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
                  <span key={assetId} data-tone={delta > 0 ? "up" : delta < 0 ? "down" : "flat"}>
                    {game.assets.find((asset) => asset.id === assetId)?.name ??
                      assetId}{" "}
                    <strong>{signed(Number(delta))}</strong>
                  </span>
                ))}
              </div>
            </>
          ) : (
            <EmptyState title="No market event yet">
              A Market Pulse space will reveal the first printed event.
            </EmptyState>
          )}
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
      </div>
      <p className="surface-footnote">
        Prices are fictional index points for this board game. They are not
        quotes, recommendations, or financial advice.
      </p>
    </div>
  );
}
