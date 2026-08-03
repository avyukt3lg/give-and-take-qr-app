import type { CSSProperties } from "react";

import type { Player } from "@/domain/types";

const ROUTE_SPACE_COUNT = 44;
const ROUTE_MAX_INDEX = ROUTE_SPACE_COUNT - 1;

interface RoutePoint {
  readonly x: number;
  readonly y: number;
}

function routePoint(index: number): RoutePoint {
  if (index <= 12) {
    return { x: 6 + index * 9, y: 6 };
  }
  if (index <= 21) {
    return { x: 114, y: 6 + (index - 12) * 6 };
  }
  if (index <= 34) {
    return { x: 114 - (index - 22) * 9, y: 66 };
  }
  return { x: 6, y: 66 - (index - 34) * 6 };
}

const ROUTE_POINTS = Array.from(
  { length: ROUTE_SPACE_COUNT },
  (_, index) => routePoint(index),
);

const clampPosition = (position: number) =>
  Math.max(0, Math.min(ROUTE_MAX_INDEX, Math.round(position)));

const spaceId = (position: number) =>
  `S${String(position).padStart(2, "0")}`;

export interface RoutePositionStampProps {
  readonly player: Pick<Player, "name" | "position" | "tokenColor">;
}

export function RoutePositionStamp({ player }: RoutePositionStampProps) {
  const position = clampPosition(player.position);
  const point = ROUTE_POINTS[position]!;
  const currentSpaceId = spaceId(position);

  return (
    <div
      className="route-position-stamp"
      role="img"
      aria-label={`${player.name}'s pawn is at ${currentSpaceId} on the 44-space physical route`}
      style={{ "--pawn-color": player.tokenColor } as CSSProperties}
    >
      <svg viewBox="0 0 120 72" aria-hidden="true" focusable="false">
        <rect className="route-position-stamp__track" x="6" y="6" width="108" height="60" />
        {ROUTE_POINTS.map((route, index) => (
          <circle
            key={index}
            className="route-position-stamp__space"
            data-terminal={
              index === 0 || index === ROUTE_MAX_INDEX || undefined
            }
            cx={route.x}
            cy={route.y}
            r={index === 0 || index === ROUTE_MAX_INDEX ? 1.8 : 1.15}
          />
        ))}
        <g
          className="route-position-stamp__pawn"
          style={{ transform: `translate(${point.x}px, ${point.y}px)` }}
        >
          <circle className="route-position-stamp__pawn-halo" r="5.2" />
          <circle className="route-position-stamp__pawn-token" r="3.1" />
        </g>
      </svg>
      <span>
        <small>Pawn route</small>
        <strong>{currentSpaceId}</strong>
      </span>
    </div>
  );
}
