import { useEffect, useState } from "react";

import type { ThemeId } from "@/domain/types";

export interface ResolvedThemeTokens {
  readonly signal: string;
  readonly brass: string;
  readonly canvas: string;
  readonly canvasSunk: string;
  readonly ink: string;
}

const FALLBACK: ResolvedThemeTokens = {
  signal: "#c8f04a",
  brass: "#b18a43",
  canvas: "#0b0c0a",
  canvasSunk: "#070806",
  ink: "#e8e1d2",
};

function readTokens(): ResolvedThemeTokens {
  if (typeof window === "undefined") return FALLBACK;
  const styles = window.getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) =>
    styles.getPropertyValue(name).trim() || fallback;

  return {
    signal: read("--signal", FALLBACK.signal),
    brass: read("--brass", FALLBACK.brass),
    canvas: read("--canvas", FALLBACK.canvas),
    canvasSunk: read("--canvas-sunk", FALLBACK.canvasSunk),
    ink: read("--ink", FALLBACK.ink),
  };
}

/**
 * Canvas effects cannot read CSS custom properties, so anything drawn to a
 * canvas has to be told the current palette explicitly. Resolving it here is
 * what lets the entry board tint follow Table, Classroom and Contrast instead
 * of being hardcoded to one theme's accent.
 */
export function useThemeTokens(theme: ThemeId): ResolvedThemeTokens {
  const [tokens, setTokens] = useState<ResolvedThemeTokens>(readTokens);

  useEffect(() => {
    // The theme attribute is written to <html> in an effect, so read on the
    // next frame to get the applied values rather than the outgoing ones.
    const frame = requestAnimationFrame(() => setTokens(readTokens()));
    return () => cancelAnimationFrame(frame);
  }, [theme]);

  return tokens;
}
