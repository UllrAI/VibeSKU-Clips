import { Skeleton } from "@/components/ui/skeleton";
import { PageSkeleton } from "../../_components/page-skeleton";

export default function WorkDetailLoading() {
  return (
    <PageSkeleton>
      <Skeleton className="h-8 w-full max-w-md" />
      <Skeleton className="h-96 w-full" />
    </PageSkeleton>
  );
}
