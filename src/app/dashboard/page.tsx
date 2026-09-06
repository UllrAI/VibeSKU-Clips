import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Clapperboard,
  Film,
  FolderDown,
  ListChecks,
  SquarePlay,
} from "lucide-react";
import { DashboardPageWrapper } from "./_components/dashboard-page-wrapper";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Progress } from "@/components/ui/progress";
import { StatusBadge } from "@/components/ugc/status-badge";
import { getServerTranslations } from "@/lib/i18n/translation/server";
import { createMetadataDefaults } from "@/lib/metadata";
import { listBatches, getProductionSummary } from "@/lib/ugc/queries";

export async function generateMetadata() {
  const { locale, t } = await getServerTranslations();
  const metadata = createMetadataDefaults({ locale });
  return {
    ...metadata,
    title: t("ugc_overview_title"),
    description: t("ugc_overview_description"),
  };
}

export default async function DashboardOverviewPage() {
  const { t, locale } = await getServerTranslations();
  const [summary, batches] = await Promise.all([
    getProductionSummary(),
    listBatches(),
  ]);

  const tiles = [
    { key: "ugc_overview_ready_clips", value: summary.readyClips },
    { key: "ugc_overview_awaiting_review", value: summary.awaitingReview },
    { key: "ugc_overview_selected", value: summary.selectedClips },
    { key: "ugc_overview_credits", value: summary.creditsSpent },
  ];

  const attention = [
    summary.productsNeedingInput > 0
      ? {
          id: "products",
          href: "/dashboard/products",
          text: t("ugc_overview_products_need_input", {
            count: summary.productsNeedingInput,
          }),
        }
      : null,
    summary.failedClips > 0
      ? {
          id: "clips",
          href: "/dashboard/batches",
          text: t("ugc_overview_clips_failed", {
            count: summary.failedClips,
          }),
        }
      : null,
  ].filter((item): item is NonNullable<typeof item> => item !== null);

  const activeBatches = batches.slice(0, 5);

  return (
    <DashboardPageWrapper
      title={<>{t("ugc_overview_title")}</>}
      description={<>{t("ugc_overview_description")}</>}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild>
          <Link href="/dashboard/works">
            <Film />
            {t("ugc_overview_start_work")}
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/dashboard/batches/new">
            <Clapperboard />
            {t("ugc_nav_new_batch")}
          </Link>
        </Button>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((tile) => (
          <Card key={tile.key}>
            <CardHeader className="pb-2">
              <CardDescription>{t(tile.key)}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tabular-nums">
                {tile.value.toLocaleString(locale)}
              </p>
            </CardContent>
          </Card>
        ))}
      </section>

      {attention.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="text-primary size-4" />
              {t("ugc_overview_needs_attention")}
            </CardTitle>
            <CardDescription>
              {t("ugc_overview_needs_attention_hint")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {attention.map((item) => (
              <div
                key={item.id}
                className="border-border flex items-center justify-between gap-4 rounded-md border px-4 py-3 text-sm"
              >
                <span>{item.text}</span>
                <Button asChild variant="outline" size="sm">
                  <Link href={item.href}>
                    {t("ugc_common_open")}
                    <ArrowRight />
                  </Link>
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ListChecks className="text-primary size-4" />
            {t("ugc_overview_recent_batches")}
          </CardTitle>
          <CardDescription>
            {t("ugc_overview_recent_batches_hint")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {activeBatches.length === 0 ? (
            <EmptyState
              spacing="compact"
              icon={<Clapperboard />}
              title={t("ugc_overview_empty_title")}
              description={t("ugc_overview_empty_hint")}
              action={
                <Button asChild size="sm">
                  <Link href="/dashboard/batches/new">
                    {t("ugc_nav_new_batch")}
                  </Link>
                </Button>
              }
            />
          ) : (
            activeBatches.map((entry) => {
              const done = entry.ready + entry.failed;
              const total = entry.total || entry.batch.plannedCount;
              return (
                <Link
                  key={entry.batch.id}
                  href={`/dashboard/batches/${entry.batch.id}`}
                  className="border-border hover:bg-accent/50 block rounded-md border px-4 py-3 transition-colors"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{entry.batch.name}</span>
                    <StatusBadge kind="batch" status={entry.batch.status} />
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
              );
            })
          )}
        </CardContent>
      </Card>

      <section className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <SquarePlay className="text-primary size-4" />
              {t("ugc_nav_review")}
            </CardTitle>
            <CardDescription>{t("ugc_review_description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/review">
                {t("ugc_common_open")}
                <ArrowRight />
              </Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FolderDown className="text-primary size-4" />
              {t("ugc_nav_exports")}
            </CardTitle>
            <CardDescription>{t("ugc_exports_description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/exports">
                {t("ugc_common_open")}
                <ArrowRight />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </section>
    </DashboardPageWrapper>
  );
}
