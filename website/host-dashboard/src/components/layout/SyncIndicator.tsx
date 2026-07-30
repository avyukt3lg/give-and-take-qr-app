import { CloudOff, Check, RefreshCw, RotateCw, TriangleAlert } from "lucide-react";

import type { BackendSnapshot } from "@/app/contracts";
import { Button } from "@/components/ui/button";
import { NumberTicker } from "@/components/ui/number-ticker";

/**
 * The three connection states a host has to be able to tell apart from across a
 * table: the table is saved, the table is saving, the table is not reaching the
 * server.
 *
 * Before this the only difference between them was the fill of a 0.55rem dot —
 * green, amber or red — plus the raw state word ("saving", "offline"). That is
 * state carried by colour alone at a size that fails on a projector, and it is
 * one of the six things the two-second bar requires a host to know.
 *
 * Each state now differs in four channels at once: a distinct glyph, a distinct
 * word, a distinct rule weight, and only then colour.
 */

type SyncTone = "settled" | "working" | "broken";

interface SyncPresentation {
  tone: SyncTone;
  label: string;
  Icon: typeof Check;
  /** True only while a request is genuinely in flight. */
  busy: boolean;
}

function present(state: BackendSnapshot["state"]): SyncPresentation {
  switch (state) {
    case "saved":
      return { tone: "settled", label: "Synced", Icon: Check, busy: false };
    case "saving":
      return { tone: "working", label: "Saving", Icon: RefreshCw, busy: true };
    case "connecting":
      return { tone: "working", label: "Connecting", Icon: RefreshCw, busy: true };
    case "offline":
      return { tone: "broken", label: "Offline", Icon: CloudOff, busy: false };
    case "error":
      return { tone: "broken", label: "Sync failed", Icon: TriangleAlert, busy: false };
    case "idle":
    default:
      // "idle" is a real state but not a meaningful one to a host — the table is
      // open and nothing is pending. Reading it as settled is honest; reading the
      // raw word "idle" was not.
      return { tone: "settled", label: "Ready", Icon: Check, busy: false };
  }
}

export function SyncIndicator({
  backend,
  onRetry,
}: {
  backend: BackendSnapshot;
  onRetry(): void;
}) {
  const { tone, label, Icon, busy } = present(backend.state);
  const broken = tone === "broken";

  return (
    <div
      className="save-indicator"
      data-tone={tone}
      data-busy={busy || undefined}
      // Assertive only when the table has stopped reaching the server, because
      // that interrupts what the host is doing. A routine save must not.
      aria-live={broken ? "assertive" : "polite"}
      role={broken ? "alert" : "status"}
    >
      <span className="save-indicator__glyph" aria-hidden="true">
        <Icon />
      </span>
      <div>
        <strong>{label}</strong>
        <small>{backend.detail}</small>
      </div>
      {broken ? (
        <Button
          variant="ghost"
          size="icon"
          onClick={onRetry}
          aria-label="Retry session sync"
        >
          <RotateCw aria-hidden="true" />
        </Button>
      ) : (
        // The revision counter is the host's proof that a save landed. Ticking it
        // means an arriving update reads as movement rather than a silent
        // substitution. Space is reserved so it cannot reflow the row.
        <span className="save-indicator__revision" title="Saved revision">
          <span aria-hidden="true">r</span>
          <NumberTicker value={backend.revision} />
        </span>
      )}
    </div>
  );
}
