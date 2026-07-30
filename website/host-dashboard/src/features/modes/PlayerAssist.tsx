import { ChevronUp, Coins, LogOut, ShieldCheck, WalletCards } from "lucide-react";
import type { ReactNode } from "react";

import { BrandMark } from "@/components/brand/BrandMark";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getAsset, getSpace } from "@/domain/game-config";
import { portfolioValue } from "@/domain/scoring";
import type { GameDefinition, GameSession } from "@/domain/types";
import { formatMoney } from "@/features/shared/format";

export function PlayerAssist({
  game,
  session,
  selectedPlayerId,
  playerLocked,
  settings,
  onSelectPlayer,
  onLeave,
}: {
  game: GameDefinition;
  session: GameSession;
  selectedPlayerId: string | null;
  playerLocked: boolean;
  settings?: ReactNode;
  onSelectPlayer(playerId: string): void;
  onLeave(): void;
}) {
  const player =
    session.players.find((item) => item.id === selectedPlayerId) ??
    (playerLocked
      ? null
      : session.players[session.currentPlayerIndex] ??
        session.players[0]) ??
    null;
  const current = session.players[session.currentPlayerIndex] ?? null;
  const space = getSpace(
    game,
    session.pendingResolution?.spaceId ??
      `S${String(current?.position ?? 0).padStart(2, "0")}`,
  );

  return (
    <main id="main-content" className="player-assist" tabIndex={-1}>
      <header>
        <BrandMark compact />
        <span>{session.code}</span>
        <div className="assist-header-actions">
          {settings}
          <Button
            variant="ghost"
            size="icon"
            onClick={onLeave}
            aria-label="Leave this table"
          >
            <LogOut aria-hidden="true" />
          </Button>
        </div>
      </header>

      <section className="assist-now" aria-labelledby="assist-now-title">
        <p className="eyebrow">
          {current?.id === player?.id ? "Your turn" : `${current?.name ?? "Host"} is playing`}
        </p>
        <h1 id="assist-now-title" className="display-serif">
          {session.phase === "Roll"
            ? "Watch the physical die."
            : session.phase === "Resolve"
              ? `${space?.id ?? "S—"} · ${space?.label ?? "Resolve"}`
              : session.phase === "Log"
                ? "Explain the choice."
                : "Check the table."}
        </h1>
        <p>
          {space?.effect ??
            "The host will start the turn after the physical table is ready."}
        </p>
        <span className="assist-phase">{session.phase}</span>
      </section>

      {session.players.length > 1 && !playerLocked && (
        <div className="assist-player-picker">
          <label htmlFor="assist-player">Viewing player</label>
          <Select
            value={player?.id ?? ""}
            onValueChange={onSelectPlayer}
          >
            <SelectTrigger id="assist-player">
              <SelectValue placeholder="Choose a player" />
            </SelectTrigger>
            <SelectContent>
              {session.players.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {player ? (
        <>
          <section className="assist-balance" aria-label={`${player.name} summary`}>
            <div>
              <Coins aria-hidden="true" />
              <span>Cash</span>
              <strong>{formatMoney(player.cash)}</strong>
            </div>
            <div>
              <WalletCards aria-hidden="true" />
              <span>Portfolio</span>
              <strong>{formatMoney(portfolioValue(player, session.prices))}</strong>
            </div>
            <div>
              <ShieldCheck aria-hidden="true" />
              <span>Evidence</span>
              <strong>
                {player.riskEvidence + player.ethicsPosition + player.reflectionEvidence}
              </strong>
            </div>
          </section>

          <details className="assist-holdings" open>
            <summary>
              <span>
                <strong>{player.name}’s holdings</strong>
                <small>Pull up for the full register</small>
              </span>
              <ChevronUp aria-hidden="true" />
            </summary>
            <div>
              {game.assets.map((assetDefinition) => {
                const asset = getAsset(game, assetDefinition.id);
                const units = Number(player.holdings[asset.id] ?? 0);
                const price = Number(session.prices[asset.id] ?? asset.startIndex);
                return (
                  <article key={asset.id} data-risk={asset.risk}>
                    <span>{asset.name}</span>
                    <strong>{units} units</strong>
                    <small>
                      Risk {asset.risk} · index {price} ·{" "}
                      {formatMoney(units * price * 1_000)}
                    </small>
                  </article>
                );
              })}
            </div>
          </details>
        </>
      ) : (
        <section className="assist-private-state" role="alert">
          <strong>Player identity not matched</strong>
          <p>
            This joined screen will not expose another player’s holdings. Leave
            and rejoin using the same player name recorded by the host.
          </p>
          <Button onClick={onLeave}>
            <LogOut aria-hidden="true" />
            Leave and rejoin
          </Button>
        </section>
      )}

      <footer>
        The printed board, cards and host remain the source of truth.
      </footer>
    </main>
  );
}
