import { DashboardPageWrapper } from "../_components/dashboard-page-wrapper";
import { getServerTranslations } from "@/lib/i18n/translation/server";
import { createMetadataDefaults } from "@/lib/metadata";
import { listWorks } from "@/lib/ugc/works";
import { WorkList } from "./_components/work-list";

export async function generateMetadata() {
  const { locale, t } = await getServerTranslations();
  return {
    ...createMetadataDefaults({ locale }),
    title: t("ugc_works_title"),
    description: t("ugc_works_description"),
  };
}

export default async function WorksPage() {
  const { t } = await getServerTranslations();
  const works = await listWorks();

  return (
    <DashboardPageWrapper
      title={<>{t("ugc_works_title")}</>}
      description={<>{t("ugc_works_description")}</>}
    >
      <WorkList works={works} />
    </DashboardPageWrapper>
  );
}
