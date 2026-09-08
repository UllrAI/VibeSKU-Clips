import { ArrowRight, Globe, ScanSearch, FolderDown } from "lucide-react";
import { ShellContainer } from "@/components/layout/page-container";
import { LocalizedLink } from "@/components/localized-link";
import { getStaticTranslations } from "@/lib/i18n/translation/static";
import { SOURCE_LOCALE, type SupportedLocale } from "@/lib/config/i18n";
import { FramePreview } from "./frame-preview";

export function CreativeControl({
  locale = SOURCE_LOCALE,
}: { locale?: SupportedLocale } = {}) {
  const { t } = getStaticTranslations(locale);
  return (
    <section id="features" className="scroll-mt-24">
      <ShellContainer>
        <div className="grid items-center gap-10 border-b py-16 sm:py-24 lg:grid-cols-2 lg:gap-24">
          <div className="order-2 lg:order-1">
            <FramePreview
              labels={{
                title: t("home_frame_title"),
                portrait: t("home_frame_portrait"),
                landscape: t("home_frame_landscape"),
                alt: t("home_demo_image_alt"),
                note: t("home_frame_note"),
                caption: t("home_frame_caption"),
              }}
            />
          </div>
          <div className="order-1 flex flex-col items-start gap-6 lg:order-2">
            <p className="text-muted-foreground flex items-center gap-4 text-sm">
              <span className="font-mono" translate="no">
                02 /
              </span>
              {t("home_features_eyebrow")}
            </p>
            <h2 className="text-3xl leading-[1.15] font-semibold tracking-tight text-balance whitespace-pre-line sm:text-5xl">
              {t("home_creative_title")}
            </h2>
            <p className="text-muted-foreground text-base leading-7">
              {t("home_creative_description")}
            </p>
            <div className="mt-2 w-full divide-y">
              {[
                {
                  icon: ScanSearch,
                  title: t("home_control_facts_title"),
                  description: t("home_control_facts_description"),
                },
                {
                  icon: Globe,
                  title: t("home_control_language_title"),
                  description: t("home_control_language_description"),
                },
                {
                  icon: FolderDown,
                  title: t("home_control_download_title"),
                  description: t("home_control_download_description"),
                },
              ].map(({ icon: Icon, title, description }) => (
                <div
                  key={title}
                  className="grid grid-cols-[24px_1fr] gap-4 py-5"
                >
                  <Icon
                    className="text-muted-foreground mt-1 size-4"
                    aria-hidden
                  />
                  <div className="space-y-2">
                    <h3 className="font-medium">{title}</h3>
                    <p className="text-muted-foreground text-sm leading-6">
                      {description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <LocalizedLink
              href="/features"
              locale={locale}
              className="focus-visible:outline-ring flex min-h-11 items-center gap-3 text-sm font-medium underline-offset-4 hover:underline focus-visible:outline-2"
            >
              {t("home_cta_secondary")}
              <ArrowRight className="size-4" aria-hidden />
            </LocalizedLink>
          </div>
        </div>
      </ShellContainer>
    </section>
  );
}
