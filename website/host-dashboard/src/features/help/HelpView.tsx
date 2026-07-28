import { ArrowRight, Search, Volume2 } from "lucide-react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { GameDefinition } from "@/domain/types";
import { EmptyState, SurfaceIntro } from "@/features/shared/SurfacePrimitives";

const helpSections = [
  {
    id: "quick-start",
    title: "Quick start",
    body: "Give each player one Starter Profile, Player Board, pawn, and starting cash. Shuffle every deck separately and keep the physical D6 beside the host.",
  },
  {
    id: "turn-flow",
    title: "Turn flow",
    body: "Roll one physical D6, move on S00–S43, resolve the landing space, record one evidence note, complete the physical checklist, then end the turn.",
  },
  {
    id: "movement",
    title: "Movement",
    body: "If a roll passes S43, stop at S43. Choice advances do not resolve the new space until that player’s next turn.",
  },
  {
    id: "deck-life",
    title: "Deck lifecycle",
    body: "Draw, resolve and discard face-up. When a draw deck is empty, shuffle its discard pile into a new draw deck.",
  },
  {
    id: "market",
    title: "Market",
    body: "Market/Life cards update shared fictional asset indexes. Asset price indexes cannot fall below one.",
  },
  {
    id: "scoring",
    title: "Scoring",
    body: "Score when all players reach S43 or after twelve turns per player. Value 25, diversification 20, risk 15, ethics 20 and reflection 20.",
  },
  {
    id: "evidence",
    title: "Evidence",
    body: "Each turn needs one decision, finance term or evidence note. Custom notes are best when the decision needs context.",
  },
  {
    id: "mismatch",
    title: "Physical deck mismatch",
    body: "Check the printed draw pile and discard pile. Continue only after the host agrees which printed card was actually drawn.",
  },
  {
    id: "sync",
    title: "Sync troubleshooting",
    body: "If Supabase saving fails, retry before continuing important actions or changing devices. The printed rules and physical board remain usable.",
  },
];

const glossary = [
  ["Asset index", "The fictional price level used to value each asset category."],
  ["Bias watch", "The behaviour trap highlighted by a Market/Life card."],
  ["Diversification", "Holding several asset categories rather than relying on one."],
  ["ESG", "Environmental, social and governance factors in responsible investing."],
  ["FOMO", "Fear of missing out; a pressure that can distort a decision."],
  ["Liquidity", "How easily cash or an asset can cover an expense."],
  ["Risk–return", "The trade-off between possible reward and possible loss."],
  ["Volatility", "How much an asset index can move up or down."],
] as const;

const flows = [
  ["Turn flow", ["Roll", "Move", "Resolve", "Log", "End"]],
  ["Deck cycle", ["Draw", "Resolve", "Discard", "Reshuffle"]],
  ["Scoring", ["Portfolio", "Diversify", "Risk", "Ethics", "Reflect"]],
] as const;

export function HelpView({
  game,
  query,
  onQueryChange,
  onSpeak,
}: {
  game: GameDefinition;
  query: string;
  onQueryChange(query: string): void;
  onSpeak(text: string): void;
}) {
  const needle = query.trim().toLowerCase();
  const sections = helpSections.filter(
    (item) =>
      !needle ||
      item.title.toLowerCase().includes(needle) ||
      item.body.toLowerCase().includes(needle),
  );
  const terms = glossary.filter(
    ([term, body]) =>
      !needle ||
      term.toLowerCase().includes(needle) ||
      body.toLowerCase().includes(needle),
  );

  return (
    <div className="surface help-surface">
      <SurfaceIntro
        eyebrow="07 · Searchable field guide"
        title="The printed rulebook, indexed for the table."
        description="Search the turn system and finance glossary without leaving the active session."
      />

      <div className="help-search">
        <Search aria-hidden="true" />
        <label htmlFor="help-query">Search rules and finance terms</label>
        <Input
          id="help-query"
          type="search"
          value={query}
          autoComplete="off"
          placeholder="Try “scoring”, “market”, or “liquidity”"
          onChange={(event) => onQueryChange(event.target.value)}
        />
      </div>

      <section className="flow-plates" aria-label="Game flow diagrams">
        {flows.map(([title, steps]) => (
          <div
            key={title}
            role="img"
            tabIndex={0}
            aria-label={`${title}: ${steps.join(" to ")}`}
          >
            <strong>{title}</strong>
            <span>
              {steps.map((step, index) => (
                <span key={step}>
                  <i>{step}</i>
                  {index < steps.length - 1 && <ArrowRight aria-hidden="true" />}
                </span>
              ))}
            </span>
          </div>
        ))}
      </section>

      <div className="help-layout">
        <section className="rule-index" aria-labelledby="rule-index-title">
          <header>
            <p className="eyebrow">Rules</p>
            <h3 id="rule-index-title">Table operations</h3>
          </header>
          {sections.length ? (
            <Accordion
              type="multiple"
              defaultValue={["quick-start", "turn-flow"]}
              className="help-accordion"
            >
              {sections.map((section, index) => (
                <AccordionItem key={section.id} value={section.id}>
                  <AccordionTrigger>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    {section.title}
                  </AccordionTrigger>
                  <AccordionContent>
                    <p>{section.body}</p>
                    <Button
                      variant="ghost"
                      onClick={() => onSpeak(`${section.title}. ${section.body}`)}
                    >
                      <Volume2 aria-hidden="true" />
                      Read aloud
                    </Button>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          ) : (
            <EmptyState title="No matching rule">
              Try a broader word or clear the search.
            </EmptyState>
          )}
        </section>

        <section className="glossary-index" aria-labelledby="glossary-title">
          <header>
            <p className="eyebrow">A—Z</p>
            <h3 id="glossary-title">Finance glossary</h3>
          </header>
          {terms.length ? (
            <dl>
              {terms.map(([term, body]) => (
                <div key={term}>
                  <dt>{term}</dt>
                  <dd>{body}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <EmptyState title="No matching term">
              Search for a different finance concept.
            </EmptyState>
          )}
        </section>
      </div>

      <section className="asset-reference" aria-labelledby="asset-reference-title">
        <header>
          <p className="eyebrow">Printed asset legend</p>
          <h3 id="asset-reference-title">The six fictional categories</h3>
        </header>
        <div>
          {game.assets.map((asset) => (
            <article
              key={asset.id}
              style={{ "--asset": asset.color } as React.CSSProperties}
            >
              <span>{asset.id.slice(0, 2).toUpperCase()}</span>
              <strong>{asset.name}</strong>
              <small>
                Risk {asset.risk} · starts at index {asset.startIndex}
              </small>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
