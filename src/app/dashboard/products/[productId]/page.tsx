import { notFound } from "next/navigation";
import { z } from "zod";
import { DashboardPageWrapper } from "../../_components/dashboard-page-wrapper";
import { getServerTranslations } from "@/lib/i18n/translation/server";
import { createMetadataDefaults } from "@/lib/metadata";
import { getProduct, getProductState } from "@/lib/ugc/queries";
import { ProductWorkbench } from "./_components/product-workbench";

export async function generateMetadata() {
  const { locale, t } = await getServerTranslations();
  return {
    ...createMetadataDefaults({ locale }),
    title: t("ugc_products_title"),
    description: t("ugc_product_detail_description"),
  };
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { productId } = await params;
  if (!z.uuid().safeParse(productId).success) notFound();

  const { t } = await getServerTranslations();
  const [product, state] = await Promise.all([
    getProduct(productId),
    getProductState(productId),
  ]);
  if (!product || !state) notFound();

  return (
    <DashboardPageWrapper
      title={<>{product.name}</>}
      parentTitle={<>{t("ugc_products_title")}</>}
      parentUrl="/dashboard/products"
      description={<>{t("ugc_product_detail_description")}</>}
    >
      <ProductWorkbench product={product} initialState={state} />
    </DashboardPageWrapper>
  );
}
