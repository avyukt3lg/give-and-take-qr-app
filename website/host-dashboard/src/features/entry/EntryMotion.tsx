import {
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";
import { useEffect, useState, type ElementType, type ReactNode, type RefObject } from "react";

/**
 * Motion primitives for the entry hero.
 *
 * Two rules hold across all of them:
 *
 *  - Reduced motion means no positional or scale animation, not "no effect".
 *    Every primitive here has a designed static state — the settled frame —
 *    rather than a disabled animation.
 *  - Nothing the user aims at moves. The console holds the primary action, so
 *    it never parallaxes and never tilts.
 */

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
    const timer = window.setTimeout(() => setSettled(true), ENTRY_CHOREOGRAPHY_MS);
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

export interface RevealProps {
  readonly children: ReactNode;
  readonly delay?: number;
  readonly reducedMotion: boolean;
  readonly as?: ElementType;
  readonly className?: string;
  readonly id?: string;
  readonly y?: number;
}

/**
 * Blur-to-sharp entrance. Nothing pops: elements arrive slightly low and out
 * of focus and settle. Under reduced motion the element is simply present.
 */
export function Reveal({
  children,
  delay = 0,
  reducedMotion,
  as = "div",
  className,
  id,
  y = 14,
}: RevealProps) {
  const Component = motion[as as "div"] ?? motion.div;

  if (reducedMotion) {
    const Static = as as "div";
    return (
      <Static className={className} id={id}>
        {children}
      </Static>
    );
  }

  return (
    <Component
      id={id}
      className={className}
      initial={{ opacity: 0, y, filter: "blur(10px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{
        duration: 0.62,
        delay,
        ease: [0.16, 1, 0.3, 1],
      }}
    >
      {children}
    </Component>
  );
}

/**
 * Reveals a headline one authored line at a time. The line breaks in this
 * product are deliberate — the display face sets "Keep the board physical."
 * and "Run the table here." as two statements — so they arrive as two
 * statements rather than as one block fading up.
 */
export function RevealLines({
  lines,
  reducedMotion,
  delay = 0,
  className,
  id,
}: {
  readonly lines: ReactNode[];
  readonly reducedMotion: boolean;
  readonly delay?: number;
  readonly className?: string;
  readonly id?: string;
}) {
  return (
    <h1 id={id} className={className}>
      {lines.map((line, index) => (
        <span className="entry-headline__line" key={index}>
          {/* A real space in the DOM between lines. Without it the heading's
              text is "…physical.Run the table…" and the accessible name is
              only correct because Chromium inserts a space for block-level
              children — a heuristic that is not guaranteed across engines. */}
          {index > 0 ? " " : null}
          {reducedMotion ? (
            <span>{line}</span>
          ) : (
            <motion.span
              initial={{ opacity: 0, y: "0.36em", filter: "blur(12px)" }}
              animate={{ opacity: 1, y: "0em", filter: "blur(0px)" }}
              transition={{
                duration: 0.78,
                delay: delay + index * 0.09,
                ease: [0.16, 1, 0.3, 1],
              }}
            >
              {line}
            </motion.span>
          )}
        </span>
      ))}
    </h1>
  );
}

/**
 * Depth by layer. The page grid moves slowest, the artwork frame and its
 * registration marks drift, and the console is fixed. Offsets are small on
 * purpose — the moment parallax is consciously noticeable it has stopped
 * describing depth and started decorating.
 */
export function useLayerParallax(
  target: RefObject<HTMLElement | null>,
  distance: number,
  reducedMotion: boolean,
): MotionValue<number> {
  const { scrollYProgress } = useScroll({
    target,
    offset: ["start end", "end start"],
  });
  const raw = useTransform(
    scrollYProgress,
    [0, 1],
    reducedMotion ? [0, 0] : [distance, -distance],
  );
  return useSpring(raw, { stiffness: 120, damping: 30, mass: 0.4 });
}

/**
 * Corner registration marks. Part of the approved language, they carry no
 * reading load, which makes them the right thing to drift under scroll.
 */
export function RegistrationMarks({ className }: { readonly className?: string }) {
  return (
    <div className={`registration-marks ${className ?? ""}`} aria-hidden="true">
      <span data-corner="tl" />
      <span data-corner="tr" />
      <span data-corner="bl" />
      <span data-corner="br" />
    </div>
  );
}

/**
 * The vertical chapter index from the approved design. Decorative — the
 * chapters themselves are a real ordered list in the document — so it is
 * hidden from assistive technology rather than duplicating that structure.
 */
export function ChapterIndex({
  count,
  active,
}: {
  readonly count: number;
  readonly active: number;
}) {
  return (
    <ul className="entry-chapter-index" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <li key={index} data-active={index === active}>
          {String(index + 1).padStart(2, "0")}
        </li>
      ))}
    </ul>
  );
}

/**
 * Persistent status band. The clock is the only live element on the entry
 * page; it is what keeps the fictional-data disclaimer permanently on screen
 * instead of buried in a footer nobody scrolls to.
 */
export function StatusBand({ reducedMotion }: { readonly reducedMotion: boolean }) {
  // Visual furniture that restates the header meta strip and the footer
  // disclaimer. Both of those are real content in landmarks; announcing this
  // as well would duplicate them and leave content outside any landmark.
  return (
    <div className="entry-status-band" aria-hidden="true">
      <span>S00—S43 · 12 turns · Fictional data only</span>
      <span className="entry-status-band__live">
        <Clock reducedMotion={reducedMotion} />
        <span>Scroll</span>
      </span>
    </div>
  );
}

function Clock({ reducedMotion }: { readonly reducedMotion: boolean }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    // Under reduced motion the clock still updates — it is information, not
    // decoration — but a minute is enough to stop it reading as animation.
    const period = reducedMotion ? 60_000 : 1_000;
    const timer = window.setInterval(() => setNow(new Date()), period);
    return () => window.clearInterval(timer);
  }, [reducedMotion]);

  return (
    <time dateTime={now.toISOString()}>
      {now.toLocaleTimeString("en-GB", { hour12: false })}
    </time>
  );
}
