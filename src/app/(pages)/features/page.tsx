import { getServerTranslations } from "@/lib/i18n/translation/server";
import { getStaticTranslations } from "@/lib/i18n/translation/static";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Features } from "@/components/homepage/features";
import { MarketingPageShell } from "@/components/layout/marketing-page-shell";
import {
  PageIntro,
  PageIntroDescription,
  PageIntroHeading,
} from "@/components/layout/page-intro";
import { CheckCircle2, Package2, Wrench } from "lucide-react";
import {
  createLocalizedAlternates,
  createMetadataDefaults,
} from "@/lib/metadata";
import { SOURCE_LOCALE, type SupportedLocale } from "@/lib/config/i18n";
export async function buildFeaturesMetadata(locale: SupportedLocale) {
  const { t } = await getServerTranslations({ locale });
  const metadata = createMetadataDefaults({
    alternates: createLocalizedAlternates("/features", locale),
    locale,
  });
  return {
    ...metadata,
    title: t("features_title"),
    description: t("features_meta_description"),
    openGraph: {
      ...metadata.openGraph,
      title: t("features_title"),
      description: t("features_meta_description"),
    },
    twitter: {
      ...metadata.twitter,
      title: t("features_title"),
      description: t("features_meta_description"),
    },
  };
}
export function generateMetadata() {
  return buildFeaturesMetadata(SOURCE_LOCALE);
}
export default function FeaturesPage({
  locale = SOURCE_LOCALE,
}: {
  locale?: SupportedLocale;
} = {}) {
  const { t } = getStaticTranslations(locale);
  const includedItems = [
    <>{t("features_delivered_ingest")}</>,
    <>{t("features_delivered_scripts")}</>,
    <>{t("features_delivered_talent")}</>,
    <>{t("features_delivered_workflow")}</>,
    <>{t("features_delivered_quality")}</>,
    <>{t("features_delivered_review")}</>,
    <>{t("features_delivered_export")}</>,
    <>{t("features_delivered_assets")}</>,
  ];
  const customizationItems = [
    <>{t("features_operations_publishing")}</>,
    <>{t("features_operations_shop_links")}</>,
    <>{t("features_operations_language_review")}</>,
    <>{t("features_operations_providers")}</>,
  ];
  return (
    <>
      <MarketingPageShell>
        <PageIntro
          className="mb-20"
          badge={
            <Badge className="border-border bg-background inline-flex items-center border px-3 py-1 text-sm">
              <Package2 className="text-muted-foreground mr-2 h-3 w-3" />
              <span className="text-muted-foreground font-mono">
                {t("features_scope_badge")}
              </span>
            </Badge>
          }
        >
          <PageIntroHeading>{t("features_heading")}</PageIntroHeading>
          <PageIntroDescription>{t("features_intro")}</PageIntroDescription>
        </PageIntro>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="text-primary h-5 w-5" />
                {t("features_delivered_heading")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-relaxed">
              {includedItems.map((item, index) => (
                <div key={index} className="flex items-start gap-3">
                  <CheckCircle2 className="text-primary mt-0.5 h-4 w-4 shrink-0" />
                  <span>{item}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wrench className="text-primary h-5 w-5" />
                {t("features_operations_heading")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-relaxed">
              {customizationItems.map((item, index) => (
                <div key={index} className="flex items-start gap-3">
                  <Wrench className="text-primary mt-0.5 h-4 w-4 shrink-0" />
                  <span>{item}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </MarketingPageShell>

      <Features locale={locale} />
    </>
  );
}
