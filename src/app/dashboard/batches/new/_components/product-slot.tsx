"use client";

import { useId, useState } from "react";
import Image from "next/image";
import { Check, ChevronDown, ImagePlus, Link2, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ImageField } from "@/components/ugc/image-field";
import { useTranslation } from "@/lib/i18n/translation/client";
import { isProductUrl, productNameFromUrl } from "@/lib/ugc/product-name";
import type { ProductRow } from "@/lib/ugc/queries";

/** The sentinel a plan line carries until the draft product actually exists. */
export const NEW_PRODUCT = "new";

export interface ProductDraft {
  /** A link, or a plain product name when the operator uploads images instead. */
  entry: string;
  images: string[];
}

export const emptyDraft: ProductDraft = { entry: "", images: [] };

export function draftName(draft: ProductDraft): string {
  const entry = draft.entry.trim();
  return productNameFromUrl(entry, entry);
}

export function draftIsUsable(draft: ProductDraft): boolean {
  return (
    draftName(draft).length > 0 &&
    (isProductUrl(draft.entry) || draft.images.length > 0)
  );
}

/**
 * One field for the thing the batch is actually about. A link, a name with
 * images, or a product that already exists all fill the same slot, so nobody
 * has to visit the product library and come back before they can start.
 */
export function ProductSlot({
  products,
  value,
  onValueChange,
  draft,
  onDraftChange,
}: {
  products: ProductRow[];
  value: string;
  onValueChange: (value: string) => void;
  draft: ProductDraft;
  onDraftChange: (draft: ProductDraft) => void;
}) {
  const { t } = useTranslation();
  const fieldId = useId();
  const [photosOpen, setPhotosOpen] = useState(false);
  const selected = products.find((product) => product.id === value);
  const isDraft = value === NEW_PRODUCT;
  const linked = isProductUrl(draft.entry);
  // Photos are the whole input when there is no link to read, and an optional
  // extra once there is one — so the dropzone only takes the space it earns.
  const showPhotos = !linked || photosOpen || draft.images.length > 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <Label htmlFor={fieldId}>{t("ugc_plan_product")}</Label>
          {isDraft ? (
            <div className="relative">
              <Link2
                className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
                aria-hidden="true"
              />
              <Input
                id={fieldId}
                value={draft.entry}
                onChange={(event) =>
                  onDraftChange({ ...draft, entry: event.target.value })
                }
                placeholder={t("ugc_plan_product_entry_placeholder")}
                className="pl-9"
                autoComplete="off"
              />
            </div>
          ) : (
            <Select value={value} onValueChange={onValueChange}>
              <SelectTrigger id={fieldId}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {products.map((product) => (
                  <SelectItem key={product.id} value={product.id}>
                    {product.name}
                  </SelectItem>
                ))}
                <SelectItem value={NEW_PRODUCT}>
                  {t("ugc_plan_product_new")}
                </SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>

        {isDraft && products.length > 0 && (
          <Select value={value} onValueChange={onValueChange}>
            <SelectTrigger
              className="w-48"
              aria-label={t("ugc_plan_product_existing")}
            >
              <SelectValue placeholder={t("ugc_plan_product_existing")} />
            </SelectTrigger>
            <SelectContent>
              {products.map((product) => (
                <SelectItem key={product.id} value={product.id}>
                  {product.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {isDraft ? (
        <>
          <p className="text-muted-foreground text-xs">
            {linked
              ? t("ugc_plan_product_will_read", { name: draftName(draft) })
              : t("ugc_plan_product_entry_hint")}
          </p>
          <Collapsible open={showPhotos} onOpenChange={setPhotosOpen}>
            {!showPhotos && (
              <CollapsibleTrigger asChild>
                <Button variant="outline" size="sm">
                  <ImagePlus />
                  {t("ugc_plan_photos_optional")}
                  <ChevronDown aria-hidden="true" />
                </Button>
              </CollapsibleTrigger>
            )}
            <CollapsibleContent>
              <ImageField
                value={draft.images}
                onChange={(images) => onDraftChange({ ...draft, images })}
                maxFiles={8}
                label={t("ugc_product_images")}
              />
            </CollapsibleContent>
          </Collapsible>
        </>
      ) : (
        selected && (
          <div className="border-border flex items-center gap-3 rounded-lg border px-3 py-2">
            {selected.images[0] ? (
              <div className="border-border relative size-10 shrink-0 overflow-hidden rounded-md border">
                <Image
                  src={selected.images[0]}
                  alt=""
                  fill
                  sizes="40px"
                  className="object-cover"
                  unoptimized
                />
              </div>
            ) : (
              <Package className="text-muted-foreground size-5 shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{selected.name}</p>
              <p className="text-muted-foreground truncate text-xs">
                {selected.facts?.summary ?? t("ugc_plan_product_no_facts_yet")}
              </p>
            </div>
            {selected.status === "ready" && (
              <Check className="text-primary size-4 shrink-0" aria-hidden />
            )}
          </div>
        )
      )}
    </div>
  );
}
