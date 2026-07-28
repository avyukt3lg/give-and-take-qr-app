import rawGameConfig from "../../../../../game_data/game_config.json";

import { normaliseGame } from "../../domain/game-config";
import { startSession } from "../../domain/game-engine";
import { createSession } from "../../domain/session";
import type {
  GameDefinition,
  GameSession,
  RandomDependencies,
} from "../../domain/types";

export const game: GameDefinition = normaliseGame(rawGameConfig);

export function fixedDependencies(
  randomValues: number[] = [0.25],
): RandomDependencies {
  let randomIndex = 0;
  let idIndex = 0;
  return {
    now: () => "2026-07-28T10:00:00.000Z",
    random: () => {
      const value =
        randomValues[randomIndex] ??
        randomValues[randomValues.length - 1] ??
        0.25;
      randomIndex += 1;
      return value;
    },
    createId: () => `fixed-${++idIndex}`,
  };
}

export function freshSession(
  dependencies = fixedDependencies(),
): GameSession {
  return createSession(game, dependencies, "GT-4827");
}

export function startedSession(
  dependencies = fixedDependencies(),
): GameSession {
  const created = freshSession(dependencies);
  const result = startSession(
    created,
    game,
    [
      { name: "Asha", profileId: "SP01" },
      { name: "Dev", profileId: "SP03" },
    ],
    dependencies,
  );
  if (result.error) throw new Error(result.error);
  return result.session;
}
