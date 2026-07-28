import {
  forwardRef,
  useId,
  type ButtonHTMLAttributes,
  type PointerEvent,
} from "react";

import { cn } from "@/lib/utils";

export interface LiquidButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: "signal" | "brass";
}

/**
 * The single expressive entry action. The filter id is instance-safe, pointer
 * events are composed with caller handlers, and the label remains normal DOM
 * text when SVG filters or backdrop filters are unavailable.
 */
export const LiquidButton = forwardRef<HTMLButtonElement, LiquidButtonProps>(
  function LiquidButton(
    {
      children,
      className,
      disabled,
      onPointerDown,
      onPointerUp,
      onPointerCancel,
      onPointerLeave,
      tone = "signal",
      type = "button",
      ...props
    },
    ref,
  ) {
    const filterId = `liquid-${useId().replaceAll(":", "")}`;

    const release = (event: PointerEvent<HTMLButtonElement>) => {
      event.currentTarget.removeAttribute("data-pressed");
    };

    return (
      <button
        ref={ref}
        type={type}
        className={cn("liquid-button", className)}
        data-tone={tone}
        disabled={disabled}
        onPointerDown={(event) => {
          if (!disabled) event.currentTarget.dataset.pressed = "true";
          onPointerDown?.(event);
        }}
        onPointerUp={(event) => {
          release(event);
          onPointerUp?.(event);
        }}
        onPointerCancel={(event) => {
          release(event);
          onPointerCancel?.(event);
        }}
        onPointerLeave={(event) => {
          release(event);
          onPointerLeave?.(event);
        }}
        {...props}
      >
        <svg
          className="liquid-button__filter"
          width="0"
          height="0"
          aria-hidden="true"
          focusable="false"
        >
          <filter id={filterId}>
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.015 0.08"
              numOctaves="1"
              seed="4"
              result="noise"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="noise"
              scale="3"
              xChannelSelector="R"
              yChannelSelector="B"
            />
          </filter>
        </svg>
        <span
          className="liquid-button__surface"
          style={{ filter: `url(#${filterId})` }}
          aria-hidden="true"
        />
        <span className="liquid-button__label">{children}</span>
      </button>
    );
  },
);
