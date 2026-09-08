import Image from "next/image";
import { ArrowDown, ArrowRight } from "lucide-react";
import { getStaticTranslations } from "@/lib/i18n/translation/static";
import { SOURCE_LOCALE, type SupportedLocale } from "@/lib/config/i18n";
import { Button } from "@/components/ui/button";
import { ShellContainer } from "@/components/layout/page-container";
import { LocalizedLink as Link } from "@/components/localized-link";

export function Hero({
  locale = SOURCE_LOCALE,
}: { locale?: SupportedLocale } = {}) {
  const { t } = getStaticTranslations(locale);
  return (
    <section>
      <ShellContainer className="pt-10 sm:pt-14">
        <div className="mb-6 flex items-center justify-between gap-4 text-sm">
          <p className="flex items-center gap-3">
            <span className="bg-primary h-2 w-2 rounded-full" aria-hidden />
            {t("home_hero_badge")}
          </p>
          <span
            className="text-muted-foreground hidden font-mono sm:block"
            translate="no"
          >
            VibeSKU Clips / 01
          </span>
        </div>
        <div className="grid items-end gap-6 lg:grid-cols-[1.6fr_1fr] lg:gap-20">
          {/* Editorial scale is local to this media-led marketing page, not the app's title system. */}
          <h1 className="text-[clamp(2.75rem,5.6vw,5rem)] leading-[1.08] font-semibold tracking-[-0.045em] text-balance">
            {t("home_hero_title")}
            <span className="block">{t("home_hero_title_accent")}</span>
          </h1>
          <div className="flex flex-col items-start gap-5 pb-1">
            <p className="text-muted-foreground text-base leading-7 text-pretty">
              {t("home_hero_description")}
            </p>
            <Button size="lg" className="min-h-11 w-full sm:w-auto" asChild>
              <Link
                href="/signup"
                locale={locale}
                data-umami-event="signup_click"
                data-umami-event-source="homepage_hero"
              >
                {t("home_hero_primary_cta")}
                <ArrowRight aria-hidden />
              </Link>
            </Button>
          </div>
        </div>
        <div className="mt-10 grid grid-cols-[1fr_1.25fr] items-end gap-3 sm:mt-12 sm:grid-cols-[1fr_1.3fr_1fr] sm:gap-5">
          <figure className="min-w-0">
            <div className="relative aspect-[3/4] overflow-hidden rounded-lg sm:aspect-[4/5]">
              <Image
                src="/images/home/product-tumbler.webp"
                alt={t("home_demo_product_alt")}
                fill
                preload
                sizes="(min-width: 1280px) 356px, (min-width: 640px) 30vw, 43vw"
                className="object-cover"
              />
            </div>
            <figcaption className="flex min-h-14 items-start justify-between gap-2 pt-3 text-sm sm:min-h-0">
              <span>{t("home_scene_product")}</span>
              <span
                className="text-muted-foreground font-mono text-xs"
                translate="no"
              >
                01
              </span>
            </figcaption>
          </figure>
          <figure className="min-w-0">
            <div className="relative aspect-[3/4] overflow-hidden rounded-lg sm:aspect-square">
              <Image
                src="/images/home/creator-tumbler.webp"
                alt={t("home_demo_image_alt")}
                fill
                preload
                sizes="(min-width: 1280px) 464px, (min-width: 640px) 40vw, 53vw"
                className="object-cover object-[center_38%]"
              />
            </div>
            <figcaption className="flex min-h-14 items-start justify-between gap-2 pt-3 text-sm sm:min-h-0">
              <span>{t("home_scene_creator")}</span>
              <span
                className="text-muted-foreground font-mono text-xs"
                translate="no"
              >
                02
              </span>
            </figcaption>
          </figure>
          <figure className="hidden min-w-0 sm:block">
            <div className="relative aspect-[4/5] overflow-hidden rounded-lg">
              <Image
                src="/images/home/detail-tumbler.webp"
                alt={t("home_demo_detail_alt")}
                fill
                sizes="(min-width: 1280px) 356px, 30vw"
                className="object-cover"
              />
            </div>
            <figcaption className="flex min-h-14 items-start justify-between gap-2 pt-3 text-sm sm:min-h-0">
              <span>{t("home_scene_detail")}</span>
              <span
                className="text-muted-foreground font-mono text-xs"
                translate="no"
              >
                03
              </span>
            </figcaption>
          </figure>
        </div>
        <div className="mt-6 flex flex-col justify-between gap-4 border-b pb-8 sm:flex-row sm:items-center">
          <p className="text-muted-foreground text-xs leading-5">
            {t("home_demo_disclosure")}
          </p>
          <a
            href="#how-it-works"
            className="focus-visible:outline-ring flex min-h-11 items-center gap-3 text-sm font-medium underline-offset-4 hover:underline focus-visible:outline-2"
          >
            {t("home_hero_secondary_cta")}
            <ArrowDown className="size-4" aria-hidden />
          </a>
        </div>
      </ShellContainer>
    </section>
  );
}
