"use client";

import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import type { ProductRow, ScriptRow, TalentRow } from "@/lib/ugc/queries";
import { cn } from "@/lib/utils";
import { ProductSlot, type ProductDraft } from "./product-slot";

export interface PlanLineState {
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

/**
 * Everything one plan line decides, in the order the operator thinks about it:
 * what is being sold, how it should be told, and how many clips of it to make.
 */
export function PlanLineFields({
  line,
  onChange,
  products,
  talents,
  scripts,
  draft,
  onDraftChange,
}: {
  line: PlanLineState;
  onChange: (patch: Partial<PlanLineState>) => void;
  products: ProductRow[];
  talents: TalentRow[];
  scripts: (ScriptRow & { productName: string })[];
  draft: ProductDraft;
  onDraftChange: (draft: ProductDraft) => void;
}) {
  const { t } = useTranslation();
  const templateName = useId();
  const lineScripts = scripts.filter(
    (script) => script.productId === line.productId,
  );

  return (
    <div className="space-y-5">
      <ProductSlot
        products={products}
        value={line.productId}
        onValueChange={(value) => onChange({ productId: value, scriptId: "" })}
        draft={draft}
        onDraftChange={onDraftChange}
      />

      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">
          {t("ugc_plan_template")}
        </legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {TEMPLATE_OPTIONS.map((template) => (
            <label
              key={template}
              className={cn(
                "border-border hover:bg-accent/50 has-checked:border-primary has-checked:bg-accent/50 cursor-pointer rounded-lg border px-3 py-2.5 transition-colors",
                "has-focus-visible:ring-ring has-focus-visible:ring-[3px]",
              )}
            >
              <input
                type="radio"
                name={templateName}
                value={template}
                checked={line.template === template}
                onChange={() => onChange({ template })}
                className="sr-only"
              />
              <span className="block text-sm font-medium">
                {t(templateKey(template))}
              </span>
              <span className="text-muted-foreground mt-0.5 block text-xs">
                {t(templateDescriptionKey(template))}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-2">
          <Label htmlFor={`locale-${line.id}`}>{t("ugc_plan_locale")}</Label>
          <Select
            value={line.locale}
            onValueChange={(value) => onChange({ locale: value })}
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
          <Label htmlFor={`market-${line.id}`}>{t("ugc_plan_market")}</Label>
          <Select
            value={line.market}
            onValueChange={(value) => onChange({ market: value })}
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
              onChange({ scriptCount: Number(event.target.value) || 1 })
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
              onChange({ clipsPerScript: Number(event.target.value) || 1 })
            }
          />
        </div>
      </div>

      {talents.length > 0 && (
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-medium">
            {t("ugc_plan_talents")}
          </legend>
          <div className="flex flex-wrap gap-2">
            {talents.map((talent) => (
              <label
                key={talent.id}
                className="border-border hover:bg-accent/50 has-checked:border-primary has-checked:bg-accent has-focus-visible:ring-ring cursor-pointer rounded-full border px-3 py-1.5 text-sm transition-colors has-focus-visible:ring-[3px]"
              >
                <input
                  type="checkbox"
                  checked={line.talentIds.includes(talent.id)}
                  onChange={(event) =>
                    onChange({
                      talentIds: event.target.checked
                        ? [...line.talentIds, talent.id]
                        : line.talentIds.filter((id) => id !== talent.id),
                    })
                  }
                  className="sr-only"
                />
                {talent.name}
              </label>
            ))}
          </div>
          <p className="text-muted-foreground text-xs">
            {t("ugc_plan_talents_hint")}
          </p>
        </fieldset>
      )}

      {lineScripts.length > 0 && (
        <div className="space-y-2">
          <Label htmlFor={`existing-${line.id}`}>
            {t("ugc_plan_reuse_script")}
          </Label>
          <Select
            value={line.scriptId || "none"}
            onValueChange={(value) =>
              onChange({ scriptId: value === "none" ? "" : value })
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
    </div>
  );
}
