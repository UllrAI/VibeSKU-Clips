import { ClipboardList, Sparkles, SquarePlay } from "lucide-react";

import { SectionContainer } from "@/components/layout/page-container";
import { Card, CardContent } from "@/components/ui/card";
import { getStaticTranslations } from "@/lib/i18n/translation/static";
import { SOURCE_LOCALE, type SupportedLocale } from "@/lib/config/i18n";

export function HowItWorks({
  locale = SOURCE_LOCALE,
}: {
  locale?: SupportedLocale;
} = {}) {
  const { t } = getStaticTranslations(locale);

  const steps = [
    {
      id: "submit",
      icon: ClipboardList,
      title: t("home_step_submit_title"),
      description: t("home_step_submit_description"),
    },
    {
      id: "produce",
      icon: Sparkles,
      title: t("home_step_produce_title"),
      description: t("home_step_produce_description"),
    },
    {
      id: "review",
      icon: SquarePlay,
      title: t("home_step_review_title"),
      description: t("home_step_review_description"),
    },
  ];

  return (
    <section className="bg-muted/30 border-border border-b py-20 sm:py-24">
      <SectionContainer>
        <div className="max-w-2xl">
          <h2 className="text-foreground text-3xl font-semibold tracking-tight sm:text-4xl">
            {t("home_steps_title")}
          </h2>
          <p className="text-muted-foreground mt-4 text-lg leading-8">
            {t("home_steps_description")}
          </p>
        </div>

        <ol className="mt-12 grid gap-4 sm:grid-cols-3">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <li key={step.id}>
                <Card className="h-full">
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <Icon className="text-primary size-5" aria-hidden />
                      <span className="text-muted-foreground font-mono text-xs">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                    </div>
                    <h3 className="text-foreground mt-4 font-semibold">
                      {step.title}
                    </h3>
                    <p className="text-muted-foreground mt-2 text-sm leading-6">
                      {step.description}
                    </p>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ol>
      </SectionContainer>
    </section>
  );
}
