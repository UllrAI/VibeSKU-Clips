import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ShellContainer } from "@/components/layout/page-container";
import { LocalizedLink as Link } from "@/components/localized-link";
import { getStaticTranslations } from "@/lib/i18n/translation/static";
import { SOURCE_LOCALE, type SupportedLocale } from "@/lib/config/i18n";

export function CallToAction({
  locale = SOURCE_LOCALE,
}: { locale?: SupportedLocale } = {}) {
  const { t } = getStaticTranslations(locale);
  return (
    <section>
      <ShellContainer>
        <div className="flex flex-col items-start gap-8 border-t py-16 sm:py-24">
          <p className="text-muted-foreground flex items-center gap-4 text-sm">
            <span className="font-mono" translate="no">
              04 /
            </span>
            {t("home_cta_eyebrow")}
          </p>
          <div className="grid w-full items-end gap-8 lg:grid-cols-[1.4fr_1fr] lg:gap-24">
            <h2 className="text-4xl leading-[1.1] font-semibold tracking-tight text-balance whitespace-pre-line sm:text-6xl">
              {t("home_cta_title")}
            </h2>
            <div className="space-y-6">
              <p className="text-muted-foreground text-base leading-7">
                {t("home_cta_description")}
              </p>
              <Button size="lg" className="min-h-12 w-full sm:w-auto" asChild>
                <Link
                  href="/signup"
                  locale={locale}
                  data-umami-event="signup_click"
                  data-umami-event-source="homepage_footer"
                >
                  {t("home_cta_primary")}
                  <ArrowUpRight aria-hidden />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </ShellContainer>
    </section>
  );
}
