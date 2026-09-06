import { getStaticTranslations } from "@/lib/i18n/translation/static";
import { SOURCE_LOCALE, type SupportedLocale } from "@/lib/config/i18n";
import React from "react";
import { ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionContainer } from "@/components/layout/page-container";
import { LocalizedLink as Link } from "@/components/localized-link";

export function CallToAction({
  locale = SOURCE_LOCALE,
}: {
  locale?: SupportedLocale;
} = {}) {
  const { t } = getStaticTranslations(locale);
  const commitments = [
    { id: "facts", label: <>{t("home_cta_point_facts")}</> },
    { id: "counts", label: <>{t("home_cta_point_counts")}</> },
    { id: "traceable", label: <>{t("home_cta_point_traceable")}</> },
  ];

  return (
    <section className="border-border border-t">
      <SectionContainer className="py-24 sm:py-28">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-foreground text-3xl font-semibold tracking-tight sm:text-4xl">
            {t("home_cta_title")}
          </h2>
          <p className="text-muted-foreground mt-5 text-lg leading-8">
            {t("home_cta_description")}
          </p>

          <ul className="text-muted-foreground mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm">
            {commitments.map(({ id, label }) => (
              <li key={id} className="inline-flex items-center gap-2">
                <Check className="text-primary size-4" aria-hidden />
                {label}
              </li>
            ))}
          </ul>

          <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Button size="lg" asChild>
              <Link href="/signup" locale={locale}>
                {t("home_cta_primary")}
                <ArrowRight />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/features" locale={locale}>
                {t("home_cta_secondary")}
              </Link>
            </Button>
          </div>
        </div>
      </SectionContainer>
    </section>
  );
}
