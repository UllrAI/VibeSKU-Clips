"use client";

import { useState, useTransition, type KeyboardEvent } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
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
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { actionMessageKey } from "@/components/ugc/action-message";
import {
  NO_SCENE,
  NO_TALENT,
  RANDOM_TALENT,
  SceneField,
  TalentField,
  selectableScenes,
  selectableTalents,
} from "@/components/ugc/cast-fields";
import { ImageField } from "@/components/ugc/image-field";
import {
  LOCALE_OPTIONS,
  MARKET_OPTIONS,
  contentLocaleKey,
  marketKey,
} from "@/components/ugc/labels";
import { StatusBadge } from "@/components/ugc/status-badge";
import { TemplatePicker } from "@/components/ugc/template-picker";
import { VideoSettings } from "@/components/ugc/video-settings";
import { useTranslation } from "@/lib/i18n/translation/client";
import type {
  ScriptTemplate,
  VideoAspectRatio,
  VideoMode,
  VideoModel,
  VideoModelOption,
  VideoResolution,
} from "@/lib/ugc/constants";
import { createProduct, createProductFromUrl } from "@/lib/ugc/actions";
import { MAX_PRODUCT_IMAGES } from "@/lib/ugc/constants";
import type { ProductRow, SceneRow, TalentRow } from "@/lib/ugc/queries";
import { createWork } from "@/lib/ugc/work-actions";

/**
 * Everything the first step needs, asked once. The product is the subject, so
 * it sits on top; a product that does not exist yet is created here rather
 * than in another route the operator has to come back from. Once this is
 * confirmed the script is written straight away, because the answers above
 * are exactly what the model is given.
 */
