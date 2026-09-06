import { notFound } from "next/navigation";
import { DashboardPageWrapper } from "../../_components/dashboard-page-wrapper";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
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
  const { t } = await getServerTranslations();
  const detail = await getBatchDetail(batchId);
  if (!detail) notFound();

  const { progress, clips } = detail;
  const total = progress.total || progress.batch.plannedCount;
  const done = progress.ready + progress.failed;

  const tiles = [
    { key: "ugc_batch_planned", value: progress.batch.plannedCount },
    { key: "ugc_batch_ready", value: progress.ready },
    { key: "ugc_batch_running", value: progress.running + progress.pending },
    { key: "ugc_batch_failed", value: progress.failed },
    {
      key: "ugc_plan_estimated_credits",
      value: progress.batch.estimatedCredits,
    },
  ];

  return (
    <DashboardPageWrapper
      title={<>{progress.batch.name}</>}
      parentTitle={<>{t("ugc_nav_batches")}</>}
      parentUrl="/dashboard/batches"
      description={<>{t("ugc_batch_detail_description")}</>}
      actions={<StatusBadge kind="batch" status={progress.batch.status} />}
    >
      <Card>
        <CardHeader className="pb-2">
          <CardDescription>{t("ugc_batch_progress")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Progress value={total > 0 ? (done / total) * 100 : 0} />
          <dl className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {tiles.map((tile) => (
              <div key={tile.key}>
                <dt className="text-muted-foreground text-sm">{t(tile.key)}</dt>
                <dd className="text-xl font-semibold tabular-nums">
                  {tile.value}
                </dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <BatchConsole progress={progress} clips={clips} />
    </DashboardPageWrapper>
  );
}
