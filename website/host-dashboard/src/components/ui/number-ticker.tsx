import {
  useEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
} from "react";
import { animate, useReducedMotion } from "motion/react";

import { cn } from "@/lib/utils";

/**
 * A duration-capped counter for numbers that change while the host is looking
 * at them: the revision counter, cash, portfolio value, market indexes, scores.
 *
 * The point of the movement is to say "this number just changed" — on a realtime
 * surface a value that swaps silently reads as a flicker, or is missed entirely.
 * It is not decoration, so it is bounded hard.
 *
 * Three deliberate departures from the vendored Magic UI original:
 *
 * 1. **A tween, not a spring.** The original used `useSpring({ damping: 60,
 *    stiffness: 100 })`, which has no duration guarantee and settled well past a
 *    second. The motion contract caps this class of feedback at 400ms; a spring
 *    cannot promise that, so this is a fixed tween at `--dur-panel` (340ms).
 *
 * 2. **It never displays a stale figure.** The original rendered `startValue` on
 *    mount and animated toward `value` only once in view, so a metric could show
 *    0 — or the previous number — while the host was reading it. On an
 *    operational surface that is a correctness bug, not a polish issue. Here the
 *    committed value is the initial render, and animation only ever runs from a
 *    genuinely previous value.
 *
 * 3. **Accessibility is inside the component.** The original left every call
 *    site to pair an `aria-hidden` ticker with an `sr-only` span by hand, which
 *    MarketView did and ScoresView did not. The mid-animation digits are noise to
 *    a screen reader; the settled value is what matters. Handled once, here.
 *
 * Layout stability: `tabular-nums` keeps digit advance constant so a changing
 * value cannot reflow its neighbours. A change in digit *count* still changes
 * width, so containers that hold a value crossing an order of magnitude should
 * reserve space — the Deck metrics do, via `.metric strong`.
 */
interface NumberTickerProps
  extends Omit<ComponentPropsWithoutRef<"span">, "children"> {
  value: number;
  /** Value to animate from on first paint. Omit to commit `value` immediately. */
  startValue?: number;
  decimalPlaces?: number;
  /** Formats both the animated frames and the announced value. */
  format?: (value: number) => string;
}

/** Matches --dur-panel. Under the 400ms cap the motion contract sets. */
const DURATION_SECONDS = 0.34;

export function NumberTicker({
  value,
  startValue,
  className,
  decimalPlaces = 0,
  format,
  ...props
}: NumberTickerProps) {
  const frameRef = useRef<HTMLSpanElement>(null);
  const shouldReduceMotion = useReducedMotion();

  const formatValue = (input: number): string =>
    format
      ? format(input)
      : Intl.NumberFormat("en-US", {
          minimumFractionDigits: decimalPlaces,
          maximumFractionDigits: decimalPlaces,
        }).format(Number(input.toFixed(decimalPlaces)));

  // The value the visible digits are currently resting on. Seeded from
  // startValue only when a caller explicitly asks for an entrance count.
  const [committed] = useState(() => startValue ?? value);
  const previousRef = useRef(committed);

  useEffect(() => {
    const node = frameRef.current;
    const from = previousRef.current;
    previousRef.current = value;

    if (!node || from === value) return;

    if (shouldReduceMotion) {
      // Reduced motion still gets the new number immediately — suppressing the
      // animation must not suppress the information.
      node.textContent = formatValue(value);
      return;
    }

    const controls = animate(from, value, {
      duration: DURATION_SECONDS,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (latest) => {
        node.textContent = formatValue(latest);
      },
    });

    return () => controls.stop();
    // formatValue is derived from format/decimalPlaces, both covered below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, shouldReduceMotion, format, decimalPlaces]);

  return (
    <span className={cn("inline-block text-current tabular-nums", className)} {...props}>
      {/* The animated frames are decorative; the digits mid-tween are not a
          value any user should be told. */}
      <span aria-hidden="true" ref={frameRef}>
        {formatValue(committed)}
      </span>
      {/* The settled value, and the only one announced. */}
      <span className="sr-only">{formatValue(value)}</span>
    </span>
  );
}
