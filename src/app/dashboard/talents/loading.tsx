import { CardGridSkeleton, PageSkeleton } from "../_components/page-skeleton";

export default function TalentsLoading() {
  return (
    <PageSkeleton actions>
      <CardGridSkeleton
        count={6}
        aspect="aspect-[4/5]"
        className="sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
      />
    </PageSkeleton>
  );
}
