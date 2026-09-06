import {
  CardGridSkeleton,
  PageSkeleton,
} from "../../_components/page-skeleton";

export default function ProductDetailLoading() {
  return (
    <PageSkeleton>
      <CardGridSkeleton count={2} className="lg:grid-cols-2" />
    </PageSkeleton>
  );
}
