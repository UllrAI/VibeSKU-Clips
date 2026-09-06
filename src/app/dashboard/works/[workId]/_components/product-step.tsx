"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { Loader2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { actionMessageKey } from "@/components/ugc/action-message";
import {
  LOCALE_OPTIONS,
  MARKET_OPTIONS,
  TEMPLATE_OPTIONS,
  contentLocaleKey,
  marketKey,
  templateDescriptionKey,
  templateKey,
} from "@/components/ugc/labels";
import { useTranslation } from "@/lib/i18n/translation/client";
import type { ScriptTemplate } from "@/lib/ugc/constants";
import type { ProductRow, TalentRow } from "@/lib/ugc/queries";
import { setWorkSetup, startWorkScript } from "@/lib/ugc/work-actions";
import type { WorkDetail } from "@/lib/ugc/works";
import { cn } from "@/lib/utils";
import { StepCard } from "./step-card";

const NONE = "none";

export function ProductStep({
  detail,
  products,
  talents,
  productState,
  onRefresh,
}: {
  detail: WorkDetail;
  products: ProductRow[];
  talents: TalentRow[];
  productState: "empty" | "reading" | "needs_input" | "ready";
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  const [pending, startTransition] = useTransition();
  const { work, product } = detail;
  const [productId, setProductId] = useState(work.productId ?? "");
  const [talentId, setTalentId] = useState(work.talentId ?? NONE);
  const [locale, setLocale] = useState(work.locale);
  const [market, setMarket] = useState(work.market);
  const [template, setTemplate] = useState<ScriptTemplate>(work.template);

  const save = (then?: () => void) =>
    startTransition(async () => {
      const result = await setWorkSetup(work.id, {
        productId,
        talentId: talentId === NONE ? undefined : talentId,
        locale,
        market,
        template,
      });
      if (!result.ok) {
        toast.error(t(actionMessageKey(result.code)));
        return;
      }
      onRefresh();
      then?.();
    });

  const confirm = () =>
    startTransition(async () => {
      const saved = await setWorkSetup(work.id, {
        productId,
        talentId: talentId === NONE ? undefined : talentId,
        locale,
        market,
        template,
      });
      if (!saved.ok) {
        toast.error(t(actionMessageKey(saved.code)));
        return;
      }
      const started = await startWorkScript(work.id);
      if (!started.ok) {
        toast.error(t(actionMessageKey(started.code)));
        return;
      }
      toast.success(t("ugc_work_script_started"));
      onRefresh();
    });

  const chosen = products.find((entry) => entry.id === productId);

  return (
    <StepCard
      title={t("ugc_work_step_product")}
      description={t("ugc_work_product_hint")}
      action={
        <Button
          onClick={confirm}
          disabled={pending || !productId || productState !== "ready"}
        >
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          {t("ugc_work_confirm_product")}
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="work-product">{t("ugc_plan_product")}</Label>
          <Select
            value={productId}
            onValueChange={(value) => {
              setProductId(value);
              save();
            }}
          >
            <SelectTrigger id="work-product">
              <SelectValue placeholder={t("ugc_work_pick_product")} />
            </SelectTrigger>
            <SelectContent>
              {products.map((entry) => (
                <SelectItem key={entry.id} value={entry.id}>
                  {entry.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-muted-foreground text-xs">
            {t.rich("ugc_work_product_new_hint", {
              link: (chunks) => (
                <Link
                  href="/dashboard/products"
                  className="text-primary underline-offset-4 hover:underline"
                >
                  {chunks}
                </Link>
              ),
            })}
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="work-talent">{t("ugc_plan_talents")}</Label>
          <Select value={talentId} onValueChange={setTalentId}>
            <SelectTrigger id="work-talent">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{t("ugc_work_no_talent")}</SelectItem>
              {talents.map((entry) => (
                <SelectItem key={entry.id} value={entry.id}>
                  {entry.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">
          {t("ugc_plan_template")}
        </legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {TEMPLATE_OPTIONS.map((entry) => (
            <label
              key={entry}
              className={cn(
                "border-border hover:bg-accent/50 has-checked:border-primary has-checked:bg-accent/50 cursor-pointer rounded-lg border px-3 py-2.5 transition-colors",
                "has-focus-visible:ring-ring has-focus-visible:ring-[3px]",
              )}
            >
              <input
                type="radio"
                name="work-template"
                value={entry}
                checked={template === entry}
                onChange={() => setTemplate(entry)}
                className="sr-only"
              />
              <span className="block text-sm font-medium">
                {t(templateKey(entry))}
              </span>
              <span className="text-muted-foreground mt-0.5 block text-xs">
                {t(templateDescriptionKey(entry))}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="work-locale">{t("ugc_plan_locale")}</Label>
          <Select value={locale} onValueChange={setLocale}>
            <SelectTrigger id="work-locale">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LOCALE_OPTIONS.map((entry) => (
                <SelectItem key={entry} value={entry}>
                  {t(contentLocaleKey(entry))}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="work-market">{t("ugc_plan_market")}</Label>
          <Select value={market} onValueChange={setMarket}>
            <SelectTrigger id="work-market">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MARKET_OPTIONS.map((entry) => (
                <SelectItem key={entry} value={entry}>
                  {t(marketKey(entry))}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {chosen && (
        <ProductReadout product={product ?? chosen} state={productState} />
      )}
    </StepCard>
  );
}

/** What the system actually understood about the product, before it writes. */
function ProductReadout({
  product,
  state,
}: {
  product: ProductRow;
  state: "empty" | "reading" | "needs_input" | "ready";
}) {
  const { t } = useTranslation();

  return (
    <div className="border-border space-y-3 rounded-lg border p-4">
      <div className="flex items-start gap-3">
        {product.images[0] && (
          <div className="border-border relative size-14 shrink-0 overflow-hidden rounded-md border">
            <Image
              src={product.images[0]}
              alt=""
              fill
              sizes="56px"
              className="object-cover"
              unoptimized
            />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{product.name}</p>
          {state === "reading" && (
            <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
              <Loader2
                className="size-3.5 animate-spin motion-reduce:animate-none"
                aria-hidden
              />
              {t("ugc_work_product_reading")}
            </p>
          )}
          {state === "needs_input" && (
            <p className="text-destructive flex items-center gap-1.5 text-sm">
              <TriangleAlert className="size-3.5" aria-hidden />
              {product.issue ?? t("ugc_work_product_needs_input")}
            </p>
          )}
        </div>
      </div>

      {product.facts && (
        <dl className="space-y-2 text-sm">
          <div>
            <dt className="text-muted-foreground text-xs">
              {t("ugc_work_facts_summary")}
            </dt>
            <dd>{product.facts.summary}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">
              {t("ugc_work_facts_appearance")}
            </dt>
            <dd>{product.facts.appearance}</dd>
          </div>
          {product.facts.sellingPoints.length > 0 && (
            <div>
              <dt className="text-muted-foreground text-xs">
                {t("ugc_brief_selling_points")}
              </dt>
              <dd className="flex flex-wrap gap-1.5 pt-1">
                {product.facts.sellingPoints.map((point) => (
                  <Badge
                    key={point}
                    variant="secondary"
                    className="font-normal"
                  >
                    {point}
                  </Badge>
                ))}
              </dd>
            </div>
          )}
        </dl>
      )}
    </div>
  );
}
