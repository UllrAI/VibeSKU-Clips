"use client";

import { useCallback, useEffect, type ReactNode } from "react";

import { AdminTableBase } from "@/components/admin/admin-table-base";
import { UserAvatarCell } from "@/components/admin/user-avatar-cell";
import { LocalizedLink } from "@/components/localized-link";
import { Badge } from "@/components/ui/badge";
import { useAdminTable } from "@/hooks/use-admin-table";
import { useIntlLocale } from "@/hooks/use-intl-locale";
import type { AdminTaskListItem } from "@/lib/admin/operations";
import { queryAdminTasks } from "@/lib/actions/admin/operation-queries";
import { useTranslation } from "@/lib/i18n/translation/client";
import type { TaskRunStatus } from "@/lib/tasks/types";

import { AdminTaskStateBadge } from "../../_components/operations-status";
import { TaskActionButtons } from "../../_components/task-action-buttons";

interface TaskManagementTableProps {
  initialData: AdminTaskListItem[];
  initialPagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

function taskDuration(item: AdminTaskListItem): number | null {
  if (!item.startedAt) return null;
  const end = item.completedAt ?? item.updatedAt;
  return Math.max(
    0,
    new Date(end).getTime() - new Date(item.startedAt).getTime(),
  );
}

export function TaskManagementTable({
  initialData,
  initialPagination,
}: TaskManagementTableProps) {
  const { t } = useTranslation();
  const intlLocale = useIntlLocale();
  const formatDuration = (durationMs: number | null) => {
    if (durationMs === null) return "—";
    if (durationMs < 60_000) {
      return t("admin_ops_duration_seconds", {
        seconds: Math.round(durationMs / 1000),
      });
    }
    return t("admin_ops_duration_minutes_seconds", {
      minutes: Math.floor(durationMs / 60_000),
      seconds: Math.round((durationMs % 60_000) / 1000),
    });
  };
  const queryTasks = useCallback(
    ({
      page,
      limit,
      search,
      filter,
    }: {
      page: number;
      limit: number;
      search?: string;
      filter?: string;
    }) =>
      queryAdminTasks({
        page,
        limit,
        search,
        status: filter as TaskRunStatus | "all" | "stalled",
      }),
    [],
  );
  const {
    data,
    loading,
    error,
    pagination,
    searchTerm,
    filter,
    setSearchTerm,
    setFilter,
    setCurrentPage,
    refresh,
  } = useAdminTable<AdminTaskListItem>({
    queryAction: queryTasks,
    initialData,
    initialPagination,
    initialFilter: "all",
  });

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const columns: Array<{
    key: string;
    label: ReactNode;
    render: (item: AdminTaskListItem) => ReactNode;
  }> = [
    {
      key: "task",
      label: <>{t("admin_ops_task")}</>,
      render: (item) => (
        <div className="min-w-52 space-y-1">
          <p className="font-medium" translate="no">
            {item.kind}
          </p>
          <p
            className="text-muted-foreground max-w-60 truncate font-mono text-xs"
            title={item.id}
            translate="no"
          >
            {item.id}
          </p>
        </div>
      ),
    },
    {
      key: "owner",
      label: <>{t("admin_ops_owner")}</>,
      render: (item) =>
        item.owner ? (
          <UserAvatarCell
            name={item.owner.name}
            email={item.owner.email}
            image={null}
          />
        ) : (
          <span className="text-muted-foreground text-sm">—</span>
        ),
    },
    {
      key: "subject",
      label: <>{t("admin_ops_subject")}</>,
      render: (item) =>
        item.work ? (
          <LocalizedLink
            href={`/dashboard/admin/works/${item.work.id}`}
            className="text-sm underline-offset-4 hover:underline"
          >
            {item.work.title}
          </LocalizedLink>
        ) : (
          <span
            className="text-muted-foreground block max-w-48 truncate font-mono text-xs"
            title={item.scopeKey}
            translate="no"
          >
            {item.scopeKey}
          </span>
        ),
    },
    {
      key: "status",
      label: <>{t("admin_ops_state")}</>,
      render: (item) => (
        <div className="space-y-1">
          <AdminTaskStateBadge status={item.status} stalled={item.stalled} />
          {item.progressStep && (
            <p
              className="text-muted-foreground font-mono text-xs"
              translate="no"
            >
              {item.progressStep}
            </p>
          )}
        </div>
      ),
    },
    {
      key: "error",
      label: <>{t("admin_ops_error")}</>,
      render: (item) =>
        item.errorCode ? (
          <div className="space-y-1">
            <Badge variant="destructive" translate="no">
              {item.errorCode}
            </Badge>
            {item.attempt !== null && (
              <p className="text-muted-foreground text-xs tabular-nums">
                {t("admin_ops_attempt", { attempt: item.attempt })}
              </p>
            )}
          </div>
        ) : (
          <span className="text-muted-foreground text-sm">—</span>
        ),
    },
    {
      key: "timing",
      label: <>{t("admin_ops_timing")}</>,
      render: (item) => (
        <div className="space-y-1 text-sm tabular-nums">
          <time dateTime={new Date(item.createdAt).toISOString()}>
            {new Date(item.createdAt).toLocaleString(intlLocale, {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </time>
          <p className="text-muted-foreground text-xs">
            {formatDuration(taskDuration(item))}
          </p>
        </div>
      ),
    },
    {
      key: "actions",
      label: <>{t("admin_actions")}</>,
      render: (item) => (
        <TaskActionButtons
          taskRunId={item.id}
          status={item.status}
          onChanged={refresh}
        />
      ),
    },
  ];

  const filters = [
    { value: "all", label: <>{t("admin_ops_filter_all")}</> },
    { value: "stalled", label: <>{t("admin_ops_task_stalled")}</> },
    { value: "queued", label: <>{t("admin_ops_task_queued")}</> },
    { value: "running", label: <>{t("admin_ops_task_running")}</> },
    { value: "waiting", label: <>{t("admin_ops_task_waiting")}</> },
    { value: "failed", label: <>{t("admin_ops_task_failed")}</> },
    { value: "completed", label: <>{t("admin_ops_task_completed")}</> },
    { value: "cancelled", label: <>{t("admin_ops_task_cancelled")}</> },
  ];

  return (
    <AdminTableBase
      columns={columns}
      data={data}
      loading={loading}
      error={error}
      searchTerm={searchTerm}
      onSearchChange={setSearchTerm}
      filterValue={filter}
      onFilterChange={setFilter}
      filterOptions={filters}
      filterMode="tabs"
      filterPlaceholder={<>{t("admin_ops_filter_task_state")}</>}
      pagination={pagination}
      onPageChange={setCurrentPage}
      searchPlaceholder={<>{t("admin_ops_search_tasks")}</>}
      emptyMessage={<>{t("admin_ops_no_tasks")}</>}
    />
  );
}
