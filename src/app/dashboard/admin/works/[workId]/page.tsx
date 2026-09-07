import { notFound } from "next/navigation";
import {
  ExternalLink,
  Film,
  ListChecks,
  Package,
  UserRound,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ugc/status-badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getAdminWorkDetail } from "@/lib/admin/operations";
import { requireAdmin } from "@/lib/auth/permissions";
import { getRequestLocale } from "@/lib/i18n/server-locale";
import { getServerTranslations } from "@/lib/i18n/translation/server";
import { resolveIntlLocale } from "@/lib/locale";
import { createMetadataDefaults } from "@/lib/metadata";

import { DashboardPageWrapper } from "../../../_components/dashboard-page-wrapper";
import {
  AdminTaskStateBadge,
  AdminWorkStateBadge,
} from "../../_components/operations-status";
import { TaskActionButtons } from "../../_components/task-action-buttons";

export async function generateMetadata() {
  const { locale, t } = await getServerTranslations();
  return {
    ...createMetadataDefaults({ locale }),
    title: t("admin_ops_work_detail_title"),
    description: t("admin_ops_work_detail_description"),
  };
}

export default async function AdminWorkDetailPage({
  params,
}: PageProps<"/dashboard/admin/works/[workId]">) {
  const { workId } = await params;
  const { t } = await getServerTranslations();
  await requireAdmin();
  const [detail, locale] = await Promise.all([
    getAdminWorkDetail(workId),
    getRequestLocale(),
  ]);
  if (!detail) notFound();
  const intlLocale = resolveIntlLocale(locale);
  const formatDate = (value: Date | null) =>
    value
      ? value.toLocaleString(intlLocale, {
          dateStyle: "medium",
          timeStyle: "short",
        })
      : "—";
  const currentRun = detail.runs.find(
    (run) => run.id === detail.work.taskRunId,
  );

  return (
    <DashboardPageWrapper
      title={detail.work.title}
      parentTitle={<>{t("admin_ops_works_title")}</>}
      parentUrl="/dashboard/admin/works"
      description={<>{t("admin_ops_work_detail_description")}</>}
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium">
              {t("admin_ops_state")}
            </CardTitle>
            <ListChecks className="text-muted-foreground size-4" />
          </CardHeader>
          <CardContent className="space-y-2">
            <AdminWorkStateBadge state={detail.state} />
            <p className="text-muted-foreground text-sm">
              {t(`ugc_work_step_${detail.work.step}`)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium">
              {t("admin_ops_owner")}
            </CardTitle>
            <UserRound className="text-muted-foreground size-4" />
          </CardHeader>
          <CardContent>
            <p className="font-medium">
              {detail.owner.name ?? detail.owner.email}
            </p>
            <p className="text-muted-foreground text-sm">
              {detail.owner.email}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium">
              {t("admin_ops_product_and_talent")}
            </CardTitle>
            <Package className="text-muted-foreground size-4" />
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>{detail.product?.name ?? t("admin_ops_no_product")}</p>
            <p className="text-muted-foreground">
              {detail.talent?.name ?? t("ugc_work_no_talent")}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium">
              {t("admin_ops_generation_settings")}
            </CardTitle>
            <Film className="text-muted-foreground size-4" />
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p translate="no">{detail.work.videoModel}</p>
            <div className="flex gap-1">
              <Badge variant="outline" translate="no">
                {detail.work.aspectRatio}
              </Badge>
              <Badge variant="outline" translate="no">
                {detail.work.resolution}
              </Badge>
              <Badge variant="outline">
                {t(`ugc_video_mode_${detail.work.videoMode}`)}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {detail.clip?.videoUrl && (
        <Card>
          <CardHeader>
            <CardTitle>{t("admin_ops_current_video")}</CardTitle>
            <CardDescription translate="no">
              {detail.clip.reference}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
            <video
              src={detail.clip.videoUrl}
              controls
              preload="metadata"
              className="bg-muted aspect-video w-full rounded-lg border object-contain"
            />
            <div className="space-y-3 text-sm">
              <p>
                {t("admin_ops_created")}: {formatDate(detail.clip.createdAt)}
              </p>
              <p>
                {t("admin_ops_quality")}:{" "}
                {detail.clip.quality?.passed
                  ? t("ugc_work_quality_passed")
                  : t("ugc_work_quality_flagged")}
              </p>
              <Button variant="outline" asChild>
                <a href={detail.clip.videoUrl} download>
                  <ExternalLink className="size-4" />
                  {t("ugc_works_download")}
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>{t("admin_ops_task_history")}</CardTitle>
              <CardDescription>
                {t("admin_ops_task_history_hint")}
              </CardDescription>
            </div>
            {currentRun && (
              <TaskActionButtons
                taskRunId={currentRun.id}
                status={currentRun.status}
              />
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("admin_ops_task")}</TableHead>
                  <TableHead>{t("admin_ops_state")}</TableHead>
                  <TableHead>{t("admin_ops_progress")}</TableHead>
                  <TableHead>{t("admin_ops_error")}</TableHead>
                  <TableHead>{t("admin_ops_started")}</TableHead>
                  <TableHead>{t("admin_ops_finished")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.runs.length ? (
                  detail.runs.map((run) => (
                    <TableRow key={run.id}>
                      <TableCell>
                        <p className="font-medium" translate="no">
                          {run.kind}
                        </p>
                        <p
                          className="text-muted-foreground font-mono text-xs"
                          translate="no"
                        >
                          {run.id.slice(0, 8)}
                        </p>
                      </TableCell>
                      <TableCell>
                        <AdminTaskStateBadge
                          status={run.status}
                          stalled={run.stalled}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs" translate="no">
                        {run.progressStep ?? "—"}
                      </TableCell>
                      <TableCell>
                        {run.errorCode ? (
                          <Badge variant="destructive" translate="no">
                            {run.errorCode}
                          </Badge>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-sm tabular-nums">
                        {formatDate(run.startedAt)}
                      </TableCell>
                      <TableCell className="text-sm tabular-nums">
                        {formatDate(run.completedAt)}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center">
                      {t("admin_ops_no_tasks")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("admin_ops_versions")}</CardTitle>
          <CardDescription>{t("admin_ops_versions_hint")}</CardDescription>
        </CardHeader>
        <CardContent>
          {detail.versions.length ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {detail.versions.map((version) => (
                <div
                  key={version.id}
                  className="space-y-2 rounded-lg border p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">
                      {t("ugc_work_version_label", {
                        version: version.version,
                      })}
                    </p>
                    <StatusBadge kind="clip" status={version.status} />
                  </div>
                  <p
                    className="text-muted-foreground font-mono text-xs"
                    translate="no"
                  >
                    {version.reference}
                  </p>
                  <p className="text-muted-foreground text-xs tabular-nums">
                    {formatDate(version.createdAt)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              {t("admin_ops_no_versions")}
            </p>
          )}
        </CardContent>
      </Card>
    </DashboardPageWrapper>
  );
}
