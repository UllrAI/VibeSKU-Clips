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
import { ImageField } from "@/components/ugc/image-field";
import {
  LOCALE_OPTIONS,
  MARKET_OPTIONS,
  contentLocaleKey,
  marketKey,
  videoModeKey,
} from "@/components/ugc/labels";
import { StatusBadge } from "@/components/ugc/status-badge";
import { TemplatePicker } from "@/components/ugc/template-picker";
import { useTranslation } from "@/lib/i18n/translation/client";
import type { ScriptTemplate, VideoMode } from "@/lib/ugc/constants";
import { createProduct } from "@/lib/ugc/actions";
import type { ProductRow, TalentRow } from "@/lib/ugc/queries";
import { createWork } from "@/lib/ugc/work-actions";

const NO_TALENT = "none";
const RANDOM_TALENT = "random";

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
  initialProductId,
}: {
  products: ProductRow[];
  talents: TalentRow[];
  initialProductId?: string;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [source, setSource] = useState<"library" | "new">(
    products.length > 0 ? "library" : "new",
  );
  const [productId, setProductId] = useState(initialProductId ?? "");
  const [name, setName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [variant, setVariant] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [productionDirection, setProductionDirection] = useState("");
  const [talentId, setTalentId] = useState(NO_TALENT);
  const [template, setTemplate] = useState<ScriptTemplate>("spokesperson");
  const [videoMode, setVideoMode] = useState<VideoMode>("one_take");
  const [locale, setLocale] = useState("en");
  const [market, setMarket] = useState("US");

  const chosen = products.find((product) => product.id === productId);
  const availableTalents = talents.filter(
    (talent) => talent.status === "ready" && talent.imageUrl,
  );
  const ready =
    source === "library"
      ? Boolean(productId)
      : name.trim().length > 0 &&
        (sourceUrl.trim().length > 0 || images.length > 0);

  const start = () =>
    startTransition(async () => {
      let id = productId;

      if (source === "new") {
        const created = await createProduct({
          name: name.trim(),
          sourceUrl: sourceUrl.trim(),
          variant: variant.trim(),
          market,
          images,
          brief: {
            providedScript: productionDirection.trim() || undefined,
          },
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
        locale,
        market,
        template,
        videoMode,
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
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="work-new-name">{t("ugc_product_name")}</Label>
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
              maxFiles={8}
              label={t("ugc_product_images")}
            />
            <div className="space-y-2">
              <Label htmlFor="work-new-production-direction">
                {t("ugc_brief_script")}
              </Label>
              <Textarea
                id="work-new-production-direction"
                rows={6}
                value={productionDirection}
                onChange={(event) => setProductionDirection(event.target.value)}
                placeholder={t("ugc_brief_script_hint")}
              />
            </div>
            <p className="text-muted-foreground text-xs">
              {t("ugc_work_new_product_hint")}
            </p>
          </TabsContent>
        </Tabs>

        <TemplatePicker value={template} onChange={setTemplate} />

        <div className="space-y-2">
          <Label htmlFor="work-video-mode">{t("ugc_video_mode")}</Label>
          <Select
            value={videoMode}
            onValueChange={(value) => setVideoMode(value as VideoMode)}
          >
            <SelectTrigger id="work-video-mode" className="w-full sm:w-72">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="one_take">
                {t(videoModeKey("one_take"))}
              </SelectItem>
              <SelectItem value="storyboard">
                {t(videoModeKey("storyboard"))}
              </SelectItem>
            </SelectContent>
          </Select>
          <p className="text-muted-foreground text-xs">
            {t(`ugc_video_mode_${videoMode}_hint`)}
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="work-talent">{t("ugc_plan_talents")}</Label>
          <Select value={talentId} onValueChange={setTalentId}>
            <SelectTrigger id="work-talent" className="w-full sm:w-72">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_TALENT}>
                {t("ugc_work_no_talent")}
              </SelectItem>
              <SelectItem value={RANDOM_TALENT}>
                {t("ugc_work_random_talent")}
              </SelectItem>
              {availableTalents.map((talent) => (
                <SelectItem key={talent.id} value={talent.id}>
                  {talent.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {talentId === RANDOM_TALENT && (
            <p className="text-muted-foreground text-xs">
              {t("ugc_work_random_talent_hint")}
            </p>
          )}
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
