import { Skeleton } from "@/components/ui/skeleton";
import { PageSkeleton } from "../../_components/page-skeleton";

export default function BatchDetailLoading() {
  return (
    <PageSkeleton actions>
      <Skeleton className="h-14 w-full rounded-lg" />
      <Skeleton className="h-80 w-full rounded-lg" />
    </PageSkeleton>
  );
}
