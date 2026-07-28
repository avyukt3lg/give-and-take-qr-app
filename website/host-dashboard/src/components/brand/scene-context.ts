import { createContext } from "react";

export type SceneId = "ascii" | "board" | null;

export interface SceneContextValue {
  activeScene: SceneId;
  pendingScene: SceneId;
  activate(scene: Exclude<SceneId, null>): void;
  release(scene: Exclude<SceneId, null>): void;
}

export const SceneContext = createContext<SceneContextValue | null>(null);
