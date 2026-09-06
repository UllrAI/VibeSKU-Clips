"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, Film, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useIntlLocale } from "@/hooks/use-intl-locale";
import { useTranslation } from "@/lib/i18n/translation/client";
import {
  WORK_STEP_LABEL,
  workStateKey,
  workStepsFor,
  workStepPosition,
} from "@/lib/ugc/work-steps";
import type { WorkSummary } from "@/lib/ugc/works";
import { cn } from "@/lib/utils";

type WorkFilter = "all" | "running" | "waiting" | "completed" | "failed";

const FILTERS: readonly { id: WorkFilter; labelKey: string }[] = [
  { id: "all", labelKey: "ugc_works_filter_all" },
  { id: "running", labelKey: "ugc_work_state_running" },
  { id: "waiting", labelKey: "ugc_work_state_review" },
  { id: "completed", labelKey: "ugc_work_state_done" },
  { id: "failed", labelKey: "ugc_work_state_failed" },
];

function statusOf(summary: WorkSummary): Exclude<WorkFilter, "all"> {
  if (summary.failed) return "failed";
  if (summary.work.step === "done") return "completed";
  if (summary.work.stepStatus === "running") return "running";
  return "waiting";
}

function downloadUrl(url: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}download=1`;
}

export function WorkList({ works }: { works: WorkSummary[] }) {
  const { t } = useTranslation();
  const locale = useIntlLocale();
  const router = useRouter();
  const [filter, setFilter] = useState<WorkFilter>("all");

  useEffect(() => {
    if (!works.some((work) => statusOf(work) === "running")) return;
    const timer = window.setInterval(() => router.refresh(), 5000);
    return () => window.clearInterval(timer);
  }, [router, works]);

  const visible = works.filter(
    (work) => filter === "all" || statusOf(work) === filter,
  );
  const countFor = (candidate: WorkFilter) =>
    candidate === "all"
      ? works.length
      : works.filter((work) => statusOf(work) === candidate).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={filter}
          onValueChange={(value) => setFilter(value as WorkFilter)}
        >
          <TabsList
            variant="line"
            aria-label={t("ugc_works_filter_status")}
            className="flex-wrap"
          >
            {FILTERS.map((entry) => (
              <TabsTrigger key={entry.id} value={entry.id}>
                {t(entry.labelKey)}
                <span className="text-muted-foreground tabular-nums">
                  {countFor(entry.id)}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <Button asChild>
          <Link href="/dashboard/works/new">
            <Plus />
            {t("ugc_work_new_title")}
          </Link>
        </Button>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          spacing="compact"
          icon={<Film />}
          title={t("ugc_works_empty_title")}
          description={t("ugc_works_empty_hint")}
        />
      ) : (
        <ul className="space-y-3">
          {visible.map((summary) => {
            const { work } = summary;
            const status = statusOf(summary);
            const steps = workStepsFor(work.videoMode);
            const position = workStepPosition(work.step, work.videoMode);
            const playable = status === "completed" && summary.videoUrl;

            return (
              <li key={work.id}>
                <Card>
                  <CardContent className="flex gap-4 pt-6">
                    <div
                      className={cn(
                        "border-border bg-muted relative shrink-0 overflow-hidden rounded-md border",
                        work.aspectRatio === "9:16"
                          ? "aspect-9/16 w-24 sm:w-32"
                          : "aspect-video w-40 sm:w-56",
                      )}
                    >
                      {playable ? (
                        <video
                          className="size-full object-cover"
                          src={summary.videoUrl ?? undefined}
                          poster={summary.coverUrl ?? undefined}
                          controls
                          preload="none"
                        />
                      ) : summary.coverUrl ? (
                        <Image
                          src={summary.coverUrl}
                          alt=""
                          fill
                          sizes="(min-width: 640px) 128px, 96px"
                          className="object-cover"
                          unoptimized
                        />
                      ) : (
                        <div className="text-muted-foreground flex size-full items-center justify-center">
                          <Film className="size-6" aria-hidden />
                        </div>
                      )}
                    </div>

                    <div className="flex min-w-0 flex-1 flex-col justify-between gap-4">
                      <div className="space-y-1.5">
                        <div className="flex items-start justify-between gap-3">
                          <p className="min-w-0 truncate font-medium">
                            {work.title}
                          </p>
                          <Badge
                            variant={
                              status === "failed"
                                ? "destructive"
                                : status === "completed"
                                  ? "default"
                                  : "secondary"
                            }
                            className="shrink-0 font-normal"
                          >
                            {t(
                              status === "completed"
                                ? "ugc_work_state_done"
                                : status === "failed"
                                  ? "ugc_work_state_failed"
                                  : status === "running"
                                    ? "ugc_work_state_running"
                                    : "ugc_work_state_review",
                            )}
                          </Badge>
                        </div>
                        {summary.productName && (
                          <p className="text-muted-foreground truncate text-sm">
                            {summary.productName}
                          </p>
                        )}
                        <p className="text-muted-foreground text-sm">
                          {t(WORK_STEP_LABEL[work.step])}
                          {" · "}
                          {t(
                            workStateKey(
                              work.step,
                              summary.failed ? "failed" : work.stepStatus,
                            ),
                          )}
                        </p>
                        <p className="text-muted-foreground text-xs tabular-nums">
                          {t("ugc_work_step_position", {
                            position: Math.min(position + 1, steps.length),
                            total: steps.length,
                          })}
                          {" · "}
                          {new Date(work.updatedAt).toLocaleDateString(locale)}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <Button asChild size="sm">
                          <Link href={`/dashboard/works/${work.id}`}>
                            {t(
                              status === "waiting"
                                ? "ugc_works_continue"
                                : "ugc_works_open",
                            )}
                          </Link>
                        </Button>
                        {summary.videoUrl && (
                          <Button asChild size="sm" variant="outline">
                            <a href={downloadUrl(summary.videoUrl)} download>
                              <Download />
                              {t("ugc_works_download")}
                            </a>
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
