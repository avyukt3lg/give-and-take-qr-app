import { useEffect, useMemo, useRef } from "react";

import type { GameDefinition, GameSession } from "@/domain/types";
import { useScrollOverflow } from "@/hooks/useScrollOverflow";
import { useSystemReducedMotion } from "@/hooks/useReducedMotion";

export function BoardRoute({
  game,
  session,
}: {
  game: GameDefinition;
  session: GameSession;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLLIElement>(null);
  const reducedMotion = useSystemReducedMotion();
  const { overflow, firstVisible, lastVisible } = useScrollOverflow(
    scrollerRef,
    game.boardSpaces.length,
  );

  const occupied = useMemo(() => {
    // `GameSession["players"]` rather than `typeof session.players`: the latter
    // reads as a value reference to `session` and trips exhaustive-deps.
    const map = new Map<number, GameSession["players"]>();
    session.players.forEach((player) => {
      const collection = map.get(player.position) ?? [];
      collection.push(player);
      map.set(player.position, collection);
    });
    return map;
  }, [session.players]);

  const activePlayer = session.players[session.currentPlayerIndex];
  const activePosition = activePlayer?.position ?? 0;

  // The strip is 44 cells wide and shows about twelve. Before this, the active
  // pawn could sit entirely outside the fold, so the one thing a host most needs
  // to see — where the current player is — required hunting. Re-centring on a
  // position change is the honest fix; the edge fade only advertises that the
  // strip scrolls at all.
  useEffect(() => {
    const cell = activeRef.current;
    const scroller = scrollerRef.current;
    if (!cell || !scroller) return;

    const target =
      cell.offsetLeft - scroller.clientWidth / 2 + cell.clientWidth / 2;
    const left = Math.max(0, Math.min(target, scroller.scrollWidth - scroller.clientWidth));

    // Under reduced motion this is a jump, not a glide — a designed static
    // outcome rather than a disabled animation. The cell still ends up centred.
    //
    // Assigning scrollLeft is the fallback rather than the exception: jsdom does
    // not implement scrollTo at all, and older Safari accepts only the (x, y)
    // signature and ignores the options object. Either way the cell must end up
    // centred, so the outcome is the same and only the easing is lost.
    if (typeof scroller.scrollTo === "function") {
      try {
        scroller.scrollTo({ left, behavior: reducedMotion ? "auto" : "smooth" });
        return;
      } catch {
        /* falls through to the direct assignment below */
      }
    }
    scroller.scrollLeft = left;
  }, [activePosition, reducedMotion, session.currentPlayerIndex]);

  const firstId = game.boardSpaces[firstVisible]?.id ?? game.boardSpaces[0]?.id;
  const lastId = game.boardSpaces[lastVisible]?.id ?? firstId;
  const activeSpaceId = game.boardSpaces[activePosition]?.id;

  // `data-overflow` sits on the frame, not the scroller: the edge fade is an
  // overlay here, and putting a mask on the scroller would clip its own focus
  // ring.
  return (
    <div className="board-route-frame" data-overflow={overflow}>
      {/* The viewport exists only to bound the edge fades. Hanging them off the
          frame let them paint over the range line below the strip. */}
      <div className="board-route-viewport">
        <div
          ref={scrollerRef}
          className="board-route"
          role="region"
          aria-label="Physical board route and player positions"
          tabIndex={0}
        >
          <ol>
            {game.boardSpaces.map((space, index) => {
              const players = occupied.get(index) ?? [];
              const active = players.some(
                (player) => player.id === activePlayer?.id,
              );
              return (
                <li
                  key={space.id}
                  ref={active ? activeRef : undefined}
                  data-active={active || undefined}
                  data-occupied={players.length > 0 || undefined}
                >
                  <span>{space.id}</span>
                  <strong>{space.label}</strong>
                  {players.length > 0 && (
                    <span
                      className="route-tokens"
                      aria-label={`${players.map((player) => player.name).join(", ")} on ${space.id}`}
                    >
                      {players.map((player) => (
                        <i
                          key={player.id}
                          style={
                            { "--token": player.tokenColor } as React.CSSProperties
                          }
                          title={player.name}
                        />
                      ))}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      </div>

      {/* The text equivalent of the edge fade. Without it the fact that the
          strip continues would live only in a gradient, which is state conveyed
          by appearance alone. It also gives the host the count directly. */}
      <p className="board-route-range">
        <span>
          Showing {firstId}–{lastId} of {game.boardSpaces.length} spaces
        </span>
        {overflow !== "none" && (
          <span className="board-route-hint">
            Scroll or use arrow keys to see the rest of the route
          </span>
        )}
        {activeSpaceId && (
          <span className="sr-only">
            {activePlayer?.name ?? "The current player"} is on {activeSpaceId}.
          </span>
        )}
      </p>
    </div>
  );
}
