import { Skeleton } from "@/components/ui/skeleton";
import { CardGridSkeleton, PageSkeleton } from "../_components/page-skeleton";

export default function ReviewLoading() {
  return (
    <PageSkeleton>
      <Skeleton className="h-9 w-80 max-w-full" />
      <CardGridSkeleton
        count={6}
        aspect="aspect-[9/16]"
        className="sm:grid-cols-2 xl:grid-cols-3"
      />
    </PageSkeleton>
  );
}
