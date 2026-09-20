"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useTranslation } from "@/lib/i18n/translation/client";
import { MAX_PRODUCT_IMAGES } from "@/lib/ugc/constants";
import type { ProductInput } from "@/lib/ugc/product-input";
import { ImageField } from "./image-field";

export function ProductFields({
  idPrefix,
  value,
  onChange,
}: {
  idPrefix: string;
  value: ProductInput;
  onChange: (value: ProductInput) => void;
}) {
  const { t } = useTranslation();
  const update = <Key extends keyof ProductInput>(
    key: Key,
    next: ProductInput[Key],
  ) => onChange({ ...value, [key]: next });

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-source`}>
          {t("ugc_product_source_url")}
        </Label>
        <Input
          id={`${idPrefix}-source`}
          type="url"
          inputMode="url"
          value={value.sourceUrl}
          onChange={(event) => update("sourceUrl", event.target.value)}
          placeholder="https://"
        />
        <p className="text-muted-foreground text-xs">
          {t("ugc_product_source_url_hint")}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-name`}>{t("ugc_product_name")}</Label>
        <Input
          id={`${idPrefix}-name`}
          value={value.name}
          onChange={(event) => update("name", event.target.value)}
          placeholder={t("ugc_product_name_placeholder")}
        />
      </div>

      <ImageField
        value={value.images}
        onChange={(images) => update("images", images)}
        maxFiles={MAX_PRODUCT_IMAGES}
        label={t("ugc_product_images")}
      />

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-info`}>{t("ugc_product_info")}</Label>
        <Textarea
          id={`${idPrefix}-info`}
          rows={5}
          maxLength={40_000}
          value={value.info}
          onChange={(event) => update("info", event.target.value)}
          placeholder={t("ugc_product_info_placeholder")}
        />
        <p className="text-muted-foreground text-xs">
          {t("ugc_product_info_hint")}
        </p>
      </div>
    </div>
  );
}
