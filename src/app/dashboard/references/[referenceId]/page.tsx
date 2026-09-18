import { notFound } from "next/navigation";
import { z } from "zod";
import { DashboardPageWrapper } from "../../_components/dashboard-page-wrapper";
import { getServerTranslations } from "@/lib/i18n/translation/server";
import { createMetadataDefaults } from "@/lib/metadata";
import { getReference, getReferenceState } from "@/lib/ugc/queries";
import { BlueprintReview } from "./_components/blueprint-review";

export async function generateMetadata() {
  const { locale, t } = await getServerTranslations();
  return {
    ...createMetadataDefaults({ locale }),
    title: t("ugc_references_title"),
    description: t("ugc_reference_detail_description"),
  };
}

export default async function ReferenceDetailPage({
  params,
}: {
  params: Promise<{ referenceId: string }>;
}) {
  const { referenceId } = await params;
  if (!z.uuid().safeParse(referenceId).success) notFound();

  const { t } = await getServerTranslations();
  const [reference, state] = await Promise.all([
    getReference(referenceId),
    getReferenceState(referenceId),
  ]);
  if (!reference || !state) notFound();

  return (
    <DashboardPageWrapper
      title={<>{reference.title}</>}
      parentTitle={<>{t("ugc_references_title")}</>}
      parentUrl="/dashboard/references"
      description={<>{t("ugc_reference_detail_description")}</>}
    >
      <BlueprintReview reference={reference} initialState={state} />
    </DashboardPageWrapper>
  );
}
