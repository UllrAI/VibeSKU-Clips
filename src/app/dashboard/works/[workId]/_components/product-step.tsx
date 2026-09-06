"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ChevronDown, Loader2, SquarePen, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
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
  contentLocaleKey,
  marketKey,
} from "@/components/ugc/labels";
import { TemplatePicker } from "@/components/ugc/template-picker";
import { VideoSettings } from "@/components/ugc/video-settings";
import { useTranslation } from "@/lib/i18n/translation/client";
import type {
  ScriptTemplate,
  VideoAspectRatio,
  VideoMode,
  VideoResolution,
} from "@/lib/ugc/constants";
import type { ProductRow, TalentRow } from "@/lib/ugc/queries";
import { setWorkSetup, startWorkScript } from "@/lib/ugc/work-actions";
import type { WorkDetail } from "@/lib/ugc/works";
import { StepCard } from "./step-card";

const NO_TALENT = "none";
const RANDOM_TALENT = "random";

/**
 * The first step is a confirmation, not a form: the composer already asked
 * what this clip sells and who presents it. What is worth a person's time
 * here is what the system understood from the material, because that is what
 * the script will be written from — and it is still free to change.
 */
export function ProductStep({
  detail,
  products,
  talents,
  productState,
  resolutionOptions,
  onRefresh,
}: {
  detail: WorkDetail;
  products: ProductRow[];
  talents: TalentRow[];
  productState: "empty" | "reading" | "needs_input" | "ready";
  resolutionOptions: readonly VideoResolution[];
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  const [pending, startTransition] = useTransition();
  const { work, product } = detail;
  const [productId, setProductId] = useState(work.productId ?? "");
  const [talentId, setTalentId] = useState(work.talentId ?? NO_TALENT);
  const [locale, setLocale] = useState(work.locale);
  const [market, setMarket] = useState(work.market);
  const [template, setTemplate] = useState<ScriptTemplate>(work.template);
  const [videoMode, setVideoMode] = useState<VideoMode>(work.videoMode);
  const [aspectRatio, setAspectRatio] = useState<VideoAspectRatio>(
    work.aspectRatio,
  );
  const [resolution, setResolution] = useState<VideoResolution>(
    work.resolution,
  );

  const save = () =>
    setWorkSetup(work.id, {
      productId,
      talentId:
        talentId === NO_TALENT || talentId === RANDOM_TALENT
          ? undefined
          : talentId,
      randomTalent: talentId === RANDOM_TALENT,
      locale,
      market,
      template,
      videoMode,
      aspectRatio,
      resolution,
    });

  const apply = () =>
    startTransition(async () => {
      const result = await save();
      if (!result.ok) {
        toast.error(t(actionMessageKey(result.code)));
        return;
      }
      toast.success(t("ugc_work_setup_saved"));
      onRefresh();
    });

  const confirm = () =>
    startTransition(async () => {
      const saved = await save();
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

  return (
    <StepCard
      title={t("ugc_work_step_product")}
      description={t("ugc_work_product_hint")}
      action={
        <Button
          onClick={confirm}
          disabled={pending || !productId || productState !== "ready"}
        >
          {pending && (
            <Loader2
              className="animate-spin motion-reduce:animate-none"
              aria-hidden
            />
          )}
          {t("ugc_work_confirm_product")}
        </Button>
      }
      secondary={
        product && (
          <Button asChild variant="ghost" size="sm">
            <Link href={`/dashboard/products/${product.id}`}>
              <SquarePen />
              {t("ugc_work_edit_product")}
            </Link>
          </Button>
        )
      }
    >
      {productState === "reading" && <ReadingFacts />}

      {productState === "needs_input" && product && (
        <Alert>
          <TriangleAlert />
          <AlertTitle>{t("ugc_product_needs_input_title")}</AlertTitle>
          <AlertDescription>
            {product.issue ?? t("ugc_work_product_needs_input")}
          </AlertDescription>
        </Alert>
      )}

      {product?.facts && (
        <dl className="space-y-3 text-sm">
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

      <Collapsible className="border-border rounded-lg border">
        <CollapsibleTrigger className="hover:bg-accent/50 group flex w-full items-center justify-between gap-3 rounded-lg px-4 py-3 text-left transition-colors">
          <span className="text-sm font-medium">
            {t("ugc_work_setup_title")}
          </span>
          <ChevronDown
            className="text-muted-foreground size-4 shrink-0 transition-transform group-data-[state=open]:rotate-180"
            aria-hidden
          />
        </CollapsibleTrigger>
        <CollapsibleContent className="border-border space-y-4 border-t p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="work-product">{t("ugc_plan_product")}</Label>
              <Select value={productId} onValueChange={setProductId}>
                <SelectTrigger id="work-product" className="w-full">
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
            </div>
            <div className="space-y-2">
              <Label htmlFor="work-talent">{t("ugc_plan_talents")}</Label>
              <Select value={talentId} onValueChange={setTalentId}>
                <SelectTrigger id="work-talent" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_TALENT}>
                    {t("ugc_work_no_talent")}
                  </SelectItem>
                  <SelectItem value={RANDOM_TALENT}>
                    {t("ugc_work_random_talent")}
                  </SelectItem>
                  {talents.map((entry) => (
                    <SelectItem key={entry.id} value={entry.id}>
                      {entry.name}
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
          </div>

          <TemplatePicker value={template} onChange={setTemplate} />

          <VideoSettings
            videoMode={videoMode}
            onVideoModeChange={setVideoMode}
            aspectRatio={aspectRatio}
            onAspectRatioChange={setAspectRatio}
            resolution={resolution}
            onResolutionChange={setResolution}
            resolutionOptions={resolutionOptions}
          />

          <div className="grid gap-4 sm:grid-cols-2">
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
          </div>

          <Button
            variant="outline"
            size="sm"
            disabled={pending || !productId}
            onClick={apply}
          >
            {t("ugc_common_save")}
          </Button>
        </CollapsibleContent>
      </Collapsible>
    </StepCard>
  );
}

/** The product is still being read; say so in the shape of the answer. */
function ReadingFacts() {
  const { t } = useTranslation();
  return (
    <div className="space-y-3">
      <p className="text-muted-foreground flex items-center gap-2 text-sm">
        <Loader2
          className="size-4 animate-spin motion-reduce:animate-none"
          aria-hidden
        />
        {t("ugc_work_product_reading")}
      </p>
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
    </div>
  );
}
