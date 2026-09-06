"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { actionMessageKey } from "@/components/ugc/action-message";
import { useTranslation } from "@/lib/i18n/translation/client";
import { createWork } from "@/lib/ugc/work-actions";

/**
 * Starting a clip is one field and one button. Everything else — product,
 * talent, format — is asked for on the first step, where the answers can be
 * seen against the product the system just read.
 */
export function WorkComposer() {
  const { t } = useTranslation();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState("");

  const start = () =>
    startTransition(async () => {
      const result = await createWork(title.trim() || t("ugc_work_untitled"));
      if (!result.ok || !result.id) {
        toast.error(t(actionMessageKey(result.code)));
        return;
      }
      router.push(`/dashboard/works/${result.id}`);
    });

  return (
    <form
      className="border-border space-y-3 rounded-lg border p-4"
      onSubmit={(event) => {
        event.preventDefault();
        start();
      }}
    >
      <Label htmlFor="work-title">{t("ugc_work_composer_label")}</Label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id="work-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={t("ugc_work_composer_placeholder")}
          className="sm:h-10"
        />
        <Button type="submit" disabled={pending} className="sm:h-10">
          {pending ? (
            <Loader2
              className="animate-spin motion-reduce:animate-none"
              aria-hidden
            />
          ) : (
            <ArrowRight aria-hidden />
          )}
          {t("ugc_work_composer_start")}
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">
        {t("ugc_work_composer_hint")}
      </p>
    </form>
  );
}
