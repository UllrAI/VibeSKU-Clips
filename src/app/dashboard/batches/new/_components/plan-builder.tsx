"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { actionMessageKey } from "@/components/ugc/action-message";
import { useTranslation } from "@/lib/i18n/translation/client";
import { createBatch, createProduct } from "@/lib/ugc/actions";
import { MAX_BATCH_CLIPS } from "@/lib/ugc/constants";
import { summarizePlan } from "@/lib/ugc/planning";
import { isProductUrl } from "@/lib/ugc/product-name";
import type { ProductRow, ScriptRow, TalentRow } from "@/lib/ugc/queries";
import { PlanLineFields, type PlanLineState } from "./plan-line-fields";
import {
  NEW_PRODUCT,
  draftIsUsable,
  draftName,
  emptyDraft,
  type ProductDraft,
} from "./product-slot";

function newLine(productId: string, id = crypto.randomUUID()): PlanLineState {
  return {
    id,
    productId,
    locale: "en",
    market: "US",
    template: "spokesperson",
    talentIds: [],
    scriptCount: 1,
    clipsPerScript: 1,
    scriptId: "",
    accountTag: "",
  };
}

/**
 * One card holds the whole decision: what to sell, how to tell it, how many
 * clips, and what that costs — with the running total pinned to the button
 * that spends it. A batch that needs more than one product or angle grows by
 * adding lines below, rather than by starting every batch inside a matrix.
 */
