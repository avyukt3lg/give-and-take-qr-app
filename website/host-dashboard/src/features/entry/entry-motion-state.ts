import { useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

/** Load-choreography timings, in seconds. Total settles under 1.1s. */
export const ENTRY_STAGGER = {
  brand: 0,
  eyebrow: 0.08,
  headline: 0.16,
  body: 0.34,
  proof: 0.42,
  console: 0.35,
  artwork: 0.2,
} as const;

/** How long the load choreography takes to settle, in ms. */
export const ENTRY_CHOREOGRAPHY_MS = 1150;

/**
 * True once the load choreography has finished. Text that fades in is, by
 * definition, below its contrast ratio while it is fading — so anything
 * auditing this page has to know when it has reached its steady state rather
 * than sampling mid-flight. Surfaced on the page as data-entry-state.
 */
export function useChoreographySettled(reducedMotion: boolean): boolean {
  const [settled, setSettled] = useState(reducedMotion);

  useEffect(() => {
    if (reducedMotion) return;
    const timer = window.setTimeout(
      () => setSettled(true),
      ENTRY_CHOREOGRAPHY_MS,
    );
    return () => window.clearTimeout(timer);
  }, [reducedMotion]);

  return settled || reducedMotion;
}

export function useEntryReducedMotion(preference: boolean): boolean {
  const system = useReducedMotion();
  const hiddenAtMount = useHiddenAtMount();
  // A reveal that starts at opacity 0 and is driven by requestAnimationFrame
  // never runs while the document is hidden, so a page opened in a background
  // tab would hold its headline invisible. Copy must not depend on an
  // animation to become readable — if we start hidden, we start settled.
  return preference || Boolean(system) || hiddenAtMount;
}

function useHiddenAtMount(): boolean {
  const [hidden] = useState(
    () => typeof document !== "undefined" && document.hidden,
  );
  return hidden;
}
