import { DashboardPageWrapper } from "../_components/dashboard-page-wrapper";
import { getServerTranslations } from "@/lib/i18n/translation/server";
import { createMetadataDefaults } from "@/lib/metadata";
import { listProducts } from "@/lib/ugc/queries";
import { ProductLibrary } from "./_components/product-library";

export async function generateMetadata() {
  const { locale, t } = await getServerTranslations();
  return {
    ...createMetadataDefaults({ locale }),
    title: t("ugc_products_title"),
    description: t("ugc_products_description"),
  };
}

export default async function ProductsPage() {
  const { t } = await getServerTranslations();
  const products = await listProducts();

  return (
    <DashboardPageWrapper
      title={<>{t("ugc_products_title")}</>}
      description={<>{t("ugc_products_description")}</>}
    >
      <ProductLibrary products={products} />
    </DashboardPageWrapper>
  );
}
