import Image from "next/image";
import Link from "next/link";
import { Film } from "lucide-react";
import { DashboardPageWrapper } from "../_components/dashboard-page-wrapper";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { getServerTranslations } from "@/lib/i18n/translation/server";
import { createMetadataDefaults } from "@/lib/metadata";
import { listProducts, listTalents } from "@/lib/ugc/queries";
import {
  WORK_STEPS,
  WORK_STEP_LABEL,
  workStateKey,
  workStepPosition,
} from "@/lib/ugc/work-steps";
import { listWorks } from "@/lib/ugc/works";
import { WorkComposer } from "./_components/work-composer";

export async function generateMetadata() {
  const { locale, t } = await getServerTranslations();
  return {
    ...createMetadataDefaults({ locale }),
    title: t("ugc_works_title"),
    description: t("ugc_works_description"),
  };
}

export default async function WorksPage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string }>;
}) {
  const { t, locale } = await getServerTranslations();
  const { product } = await searchParams;
  const [works, products, talents] = await Promise.all([
    listWorks(),
    listProducts(),
    listTalents(),
  ]);

  return (
    <DashboardPageWrapper
      title={<>{t("ugc_works_title")}</>}
      description={<>{t("ugc_works_description")}</>}
    >
      <WorkComposer
        products={products}
        talents={talents}
        initialProductId={product}
      />

      {works.length === 0 ? (
        <EmptyState
          icon={<Film />}
          title={t("ugc_works_empty_title")}
          description={t("ugc_works_empty_hint")}
        />
      ) : (
        <section className="space-y-3">
          <h2 className="text-sm font-medium">{t("ugc_works_recent")}</h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {works.map(({ work, productName, coverUrl }) => {
              const position = workStepPosition(work.step);
              return (
                <li key={work.id}>
                  <Link
                    href={`/dashboard/works/${work.id}`}
                    className="border-border hover:bg-accent/50 flex h-full gap-3 rounded-lg border p-3 transition-colors"
                  >
                    <div className="border-border bg-muted relative aspect-9/16 w-16 shrink-0 overflow-hidden rounded-md border">
                      {coverUrl && (
                        <Image
                          src={coverUrl}
                          alt=""
                          fill
                          sizes="64px"
                          className="object-cover"
                          unoptimized
                        />
                      )}
                    </div>
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <p className="truncate font-medium">{work.title}</p>
                      {productName && (
                        <p className="text-muted-foreground truncate text-sm">
                          {productName}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge
                          variant={
                            work.stepStatus === "failed"
                              ? "destructive"
                              : "secondary"
                          }
                          className="font-normal"
                        >
                          {t(WORK_STEP_LABEL[work.step])}
                        </Badge>
                        <span className="text-muted-foreground text-xs">
                          {t(workStateKey(work.step, work.stepStatus))}
                        </span>
                      </div>
                      <p className="text-muted-foreground text-xs tabular-nums">
                        {t("ugc_work_step_position", {
                          position: Math.min(position + 1, WORK_STEPS.length),
                          total: WORK_STEPS.length,
                        })}
                        {" · "}
                        {new Date(work.createdAt).toLocaleDateString(locale)}
                      </p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </DashboardPageWrapper>
  );
}
