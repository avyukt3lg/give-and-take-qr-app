import {
  useEffect,
  useRef,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";

import {
  DRAW_DECK_KEYS,
  DRAW_DECK_LABELS,
  PLAYER_TOKEN_COLORS,
} from "@/domain/constants";
import type { BoardSpace } from "@/domain/types";

type ReliefVariant = "hero" | "chapter" | "mini";

export interface BoardRouteReliefProps {
  readonly spaces: readonly BoardSpace[];
  readonly reducedMotion: boolean;
  readonly variant?: ReliefVariant;
  readonly interactive?: boolean;
  readonly className?: string;
}

function routePosition(index: number): CSSProperties {
  if (index <= 12) {
    return { gridRow: 1, gridColumn: index + 1 };
  }
  if (index <= 21) {
    return { gridRow: index - 11, gridColumn: 13 };
  }
  if (index <= 34) {
    return { gridRow: 11, gridColumn: 35 - index };
  }
  return { gridRow: 45 - index, gridColumn: 1 };
}

function spaceTone(type: string): string {
  const value = type.toLowerCase();
  if (value === "start" || value === "finish") return "terminal";
  if (value.includes("income")) return "income";
  if (value.includes("invest")) return "invest";
  if (value.includes("market")) return "market";
  if (value.includes("ethics")) return "ethics";
  if (value.includes("expense")) return "expense";
  if (value.includes("reflection")) return "reflection";
  if (value.includes("rebalance")) return "rebalance";
  return "decision";
}

function isMajorSpace(index: number): boolean {
  return index === 0 || index === 12 || index === 22 || index === 34 || index === 43;
}

export function BoardRouteRelief({
  spaces,
  reducedMotion,
  variant = "hero",
  interactive = false,
  className,
}: BoardRouteReliefProps) {
  const reliefRef = useRef<HTMLElement>(null);
  const frameRef = useRef<number | null>(null);
  const isMini = variant === "mini";

  useEffect(
    () => () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }
    },
    [],
  );

  const setPointerDepth = (x: number, y: number) => {
    const element = reliefRef.current;
    if (!element) return;
    element.style.setProperty("--relief-shift-x", `${(x * 6).toFixed(2)}px`);
    element.style.setProperty("--relief-shift-y", `${(y * 6).toFixed(2)}px`);
    element.style.setProperty("--relief-rotate-x", `${(-y * 2).toFixed(2)}deg`);
    element.style.setProperty("--relief-rotate-y", `${(x * 2).toFixed(2)}deg`);
  };

  const resetPointerDepth = () => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
    }
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      setPointerDepth(0, 0);
    });
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (
      !interactive ||
      reducedMotion ||
      event.pointerType !== "mouse" ||
      !window.matchMedia("(pointer: fine)").matches
    ) {
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    if (bounds.width === 0 || bounds.height === 0) return;
    const x = Math.max(
      -1,
      Math.min(1, ((event.clientX - bounds.left) / bounds.width - 0.5) * 2),
    );
    const y = Math.max(
      -1,
      Math.min(1, ((event.clientY - bounds.top) / bounds.height - 0.5) * 2),
    );
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
    }
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      setPointerDepth(x, y);
    });
  };

  return (
    <figure
      ref={reliefRef}
      className={`board-route-relief ${className ?? ""}`}
      data-variant={variant}
      data-interactive={interactive || undefined}
      data-reduced-motion={reducedMotion || undefined}
      role={isMini ? "img" : undefined}
      aria-label={
        isMini
          ? "44 space physical board route from S00 to S43"
          : undefined
      }
      onPointerMove={handlePointerMove}
      onPointerLeave={resetPointerDepth}
      onPointerCancel={resetPointerDepth}
    >
      <div className="board-route-relief__edge" aria-hidden="true" />
      <div className="board-route-relief__plane">
        <ol
          className="board-route-relief__route"
          aria-hidden="true"
          data-space-count={spaces.length}
        >
          {spaces.map((space, index) => (
            <li
              key={space.id}
              style={routePosition(index)}
              data-space-id={space.id}
              data-space-tone={spaceTone(space.type)}
              data-major={isMajorSpace(index) || undefined}
              title={`${space.id}: ${space.label}`}
            >
              <span>{space.id}</span>
              {isMajorSpace(index) && <small>{space.label}</small>}
            </li>
          ))}
        </ol>

        {isMini ? (
          <div className="board-route-relief__well board-route-relief__mini-label">
            <strong>44</strong>
            <span>Physical spaces ready</span>
          </div>
        ) : (
          <div className="board-route-relief__well" aria-hidden="true">
            <div className="relief-deck-rack">
              <span className="relief-deck-rack__label">Printed deck tray</span>
              <ol>
                {DRAW_DECK_KEYS.map((key, index) => {
                  const distance = Math.abs(index - 2);
                  return (
                    <li
                      key={key}
                      style={
                        {
                          "--deck-offset": `${distance * 2}px`,
                          "--deck-angle": `${(index - 2) * -1}deg`,
                          "--deck-depth": `${(2 - distance) * 3}px`,
                          "--deck-pending-offset": `${-5 - distance}px`,
                          "--deck-pending-depth": `${7 + index}px`,
                        } as CSSProperties
                      }
                    >
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <strong>{DRAW_DECK_LABELS[key]}</strong>
                    </li>
                  );
                })}
              </ol>
            </div>
            <div className="relief-token-tray">
              <span>Pawn tray</span>
              <ol>
                {PLAYER_TOKEN_COLORS.map((color, index) => (
                  <li
                    key={color}
                    style={{ "--token-color": color } as CSSProperties}
                    title={`Player ${index + 1} pawn`}
                  />
                ))}
              </ol>
            </div>
          </div>
        )}
      </div>
      {!isMini && (
        <figcaption>
          <span>S00—S43 · 44 physical spaces</span>
          <span>Five printed decks · five pawn colours</span>
        </figcaption>
      )}
    </figure>
  );
}