export function PlanBuilder({
  products,
  talents,
  scripts,
}: {
  products: ProductRow[];
  talents: TalentRow[];
  scripts: (ScriptRow & { productName: string })[];
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [accountTag, setAccountTag] = useState("");
  const [reviewScriptsFirst, setReviewScriptsFirst] = useState(false);
  const [draft, setDraft] = useState<ProductDraft>(emptyDraft);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  // The first line is created during render, so its id must be stable across
  // the server and client passes; every later line is minted in an event.
  const firstLineId = useId();
  const [lines, setLines] = useState<PlanLineState[]>(() => [
    newLine(products[0]?.id ?? NEW_PRODUCT, firstLineId),
  ]);

  const usesDraft = lines.some((line) => line.productId === NEW_PRODUCT);

  const summary = useMemo(
    () =>
      summarizePlan({
        reviewScriptsFirst,
        items: lines.map((line) => ({
          productId: line.productId,
          locale: line.locale,
          market: line.market,
          template: line.template,
          talentIds: line.talentIds,
          scriptCount: line.scriptCount,
          clipsPerScript: line.clipsPerScript,
          scriptId: line.scriptId || undefined,
        })),
      }),
    [lines, reviewScriptsFirst],
  );

  // A batch name is bookkeeping, not a decision. Derive one from the product
  // the operator already named so the field never blocks the primary action.
  const suggestedName = useMemo(() => {
    const first = lines[0];
    const source =
      first?.productId === NEW_PRODUCT
        ? draftName(draft)
        : (products.find((product) => product.id === first?.productId)?.name ??
          "");
    return source ? t("ugc_plan_name_suggested", { product: source }) : "";
  }, [draft, lines, products, t]);

  const updateLine = (id: string, patch: Partial<PlanLineState>) =>
    setLines((current) =>
      current.map((line) => (line.id === id ? { ...line, ...patch } : line)),
    );

  const overBudget = summary.clipCount > MAX_BATCH_CLIPS;
  const effectiveName = name.trim() || suggestedName;
  const canSubmit =
    !pending &&
    effectiveName.length > 0 &&
    !overBudget &&
    (!usesDraft || draftIsUsable(draft));

  const submit = () =>
    startTransition(async () => {
      // The draft product has to exist before the batch can reference it;
      // creating it here also starts the read, so facts are on their way while
      // scripts are being written.
      let draftId = "";
      if (usesDraft) {
        const created = await createProduct({
          name: draftName(draft),
          sourceUrl: isProductUrl(draft.entry) ? draft.entry.trim() : "",
          images: draft.images,
        });
        if (!created.ok || !created.id) {
          toast.error(t(actionMessageKey(created.code)));
          return;
        }
        draftId = created.id;
      }

      const result = await createBatch({
        name: effectiveName,
        accountTag: accountTag.trim() || undefined,
        reviewScriptsFirst,
        items: lines.map((line) => ({
          productId: line.productId === NEW_PRODUCT ? draftId : line.productId,
          locale: line.locale,
          market: line.market,
          template: line.template,
          talentIds: line.talentIds,
          scriptCount: line.scriptCount,
          clipsPerScript: line.clipsPerScript,
          scriptId: line.scriptId || undefined,
          accountTag: line.accountTag.trim() || undefined,
        })),
      });
      if (!result.ok) {
        toast.error(t(actionMessageKey(result.code)));
        return;
      }
      toast.success(t("ugc_batch_submitted"));
      router.push(`/dashboard/batches/${result.id}`);
    });

  // Submit from anywhere in the composer, the way every editor does. The ref
  // keeps the listener bound once while still calling the current closure.
  const shortcutRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    shortcutRef.current = canSubmit ? submit : null;
  });
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey)) return;
      if (!shortcutRef.current) return;
      event.preventDefault();
      shortcutRef.current();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const [first, ...rest] = lines;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-6 pt-6">
          {first && (
            <PlanLineFields
              line={first}
              onChange={(patch) => updateLine(first.id, patch)}
              products={products}
              talents={talents}
              scripts={scripts}
              draft={draft}
              onDraftChange={setDraft}
            />
          )}

          <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="-ml-2">
                <ChevronDown
                  className={advancedOpen ? "rotate-180" : undefined}
                  aria-hidden="true"
                />
                {t("ugc_plan_advanced")}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="grid gap-4 pt-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="batch-name">{t("ugc_plan_name")}</Label>
                <Input
                  id="batch-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={suggestedName || t("ugc_plan_name_placeholder")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="batch-tag">{t("ugc_plan_account_tag")}</Label>
                <Input
                  id="batch-tag"
                  value={accountTag}
                  onChange={(event) => setAccountTag(event.target.value)}
                  placeholder={t("ugc_plan_account_tag_placeholder")}
                />
                <p className="text-muted-foreground text-xs">
                  {t("ugc_plan_account_tag_hint")}
                </p>
              </div>
              <div className="flex items-start gap-3 sm:col-span-2">
                <Switch
                  id="review-scripts"
                  checked={reviewScriptsFirst}
                  onCheckedChange={setReviewScriptsFirst}
                />
                <div className="space-y-1">
                  <Label htmlFor="review-scripts">
                    {t("ugc_plan_review_scripts")}
                  </Label>
                  <p className="text-muted-foreground text-sm">
                    {t("ugc_plan_review_scripts_hint")}
                  </p>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </CardContent>

        <CardFooter className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <p className="text-muted-foreground text-sm">
            <kbd
              className="bg-muted rounded px-1.5 py-0.5 text-xs"
              translate="no"
            >
              ⌘ + ↵
            </kbd>{" "}
            {t("ugc_plan_shortcut_hint")}
          </p>
          <div className="flex items-center gap-4">
            <p className="text-sm tabular-nums">
              {t("ugc_plan_footer_summary", {
                clips: summary.clipCount,
                credits: summary.estimatedCredits,
              })}
            </p>
            <Button onClick={submit} disabled={!canSubmit}>
              {pending && <Loader2 className="animate-spin" aria-hidden />}
              {t("ugc_plan_submit")}
            </Button>
          </div>
        </CardFooter>
      </Card>

      {overBudget && (
        <p className="text-destructive text-sm">
          {t("ugc_error_batch_too_large")}
        </p>
      )}

      {rest.map((line, index) => (
        <Card key={line.id}>
          <CardContent className="space-y-4 pt-6">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-sm font-medium">
                {t("ugc_plan_line", { index: index + 2 })}
              </h2>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={t("ugc_plan_remove_line")}
                onClick={() =>
                  setLines((current) =>
                    current.filter((item) => item.id !== line.id),
                  )
                }
              >
                <Trash2 />
              </Button>
            </div>
            <PlanLineFields
              line={line}
              onChange={(patch) => updateLine(line.id, patch)}
              products={products}
              talents={talents}
              scripts={scripts}
              draft={draft}
              onDraftChange={setDraft}
            />
          </CardContent>
        </Card>
      ))}

      <Button
        variant="outline"
        onClick={() =>
          setLines((current) => [
            ...current,
            newLine(current[0]?.productId ?? products[0]?.id ?? NEW_PRODUCT),
          ])
        }
      >
        <Plus />
        {t("ugc_plan_add_line")}
      </Button>
    </div>
  );
}
