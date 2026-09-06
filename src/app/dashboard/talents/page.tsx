import { DashboardPageWrapper } from "../_components/dashboard-page-wrapper";
import { getServerTranslations } from "@/lib/i18n/translation/server";
import { createMetadataDefaults } from "@/lib/metadata";
import { listTalents } from "@/lib/ugc/queries";
import { TalentLibrary } from "./_components/talent-library";

export async function generateMetadata() {
  const { locale, t } = await getServerTranslations();
  return {
    ...createMetadataDefaults({ locale }),
    title: t("ugc_talents_title"),
    description: t("ugc_talents_description"),
  };
}

export default async function TalentsPage() {
  const { t } = await getServerTranslations();
  const talents = await listTalents();

  return (
    <DashboardPageWrapper
      title={<>{t("ugc_talents_title")}</>}
      description={<>{t("ugc_talents_description")}</>}
    >
      <TalentLibrary talents={talents} />
    </DashboardPageWrapper>
  );
}
