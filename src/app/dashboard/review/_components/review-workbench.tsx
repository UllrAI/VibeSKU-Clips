"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, FolderDown, RefreshCw, Repeat2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/ugc/status-badge";
import { actionMessageKey } from "@/components/ugc/action-message";
import { contentLocaleKey, marketKey } from "@/components/ugc/labels";
import { useTranslation } from "@/lib/i18n/translation/client";
import {
  createExport,
  regenerateClip,
  retryClip,
  setClipReview,
} from "@/lib/ugc/actions";
import type { ClipDetail } from "@/lib/ugc/queries";
import type { SimilarityHint } from "@/lib/ugc/similarity";

type ReviewFilter = "all" | "pending" | "selected" | "shortlisted" | "rejected";

export function ReviewWorkbench({
  clips,
  hints,
}: {
  clips: ClipDetail[];
  hints: SimilarityHint[];
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [filter, setFilter] = useState<ReviewFilter>("all");
  const [productFilter, setProductFilter] = useState("all");
  const [selection, setSelection] = useState<string[]>([]);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportName, setExportName] = useState("");
  const [groupBy, setGroupBy] = useState<"product" | "accountTag">("product");

  const hintById = useMemo(
    () => new Map(hints.map((hint) => [hint.id, hint])),
    [hints],
  );

  const products = useMemo(
    () => [...new Set(clips.map((detail) => detail.productName))].sort(),
    [clips],
  );

  const visible = clips.filter((detail) => {
    if (filter !== "all" && detail.clip.reviewStatus !== filter) return false;
    if (productFilter !== "all" && detail.productName !== productFilter)
      return false;
    return true;
  });

  const run = (
    action: () => Promise<{ ok: boolean; code?: string }>,
    successKey: string,
  ) =>
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        toast.error(t(actionMessageKey(result.code)));
        return;
      }
      toast.success(t(successKey));
      router.refresh();
    });

  const submitExport = () =>
    startTransition(async () => {
      const result = await createExport(
        { name: exportName.trim(), groupBy, clipIds: selection },
        t("ugc_export_unassigned_group"),
      );
      if (!result.ok) {
        toast.error(t(actionMessageKey(result.code)));
        return;
      }
      toast.success(t("ugc_export_created"));
      setExportOpen(false);
      setSelection([]);
      router.push(`/dashboard/exports`);
    });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-2">
          <Label htmlFor="review-filter">{t("ugc_review_filter_status")}</Label>
          <Select
            value={filter}
            onValueChange={(value) => setFilter(value as ReviewFilter)}
          >
            <SelectTrigger id="review-filter" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("ugc_review_filter_all")}</SelectItem>
              <SelectItem value="pending">
                {t("ugc_review_status_pending")}
              </SelectItem>
              <SelectItem value="selected">
                {t("ugc_review_status_selected")}
              </SelectItem>
              <SelectItem value="shortlisted">
                {t("ugc_review_status_shortlisted")}
              </SelectItem>
              <SelectItem value="rejected">
                {t("ugc_review_status_rejected")}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="review-product">{t("ugc_plan_product")}</Label>
          <Select value={productFilter} onValueChange={setProductFilter}>
            <SelectTrigger id="review-product" className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("ugc_review_filter_all")}</SelectItem>
              {products.map((product) => (
                <SelectItem key={product} value={product}>
                  {product}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          className="ml-auto"
          disabled={selection.length === 0}
          onClick={() => setExportOpen(true)}
        >
          <FolderDown />
          {t("ugc_review_export_selection", { count: selection.length })}
        </Button>
      </div>

      {visible.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm font-medium">{t("ugc_review_empty_title")}</p>
            <p className="text-muted-foreground mt-1 text-sm">
              {t("ugc_review_empty_hint")}
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((detail) => {
            const hint = hintById.get(detail.clip.id);
            const checked = selection.includes(detail.clip.id);
            return (
              <li key={detail.clip.id}>
                <Card className="h-full">
                  <CardContent className="space-y-3 pt-6">
                    <div className="border-border bg-muted relative aspect-[9/16] overflow-hidden rounded-md border">
                      {detail.clip.videoUrl ? (
                        <video
                          className="size-full object-cover"
                          src={detail.clip.videoUrl}
                          poster={detail.clip.coverUrl ?? undefined}
                          controls
                          preload="none"
                        />
                      ) : (
                        <p className="text-muted-foreground p-4 text-sm">
                          {detail.clip.failureReason ??
                            t("ugc_clip_no_preview")}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs">
                        {detail.clip.reference}
                      </span>
                      <StatusBadge kind="clip" status={detail.clip.status} />
                      <StatusBadge
                        kind="review"
                        status={detail.clip.reviewStatus}
                      />
                    </div>

                    <div className="space-y-1 text-sm">
                      <p className="font-medium">{detail.productName}</p>
                      <p className="text-muted-foreground">
                        {[
                          t(contentLocaleKey(detail.clip.locale)),
                          t(marketKey(detail.clip.market)),
                          detail.talentName,
                          detail.clip.accountTag,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      {detail.scriptHook && (
                        <p className="text-muted-foreground line-clamp-2">
                          {detail.scriptHook}
                        </p>
                      )}
                    </div>

                    {hint && (
                      <Badge variant="outline" className="gap-1">
                        <Copy className="size-3" />
                        {t("ugc_review_similar_to", {
                          reference: hint.matchedReference,
                          score: Math.round(hint.score * 100),
                        })}
                      </Badge>
                    )}

                    {detail.clip.quality && !detail.clip.quality.passed && (
                      <ul className="text-destructive space-y-1 text-xs">
                        {detail.clip.quality.checks
                          .filter((check) => !check.passed)
                          .map((check) => (
                            <li key={check.id}>{check.detail}</li>
                          ))}
                      </ul>
                    )}

                    <div className="flex flex-wrap gap-2">
                      {(["selected", "shortlisted", "rejected"] as const).map(
                        (status) => (
                          <Button
                            key={status}
                            size="sm"
                            variant={
                              detail.clip.reviewStatus === status
                                ? "default"
                                : "outline"
                            }
                            disabled={pending || detail.clip.status !== "ready"}
                            onClick={() =>
                              run(
                                () => setClipReview(detail.clip.id, status),
                                "ugc_review_updated",
                              )
                            }
                          >
                            {t(`ugc_review_status_${status}`)}
                          </Button>
                        ),
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() =>
                          run(
                            () =>
                              detail.clip.status === "failed"
                                ? retryClip(detail.clip.id)
                                : regenerateClip(detail.clip.id),
                            detail.clip.status === "failed"
                              ? "ugc_clip_retry_queued"
                              : "ugc_clip_regenerate_queued",
                          )
                        }
                      >
                        {detail.clip.status === "failed" ? (
                          <RefreshCw />
                        ) : (
                          <Repeat2 />
                        )}
                        {t(
                          detail.clip.status === "failed"
                            ? "ugc_clip_retry"
                            : "ugc_clip_regenerate",
                        )}
                      </Button>
                      <label className="ml-auto flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={checked}
                          disabled={detail.clip.status !== "ready"}
                          onCheckedChange={(value) =>
                            setSelection((current) =>
                              value
                                ? [...current, detail.clip.id]
                                : current.filter((id) => id !== detail.clip.id),
                            )
                          }
                        />
                        {t("ugc_review_include_in_export")}
                      </label>
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("ugc_export_new_title")}</DialogTitle>
            <DialogDescription>
              {t("ugc_export_new_description")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="export-name">{t("ugc_export_name")}</Label>
              <Input
                id="export-name"
                value={exportName}
                onChange={(event) => setExportName(event.target.value)}
                placeholder={t("ugc_export_name_placeholder")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="export-group">{t("ugc_export_group_by")}</Label>
              <Select
                value={groupBy}
                onValueChange={(value) =>
                  setGroupBy(value as "product" | "accountTag")
                }
              >
                <SelectTrigger id="export-group">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="product">
                    {t("ugc_export_group_product")}
                  </SelectItem>
                  <SelectItem value="accountTag">
                    {t("ugc_export_group_account")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExportOpen(false)}>
              {t("ugc_common_cancel")}
            </Button>
            <Button
              onClick={submitExport}
              disabled={pending || !exportName.trim()}
            >
              {t("ugc_export_create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
