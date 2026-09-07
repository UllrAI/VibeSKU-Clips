"use client";

import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/lib/i18n/translation/client";
import type { AdminWorkState } from "@/lib/admin/operations-state";
import type { TaskRunStatus } from "@/lib/tasks/types";

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

const WORK_STATES: Record<
  AdminWorkState,
  { key: string; variant: BadgeVariant }
> = {
  active: { key: "admin_ops_work_active", variant: "secondary" },
  attention: { key: "admin_ops_work_attention", variant: "outline" },
  completed: { key: "admin_ops_work_completed", variant: "default" },
  failed: { key: "admin_ops_work_failed", variant: "destructive" },
};

const TASK_STATES: Record<
  TaskRunStatus,
  { key: string; variant: BadgeVariant }
> = {
  queued: { key: "admin_ops_task_queued", variant: "outline" },
  running: { key: "admin_ops_task_running", variant: "secondary" },
  waiting: { key: "admin_ops_task_waiting", variant: "secondary" },
  completed: { key: "admin_ops_task_completed", variant: "default" },
  failed: { key: "admin_ops_task_failed", variant: "destructive" },
  cancelled: { key: "admin_ops_task_cancelled", variant: "outline" },
};

export function AdminWorkStateBadge({ state }: { state: AdminWorkState }) {
  const { t } = useTranslation();
  const item = WORK_STATES[state];
  return <Badge variant={item.variant}>{t(item.key)}</Badge>;
}

export function AdminTaskStateBadge({
  status,
  stalled = false,
}: {
  status: TaskRunStatus;
  stalled?: boolean;
}) {
  const { t } = useTranslation();
  if (stalled) {
    return <Badge variant="destructive">{t("admin_ops_task_stalled")}</Badge>;
  }
  const item = TASK_STATES[status];
  return <Badge variant={item.variant}>{t(item.key)}</Badge>;
}
