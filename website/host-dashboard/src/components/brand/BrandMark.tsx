import { cn } from "@/lib/utils";

export function BrandMark({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn("brand-mark", className)}
      role="img"
      aria-label="Give And Take"
    >
      <span className="brand-mark__monogram" aria-hidden="true">
        G<span>/</span>T
      </span>
      {!compact && (
        <span className="brand-mark__name">
          Give <i>And</i> Take
        </span>
      )}
    </span>
  );
}
