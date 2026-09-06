import { notFound } from "next/navigation";
import { DashboardPageWrapper } from "../../_components/dashboard-page-wrapper";
import { StatusBadge } from "@/components/ugc/status-badge";
import { getServerTranslations } from "@/lib/i18n/translation/server";
import { createMetadataDefaults } from "@/lib/metadata";
import { getBatchDetail } from "@/lib/ugc/queries";
import { BatchConsole } from "./_components/batch-console";

export async function generateMetadata() {
  const { locale, t } = await getServerTranslations();
  return {
    ...createMetadataDefaults({ locale }),
    title: t("ugc_batch_detail_title"),
    description: t("ugc_batches_description"),
  };
}

export default async function BatchDetailPage({
  params,
}: {
  params: Promise<{ batchId: string }>;
}) {
  const { batchId } = await params;
  const { t, locale } = await getServerTranslations();
  const detail = await getBatchDetail(batchId);
  if (!detail) notFound();

  const { progress, clips } = detail;
  const meta = [
    `${t("ugc_batch_planned")} ${progress.batch.plannedCount.toLocaleString(locale)}`,
    `${t("ugc_plan_estimated_credits")} ${progress.batch.estimatedCredits.toLocaleString(locale)}`,
  ].join(" · ");

  return (
    <DashboardPageWrapper
      title={<>{progress.batch.name}</>}
      parentTitle={<>{t("ugc_nav_batches")}</>}
      parentUrl="/dashboard/batches"
      description={
        <>
          {t("ugc_batch_detail_description")}
          <span className="text-muted-foreground/80 block tabular-nums">
            {meta}
          </span>
        </>
      }
      actions={<StatusBadge kind="batch" status={progress.batch.status} />}
    >
      <BatchConsole progress={progress} clips={clips} />
    </DashboardPageWrapper>
  );
}
