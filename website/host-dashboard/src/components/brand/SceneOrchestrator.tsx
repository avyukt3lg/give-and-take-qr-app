import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  SceneContext,
  type SceneContextValue,
  type SceneId,
} from "./scene-context";

export function SceneOrchestrator({
  children,
  initialScene = "ascii",
}: {
  children: ReactNode;
  initialScene?: Exclude<SceneId, null>;
}) {
  const [sceneState, setSceneState] = useState<{
    active: SceneId;
    pending: SceneId;
  }>({
    active: initialScene,
    pending: null,
  });

  const activate = useCallback((scene: Exclude<SceneId, null>) => {
    setSceneState((current) => {
      if (current.active === scene && current.pending === null) return current;
      if (current.active === null && current.pending === scene) return current;

      // Every renderer-to-renderer switch passes through a committed idle
      // frame. React therefore runs the outgoing Canvas/WebGL cleanup before
      // the requested renderer is allowed to mount or resume.
      return { active: null, pending: scene };
    });
  }, []);

  const release = useCallback((scene: Exclude<SceneId, null>) => {
    setSceneState((current) => {
      if (current.active !== scene && current.pending !== scene) return current;
      return {
        active: current.active === scene ? null : current.active,
        pending: current.pending === scene ? null : current.pending,
      };
    });
  }, []);

  useEffect(() => {
    if (sceneState.active !== null || sceneState.pending === null) return;
    const requested = sceneState.pending;
    const frame = requestAnimationFrame(() => {
      setSceneState((current) =>
        current.active === null && current.pending === requested
          ? { active: requested, pending: null }
          : current,
      );
    });
    return () => cancelAnimationFrame(frame);
  }, [sceneState.active, sceneState.pending]);

  const value = useMemo<SceneContextValue>(
    () => ({
      activeScene: sceneState.active,
      pendingScene: sceneState.pending,
      activate,
      release,
    }),
    [activate, release, sceneState.active, sceneState.pending],
  );

  return <SceneContext.Provider value={value}>{children}</SceneContext.Provider>;
}
