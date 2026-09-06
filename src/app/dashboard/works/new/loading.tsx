import { PageSkeleton, RowListSkeleton } from "../../_components/page-skeleton";

export default function NewWorkLoading() {
  return (
    <PageSkeleton>
      <RowListSkeleton count={4} />
    </PageSkeleton>
  );
}
