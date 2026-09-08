"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ImageField } from "@/components/ugc/image-field";
import { MARKET_OPTIONS, marketKey } from "@/components/ugc/labels";
import { useTranslation } from "@/lib/i18n/translation/client";
import {
  createProduct,
  createProductFromUrl,
  updateProduct,
} from "@/lib/ugc/actions";
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
  const [createMode, setCreateMode] = useState<"manual" | "url">("manual");
  const [importUrl, setImportUrl] = useState("");

  const update = <Key extends keyof ProductFormState>(
    key: Key,
    value: ProductFormState[Key],
  ) => setState((current) => ({ ...current, [key]: value }));

  const submit = () => {
    if (!product && createMode === "url") {
      startTransition(async () => {
        const result = await createProductFromUrl({
          sourceUrl: importUrl.trim(),
        });
        if (!result.ok) {
          toast.error(t(actionMessageKey(result.code)));
          return;
        }
        toast.success(t("ugc_product_import_started"));
        onOpenChange(false);
        if (result.id) router.push(`/dashboard/products/${result.id}`);
      });
      return;
    }

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
      // A new product goes straight to its own page: the read it just started
      // is the next thing the operator needs to see.
      if (!product && result.id) {
        router.push(`/dashboard/products/${result.id}`);
        return;
      }
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
            {t(
              product
                ? "ugc_product_form_description"
                : "ugc_product_create_description",
            )}
          </DialogDescription>
        </DialogHeader>

        {!product ? (
          <Tabs
            value={createMode}
            onValueChange={(value) => setCreateMode(value as "manual" | "url")}
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="manual">
                {t("ugc_product_create_manual_tab")}
              </TabsTrigger>
              <TabsTrigger value="url">
                {t("ugc_product_create_url_tab")}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="manual" className="mt-6">
              <ManualProductFields state={state} update={update} />
            </TabsContent>
            <TabsContent value="url" className="mt-6 space-y-2">
              <Label htmlFor="product-import-url">
                {t("ugc_product_import_url")}
              </Label>
              <Input
                id="product-import-url"
                type="url"
                inputMode="url"
                value={importUrl}
                onChange={(event) => setImportUrl(event.target.value)}
                placeholder="https://"
              />
              <p className="text-muted-foreground text-xs">
                {t("ugc_product_import_url_hint")}
              </p>
            </TabsContent>
          </Tabs>
        ) : (
          <ManualProductFields state={state} update={update} />
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            {t("ugc_common_cancel")}
          </Button>
          <Button
            onClick={submit}
            disabled={
              pending ||
              (!product && createMode === "url"
                ? !importUrl.trim()
                : !state.name.trim())
            }
          >
            {!product && createMode === "url"
              ? t("ugc_product_import_and_review")
              : product
                ? t("ugc_common_save")
                : t("ugc_product_create_and_read")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ManualProductFields({
  state,
  update,
}: {
  state: ProductFormState;
  update: <Key extends keyof ProductFormState>(
    key: Key,
    value: ProductFormState[Key],
  ) => void;
}) {
  const { t } = useTranslation();

  return (
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
          <Label htmlFor="product-source">{t("ugc_product_source_url")}</Label>
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
          <Label htmlFor="product-variant">{t("ugc_product_variant")}</Label>
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

      <Collapsible className="border-border rounded-lg border">
        <CollapsibleTrigger className="hover:bg-accent/50 group flex w-full items-center justify-between gap-3 rounded-lg px-4 py-3 text-left transition-colors">
          <span>
            <span className="block text-sm font-medium">
              {t("ugc_brief_title")}
            </span>
            <span className="text-muted-foreground block text-xs">
              {t("ugc_brief_description")}
            </span>
          </span>
          <ChevronDown
            className="text-muted-foreground size-4 shrink-0 transition-transform group-data-[state=open]:rotate-180"
            aria-hidden
          />
        </CollapsibleTrigger>
        <CollapsibleContent className="border-border grid gap-4 border-t p-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="brief-audience">{t("ugc_brief_audience")}</Label>
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
              onChange={(event) => update("sellingPoints", event.target.value)}
              placeholder={t("ugc_brief_one_per_line")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="brief-banned">{t("ugc_brief_banned")}</Label>
            <Textarea
              id="brief-banned"
              rows={3}
              value={state.bannedPhrases}
              onChange={(event) => update("bannedPhrases", event.target.value)}
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
              rows={8}
              value={state.providedScript}
              onChange={(event) => update("providedScript", event.target.value)}
            />
            <p className="text-muted-foreground text-xs">
              {t("ugc_brief_script_hint")}
            </p>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
