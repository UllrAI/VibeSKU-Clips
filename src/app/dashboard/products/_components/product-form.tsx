"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ImageField } from "@/components/ugc/image-field";
import { MARKET_OPTIONS, marketKey } from "@/components/ugc/labels";
import { useTranslation } from "@/lib/i18n/translation/client";
import { createProduct, updateProduct } from "@/lib/ugc/actions";
import type { ProductRow } from "@/lib/ugc/queries";
import { actionMessageKey } from "@/components/ugc/action-message";

interface ProductFormState {
  name: string;
  sourceUrl: string;
  variant: string;
  market: string;
  images: string[];
  audience: string;
  sellingPoints: string;
  tone: string;
  scenes: string;
  bannedPhrases: string;
  providedScript: string;
}

function toState(product: ProductRow | null): ProductFormState {
  return {
    name: product?.name ?? "",
    sourceUrl: product?.sourceUrl ?? "",
    variant: product?.variant ?? "",
    market: product?.market ?? "",
    images: product?.images ?? [],
    audience: product?.brief?.audience ?? "",
    sellingPoints: (product?.brief?.sellingPoints ?? []).join("\n"),
    tone: product?.brief?.tone ?? "",
    scenes: product?.brief?.scenes ?? "",
    bannedPhrases: (product?.brief?.bannedPhrases ?? []).join("\n"),
    providedScript: product?.brief?.providedScript ?? "",
  };
}

function toLines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function ProductForm({
  product,
  open,
  onOpenChange,
}: {
  product: ProductRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<ProductFormState>(() => toState(product));

  const update = <Key extends keyof ProductFormState>(
    key: Key,
    value: ProductFormState[Key],
  ) => setState((current) => ({ ...current, [key]: value }));

  const submit = () => {
    const payload = {
      name: state.name.trim(),
      sourceUrl: state.sourceUrl.trim(),
      variant: state.variant.trim(),
      market: state.market,
      images: state.images,
      brief: {
        audience: state.audience.trim() || undefined,
        sellingPoints: toLines(state.sellingPoints),
        tone: state.tone.trim() || undefined,
        scenes: state.scenes.trim() || undefined,
        bannedPhrases: toLines(state.bannedPhrases),
        providedScript: state.providedScript.trim() || undefined,
      },
    };

    startTransition(async () => {
      const result = product
        ? await updateProduct(product.id, payload)
        : await createProduct(payload);
      if (!result.ok) {
        toast.error(t(actionMessageKey(result.code)));
        return;
      }
      toast.success(t(product ? "ugc_product_updated" : "ugc_product_created"));
      onOpenChange(false);
      router.refresh();
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {product ? t("ugc_product_edit_title") : t("ugc_product_new_title")}
          </DialogTitle>
          <DialogDescription>
            {t("ugc_product_form_description")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="product-name">{t("ugc_product_name")}</Label>
              <Input
                id="product-name"
                value={state.name}
                onChange={(event) => update("name", event.target.value)}
                placeholder={t("ugc_product_name_placeholder")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="product-source">
                {t("ugc_product_source_url")}
              </Label>
              <Input
                id="product-source"
                type="url"
                inputMode="url"
                value={state.sourceUrl}
                onChange={(event) => update("sourceUrl", event.target.value)}
                placeholder="https://"
              />
              <p className="text-muted-foreground text-xs">
                {t("ugc_product_source_url_hint")}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="product-variant">
                {t("ugc_product_variant")}
              </Label>
              <Input
                id="product-variant"
                value={state.variant}
                onChange={(event) => update("variant", event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="product-market">{t("ugc_product_market")}</Label>
              <Select
                value={state.market}
                onValueChange={(value) => update("market", value)}
              >
                <SelectTrigger id="product-market">
                  <SelectValue placeholder={t("ugc_common_not_set")} />
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
          </div>

          <ImageField
            value={state.images}
            onChange={(images) => update("images", images)}
            maxFiles={8}
            label={t("ugc_product_images")}
          />

          <div className="space-y-4">
            <div>
              <h3 className="text-base font-medium">{t("ugc_brief_title")}</h3>
              <p className="text-muted-foreground text-sm">
                {t("ugc_brief_description")}
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="brief-audience">
                  {t("ugc_brief_audience")}
                </Label>
                <Input
                  id="brief-audience"
                  value={state.audience}
                  onChange={(event) => update("audience", event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="brief-tone">{t("ugc_brief_tone")}</Label>
                <Input
                  id="brief-tone"
                  value={state.tone}
                  onChange={(event) => update("tone", event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="brief-points">
                  {t("ugc_brief_selling_points")}
                </Label>
                <Textarea
                  id="brief-points"
                  rows={3}
                  value={state.sellingPoints}
                  onChange={(event) =>
                    update("sellingPoints", event.target.value)
                  }
                  placeholder={t("ugc_brief_one_per_line")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="brief-banned">{t("ugc_brief_banned")}</Label>
                <Textarea
                  id="brief-banned"
                  rows={3}
                  value={state.bannedPhrases}
                  onChange={(event) =>
                    update("bannedPhrases", event.target.value)
                  }
                  placeholder={t("ugc_brief_one_per_line")}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="brief-scenes">{t("ugc_brief_scenes")}</Label>
                <Input
                  id="brief-scenes"
                  value={state.scenes}
                  onChange={(event) => update("scenes", event.target.value)}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="brief-script">{t("ugc_brief_script")}</Label>
                <Textarea
                  id="brief-script"
                  rows={4}
                  value={state.providedScript}
                  onChange={(event) =>
                    update("providedScript", event.target.value)
                  }
                />
                <p className="text-muted-foreground text-xs">
                  {t("ugc_brief_script_hint")}
                </p>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            {t("ugc_common_cancel")}
          </Button>
          <Button onClick={submit} disabled={pending || !state.name.trim()}>
            {product ? t("ugc_common_save") : t("ugc_product_create_and_read")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
