import {
  CardGridSkeleton,
  PageSkeleton,
} from "../../_components/page-skeleton";

export default function ReferenceDetailLoading() {
  return (
    <PageSkeleton>
      <CardGridSkeleton
        count={2}
        aspect="aspect-[9/16]"
        className="lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]"
      />
    </PageSkeleton>
  );
}
