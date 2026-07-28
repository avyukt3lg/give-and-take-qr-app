import type { GameDefinition, GameSession } from "@/domain/types";

export function BoardRoute({
  game,
  session,
}: {
  game: GameDefinition;
  session: GameSession;
}) {
  const occupied = new Map<number, typeof session.players>();
  session.players.forEach((player) => {
    const collection = occupied.get(player.position) ?? [];
    collection.push(player);
    occupied.set(player.position, collection);
  });

  return (
    <div
      className="board-route"
      role="region"
      aria-label="Physical board route and player positions"
      tabIndex={0}
    >
      <ol>
        {game.boardSpaces.map((space, index) => {
          const players = occupied.get(index) ?? [];
          const active = players.some(
            (player) => player.id === session.players[session.currentPlayerIndex]?.id,
          );
          return (
            <li
              key={space.id}
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
                      style={{ "--token": player.tokenColor } as React.CSSProperties}
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
  );
}
