"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Package, Trash2 } from "lucide-react";
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
import { actionMessageKey } from "@/components/ugc/action-message";
import {
  contentLocaleKey,
  marketKey,
  templateKey,
  videoModeKey,
} from "@/components/ugc/labels";
import { useTranslation } from "@/lib/i18n/translation/client";
import { deleteWork } from "@/lib/ugc/work-actions";
import type { WorkDetail } from "@/lib/ugc/works";

/**
 * What this work is, kept in view for the whole flow. Every step after the
 * first is generated from these setup choices, so they stay readable rather
 * than disappearing behind the step the operator happens to be on.
 */
export function WorkSummary({ detail }: { detail: WorkDetail }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const { work, product, talent } = detail;

  const remove = () =>
    startTransition(async () => {
      const result = await deleteWork(work.id);
      if (!result.ok) {
        toast.error(t(actionMessageKey(result.code)));
        return;
      }
      toast.success(t("ugc_work_deleted"));
      router.push("/dashboard/works");
    });

  return (
    <div className="border-border flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border p-3">
      <div className="border-border bg-muted relative size-10 shrink-0 overflow-hidden rounded-md border">
        {product?.images[0] ? (
          <Image
            src={product.images[0]}
            alt=""
            fill
            sizes="40px"
            className="object-cover"
            unoptimized
          />
        ) : (
          <Package
            className="text-muted-foreground absolute inset-0 m-auto size-4"
            aria-hidden
          />
        )}
      </div>

      <dl className="flex min-w-0 flex-1 flex-wrap items-center gap-x-5 gap-y-1 text-sm">
        <Fact label={t("ugc_plan_product")}>
          {product ? (
            <Link
              href={`/dashboard/products/${product.id}`}
              className="underline-offset-4 hover:underline"
            >
              {product.name}
            </Link>
          ) : (
            t("ugc_common_not_set")
          )}
        </Fact>
        <Fact label={t("ugc_plan_talents")}>
          {talent?.name ?? t("ugc_work_no_talent")}
        </Fact>
        <Fact label={t("ugc_plan_template")}>
          {t(templateKey(work.template))}
        </Fact>
        <Fact label={t("ugc_video_mode")}>
          {t(videoModeKey(work.videoMode))}
        </Fact>
        <Fact label={t("ugc_plan_locale")}>
          {t(contentLocaleKey(work.locale))} · {t(marketKey(work.market))}
        </Fact>
      </dl>

      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() => setConfirming(true)}
      >
        <Trash2 />
        {t("ugc_common_delete")}
      </Button>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("ugc_work_delete_title")}</DialogTitle>
            <DialogDescription>{t("ugc_work_delete_hint")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirming(false)}
              disabled={pending}
            >
              {t("ugc_common_cancel")}
            </Button>
            <Button variant="destructive" onClick={remove} disabled={pending}>
              <Trash2 />
              {t("ugc_common_delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Fact({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-baseline gap-1.5">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="truncate">{children}</dd>
    </div>
  );
}
