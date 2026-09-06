"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, Package, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
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
import { createBatch } from "@/lib/ugc/actions";
import { MAX_BATCH_CLIPS, type ScriptTemplate } from "@/lib/ugc/constants";
import { summarizePlan } from "@/lib/ugc/planning";
import type { ProductRow, ScriptRow, TalentRow } from "@/lib/ugc/queries";

interface PlanLineState {
  id: string;
  productId: string;
  locale: string;
  market: string;
  template: ScriptTemplate;
  talentIds: string[];
  scriptCount: number;
  clipsPerScript: number;
  scriptId: string;
  accountTag: string;
}

function newLine(productId: string): PlanLineState {
  return {
    id: crypto.randomUUID(),
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
  const [lines, setLines] = useState<PlanLineState[]>(() =>
    products[0] ? [newLine(products[0].id)] : [],
  );

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

  const updateLine = (id: string, patch: Partial<PlanLineState>) =>
    setLines((current) =>
      current.map((line) => (line.id === id ? { ...line, ...patch } : line)),
    );

  const overBudget = summary.clipCount > MAX_BATCH_CLIPS;
  const canSubmit =
    !pending && name.trim().length > 0 && lines.length > 0 && !overBudget;

  const submit = () =>
    startTransition(async () => {
      const result = await createBatch({
        name: name.trim(),
        accountTag: accountTag.trim() || undefined,
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

  if (products.length === 0) {
    return (
      <EmptyState
        icon={<Package />}
        title={t("ugc_plan_no_products")}
        description={t("ugc_plan_no_products_hint")}
        action={
          <Button asChild size="sm">
            <Link href="/dashboard/products">{t("ugc_nav_products")}</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("ugc_plan_basics")}</CardTitle>
          <CardDescription>{t("ugc_plan_basics_hint")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="batch-name">{t("ugc_plan_name")}</Label>
            <Input
              id="batch-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("ugc_plan_name_placeholder")}
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
        </CardContent>
      </Card>

      <div className="space-y-4">
        {lines.map((line, index) => {
          const lineScripts = scripts.filter(
            (script) => script.productId === line.productId,
          );
          return (
            <Card key={line.id}>
              <CardHeader className="flex-row items-center justify-between gap-4 space-y-0">
                <CardTitle className="text-base">
                  {t("ugc_plan_line", { index: index + 1 })}
                </CardTitle>
                <div className="flex gap-2">
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={t("ugc_plan_duplicate_line")}
                    onClick={() =>
                      setLines((current) => [
                        ...current,
                        { ...line, id: crypto.randomUUID() },
                      ])
                    }
                  >
                    <Copy />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={t("ugc_plan_remove_line")}
                    disabled={lines.length === 1}
                    onClick={() =>
                      setLines((current) =>
                        current.filter((item) => item.id !== line.id),
                      )
                    }
                  >
                    <Trash2 />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor={`product-${line.id}`}>
                    {t("ugc_plan_product")}
                  </Label>
                  <Select
                    value={line.productId}
                    onValueChange={(value) =>
                      updateLine(line.id, { productId: value, scriptId: "" })
                    }
                  >
                    <SelectTrigger id={`product-${line.id}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {products.map((product) => (
                        <SelectItem key={product.id} value={product.id}>
                          {product.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`locale-${line.id}`}>
                    {t("ugc_plan_locale")}
                  </Label>
                  <Select
                    value={line.locale}
                    onValueChange={(value) =>
                      updateLine(line.id, { locale: value })
                    }
                  >
                    <SelectTrigger id={`locale-${line.id}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LOCALE_OPTIONS.map((locale) => (
                        <SelectItem key={locale} value={locale}>
                          {t(contentLocaleKey(locale))}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`market-${line.id}`}>
                    {t("ugc_plan_market")}
                  </Label>
                  <Select
                    value={line.market}
                    onValueChange={(value) =>
                      updateLine(line.id, { market: value })
                    }
                  >
                    <SelectTrigger id={`market-${line.id}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MARKET_OPTIONS.map((market) => (
                        <SelectItem key={market} value={market}>
                          {t(marketKey(market))}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`template-${line.id}`}>
                    {t("ugc_plan_template")}
                  </Label>
                  <Select
                    value={line.template}
                    onValueChange={(value) =>
                      updateLine(line.id, { template: value as ScriptTemplate })
                    }
                  >
                    <SelectTrigger id={`template-${line.id}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TEMPLATE_OPTIONS.map((template) => (
                        <SelectItem key={template} value={template}>
                          {t(templateKey(template))}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-muted-foreground text-xs">
                    {t(templateDescriptionKey(line.template))}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`scripts-${line.id}`}>
                    {t("ugc_plan_script_count")}
                  </Label>
                  <Input
                    id={`scripts-${line.id}`}
                    type="number"
                    min={1}
                    max={10}
                    disabled={Boolean(line.scriptId)}
                    value={line.scriptCount}
                    onChange={(event) =>
                      updateLine(line.id, {
                        scriptCount: Number(event.target.value) || 1,
                      })
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`clips-${line.id}`}>
                    {t("ugc_plan_clips_per_script")}
                  </Label>
                  <Input
                    id={`clips-${line.id}`}
                    type="number"
                    min={1}
                    max={10}
                    value={line.clipsPerScript}
                    onChange={(event) =>
                      updateLine(line.id, {
                        clipsPerScript: Number(event.target.value) || 1,
                      })
                    }
                  />
                </div>

                {lineScripts.length > 0 && (
                  <div className="space-y-2 sm:col-span-2 lg:col-span-3">
                    <Label htmlFor={`existing-${line.id}`}>
                      {t("ugc_plan_reuse_script")}
                    </Label>
                    <Select
                      value={line.scriptId || "none"}
                      onValueChange={(value) =>
                        updateLine(line.id, {
                          scriptId: value === "none" ? "" : value,
                        })
                      }
                    >
                      <SelectTrigger id={`existing-${line.id}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">
                          {t("ugc_plan_write_new_script")}
                        </SelectItem>
                        {lineScripts.map((script) => (
                          <SelectItem key={script.id} value={script.id}>
                            {script.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-2 sm:col-span-2 lg:col-span-3">
                  <p className="text-sm font-medium">{t("ugc_plan_talents")}</p>
                  {talents.length === 0 ? (
                    <p className="text-muted-foreground text-sm">
                      {t("ugc_plan_no_talents")}
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-4">
                      {talents.map((talent) => (
                        <label
                          key={talent.id}
                          className="flex items-center gap-2 text-sm"
                        >
                          <Checkbox
                            checked={line.talentIds.includes(talent.id)}
                            onCheckedChange={(checked) =>
                              updateLine(line.id, {
                                talentIds: checked
                                  ? [...line.talentIds, talent.id]
                                  : line.talentIds.filter(
                                      (id) => id !== talent.id,
                                    ),
                              })
                            }
                          />
                          {talent.name}
                        </label>
                      ))}
                    </div>
                  )}
                  <p className="text-muted-foreground text-xs">
                    {t("ugc_plan_talents_hint")}
                  </p>
                </div>
              </CardContent>
            </Card>
          );
        })}

        <Button
          variant="outline"
          onClick={() =>
            setLines((current) => [...current, newLine(products[0].id)])
          }
        >
          <Plus />
          {t("ugc_plan_add_line")}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("ugc_plan_summary")}</CardTitle>
          <CardDescription>{t("ugc_plan_summary_hint")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid gap-4 sm:grid-cols-4">
            <div>
              <dt className="text-muted-foreground text-sm">
                {t("ugc_plan_total_clips")}
              </dt>
              <dd className="text-2xl font-semibold tabular-nums">
                {summary.clipCount}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-sm">
                {t("ugc_plan_total_scripts")}
              </dt>
              <dd className="text-2xl font-semibold tabular-nums">
                {summary.scriptCount}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-sm">
                {t("ugc_plan_total_products")}
              </dt>
              <dd className="text-2xl font-semibold tabular-nums">
                {summary.productCount}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-sm">
                {t("ugc_plan_estimated_credits")}
              </dt>
              <dd className="text-2xl font-semibold tabular-nums">
                {summary.estimatedCredits}
              </dd>
            </div>
          </dl>
          {overBudget && (
            <p className="text-destructive text-sm">
              {t("ugc_error_batch_too_large")}
            </p>
          )}
          <div className="flex justify-end">
            <Button onClick={submit} disabled={!canSubmit}>
              {t("ugc_plan_submit")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
