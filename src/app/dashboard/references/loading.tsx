import { CardGridSkeleton, PageSkeleton } from "../_components/page-skeleton";

export default function ReferencesLoading() {
  return (
    <PageSkeleton actions>
      <CardGridSkeleton
        count={6}
        aspect="aspect-video"
        className="sm:grid-cols-2 lg:grid-cols-3"
      />
    </PageSkeleton>
  );
}
