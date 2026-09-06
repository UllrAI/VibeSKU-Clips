import { PageSkeleton, RowListSkeleton } from "../_components/page-skeleton";

export default function WorksLoading() {
  return (
    <PageSkeleton actions>
      <RowListSkeleton count={4} />
    </PageSkeleton>
  );
}
