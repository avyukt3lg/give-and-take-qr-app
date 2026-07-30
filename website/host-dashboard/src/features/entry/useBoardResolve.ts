import { useEffect, useState } from "react";

import {
  ENTRY_BOARD_CELL_SIZE,
  ENTRY_BOARD_COARSE_CELL_SIZE,
} from "@/components/effects/ascii";

/**
 * The board resolves into focus on load: it starts at a coarse cell size and
 * settles to the tuned one, so the printed route appears to come into view
 * rather than simply switching on.
 *
 * This steps rather than tweens. Cell size changes re-sample the raster, so a
 * per-frame tween would thrash the worker for no visible gain — at these sizes
 * the intermediate grids are individually legible, and stepping reads as an
 * instrument focusing rather than as a fade.
 *
 * Under reduced motion the settled size is the initial state: a designed
 * static frame, not a disabled animation.
 */
const STEPS = [
  ENTRY_BOARD_COARSE_CELL_SIZE,
  25,
  18,
  13,
  10,
  ENTRY_BOARD_CELL_SIZE,
] as const;

const STEP_MS = 150;

export function useBoardResolve(reducedMotion: boolean, enabled = true): number {
  const [step, setStep] = useState(0);

  // The resolve starts when the scene does. Before that the canvas is paused,
  // so holding at the coarse step costs nothing and avoids a fine-to-coarse
  // jump at the moment the effect becomes visible.
  const running = enabled && !reducedMotion;

  useEffect(() => {
    if (!running || step >= STEPS.length - 1) return;
    const timer = window.setTimeout(() => setStep((value) => value + 1), STEP_MS);
    return () => window.clearTimeout(timer);
  }, [running, step]);

  if (reducedMotion) return ENTRY_BOARD_CELL_SIZE;
  return STEPS[step] ?? ENTRY_BOARD_CELL_SIZE;
}

/** Total duration of the resolve, for coordinating the load choreography. */
export const BOARD_RESOLVE_MS = STEP_MS * (STEPS.length - 1);
