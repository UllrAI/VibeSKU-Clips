import { DashboardPageWrapper } from "../../_components/dashboard-page-wrapper";
import { getServerTranslations } from "@/lib/i18n/translation/server";
import { createMetadataDefaults } from "@/lib/metadata";
import { listProducts, listScripts, listTalents } from "@/lib/ugc/queries";
import { PlanBuilder } from "./_components/plan-builder";

export async function generateMetadata() {
  const { locale, t } = await getServerTranslations();
  return {
    ...createMetadataDefaults({ locale }),
    title: t("ugc_plan_title"),
    description: t("ugc_plan_description"),
  };
}

export default async function NewBatchPage() {
  const { t } = await getServerTranslations();
  const [products, talents, scripts] = await Promise.all([
    listProducts(),
    listTalents(),
    listScripts(),
  ]);

  return (
    <DashboardPageWrapper
      title={<>{t("ugc_plan_title")}</>}
      parentTitle={<>{t("ugc_nav_batches")}</>}
      parentUrl="/dashboard/batches"
      description={<>{t("ugc_plan_description")}</>}
    >
      <PlanBuilder products={products} talents={talents} scripts={scripts} />
    </DashboardPageWrapper>
  );
}
