import { forwardRef, type ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export interface MetalButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  intent?: "commit" | "finish";
}

/**
 * Reserved for irreversible-feeling physical table commitments. It deliberately
 * uses pointer-state CSS instead of swallowing mouse/touch handlers.
 */
export const MetalButton = forwardRef<HTMLButtonElement, MetalButtonProps>(
  function MetalButton(
    {
      children,
      className,
      disabled,
      intent = "commit",
      type = "button",
      ...props
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        className={cn("metal-button", className)}
        data-intent={intent}
        disabled={disabled}
        {...props}
      >
        <span className="metal-button__edge" aria-hidden="true" />
        <span className="metal-button__label">{children}</span>
      </button>
    );
  },
);
