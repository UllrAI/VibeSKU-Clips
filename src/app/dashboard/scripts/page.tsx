import { DashboardPageWrapper } from "../_components/dashboard-page-wrapper";
import { getServerTranslations } from "@/lib/i18n/translation/server";
import { createMetadataDefaults } from "@/lib/metadata";
import { listScripts } from "@/lib/ugc/queries";
import { ScriptLibrary } from "./_components/script-library";

export async function generateMetadata() {
  const { locale, t } = await getServerTranslations();
  return {
    ...createMetadataDefaults({ locale }),
    title: t("ugc_scripts_title"),
    description: t("ugc_scripts_description"),
  };
}

export default async function ScriptsPage() {
  const { t } = await getServerTranslations();
  const scripts = await listScripts();

  return (
    <DashboardPageWrapper
      title={<>{t("ugc_scripts_title")}</>}
      description={<>{t("ugc_scripts_description")}</>}
    >
      <ScriptLibrary scripts={scripts} />
    </DashboardPageWrapper>
  );
}
