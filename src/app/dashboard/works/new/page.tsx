import { DashboardPageWrapper } from "../../_components/dashboard-page-wrapper";
import { getServerTranslations } from "@/lib/i18n/translation/server";
import { createMetadataDefaults } from "@/lib/metadata";
import { listProducts, listTalents } from "@/lib/ugc/queries";
import { activeVideoModelOptions } from "@/lib/ugc/media/video-provider";
import { WorkComposer } from "../_components/work-composer";

export async function generateMetadata() {
  const { locale, t } = await getServerTranslations();
  return {
    ...createMetadataDefaults({ locale }),
    title: t("ugc_work_new_title"),
    description: t("ugc_work_new_description"),
  };
}

export default async function NewWorkPage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string }>;
}) {
  const { t } = await getServerTranslations();
  const { product } = await searchParams;
  const [products, talents] = await Promise.all([
    listProducts(),
    listTalents(),
  ]);

  return (
    <DashboardPageWrapper
      title={<>{t("ugc_work_new_title")}</>}
      description={<>{t("ugc_work_new_description")}</>}
    >
      <WorkComposer
        products={products}
        talents={talents}
        initialProductId={product}
        modelOptions={activeVideoModelOptions()}
      />
    </DashboardPageWrapper>
  );
}
