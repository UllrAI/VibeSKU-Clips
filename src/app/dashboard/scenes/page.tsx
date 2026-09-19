import { DashboardPageWrapper } from "../_components/dashboard-page-wrapper";
import { getServerTranslations } from "@/lib/i18n/translation/server";
import { createMetadataDefaults } from "@/lib/metadata";
import { listScenes } from "@/lib/ugc/queries";
import { SceneLibrary } from "./_components/scene-library";

export async function generateMetadata() {
  const { locale, t } = await getServerTranslations();
  return {
    ...createMetadataDefaults({ locale }),
    title: t("ugc_scenes_title"),
    description: t("ugc_scenes_description"),
  };
}

export default async function ScenesPage() {
  const { t } = await getServerTranslations();
  const scenes = await listScenes();

  return (
    <DashboardPageWrapper
      title={<>{t("ugc_scenes_title")}</>}
      description={<>{t("ugc_scenes_description")}</>}
    >
      <SceneLibrary scenes={scenes} />
    </DashboardPageWrapper>
  );
}
