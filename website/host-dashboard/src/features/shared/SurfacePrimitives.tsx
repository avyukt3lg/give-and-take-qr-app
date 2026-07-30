import { Check, CircleAlert, Minus, Plus } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The operational header for a surface. `title` is the directive — what the
 * host does here — not a description of the product. The surface is already
 * named by the h1 in the workspace header, so this heading states the task
 * instead of repeating the name. `description` is for a real constraint the
 * host must know, and is usually absent.
 */
export function SurfaceIntro({
  eyebrow,
  title,
  description,
  aside,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  aside?: ReactNode;
}) {
  return (
    <header className="surface-intro">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2 className="display-serif">{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {aside && <div className="surface-intro__aside">{aside}</div>}
    </header>
  );
}

export function RuleLabel({ children }: { children: ReactNode }) {
  return <p className="rule-label">{children}</p>;
}

export function EmptyState({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span aria-hidden="true">—</span>
      <strong>{title}</strong>
      <p>{children}</p>
    </div>
  );
}

export function StatusMark({
  done,
  children,
}: {
  done: boolean;
  children: ReactNode;
}) {
  return (
    <span className="status-mark" data-done={done}>
      {done ? <Check aria-hidden="true" /> : <CircleAlert aria-hidden="true" />}
      {children}
    </span>
  );
}

export function DeltaControl({
  label,
  onDecrease,
  onIncrease,
  disabled,
}: {
  label: string;
  onDecrease(): void;
  onIncrease(): void;
  disabled?: boolean;
}) {
  return (
    <span className="delta-control">
      <Button
        type="button"
        variant="outline"
        size="icon"
        disabled={disabled}
        onClick={onDecrease}
        aria-label={`Decrease ${label}`}
      >
        <Minus aria-hidden="true" />
      </Button>
      <span>{label}</span>
      <Button
        type="button"
        variant="outline"
        size="icon"
        disabled={disabled}
        onClick={onIncrease}
        aria-label={`Increase ${label}`}
      >
        <Plus aria-hidden="true" />
      </Button>
    </span>
  );
}

export function Metric({
  label,
  value,
  detail,
  signal = false,
  className,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  signal?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("metric", className)} data-signal={signal || undefined}>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </div>
  );
}
