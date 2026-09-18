import { DashboardPageWrapper } from "../_components/dashboard-page-wrapper";
import { getServerTranslations } from "@/lib/i18n/translation/server";
import { createMetadataDefaults } from "@/lib/metadata";
import { listReferences } from "@/lib/ugc/queries";
import { ReferenceLibrary } from "./_components/reference-library";

export async function generateMetadata() {
  const { locale, t } = await getServerTranslations();
  return {
    ...createMetadataDefaults({ locale }),
    title: t("ugc_references_title"),
    description: t("ugc_references_description"),
  };
}

export default async function ReferencesPage() {
  const { t } = await getServerTranslations();
  const references = await listReferences();

  return (
    <DashboardPageWrapper
      title={<>{t("ugc_references_title")}</>}
      description={<>{t("ugc_references_description")}</>}
    >
      <ReferenceLibrary references={references} />
    </DashboardPageWrapper>
  );
}
