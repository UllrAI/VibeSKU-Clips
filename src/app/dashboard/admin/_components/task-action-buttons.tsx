"use client";

import { useState, useTransition } from "react";
import { Loader2, RotateCcw, Square } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  cancelAdminTaskAction,
  retryAdminTaskAction,
} from "@/lib/actions/admin/operations";
import { useTranslation } from "@/lib/i18n/translation/client";
import type { TaskRunStatus } from "@/lib/tasks/types";

export function TaskActionButtons({
  taskRunId,
  status,
  onChanged,
}: {
  taskRunId: string;
  status: TaskRunStatus;
  onChanged?: () => void;
}) {
  const { t } = useTranslation();
  const [dialog, setDialog] = useState<"cancel" | "retry" | null>(null);
  const [isPending, startTransition] = useTransition();
  const active = ["queued", "running", "waiting"].includes(status);
  const retryable = status === "failed" || status === "cancelled";

  if (!active && !retryable) return null;

  const runAction = () => {
    startTransition(async () => {
      const result =
        dialog === "cancel"
          ? await cancelAdminTaskAction({ taskRunId })
          : await retryAdminTaskAction({ taskRunId });
      if (result.data?.success) {
        toast.success(
          dialog === "cancel"
            ? t("admin_ops_task_cancelled_success")
            : t("admin_ops_task_retried_success"),
        );
        setDialog(null);
        onChanged?.();
      } else {
        toast.error(t("admin_ops_task_action_failed"));
      }
    });
  };

  return (
    <>
      <Button
        variant={active ? "destructive" : "outline"}
        size="sm"
        onClick={() => setDialog(active ? "cancel" : "retry")}
      >
        {active ? (
          <Square className="size-4" />
        ) : (
          <RotateCcw className="size-4" />
        )}
        {active ? t("admin_ops_task_cancel") : t("admin_ops_task_retry")}
      </Button>
      <Dialog
        open={dialog !== null}
        onOpenChange={(open) => !open && setDialog(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialog === "cancel"
                ? t("admin_ops_task_cancel_confirm_title")
                : t("admin_ops_task_retry_confirm_title")}
            </DialogTitle>
            <DialogDescription>
              {dialog === "cancel"
                ? t("admin_ops_task_cancel_confirm_hint")
                : t("admin_ops_task_retry_confirm_hint")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialog(null)}
              disabled={isPending}
            >
              {t("admin_cancel")}
            </Button>
            <Button
              variant={dialog === "cancel" ? "destructive" : "default"}
              onClick={runAction}
              disabled={isPending}
            >
              {isPending && <Loader2 className="size-4 animate-spin" />}
              {dialog === "cancel"
                ? t("admin_ops_task_cancel")
                : t("admin_ops_task_retry")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
