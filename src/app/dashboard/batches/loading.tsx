import { PageSkeleton, RowListSkeleton } from "../_components/page-skeleton";

export default function BatchesLoading() {
  return (
    <PageSkeleton actions>
      <RowListSkeleton count={4} />
    </PageSkeleton>
  );
}
