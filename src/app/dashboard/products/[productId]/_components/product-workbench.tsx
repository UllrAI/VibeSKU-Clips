"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ExternalLink,
  Film,
  Loader2,
  RefreshCw,
  Save,
  SquarePen,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  actionMessageKey,
  jobFailureKey,
} from "@/components/ugc/action-message";
import { ImageField } from "@/components/ugc/image-field";
import { marketKey } from "@/components/ugc/labels";
import { StatusBadge } from "@/components/ugc/status-badge";
import { useProductState } from "@/hooks/use-product-state";
import { useTranslation } from "@/lib/i18n/translation/client";
import {
  deleteProduct,
  reviseProductAnalysis,
  retryProductAnalysis,
  saveProductFacts,
} from "@/lib/ugc/actions";
import type { ProductRow, ProductState } from "@/lib/ugc/queries";
import { ProductForm } from "../../_components/product-form";

/**
 * A product is material plus what the system understood from it. Both halves
 * are on one screen because the second is only trustworthy next to the first:
 * the operator reads the extraction against the images that produced it, fixes
 * what is wrong, and saves — which is also what clears the product to be used.
 */
export function ProductWorkbench({
  product,
  initialState,
}: {
  product: ProductRow;
  initialState: ProductState;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const state = useProductState(product.id, initialState);
  const [editingMaterial, setEditingMaterial] = useState(false);
  const [revisingAnalysis, setRevisingAnalysis] = useState(false);
  const [analysisFeedback, setAnalysisFeedback] = useState("");
  const [additionalImages, setAdditionalImages] = useState<string[]>([]);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  const reading = state.status === "analyzing" || state.status === "draft";
  const readFailed = state.run.failed;
  const stalled = state.run.stalled;

  const queueAnalysis = async (input: {
    feedback?: string;
    images: string[];
  }) => {
    const result = await reviseProductAnalysis(product.id, input);
    if (!result.ok) {
      toast.error(t(actionMessageKey(result.code)));
      return false;
    }
    toast.success(t("ugc_product_analysis_queued"));
    router.refresh();
    return true;
  };

  const reread = () =>
    startTransition(async () => {
      const queued = await queueAnalysis({
        feedback: analysisFeedback.trim() || undefined,
        images: additionalImages,
      });
      if (!queued) return;
      setRevisingAnalysis(false);
      setAnalysisFeedback("");
      setAdditionalImages([]);
    });

  const retryReading = () =>
    startTransition(async () => {
      const result = await retryProductAnalysis(product.id);
      if (!result.ok) {
        toast.error(t(actionMessageKey(result.code)));
        return;
      }
      toast.success(t("ugc_product_analysis_queued"));
      router.refresh();
    });

  const remove = () =>
    startTransition(async () => {
      const result = await deleteProduct(product.id);
      if (!result.ok) {
        toast.error(t(actionMessageKey(result.code)));
        return;
      }
      toast.success(t("ugc_product_deleted"));
      router.push("/dashboard/products");
    });

  return (
    <div className="grid gap-4 lg:grid-cols-5 lg:items-start">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">
            {t("ugc_product_material_title")}
          </CardTitle>
          <CardDescription>{t("ugc_product_material_hint")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {product.images.length > 0 && (
            <div className="space-y-2">
              <ul className="grid grid-cols-3 gap-2">
                {product.images.map((url) => (
                  <li
                    key={url}
                    className="border-border bg-muted relative aspect-square overflow-hidden rounded-md border"
                  >
                    <Image
                      src={url}
                      alt=""
                      fill
                      sizes="120px"
                      className="object-cover"
                      unoptimized
                    />
                  </li>
                ))}
              </ul>
              <p className="text-muted-foreground text-xs">
                {t("ugc_product_images_analysis_count", {
                  count: product.images.length,
                })}
              </p>
            </div>
          )}

          <dl className="space-y-2 text-sm">
            <Detail label={t("ugc_product_variant")}>
              {product.variant || t("ugc_common_not_set")}
            </Detail>
            <Detail label={t("ugc_product_market")}>
              {product.market
                ? t(marketKey(product.market))
                : t("ugc_common_not_set")}
            </Detail>
            <Detail label={t("ugc_product_source_url")}>
              {product.sourceUrl ? (
                <a
                  href={product.sourceUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  title={product.sourceUrl}
                  aria-label={product.sourceUrl}
                  className="text-primary inline-flex max-w-full min-w-0 items-center gap-1 underline-offset-4 hover:underline"
                >
                  <span className="min-w-0 truncate" dir="ltr" translate="no">
                    {sourceUrlLabel(product.sourceUrl)}
                  </span>
                  <ExternalLink className="size-3 shrink-0" aria-hidden />
                </a>
              ) : (
                t("ugc_common_not_set")
              )}
            </Detail>
          </dl>
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2 border-t">
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => setEditingMaterial(true)}
          >
            <SquarePen />
            {t("ugc_product_edit_material")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => setConfirmingDelete(true)}
          >
            <Trash2 />
            {t("ugc_common_delete")}
          </Button>
        </CardFooter>
      </Card>

      <Card className="lg:col-span-3">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-base">
              {t("ugc_product_facts_title")}
            </CardTitle>
            <StatusBadge kind="product" status={state.status} />
          </div>
          <CardDescription>{t("ugc_product_facts_hint")}</CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {stalled && (
            <Alert variant="destructive">
              <TriangleAlert />
              <AlertTitle>{t("ugc_work_stalled_title")}</AlertTitle>
              <AlertDescription>{t("ugc_work_stalled_hint")}</AlertDescription>
            </Alert>
          )}
          {readFailed && (
            <Alert variant="destructive">
              <TriangleAlert />
              <AlertTitle>{t("ugc_product_read_failed_title")}</AlertTitle>
              <AlertDescription>
                <p>
                  {state.run.failureCode
                    ? t(jobFailureKey(state.run.failureCode))
                    : t("ugc_product_read_failed_hint")}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-foreground mt-2"
                  disabled={pending}
                  onClick={retryReading}
                >
                  {pending ? (
                    <Loader2 className="animate-spin" aria-hidden />
                  ) : (
                    <RefreshCw aria-hidden />
                  )}
                  {product.sourceUrl
                    ? t("ugc_product_retry_import")
                    : t("ugc_product_reanalyze")}
                </Button>
              </AlertDescription>
            </Alert>
          )}
          {state.status === "needs_input" && state.issue && (
            <Alert>
              <TriangleAlert />
              <AlertTitle>{t("ugc_product_needs_input_title")}</AlertTitle>
              <AlertDescription>{state.issue}</AlertDescription>
            </Alert>
          )}

          {reading && !readFailed && !stalled ? (
            <ReadingPlaceholder />
          ) : product.facts ? (
            <FactsEditor
              key={product.updatedAt.toISOString()}
              productId={product.id}
              facts={product.facts}
              cleared={state.status === "ready"}
              onSaved={() => router.refresh()}
            />
          ) : (
            <p className="text-muted-foreground text-sm">
              {t("ugc_product_not_read_yet")}
            </p>
          )}
        </CardContent>

        <CardFooter className="flex flex-wrap items-center justify-between gap-3 border-t">
          <Button
            variant="outline"
            size="sm"
            disabled={pending || (reading && !readFailed && !stalled)}
            onClick={() => setRevisingAnalysis(true)}
          >
            <RefreshCw />
            {t("ugc_product_reanalyze")}
          </Button>
          {state.status === "ready" && (
            <Button asChild>
              <Link href={`/dashboard/works/new?product=${product.id}`}>
                <Film />
                {t("ugc_product_use_in_work")}
              </Link>
            </Button>
          )}
        </CardFooter>
      </Card>

      {editingMaterial && (
        <ProductForm
          product={product}
          open={editingMaterial}
          onOpenChange={setEditingMaterial}
        />
      )}

      <Dialog open={revisingAnalysis} onOpenChange={setRevisingAnalysis}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{t("ugc_product_revision_title")}</DialogTitle>
            <DialogDescription>
              {t("ugc_product_revision_description", {
                count: product.images.length,
              })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="product-analysis-feedback">
                {t("ugc_product_revision_feedback")}
              </Label>
              <Textarea
                id="product-analysis-feedback"
                rows={5}
                value={analysisFeedback}
                onChange={(event) => setAnalysisFeedback(event.target.value)}
                placeholder={t("ugc_product_revision_feedback_placeholder")}
              />
              <p className="text-muted-foreground text-xs">
                {t("ugc_product_revision_feedback_hint")}
              </p>
            </div>
            <ImageField
              value={additionalImages}
              onChange={setAdditionalImages}
              maxFiles={Math.max(0, 8 - product.images.length)}
              label={t("ugc_product_revision_images")}
            />
            {product.images.length >= 8 && (
              <p className="text-muted-foreground text-xs">
                {t("ugc_product_revision_images_full")}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRevisingAnalysis(false)}
              disabled={pending}
            >
              {t("ugc_common_cancel")}
            </Button>
            <Button onClick={reread} disabled={pending}>
              {pending && <Loader2 className="animate-spin" aria-hidden />}
              {t("ugc_product_revision_submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("ugc_product_delete_title")}</DialogTitle>
            <DialogDescription>
              {t("ugc_product_delete_hint")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmingDelete(false)}
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

function Detail({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

function sourceUrlLabel(value: string): string {
  try {
    const url = new URL(value);
    const hostname = url.hostname.replace(/^www\./, "");
    const pathname =
      url.pathname === "/" ? "" : url.pathname.replace(/\/$/, "");
    return `${hostname}${pathname}`;
  } catch {
    return value;
  }
}

/** What the reader is doing, in the shape of the answer it will replace. */
function ReadingPlaceholder() {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <p className="text-muted-foreground flex items-center gap-2 text-sm">
        <Loader2
          className="size-4 animate-spin motion-reduce:animate-none"
          aria-hidden
        />
        {t("ugc_product_reading_title")}
      </p>
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-4 w-2/3" />
      </div>
      <p className="text-muted-foreground/70 text-xs">
        {t("ugc_product_reading_hint")}
      </p>
    </div>
  );
}

function toLines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * The extraction, in editable form. Saving is an act of approval, not a
 * formality: the operator's wording is what every script downstream is
 * written from.
 */
function FactsEditor({
  productId,
  facts,
  cleared,
  onSaved,
}: {
  productId: string;
  facts: NonNullable<ProductRow["facts"]>;
  /** The product is already usable, so saving is no longer the page's point. */
  cleared: boolean;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [pending, startTransition] = useTransition();
  const [summary, setSummary] = useState(facts.summary);
  const [appearance, setAppearance] = useState(facts.appearance);
  const [sellingPoints, setSellingPoints] = useState(
    facts.sellingPoints.join("\n"),
  );
  const [specs, setSpecs] = useState(facts.specs.join("\n"));
  const [scenarios, setScenarios] = useState(facts.scenarios.join("\n"));

  const dirty =
    summary !== facts.summary ||
    appearance !== facts.appearance ||
    sellingPoints !== facts.sellingPoints.join("\n") ||
    specs !== facts.specs.join("\n") ||
    scenarios !== facts.scenarios.join("\n");

  const save = () =>
    startTransition(async () => {
      const result = await saveProductFacts(productId, {
        summary: summary.trim(),
        appearance: appearance.trim(),
        sellingPoints: toLines(sellingPoints),
        specs: toLines(specs),
        scenarios: toLines(scenarios),
      });
      if (!result.ok) {
        toast.error(t(actionMessageKey(result.code)));
        return;
      }
      toast.success(t("ugc_product_facts_saved"));
      onSaved();
    });

  const complete =
    summary.trim().length > 0 &&
    appearance.trim().length > 0 &&
    toLines(sellingPoints).length > 0;

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (complete) save();
      }}
    >
      <Field
        id="facts-summary"
        label={t("ugc_work_facts_summary")}
        value={summary}
        onChange={setSummary}
        rows={2}
      />
      <Field
        id="facts-appearance"
        label={t("ugc_work_facts_appearance")}
        value={appearance}
        onChange={setAppearance}
        rows={2}
      />
      <Field
        id="facts-selling-points"
        label={t("ugc_brief_selling_points")}
        hint={t("ugc_brief_one_per_line")}
        value={sellingPoints}
        onChange={setSellingPoints}
        rows={3}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="facts-specs"
          label={t("ugc_product_facts_specs")}
          hint={t("ugc_brief_one_per_line")}
          value={specs}
          onChange={setSpecs}
          rows={3}
        />
        <Field
          id="facts-scenarios"
          label={t("ugc_product_facts_scenarios")}
          hint={t("ugc_brief_one_per_line")}
          value={scenarios}
          onChange={setScenarios}
          rows={3}
        />
      </div>

      {facts.sources.length > 0 && (
        <p className="text-muted-foreground text-xs">
          {t("ugc_product_facts_sources")}: {facts.sources.join(" · ")}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button
          type="submit"
          variant={dirty || !cleared ? "default" : "outline"}
          disabled={pending || !complete}
        >
          {pending ? (
            <Loader2
              className="animate-spin motion-reduce:animate-none"
              aria-hidden
            />
          ) : (
            <Save aria-hidden />
          )}
          {t(dirty ? "ugc_product_facts_save" : "ugc_product_facts_confirm")}
        </Button>
        {dirty && (
          <span className="text-muted-foreground text-xs">
            {t("ugc_product_facts_unsaved")}
          </span>
        )}
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  hint,
  value,
  onChange,
  rows,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  rows: number;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {hint && <span className="text-muted-foreground text-xs">{hint}</span>}
      </div>
      <Textarea
        id={id}
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
