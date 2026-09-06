import Link from "next/link";
import { Clapperboard, TriangleAlert } from "lucide-react";
import { DashboardPageWrapper } from "../_components/dashboard-page-wrapper";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Progress } from "@/components/ui/progress";
import { StatusBadge } from "@/components/ugc/status-badge";
import { getServerTranslations } from "@/lib/i18n/translation/server";
import { createMetadataDefaults } from "@/lib/metadata";
import { listBatches } from "@/lib/ugc/queries";

export async function generateMetadata() {
  const { locale, t } = await getServerTranslations();
  return {
    ...createMetadataDefaults({ locale }),
    title: t("ugc_batches_title"),
    description: t("ugc_batches_description"),
  };
}

export default async function BatchesPage() {
  const { t, locale } = await getServerTranslations();
  const batches = await listBatches();

  return (
    <DashboardPageWrapper
      title={<>{t("ugc_batches_title")}</>}
      description={<>{t("ugc_batches_description")}</>}
      actions={
        <Button asChild size="sm">
          <Link href="/dashboard/batches/new">
            <Clapperboard />
            {t("ugc_nav_new_batch")}
          </Link>
        </Button>
      }
    >
      {batches.length === 0 ? (
        <EmptyState
          icon={<Clapperboard />}
          title={t("ugc_batches_empty_title")}
          description={t("ugc_batches_empty_hint")}
          action={
            <Button asChild size="sm">
              <Link href="/dashboard/batches/new">
                {t("ugc_nav_new_batch")}
              </Link>
            </Button>
          }
        />
      ) : (
        <ul className="space-y-3">
          {batches.map((entry) => {
            const total = entry.total || entry.batch.plannedCount;
            const done = entry.ready + entry.failed;
            return (
              <li key={entry.batch.id}>
                <Link
                  href={`/dashboard/batches/${entry.batch.id}`}
                  className="border-border hover:bg-accent/50 block rounded-lg border px-4 py-4 transition-colors"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="space-y-1">
                      <p className="font-medium">{entry.batch.name}</p>
                      <p className="text-muted-foreground text-sm">
                        {new Date(entry.batch.createdAt).toLocaleString(locale)}
                        {entry.batch.accountTag
                          ? ` · ${entry.batch.accountTag}`
                          : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {entry.stalled && (
                        <span className="text-destructive flex items-center gap-1 text-xs">
                          <TriangleAlert className="size-3.5" aria-hidden />
                          {t("ugc_batch_stalled_badge")}
                        </span>
                      )}
                      <StatusBadge kind="batch" status={entry.batch.status} />
                    </div>
                  </div>
                  <Progress
                    className="mt-3"
                    value={total > 0 ? (done / total) * 100 : 0}
                  />
                  <p className="text-muted-foreground mt-2 text-sm tabular-nums">
                    {t("ugc_batch_progress_summary", {
                      ready: entry.ready,
                      total,
                      failed: entry.failed,
                    })}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </DashboardPageWrapper>
  );
}
