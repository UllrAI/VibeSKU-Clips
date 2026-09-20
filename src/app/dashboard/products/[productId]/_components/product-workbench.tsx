"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Download,
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
  isProductImportFailure,
  jobFailureKey,
} from "@/components/ugc/action-message";
import { StatusBadge } from "@/components/ugc/status-badge";
import { useProductState } from "@/hooks/use-product-state";
import { useTranslation } from "@/lib/i18n/translation/client";
import {
  deleteProduct,
  reimportProductMaterial,
  reviseProductAnalysis,
  saveProductFacts,
} from "@/lib/ugc/actions";
import type { ProductRow, ProductState } from "@/lib/ugc/queries";
import { ProductForm } from "../../_components/product-form";

/**
 * A product is material plus what the system understood from it. Both halves
 * are on one screen because the second is only trustworthy next to the first:
 * the operator reads the extraction against the images that produced it and
 * can correct it without a separate unlock step.
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
  const [confirmingReimport, setConfirmingReimport] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  const taskActive = ["queued", "running", "waiting"].includes(
    state.run.status,
  );
  const reading = !product.facts && taskActive;
  const updating = Boolean(product.facts) && taskActive;
  const readFailed = state.run.failed;
  const stalled = state.run.stalled;
  const activeReading = reading && !readFailed && !stalled;
  const importFailed = isProductImportFailure(state.run.failureCode);

  const queueAnalysis = async (input: { feedback?: string }) => {
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
      });
      if (!queued) return;
      setRevisingAnalysis(false);
      setAnalysisFeedback("");
    });

  const retryReading = () =>
    startTransition(async () => {
      const result = importFailed
        ? await reimportProductMaterial(product.id)
        : await reviseProductAnalysis(product.id, {});
      if (!result.ok) {
        toast.error(t(actionMessageKey(result.code)));
        return;
      }
      toast.success(
        t(
          importFailed
            ? "ugc_product_reimport_started"
            : "ugc_product_analysis_queued",
        ),
      );
      router.refresh();
    });

  const reimport = () =>
    startTransition(async () => {
      const result = await reimportProductMaterial(product.id);
      if (!result.ok) {
        toast.error(t(actionMessageKey(result.code)));
        return;
      }
      toast.success(t("ugc_product_reimport_started"));
      setConfirmingReimport(false);
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
            <Detail label={t("ugc_product_info")}>
              <span className="whitespace-pre-wrap">
                {product.info || t("ugc_common_not_set")}
              </span>
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
            disabled={pending || taskActive}
            onClick={() => setEditingMaterial(true)}
          >
            <SquarePen />
            {t("ugc_product_edit_material")}
          </Button>
          {product.sourceUrl && (
            <Button
              variant="ghost"
              size="sm"
              disabled={pending || taskActive}
              onClick={() => setConfirmingReimport(true)}
            >
              <Download />
              {t("ugc_product_reimport")}
            </Button>
          )}
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
                  {importFailed
                    ? t("ugc_product_retry_import")
                    : t("ugc_product_reanalyze")}
                </Button>
              </AlertDescription>
            </Alert>
          )}
          {state.status === "needs_input" && (
            <Alert>
              <TriangleAlert />
              <AlertTitle>{t("ugc_product_needs_input_title")}</AlertTitle>
              <AlertDescription>
                {state.issue ?? t("ugc_product_needs_image_hint")}
              </AlertDescription>
            </Alert>
          )}

          {updating && (
            <p className="text-muted-foreground flex items-center gap-2 text-sm">
              <Loader2
                className="size-4 animate-spin motion-reduce:animate-none"
                aria-hidden
              />
              {t("ugc_product_updating_title")}
            </p>
          )}

          {activeReading ? (
            <ReadingPlaceholder />
          ) : product.facts ? (
            <FactsEditor
              key={product.updatedAt.toISOString()}
              productId={product.id}
              facts={product.facts}
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
            disabled={pending || taskActive}
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
          <div>
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

      <Dialog open={confirmingReimport} onOpenChange={setConfirmingReimport}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("ugc_product_reimport_title")}</DialogTitle>
            <DialogDescription>
              {t("ugc_product_reimport_description")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmingReimport(false)}
              disabled={pending}
            >
              {t("ugc_common_cancel")}
            </Button>
            <Button onClick={reimport} disabled={pending}>
              {pending && <Loader2 className="animate-spin" aria-hidden />}
              {t("ugc_product_reimport")}
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
 * The concise extraction, in editable form. Saving changes what later scripts
 * use, but the extraction is already usable when it first lands.
 */
function FactsEditor({
  productId,
  facts,
  onSaved,
}: {
  productId: string;
  facts: NonNullable<ProductRow["facts"]>;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [pending, startTransition] = useTransition();
  const [overview, setOverview] = useState(facts.overview);
  const [highlights, setHighlights] = useState(facts.highlights.join("\n"));

  const dirty =
    overview !== facts.overview || highlights !== facts.highlights.join("\n");

  const save = () =>
    startTransition(async () => {
      const result = await saveProductFacts(productId, {
        overview: overview.trim(),
        highlights: toLines(highlights),
      });
      if (!result.ok) {
        toast.error(t(actionMessageKey(result.code)));
        return;
      }
      toast.success(t("ugc_product_facts_saved"));
      onSaved();
    });

  const complete = overview.trim().length > 0;

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (complete && dirty) save();
      }}
    >
      <Field
        id="facts-overview"
        label={t("ugc_product_facts_overview")}
        value={overview}
        onChange={setOverview}
        rows={4}
      />
      <Field
        id="facts-highlights"
        label={t("ugc_product_facts_highlights")}
        hint={t("ugc_brief_one_per_line")}
        value={highlights}
        onChange={setHighlights}
        rows={5}
      />

      {(facts.warnings?.length ?? 0) > 0 && (
        <Alert>
          <TriangleAlert />
          <AlertTitle>{t("ugc_product_warnings_title")}</AlertTitle>
          <AlertDescription>
            <ul className="list-disc space-y-1 pl-4">
              {facts.warnings?.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {facts.sources.length > 0 && (
        <p className="text-muted-foreground text-xs">
          {t("ugc_product_facts_sources")}: {facts.sources.join(" · ")}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending || !complete || !dirty}>
          {pending ? (
            <Loader2
              className="animate-spin motion-reduce:animate-none"
              aria-hidden
            />
          ) : (
            <Save aria-hidden />
          )}
          {t("ugc_product_facts_save")}
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
