import { Skeleton } from "@/components/ui/skeleton";
import { PageSkeleton, RowListSkeleton } from "./_components/page-skeleton";

export default function DashboardLoading() {
  return (
    <PageSkeleton actions>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="border-border space-y-3 rounded-xl border p-6"
          >
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-16" />
          </div>
        ))}
      </div>

      <div className="border-border space-y-4 rounded-xl border p-6">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-72 max-w-full" />
        <RowListSkeleton count={3} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 2 }, (_, index) => (
          <div
            key={index}
            className="border-border space-y-3 rounded-xl border p-6"
          >
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-56 max-w-full" />
            <Skeleton className="h-8 w-24" />
          </div>
        ))}
      </div>
    </PageSkeleton>
  );
}
