"use client";

import { useId } from "react";
import {
  TEMPLATE_OPTIONS,
  templateDescriptionKey,
  templateKey,
} from "@/components/ugc/labels";
import { useTranslation } from "@/lib/i18n/translation/client";
import type { ScriptTemplate } from "@/lib/ugc/constants";
import { cn } from "@/lib/utils";

/**
 * What kind of clip this is. Three cards rather than a select, because the
 * choice changes how the fifteen seconds are spent and the difference is
 * worth reading before picking.
 */
export function TemplatePicker({
  value,
  onChange,
  disabled,
}: {
  value: ScriptTemplate;
  onChange: (value: ScriptTemplate) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const name = useId();

  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="mb-2 text-sm font-medium">
        {t("ugc_plan_template")}
      </legend>
      <div className="grid gap-2 sm:grid-cols-3">
        {TEMPLATE_OPTIONS.map((entry) => (
          <label
            key={entry}
            className={cn(
              "border-border hover:bg-accent/50 has-checked:border-primary has-checked:bg-accent/50 rounded-lg border px-3 py-2.5 transition-colors",
              "has-focus-visible:ring-ring has-focus-visible:ring-[3px]",
              disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
            )}
          >
            <input
              type="radio"
              name={name}
              value={entry}
              checked={value === entry}
              onChange={() => onChange(entry)}
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
  );
}
