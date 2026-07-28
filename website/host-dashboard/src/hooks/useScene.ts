import { useCallback, useContext } from "react";

import { SceneContext, type SceneId } from "@/components/brand/scene-context";

export function useScene(scene: Exclude<SceneId, null>) {
  const context = useContext(SceneContext);
  const activateScene = context?.activate;
  const releaseScene = context?.release;
  const activate = useCallback(
    () => activateScene?.(scene),
    [activateScene, scene],
  );
  const release = useCallback(
    () => releaseScene?.(scene),
    [releaseScene, scene],
  );

  return {
    active: context ? context.activeScene === scene : scene === "ascii",
    pending: context ? context.pendingScene === scene : false,
    activate,
    release,
  };
}
