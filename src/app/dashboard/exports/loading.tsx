import { PageSkeleton, RowListSkeleton } from "../_components/page-skeleton";

export default function ExportsLoading() {
  return (
    <PageSkeleton>
      <RowListSkeleton count={3} />
    </PageSkeleton>
  );
}
