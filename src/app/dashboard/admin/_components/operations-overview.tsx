"use client";

import { AlertTriangle, CheckCircle2, Film, ListTodo } from "lucide-react";

import { LocalizedLink } from "@/components/localized-link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AdminOperationsStats } from "@/lib/admin/operations";
import { useTranslation } from "@/lib/i18n/translation/client";

export function OperationsOverview({
  stats,
  locale,
}: {
  stats: AdminOperationsStats;
  locale: string;
}) {
  const { t } = useTranslation();
  const format = (value: number) => value.toLocaleString(locale);

  return (
    <section aria-labelledby="operations-overview-title" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="operations-overview-title" className="text-xl font-semibold">
            {t("admin_ops_overview_title")}
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            {t("admin_ops_overview_hint")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <LocalizedLink href="/dashboard/admin/works">
              <Film className="size-4" />
              {t("admin_ops_open_works")}
            </LocalizedLink>
          </Button>
          <Button asChild>
            <LocalizedLink href="/dashboard/admin/tasks">
              <ListTodo className="size-4" />
              {t("admin_ops_open_tasks")}
            </LocalizedLink>
          </Button>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium">
              {t("admin_ops_total_works")}
            </CardTitle>
            <Film className="text-muted-foreground size-4" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">
              {format(stats.works.total)}
            </p>
            <p className="text-muted-foreground text-xs">
              {t("admin_ops_active_count", {
                count: format(stats.works.active),
              })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium">
              {t("admin_ops_needs_attention")}
            </CardTitle>
            <AlertTriangle className="text-muted-foreground size-4" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">
              {format(stats.works.attention + stats.works.failed)}
            </p>
            <p className="text-muted-foreground text-xs">
              {t("admin_ops_failed_works_count", {
                count: format(stats.works.failed),
              })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium">
              {t("admin_ops_active_tasks")}
            </CardTitle>
            <ListTodo className="text-muted-foreground size-4" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">
              {format(
                stats.tasks.queued + stats.tasks.running + stats.tasks.waiting,
              )}
            </p>
            <p className="text-muted-foreground text-xs">
              {t("admin_ops_stalled_count", {
                count: format(stats.tasks.stalled),
              })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium">
              {t("admin_ops_completed_works")}
            </CardTitle>
            <CheckCircle2 className="text-muted-foreground size-4" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">
              {format(stats.works.completed)}
            </p>
            <p className="text-muted-foreground text-xs">
              {t("admin_ops_failed_tasks_24h", {
                count: format(stats.tasks.failedLast24Hours),
              })}
            </p>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
