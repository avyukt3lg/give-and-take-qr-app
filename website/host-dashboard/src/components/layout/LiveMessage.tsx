import { X } from "lucide-react";

export function LiveMessage({
  message,
  assertive = false,
  onDismiss,
}: {
  message: string | null;
  assertive?: boolean;
  onDismiss(): void;
}) {
  return (
    <>
      <div
        className="sr-only"
        role={assertive ? "alert" : "status"}
        aria-live={assertive ? "assertive" : "polite"}
        aria-atomic="true"
      >
        {message ?? ""}
      </div>
      {message && (
        <aside className="live-message" aria-label="Table notification">
          <span aria-hidden="true">GT</span>
          <p>{message}</p>
          <button type="button" onClick={onDismiss} aria-label="Dismiss notification">
            <X aria-hidden="true" />
          </button>
        </aside>
      )}
    </>
  );
}
