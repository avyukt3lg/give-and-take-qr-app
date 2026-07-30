import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * A copy control that confirms at the control.
 *
 * WHAT IT TELLS THE USER: the thing you pressed did the thing. The table code is
 * how players join, so a host copying it needs to know it is on the clipboard
 * before they paste it into a message. Previously the only confirmation was a
 * message rendered in a live region elsewhere on the page — correct for a screen
 * reader, invisible to a host looking at the button they just pressed.
 *
 * The confirmed state is a real state, not an animation: the label changes, the
 * glyph changes, and the button holds it long enough to read. It reverts so the
 * control does not falsely claim a stale clipboard.
 *
 * Failure is deliberately not shown here. `copyText` already raises an assertive
 * message on failure, and the honest outcome of a failed copy is that the button
 * simply does not confirm.
 */
const CONFIRM_MS = 2000;

export function CopyButton({
  onCopy,
  label,
  confirmedLabel = "Copied",
  variant = "outline",
}: {
  onCopy(): Promise<boolean> | boolean;
  label: string;
  confirmedLabel?: string;
  variant?: "outline" | "ghost" | "default";
}) {
  const [confirmed, setConfirmed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    },
    [],
  );

  const handleClick = async () => {
    const ok = await onCopy();
    if (!ok) return;

    setConfirmed(true);
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setConfirmed(false), CONFIRM_MS);
  };

  return (
    <Button
      variant={variant}
      onClick={handleClick}
      data-confirmed={confirmed || undefined}
      className="copy-button"
    >
      {confirmed ? (
        <Check aria-hidden="true" />
      ) : (
        <Copy aria-hidden="true" />
      )}
      {/* The label itself changes, so the state is not carried by the glyph or
          its colour alone. */}
      {confirmed ? confirmedLabel : label}
    </Button>
  );
}
