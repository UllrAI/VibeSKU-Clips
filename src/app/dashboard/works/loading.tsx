import { PageSkeleton, RowListSkeleton } from "../_components/page-skeleton";

export default function WorksLoading() {
  return (
    <PageSkeleton>
      <RowListSkeleton count={4} />
    </PageSkeleton>
  );
}
