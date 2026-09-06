import { ArrowRight } from "lucide-react";

import { getStaticTranslations } from "@/lib/i18n/translation/static";
import { SOURCE_LOCALE, type SupportedLocale } from "@/lib/config/i18n";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShellContainer } from "@/components/layout/page-container";
import { LocalizedLink as Link } from "@/components/localized-link";

export function Hero({
  locale = SOURCE_LOCALE,
}: {
  locale?: SupportedLocale;
} = {}) {
  const { t } = getStaticTranslations(locale);

  const workSteps = [
    {
      id: "product",
      label: t("ugc_work_step_product"),
      state: t("ugc_work_state_done"),
    },
    {
      id: "script",
      label: t("ugc_work_step_script"),
      state: t("ugc_work_state_review"),
    },
    {
      id: "video",
      label: t("ugc_work_step_video"),
      state: t("ugc_work_state_idle"),
    },
  ];

  return (
    <section className="border-border border-b py-20 sm:py-28">
      <ShellContainer>
        <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-16">
          <div>
            <Badge variant="outline" className="border-primary/40 text-primary">
              {t("home_hero_badge")}
            </Badge>

            <h1 className="text-foreground mt-6 text-4xl font-semibold tracking-tight sm:text-5xl">
              {t("home_hero_title")}
            </h1>

            <p className="text-muted-foreground mt-6 max-w-xl text-lg leading-8">
              {t("home_hero_description")}
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button size="lg" asChild>
                <Link
                  href="/signup"
                  locale={locale}
                  data-umami-event="signup_click"
                  data-umami-event-source="homepage_hero"
                >
                  {t("home_hero_primary_cta")}
                  <ArrowRight />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="/features" locale={locale}>
                  {t("home_hero_secondary_cta")}
                </Link>
              </Button>
            </div>

            <p className="text-muted-foreground mt-6 text-sm">
              {t("home_hero_footnote")}
            </p>
          </div>

          <div className="border-border bg-card rounded-lg border">
            <div className="border-border flex items-center justify-between border-b px-5 py-4">
              <span className="text-sm font-medium">
                {t("home_plan_card_title")}
              </span>
              <span className="text-muted-foreground font-mono text-xs">
                9:16 / 16:9 · 15s
              </span>
            </div>

            <ul className="divide-border divide-y">
              {workSteps.map((step, index) => (
                <li
                  key={step.id}
                  className="flex items-center justify-between gap-4 px-5 py-4"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="text-muted-foreground font-mono text-xs tabular-nums">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <p className="truncate text-sm font-medium">{step.label}</p>
                  </div>
                  <span className="text-muted-foreground text-sm">
                    {step.state}
                  </span>
                </li>
              ))}
            </ul>

            <div className="border-border flex items-center justify-between border-t px-5 py-4">
              <span className="text-sm font-medium">
                {t("home_plan_card_total")}
              </span>
              <span className="text-lg font-semibold tabular-nums">1</span>
            </div>
          </div>
        </div>
      </ShellContainer>
    </section>
  );
}
