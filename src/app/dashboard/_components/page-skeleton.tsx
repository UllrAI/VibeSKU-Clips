import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Route-level placeholders mirror the layout they stand in for, so the page
 * does not jump when the data lands. Anything that cannot be mirrored honestly
 * is better left out than approximated.
 */
export function PageSkeleton({
  children,
  actions = false,
}: {
  children: React.ReactNode;
  actions?: boolean;
}) {
  return (
    <div className="space-y-4 px-4 py-4 md:space-y-6 md:py-6 lg:px-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-44" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        {actions && <Skeleton className="h-9 w-32" />}
      </div>
      {children}
    </div>
  );
}

export function CardGridSkeleton({
  count,
  aspect,
  className,
}: {
  count: number;
  /** Matches the media box of the real card, or omit for text-only cards. */
  aspect?: string;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-4", className)}>
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className="border-border space-y-3 rounded-xl border p-6"
        >
          {aspect && <Skeleton className={cn("w-full", aspect)} />}
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ))}
    </div>
  );
}

export function RowListSkeleton({ count }: { count: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className="border-border space-y-3 rounded-lg border px-4 py-4"
        >
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-5 w-20" />
          </div>
          <Skeleton className="h-2 w-full" />
        </div>
      ))}
    </div>
  );
}