export function WorkComposer({
  products,
  talents,
  scenes,
  initialProductId,
  modelOptions,
}: {
  products: ProductRow[];
  talents: TalentRow[];
  scenes: SceneRow[];
  initialProductId?: string;
  modelOptions: readonly VideoModelOption[];
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [source, setSource] = useState<"library" | "new">(
    products.length > 0 ? "library" : "new",
  );
  const [newProductMode, setNewProductMode] = useState<"manual" | "url">(
    "manual",
  );
  const [productId, setProductId] = useState(initialProductId ?? "");
  const [name, setName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [variant, setVariant] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [creativeDirection, setCreativeDirection] = useState("");
  const [talentId, setTalentId] = useState(NO_TALENT);
  const [sceneId, setSceneId] = useState(NO_SCENE);
  const [template, setTemplate] = useState<ScriptTemplate>("spokesperson");
  const [videoMode, setVideoMode] = useState<VideoMode>("one_take");
  const [videoModel, setVideoModel] = useState<VideoModel>("h3");
  const [aspectRatio, setAspectRatio] = useState<VideoAspectRatio>("9:16");
  const [resolution, setResolution] = useState<VideoResolution>("720p");
  const [locale, setLocale] = useState("en");
  const [market, setMarket] = useState("US");

  const chosen = products.find((product) => product.id === productId);
  const availableTalents = selectableTalents(talents);
  const availableScenes = selectableScenes(scenes);
  const ready =
    source === "library"
      ? Boolean(productId)
      : newProductMode === "url"
        ? sourceUrl.trim().length > 0
        : name.trim().length > 0 &&
          (sourceUrl.trim().length > 0 || images.length > 0);

  const start = () =>
    startTransition(async () => {
      let id = productId;

      if (source === "new") {
        const created =
          newProductMode === "url"
            ? await createProductFromUrl({
                sourceUrl: sourceUrl.trim(),
                market,
              })
            : await createProduct({
                name: name.trim(),
                sourceUrl: sourceUrl.trim(),
                variant: variant.trim(),
                market,
                images,
              });
        if (!created.ok || !created.id) {
          toast.error(t(actionMessageKey(created.code)));
          return;
        }
        id = created.id;
      }

      const work = await createWork({
        productId: id,
        talentId:
          talentId === NO_TALENT || talentId === RANDOM_TALENT
            ? undefined
            : talentId,
        randomTalent: talentId === RANDOM_TALENT,
        sceneId: sceneId === NO_SCENE ? undefined : sceneId,
        locale,
        market,
        template,
        creativeDirection: creativeDirection.trim() || undefined,
        videoMode,
        videoModel,
        aspectRatio,
        resolution,
      });
      if (!work.ok || !work.id) {
        toast.error(t(actionMessageKey(work.code)));
        return;
      }
      router.push(`/dashboard/works/${work.id}`);
    });

  const submitOnMeta = (event: KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && ready) {
      event.preventDefault();
      start();
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("ugc_work_new_title")}</CardTitle>
        <CardDescription>{t("ugc_work_new_hint")}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-5" onKeyDown={submitOnMeta}>
        <Tabs
          value={source}
          onValueChange={(value) => setSource(value as "library" | "new")}
        >
          <TabsList>
            <TabsTrigger value="library" disabled={products.length === 0}>
              {t("ugc_work_source_library")}
            </TabsTrigger>
            <TabsTrigger value="new">{t("ugc_work_source_new")}</TabsTrigger>
          </TabsList>

          <TabsContent value="library" className="mt-4 space-y-3">
            <div className="space-y-2">
              <Label htmlFor="work-product">{t("ugc_plan_product")}</Label>
              <Select value={productId} onValueChange={setProductId}>
                <SelectTrigger id="work-product" className="w-full">
                  <SelectValue placeholder={t("ugc_work_pick_product")} />
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

            {chosen && (
              <div className="border-border flex items-start gap-3 rounded-lg border p-3">
                {chosen.images[0] && (
                  <div className="border-border relative size-12 shrink-0 overflow-hidden rounded-md border">
                    <Image
                      src={chosen.images[0]}
                      alt=""
                      fill
                      sizes="48px"
                      className="object-cover"
                      unoptimized
                    />
                  </div>
                )}
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-medium">
                      {chosen.name}
                    </p>
                    <StatusBadge kind="product" status={chosen.status} />
                  </div>
                  <p className="text-muted-foreground line-clamp-2 text-xs">
                    {chosen.facts?.summary ??
                      chosen.issue ??
                      t("ugc_work_product_reading")}
                  </p>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="new" className="mt-4 space-y-4">
            <Tabs
              value={newProductMode}
              onValueChange={(value) =>
                setNewProductMode(value as "manual" | "url")
              }
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="manual">
                  {t("ugc_product_create_manual_tab")}
                </TabsTrigger>
                <TabsTrigger value="url">
                  {t("ugc_product_create_url_tab")}
                </TabsTrigger>
              </TabsList>
              <TabsContent value="manual" className="mt-4 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="work-new-name">
                      {t("ugc_product_name")}
                    </Label>
                    <Input
                      id="work-new-name"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      placeholder={t("ugc_product_name_placeholder")}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="work-new-source">
                      {t("ugc_product_source_url")}
                    </Label>
                    <Input
                      id="work-new-source"
                      type="url"
                      inputMode="url"
                      value={sourceUrl}
                      onChange={(event) => setSourceUrl(event.target.value)}
                      placeholder="https://"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="work-new-variant">
                      {t("ugc_product_variant")}
                    </Label>
                    <Input
                      id="work-new-variant"
                      value={variant}
                      onChange={(event) => setVariant(event.target.value)}
                    />
                  </div>
                </div>
                <ImageField
                  value={images}
                  onChange={setImages}
                  maxFiles={MAX_PRODUCT_IMAGES}
                  label={t("ugc_product_images")}
                />
              </TabsContent>
              <TabsContent value="url" className="mt-4 space-y-2">
                <Label htmlFor="work-new-import-url">
                  {t("ugc_product_import_url")}
                </Label>
                <Input
                  id="work-new-import-url"
                  type="url"
                  inputMode="url"
                  value={sourceUrl}
                  onChange={(event) => setSourceUrl(event.target.value)}
                  placeholder="https://"
                />
                <p className="text-muted-foreground text-xs">
                  {t("ugc_product_import_url_hint")}
                </p>
              </TabsContent>
            </Tabs>
            <p className="text-muted-foreground text-xs">
              {t("ugc_work_new_product_hint")}
            </p>
          </TabsContent>
        </Tabs>

        <div className="space-y-2">
          <Label htmlFor="work-creative-direction">
            {t("ugc_work_creative_direction")}
          </Label>
          <Textarea
            id="work-creative-direction"
            rows={4}
            maxLength={6000}
            value={creativeDirection}
            onChange={(event) => setCreativeDirection(event.target.value)}
            placeholder={t("ugc_work_creative_direction_hint")}
          />
          <p className="text-muted-foreground text-xs">
            {t("ugc_work_creative_direction_description")}
          </p>
        </div>

        <TemplatePicker value={template} onChange={setTemplate} />

        <VideoSettings
          videoMode={videoMode}
          onVideoModeChange={setVideoMode}
          videoModel={videoModel}
          onVideoModelChange={setVideoModel}
          aspectRatio={aspectRatio}
          onAspectRatioChange={setAspectRatio}
          resolution={resolution}
          onResolutionChange={setResolution}
          modelOptions={modelOptions}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <TalentField
            id="work-talent"
            value={talentId}
            onChange={setTalentId}
            talents={availableTalents}
          />
          <SceneField
            id="work-scene"
            value={sceneId}
            onChange={setSceneId}
            scenes={availableScenes}
          />
        </div>

        <Collapsible className="border-border rounded-lg border">
          <CollapsibleTrigger className="hover:bg-accent/50 group flex w-full items-center justify-between gap-3 rounded-lg px-4 py-3 text-left transition-colors">
            <span>
              <span className="block text-sm font-medium">
                {t("ugc_work_delivery_title")}
              </span>
              <span className="text-muted-foreground block text-xs">
                {t(contentLocaleKey(locale))} · {t(marketKey(market))}
              </span>
            </span>
            <ChevronDown
              className="text-muted-foreground size-4 shrink-0 transition-transform group-data-[state=open]:rotate-180"
              aria-hidden
            />
          </CollapsibleTrigger>
          <CollapsibleContent className="border-border grid gap-4 border-t p-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="work-locale">{t("ugc_plan_locale")}</Label>
              <Select value={locale} onValueChange={setLocale}>
                <SelectTrigger id="work-locale" className="w-full">
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
                <SelectTrigger id="work-market" className="w-full">
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
          </CollapsibleContent>
        </Collapsible>
      </CardContent>

      <CardFooter className="flex flex-wrap items-center justify-between gap-3 border-t">
        <p className="text-muted-foreground text-xs">
          {t("ugc_work_new_cost_hint")}
        </p>
        <Button onClick={start} disabled={pending || !ready}>
          {pending ? (
            <Loader2
              className="animate-spin motion-reduce:animate-none"
              aria-hidden
            />
          ) : (
            <Sparkles aria-hidden />
          )}
          {t("ugc_work_new_start")}
        </Button>
      </CardFooter>
    </Card>
  );
}
