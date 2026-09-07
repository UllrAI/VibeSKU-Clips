"use client";

import { useCallback, useEffect } from "react";
import { ExternalLink } from "lucide-react";

import {
  AdminTableBase,
  type AdminTableColumn,
} from "@/components/admin/admin-table-base";
import { UserAvatarCell } from "@/components/admin/user-avatar-cell";
import { LocalizedLink } from "@/components/localized-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAdminTable } from "@/hooks/use-admin-table";
import { useIntlLocale } from "@/hooks/use-intl-locale";
import {
  type AdminWorkListItem,
  type AdminWorkState,
} from "@/lib/admin/operations";
import { queryAdminWorks } from "@/lib/actions/admin/operation-queries";
import { useTranslation } from "@/lib/i18n/translation/client";

import {
  AdminTaskStateBadge,
  AdminWorkStateBadge,
} from "../../_components/operations-status";

interface WorkManagementTableProps {
  initialData: AdminWorkListItem[];
  initialPagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export function WorkManagementTable({
  initialData,
  initialPagination,
}: WorkManagementTableProps) {
  const { t } = useTranslation();
  const intlLocale = useIntlLocale();
  const queryWorks = useCallback(
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
      queryAdminWorks({
        page,
        limit,
        search,
        state: filter as AdminWorkState | "all",
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
  } = useAdminTable<AdminWorkListItem>({
    queryAction: queryWorks,
    initialData,
    initialPagination,
    initialFilter: "all",
  });

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const columns: AdminTableColumn<AdminWorkListItem>[] = [
    {
      key: "work",
      label: <>{t("admin_ops_work")}</>,
      headerClassName: "w-[26%]",
      render: (item) => (
        <div className="min-w-0 space-y-1">
          <LocalizedLink
            href={`/dashboard/admin/works/${item.id}`}
            title={item.title}
            className="block truncate font-medium underline-offset-4 hover:underline"
          >
            {item.title}
          </LocalizedLink>
          <p className="text-muted-foreground truncate text-xs">
            {item.productName ?? t("admin_ops_no_product")}
          </p>
        </div>
      ),
    },
    {
      key: "owner",
      label: <>{t("admin_ops_owner")}</>,
      headerClassName: "w-[23%]",
      render: (item) => (
        <UserAvatarCell
          name={item.owner.name}
          email={item.owner.email}
          image={null}
          className="min-w-0"
        />
      ),
    },
    {
      key: "state",
      label: <>{t("admin_ops_state")}</>,
      headerClassName: "w-[11%]",
      render: (item) => (
        <div className="space-y-1">
          {item.taskStalled && item.taskStatus ? (
            <AdminTaskStateBadge status={item.taskStatus} stalled />
          ) : (
            <AdminWorkStateBadge state={item.state} />
          )}
          {item.step !== "done" && (
            <p className="text-muted-foreground text-xs">
              {t(`ugc_work_step_${item.step}`)}
            </p>
          )}
        </div>
      ),
    },
    {
      key: "settings",
      label: <>{t("admin_ops_generation_settings")}</>,
      headerClassName: "w-[15%]",
      render: (item) => (
        <div className="space-y-1 text-sm">
          <span translate="no">{item.videoModel}</span>
          <div className="flex gap-1">
            <Badge variant="outline" translate="no">
              {item.aspectRatio}
            </Badge>
            <Badge variant="outline" translate="no">
              {item.resolution}
            </Badge>
          </div>
        </div>
      ),
    },
    {
      key: "updatedAt",
      label: <>{t("admin_ops_updated")}</>,
      align: "right" as const,
      headerClassName: "w-[17%]",
      render: (item) => (
        <time
          className="text-muted-foreground text-sm tabular-nums"
          dateTime={new Date(item.updatedAt).toISOString()}
        >
          {new Date(item.updatedAt).toLocaleString(intlLocale, {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </time>
      ),
    },
    {
      key: "actions",
      label: <>{t("admin_actions")}</>,
      align: "right" as const,
      sticky: "right" as const,
      headerClassName: "w-[8%]",
      render: (item) => (
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" asChild>
            <LocalizedLink href={`/dashboard/admin/works/${item.id}`}>
              <ExternalLink className="size-4" />
              {t("admin_ops_inspect")}
            </LocalizedLink>
          </Button>
        </div>
      ),
    },
  ];

  const filters = [
    { value: "all", label: t("admin_ops_filter_all") },
    { value: "active", label: t("admin_ops_work_active") },
    { value: "attention", label: t("admin_ops_work_attention") },
    { value: "completed", label: t("admin_ops_work_completed") },
    { value: "failed", label: t("admin_ops_work_failed") },
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
      filterPlaceholder={<>{t("admin_ops_filter_work_state")}</>}
      pagination={pagination}
      onPageChange={setCurrentPage}
      tableClassName="min-w-[960px] table-fixed"
      searchPlaceholder={<>{t("admin_ops_search_works")}</>}
      emptyMessage={<>{t("admin_ops_no_works")}</>}
    />
  );
}
