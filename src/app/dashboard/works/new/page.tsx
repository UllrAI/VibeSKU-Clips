import { DashboardPageWrapper } from "../../_components/dashboard-page-wrapper";
import { getServerTranslations } from "@/lib/i18n/translation/server";
import { createMetadataDefaults } from "@/lib/metadata";
import { getReference, listProducts, listTalents } from "@/lib/ugc/queries";
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
  searchParams: Promise<{ product?: string; referenceId?: string }>;
}) {
  const { t } = await getServerTranslations();
  const { product, referenceId } = await searchParams;
  const [products, talents, reference] = await Promise.all([
    listProducts(),
    listTalents(),
    referenceId ? getReference(referenceId) : null,
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
        reference={
          reference?.blueprint
            ? {
                id: reference.id,
                title: reference.title,
                hook: reference.blueprint.hook,
                aspectRatio: reference.aspectRatio,
              }
            : null
        }
        modelOptions={activeVideoModelOptions()}
      />
    </DashboardPageWrapper>
  );
}
