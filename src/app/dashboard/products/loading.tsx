import { CardGridSkeleton, PageSkeleton } from "../_components/page-skeleton";

export default function ProductsLoading() {
  return (
    <PageSkeleton actions>
      <CardGridSkeleton count={4} className="md:grid-cols-2" />
    </PageSkeleton>
  );
}
