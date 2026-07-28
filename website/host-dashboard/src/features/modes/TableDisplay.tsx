import { Maximize2 } from "lucide-react";
import type { ReactNode } from "react";

import { BrandMark } from "@/components/brand/BrandMark";
import { getSpace } from "@/domain/game-config";
import type { GameDefinition, GameSession } from "@/domain/types";
import { formatMoney } from "@/features/shared/format";

export function TableDisplay({
  game,
  session,
  settings,
}: {
  game: GameDefinition;
  session: GameSession;
  settings?: ReactNode;
}) {
  const current = session.players[session.currentPlayerIndex] ?? null;
  const position = session.pendingResolution?.spaceId ??
    `S${String(current?.position ?? 0).padStart(2, "0")}`;
  const space = getSpace(game, position);
  const latest = session.marketHistory[0] ?? null;

  return (
    <main id="main-content" className="table-display" tabIndex={-1}>
      <header>
        <BrandMark />
        <span>{session.code}</span>
        {settings}
      </header>

      <section className="projection-now" aria-labelledby="projection-title">
        <span className="projection-phase">{session.phase}</span>
        <p>
          Turn{" "}
          {current ? Math.min(current.turnsTaken + 1, game.turnLimit) : "—"} /{" "}
          {game.turnLimit}
        </p>
        <h1 id="projection-title" className="display-serif">
          {current?.name ?? "Prepare the table"}
        </h1>
        <div className="projection-space">
          <strong>{space?.id ?? "S—"}</strong>
          <span>{space?.label ?? "Waiting for setup"}</span>
        </div>
        <p className="projection-instruction">
          {session.phase === "Roll"
            ? "Roll the physical D6."
            : session.phase === "Resolve"
              ? space?.effect ?? "Follow the printed space."
              : session.phase === "Log"
                ? "Record one evidence note."
                : "Finish the checklist and pass the turn."}
        </p>
      </section>

      <section className="projection-band" aria-label="Shared market indexes">
        {game.assets.map((asset) => (
          <div key={asset.id} style={{ "--asset": asset.color } as React.CSSProperties}>
            <span>{asset.name}</span>
            <strong>{session.prices[asset.id] ?? asset.startIndex}</strong>
          </div>
        ))}
      </section>

      <footer>
        <div>
          <span>Current cash</span>
          <strong>{current ? formatMoney(current.cash) : "—"}</strong>
        </div>
        <div>
          <span>Latest market event</span>
          <strong>{latest ? `${latest.id} · ${latest.title}` : "No event yet"}</strong>
        </div>
        <span className="projection-hint">
          <Maximize2 aria-hidden="true" /> Projection display
        </span>
      </footer>
    </main>
  );
}
