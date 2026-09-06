import { getStaticTranslations } from "@/lib/i18n/translation/static";
import { SOURCE_LOCALE, type SupportedLocale } from "@/lib/config/i18n";
import React from "react";
import { Card } from "@/components/ui/card";
import { SectionContainer } from "@/components/layout/page-container";
import {
  Boxes,
  FolderDown,
  Globe,
  Layers,
  ScanSearch,
  ShieldCheck,
  SquarePlay,
  UserRoundCheck,
} from "lucide-react";

function FeatureCard({
  description,
  icon: Icon,
  title,
}: {
  description: React.ReactNode;
  icon: React.ComponentType<{ className?: string }>;
  title: React.ReactNode;
}) {
  return (
    <Card className="h-full p-6">
      <Icon className="text-primary size-5" />
      <h3 className="text-foreground mt-4 text-base font-semibold">{title}</h3>
      <p className="text-muted-foreground mt-2 text-sm leading-6">
        {description}
      </p>
    </Card>
  );
}

export function Features({
  locale = SOURCE_LOCALE,
}: {
  locale?: SupportedLocale;
} = {}) {
  const { t } = getStaticTranslations(locale);

  const features = [
    {
      id: "understanding",
      icon: ScanSearch,
      title: <>{t("home_feature_understanding_title")}</>,
      description: <>{t("home_feature_understanding_description")}</>,
    },
    {
      id: "localisation",
      icon: Globe,
      title: <>{t("home_feature_localisation_title")}</>,
      description: <>{t("home_feature_localisation_description")}</>,
    },
    {
      id: "talent",
      icon: UserRoundCheck,
      title: <>{t("home_feature_talent_title")}</>,
      description: <>{t("home_feature_talent_description")}</>,
    },
    {
      id: "batch",
      icon: Layers,
      title: <>{t("home_feature_batch_title")}</>,
      description: <>{t("home_feature_batch_description")}</>,
    },
    {
      id: "quality",
      icon: ShieldCheck,
      title: <>{t("home_feature_quality_title")}</>,
      description: <>{t("home_feature_quality_description")}</>,
    },
    {
      id: "review",
      icon: SquarePlay,
      title: <>{t("home_feature_review_title")}</>,
      description: <>{t("home_feature_review_description")}</>,
    },
    {
      id: "export",
      icon: FolderDown,
      title: <>{t("home_feature_export_title")}</>,
      description: <>{t("home_feature_export_description")}</>,
    },
    {
      id: "assets",
      icon: Boxes,
      title: <>{t("home_feature_assets_title")}</>,
      description: <>{t("home_feature_assets_description")}</>,
    },
  ];

  const specs = [
    { id: "duration", label: t("home_spec_duration"), value: "15s" },
    { id: "frame", label: t("home_spec_frame"), value: "1080×1920" },
    { id: "templates", label: t("home_spec_templates"), value: "3" },
    { id: "locales", label: t("home_spec_locales"), value: "6" },
  ];

  return (
    <section id="features" className="border-border border-b py-24">
      <SectionContainer>
        <div className="max-w-2xl">
          <h2 className="text-foreground text-3xl font-semibold tracking-tight sm:text-4xl">
            {t("home_features_title")}
          </h2>
          <p className="text-muted-foreground mt-4 text-lg leading-8">
            {t("home_features_description")}
          </p>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((feature) => (
            <FeatureCard key={feature.id} {...feature} />
          ))}
        </div>

        <dl className="border-border bg-border mt-12 grid gap-px overflow-hidden rounded-lg border sm:grid-cols-4">
          {specs.map((spec) => (
            <div key={spec.id} className="bg-card px-6 py-8 text-center">
              <dt className="text-muted-foreground text-sm">{spec.label}</dt>
              <dd className="text-foreground mt-2 text-2xl font-semibold tabular-nums">
                <span translate="no">{spec.value}</span>
              </dd>
            </div>
          ))}
        </dl>
      </SectionContainer>
    </section>
  );
}
