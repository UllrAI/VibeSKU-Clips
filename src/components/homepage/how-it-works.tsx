import { Check } from "lucide-react";
import { ShellContainer } from "@/components/layout/page-container";
import { getStaticTranslations } from "@/lib/i18n/translation/static";
import { SOURCE_LOCALE, type SupportedLocale } from "@/lib/config/i18n";
import { ScriptPreview } from "./script-preview";

export function HowItWorks({
  locale = SOURCE_LOCALE,
}: { locale?: SupportedLocale } = {}) {
  const { t } = getStaticTranslations(locale);
  return (
    <section id="how-it-works" className="scroll-mt-24">
      <ShellContainer>
        <div className="grid gap-10 border-b py-16 sm:py-24 lg:grid-cols-[1fr_1fr] lg:gap-24">
          <div className="flex flex-col items-start gap-6">
            <p className="text-muted-foreground flex items-center gap-4 text-sm">
              <span className="font-mono" translate="no">
                01 /
              </span>
              {t("home_steps_eyebrow")}
            </p>
            <h2 className="text-3xl leading-[1.15] font-semibold tracking-tight text-balance whitespace-pre-line sm:text-5xl">
              {t("home_steps_title")}
            </h2>
            <p className="text-muted-foreground text-base leading-7">
              {t("home_steps_description")}
            </p>
            <ol className="mt-2 w-full divide-y">
              {[
                [
                  t("home_step_submit_title"),
                  t("home_step_submit_description"),
                ],
                [
                  t("home_step_produce_title"),
                  t("home_step_produce_description"),
                ],
                [
                  t("home_step_review_title"),
                  t("home_step_review_description"),
                ],
              ].map(([title, description], index) => (
                <li
                  key={title}
                  className="grid grid-cols-[24px_1fr] gap-4 py-5"
                >
                  <span className="text-muted-foreground pt-1 font-mono text-xs">
                    0{index + 1}
                  </span>
                  <div className="space-y-2">
                    <h3 className="font-medium">{title}</h3>
                    <p className="text-muted-foreground text-sm leading-6">
                      {description}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="flex items-start gap-2 text-sm leading-6">
              <Check
                className="text-primary mt-1 size-4 shrink-0"
                aria-hidden
              />
              {t("home_hero_footnote")}
            </p>
          </div>
          <div className="self-center">
            <ScriptPreview
              labels={{
                example: t("home_demo_sample"),
                imageAlt: t("home_demo_product_alt"),
                title: t("home_demo_title"),
                caption: t("home_demo_product_name"),
                label: t("home_demo_angles"),
                script: t("home_demo_script"),
                beats: [
                  t("home_demo_hook"),
                  t("home_demo_detail"),
                  t("home_demo_close"),
                ],
                angles: [
                  {
                    id: "routine",
                    title: t("home_demo_routine"),
                    lines: [
                      t("home_demo_routine_1"),
                      t("home_demo_routine_2"),
                      t("home_demo_routine_3"),
                    ],
                  },
                  {
                    id: "product",
                    title: t("home_demo_product"),
                    lines: [
                      t("home_demo_product_1"),
                      t("home_demo_product_2"),
                      t("home_demo_product_3"),
                    ],
                  },
                  {
                    id: "gift",
                    title: t("home_demo_gift"),
                    lines: [
                      t("home_demo_gift_1"),
                      t("home_demo_gift_2"),
                      t("home_demo_gift_3"),
                    ],
                  },
                ],
              }}
            />
          </div>
        </div>
      </ShellContainer>
    </section>
  );
}
