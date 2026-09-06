"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, FolderDown, RefreshCw, Repeat2, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

const FILTERS: readonly { id: ReviewFilter; labelKey: string }[] = [
  { id: "all", labelKey: "ugc_review_filter_all" },
  { id: "pending", labelKey: "ugc_review_status_pending" },
  { id: "selected", labelKey: "ugc_review_status_selected" },
  { id: "shortlisted", labelKey: "ugc_review_status_shortlisted" },
  { id: "rejected", labelKey: "ugc_review_status_rejected" },
];

const DECISIONS = ["selected", "shortlisted", "rejected"] as const;

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

  const inProduct = clips.filter(
    (detail) => productFilter === "all" || detail.productName === productFilter,
  );
  const visible = inProduct.filter(
    (detail) => filter === "all" || detail.clip.reviewStatus === filter,
  );
  const selectable = visible.filter((detail) => detail.clip.status === "ready");

  const countFor = (id: ReviewFilter) =>
    id === "all"
      ? inProduct.length
      : inProduct.filter((detail) => detail.clip.reviewStatus === id).length;

  const toggle = (clipId: string) =>
    setSelection((current) =>
      current.includes(clipId)
        ? current.filter((id) => id !== clipId)
        : [...current, clipId],
    );

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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={filter}
          onValueChange={(value) => setFilter(value as ReviewFilter)}
        >
          <TabsList
            variant="line"
            aria-label={t("ugc_review_filter_status")}
            className="flex-wrap"
          >
            {FILTERS.map((entry) => (
              <TabsTrigger key={entry.id} value={entry.id}>
                {t(entry.labelKey)}
                <span className="text-muted-foreground tabular-nums">
                  {countFor(entry.id)}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <Select value={productFilter} onValueChange={setProductFilter}>
          <SelectTrigger className="w-56" aria-label={t("ugc_plan_product")}>
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

      {visible.length === 0 ? (
        <EmptyState
          spacing="compact"
          icon={<FolderDown />}
          title={t("ugc_review_empty_title")}
          description={t("ugc_review_empty_hint")}
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((detail) => {
            const hint = hintById.get(detail.clip.id);
            const checked = selection.includes(detail.clip.id);
            // Only a finished clip has something to play or to ship: a still
            // frame behind player chrome invites a click that goes nowhere.
            const playable =
              detail.clip.status === "ready" && Boolean(detail.clip.videoUrl);
            return (
              <li key={detail.clip.id}>
                <Card
                  data-selected={checked || undefined}
                  className="data-selected:ring-primary h-full transition-shadow data-selected:ring-2"
                >
                  <CardContent className="space-y-3 pt-6">
                    <div className="border-border bg-muted relative aspect-[9/16] overflow-hidden rounded-md border">
                      {playable ? (
                        <video
                          className="size-full object-cover"
                          src={detail.clip.videoUrl ?? undefined}
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
                      {DECISIONS.map((status) => (
                        <Button
                          key={status}
                          size="sm"
                          variant={
                            detail.clip.reviewStatus === status
                              ? "default"
                              : "outline"
                          }
                          aria-pressed={detail.clip.reviewStatus === status}
                          disabled={pending || !playable}
                          onClick={() =>
                            run(
                              () => setClipReview(detail.clip.id, status),
                              "ugc_review_updated",
                            )
                          }
                        >
                          {t(`ugc_review_status_${status}`)}
                        </Button>
                      ))}
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
                      <Button
                        size="sm"
                        variant={checked ? "secondary" : "ghost"}
                        aria-pressed={checked}
                        disabled={!playable}
                        className="ml-auto"
                        onClick={() => toggle(detail.clip.id)}
                      >
                        {t("ugc_review_include_in_export")}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {selection.length > 0 && (
        <div
          role="region"
          aria-label={t("ugc_review_selection_bar")}
          className="bg-background/95 supports-[backdrop-filter]:bg-background/80 border-border sticky bottom-4 z-10 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 shadow-sm backdrop-blur"
        >
          <span className="text-sm font-medium tabular-nums">
            {t("ugc_review_selected_count", { count: selection.length })}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={selection.length === selectable.length}
            onClick={() =>
              setSelection(selectable.map((detail) => detail.clip.id))
            }
          >
            {t("ugc_review_select_visible")}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelection([])}>
            <X />
            {t("ugc_review_clear_selection")}
          </Button>
          <Button
            size="sm"
            className="ml-auto"
            onClick={() => setExportOpen(true)}
          >
            <FolderDown />
            {t("ugc_review_export_selection", { count: selection.length })}
          </Button>
        </div>
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
