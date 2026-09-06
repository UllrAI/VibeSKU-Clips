import { CardGridSkeleton, PageSkeleton } from "../_components/page-skeleton";

export default function TalentsLoading() {
  return (
    <PageSkeleton actions>
      <CardGridSkeleton
        count={6}
        aspect="aspect-[3/4]"
        className="sm:grid-cols-2 lg:grid-cols-3"
      />
    </PageSkeleton>
  );
}
