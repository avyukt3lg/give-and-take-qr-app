import { CONFIG_VERSION } from "../domain/constants";
import { normaliseGame } from "../domain/game-config";
import type { GameDefinition } from "../domain/types";

export const DEFAULT_GAME_CONFIG_URL =
  `../../game_data/game_config.json?v=${CONFIG_VERSION}`;

export interface LoadGameConfigOptions {
  url?: string;
  fetcher?: typeof fetch;
  fallback?: unknown;
}

export async function loadGameConfig(
  options: LoadGameConfigOptions = {},
): Promise<GameDefinition> {
  const fetcher = options.fetcher ?? globalThis.fetch;
  if (!fetcher) {
    if (options.fallback) return normaliseGame(options.fallback);
    throw new Error("This browser cannot load the game configuration.");
  }

  try {
    const response = await fetcher(
      options.url ?? DEFAULT_GAME_CONFIG_URL,
      { cache: "default" },
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return normaliseGame(await response.json());
  } catch (cause) {
    if (options.fallback) return normaliseGame(options.fallback);
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new Error(
      `The full game_config.json must be served with the QR app. ${detail}`,
      { cause },
    );
  }
}
