import { CardGridSkeleton, PageSkeleton } from "../_components/page-skeleton";

export default function ScriptsLoading() {
  return (
    <PageSkeleton>
      <CardGridSkeleton count={4} className="lg:grid-cols-2" />
    </PageSkeleton>
  );
}
