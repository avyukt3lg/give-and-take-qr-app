import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Reports which edges of a scroll container have content beyond the fold.
 *
 * A container with `overflow-x: auto` scrolls, but says nothing about the fact
 * that it scrolls: the board strip clipped mid-cell at S12 with no indication
 * that S13-S43 existed. That is defect 14. A static edge fade is not enough on
 * its own either, because a fade that is always present is decoration — it has
 * to appear only when there really is more to see, and it has to be paired with
 * a text equivalent so the information does not live in a gradient alone.
 *
 * Returns the edge state plus the visible-item range, so a caller can render
 * "S00-S12 of S43" next to the strip.
 */
export type ScrollOverflow = "none" | "start" | "end" | "both";

export interface ScrollOverflowState {
  overflow: ScrollOverflow;
  /** Fraction of the scrollable width that is currently visible, 0-1. */
  visibleFraction: number;
  /** Index of the first item at least half in view, when itemWidth is known. */
  firstVisible: number;
  /** Index of the last item at least half in view. */
  lastVisible: number;
}

const INITIAL: ScrollOverflowState = {
  overflow: "none",
  visibleFraction: 1,
  firstVisible: 0,
  lastVisible: 0,
};

export function useScrollOverflow<T extends HTMLElement>(
  ref: React.RefObject<T | null>,
  itemCount: number,
): ScrollOverflowState {
  const [state, setState] = useState<ScrollOverflowState>(INITIAL);
  // Compared before setState so a scroll event that does not change the edge
  // state does not re-render. The strip fires these continuously while dragging.
  const lastRef = useRef<ScrollOverflowState>(INITIAL);

  const measure = useCallback(() => {
    const node = ref.current;
    if (!node) return;

    const { scrollLeft, scrollWidth, clientWidth } = node;
    // A 1px tolerance: fractional device pixel ratios leave scrollLeft a hair
    // short of the true maximum, which would pin the "end" affordance on
    // forever at the right-hand end of the strip.
    const atStart = scrollLeft <= 1;
    const atEnd = scrollLeft + clientWidth >= scrollWidth - 1;
    const scrollable = scrollWidth > clientWidth + 1;

    const overflow: ScrollOverflow = !scrollable
      ? "none"
      : atStart
        ? "end"
        : atEnd
          ? "start"
          : "both";

    const visibleFraction = scrollWidth > 0 ? clientWidth / scrollWidth : 1;
    const perItem = itemCount > 0 ? scrollWidth / itemCount : 0;
    const firstVisible =
      perItem > 0 ? Math.min(itemCount - 1, Math.floor(scrollLeft / perItem)) : 0;
    const lastVisible =
      perItem > 0
        ? Math.min(
            itemCount - 1,
            Math.max(firstVisible, Math.ceil((scrollLeft + clientWidth) / perItem) - 1),
          )
        : Math.max(0, itemCount - 1);

    const next: ScrollOverflowState = {
      overflow,
      visibleFraction,
      firstVisible,
      lastVisible,
    };
    const previous = lastRef.current;
    if (
      previous.overflow === next.overflow &&
      previous.firstVisible === next.firstVisible &&
      previous.lastVisible === next.lastVisible
    ) {
      return;
    }
    lastRef.current = next;
    setState(next);
  }, [itemCount, ref]);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    measure();
    node.addEventListener("scroll", measure, { passive: true });

    // The strip's own width changes with the rail and the viewport, and its
    // content width changes when the player count changes. Observing the node
    // covers both without a window resize listener.
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(node);

    return () => {
      node.removeEventListener("scroll", measure);
      observer?.disconnect();
    };
  }, [measure, ref]);

  return state;
}
