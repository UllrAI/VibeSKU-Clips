import { Plus } from "lucide-react";
import { ShellContainer } from "@/components/layout/page-container";
import { SOURCE_LOCALE, type SupportedLocale } from "@/lib/config/i18n";
import { getStaticTranslations } from "@/lib/i18n/translation/static";

export function HomeFaq({
  locale = SOURCE_LOCALE,
}: { locale?: SupportedLocale } = {}) {
  const { t } = getStaticTranslations(locale);
  return (
    <section className="py-16 sm:py-24">
      <ShellContainer className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-24">
        <div className="space-y-4">
          <p className="text-muted-foreground flex items-center gap-4 text-sm">
            <span className="font-mono" translate="no">
              03 /
            </span>
            {t("home_faq_eyebrow")}
          </p>
          <h2 className="text-3xl font-semibold tracking-tight sm:text-5xl">
            {t("home_faq_title")}
          </h2>
        </div>
        <div className="divide-y border-y">
          {(["input", "review", "format", "publish"] as const).map((id) => (
            <details key={id} className="group">
              <summary className="focus-visible:outline-ring flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 py-5 text-base font-medium focus-visible:outline-2 [&::-webkit-details-marker]:hidden">
                {t(`home_faq_${id}_question`)}
                <Plus
                  className="size-4 shrink-0 group-open:rotate-45"
                  aria-hidden
                />
              </summary>
              <p className="text-muted-foreground pb-6 text-sm leading-7">
                {t(`home_faq_${id}_answer`)}
              </p>
            </details>
          ))}
        </div>
      </ShellContainer>
    </section>
  );
}
