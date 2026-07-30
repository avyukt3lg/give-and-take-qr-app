import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";

/**
 * Motion primitives for the Command Deck.
 *
 * The Deck is an operational surface. Every effect here answers one question —
 * "what does this tell the user?" — and nothing is here because it looks good.
 * There is no parallax and nothing moves underneath a control.
 */

/**
 * Re-keys its children with a short blur-fade whenever `changeKey` changes.
 *
 * WHAT IT TELLS THE USER: the turn, the player or the phase just changed, and
 * what you are now reading is new. This is the single most important motion in
 * the app. A host running a physical table looks away to move a pawn; on looking
 * back, an instruction panel that swapped silently is indistinguishable from one
 * that never changed, and following a stale instruction is a real failure mode.
 *
 * Deliberately NOT a positional animation. The Now zone is where the host reads
 * the next action, so it must not slide, and it must not change height — the
 * outer element holds the grid area and only the contents cross-fade.
 *
 * Under reduced motion the children are swapped with no transition at all. There
 * is no positional or opacity animation to soften, so the designed static state
 * is simply the new content, immediately.
 */
export function NowRekey({
  changeKey,
  children,
  className,
}: {
  changeKey: string;
  children: ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();

  if (reduce) {
    return <div className={className}>{children}</div>;
  }

  // Enter-only, and deliberately not wrapped in AnimatePresence.
  //
  // `AnimatePresence mode="wait"` would run the outgoing exit to completion
  // before the incoming enter began: 340ms of empty panel, then 340ms of fade,
  // on every phase change. An instruction the host cannot read for a third of a
  // second is worse than one that swaps silently. `mode="popLayout"` is no
  // better — it pulls the outgoing child out of flow and collapses the zone.
  //
  // Changing the key remounts the child, and only the arriving content animates.
  return (
    <motion.div
      key={changeKey}
      className={className}
      // Starts at 0.4, not 0: the text resolves into focus rather than appearing
      // from nothing, so the panel is legible on the first frame and the change
      // still registers.
      initial={{ opacity: 0.4, filter: "blur(5px)" }}
      animate={{ opacity: 1, filter: "blur(0px)" }}
      transition={{
        // Panel class: a content swap inside a frame that itself does not move.
        duration: 0.34,
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      {children}
    </motion.div>
  );
}

/**
 * A single underline that travels between the members of a set.
 *
 * WHAT IT TELLS THE USER: the phase advanced, and in which direction. An instant
 * class swap tells you the new state but not that a transition happened, and the
 * four phases (Roll / Resolve / Log / End) are a sequence the host is walking
 * through — direction is information.
 *
 * Implemented with a shared `layoutId`, so exactly one element exists and Motion
 * animates it between positions. Rendering four underlines and cross-fading
 * their opacity would look similar and say nothing about direction.
 *
 * Under reduced motion the underline still marks the active step; it just
 * appears there rather than travelling. That is a designed static state — the
 * active phase is never unmarked.
 */
export function TravellingUnderline({
  active,
  layoutId,
}: {
  active: boolean;
  layoutId: string;
}) {
  const reduce = useReducedMotion();

  if (!active) return null;

  if (reduce) {
    return <span className="travelling-underline" aria-hidden="true" />;
  }

  return (
    <motion.span
      layoutId={layoutId}
      className="travelling-underline"
      aria-hidden="true"
      transition={{
        // Surface class: a phase advance is a change of what the host is doing.
        duration: 0.56,
        ease: [0.16, 1, 0.3, 1],
      }}
    />
  );
}
