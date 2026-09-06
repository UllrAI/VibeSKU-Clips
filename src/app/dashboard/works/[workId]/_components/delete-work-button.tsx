"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { actionMessageKey } from "@/components/ugc/action-message";
import { useTranslation } from "@/lib/i18n/translation/client";
import { deleteWork } from "@/lib/ugc/work-actions";

export function DeleteWorkButton({ workId }: { workId: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await deleteWork(workId);
          if (!result.ok) {
            toast.error(t(actionMessageKey(result.code)));
            return;
          }
          toast.success(t("ugc_work_deleted"));
          router.push("/dashboard/works");
        })
      }
    >
      <Trash2 />
      {t("ugc_common_delete")}
    </Button>
  );
}
