import { notFound } from "next/navigation";
import { DashboardPageWrapper } from "../../_components/dashboard-page-wrapper";
import { getServerTranslations } from "@/lib/i18n/translation/server";
import { createMetadataDefaults } from "@/lib/metadata";
import { listProducts, listTalents } from "@/lib/ugc/queries";
import { activeVideoModelOptions } from "@/lib/ugc/media/video-provider";
import { getWork, getWorkState } from "@/lib/ugc/works";
import { WorkConsole } from "./_components/work-console";

export async function generateMetadata() {
  const { locale, t } = await getServerTranslations();
  return {
    ...createMetadataDefaults({ locale }),
    title: t("ugc_works_title"),
    description: t("ugc_works_description"),
  };
}

export default async function WorkDetailPage({
  params,
}: {
  params: Promise<{ workId: string }>;
}) {
  const { workId } = await params;
  const { t } = await getServerTranslations();
  const [detail, state] = await Promise.all([
    getWork(workId),
    getWorkState(workId),
  ]);
  if (!detail || !state) notFound();

  const [products, talents] = await Promise.all([
    listProducts(),
    listTalents(),
  ]);

  return (
    <DashboardPageWrapper
      title={<>{detail.work.title}</>}
      parentTitle={<>{t("ugc_nav_works")}</>}
      parentUrl="/dashboard/works"
      description={<>{t("ugc_work_detail_description")}</>}
    >
      <WorkConsole
        detail={detail}
        products={products}
        talents={talents}
        initialState={state}
        modelOptions={activeVideoModelOptions()}
      />
    </DashboardPageWrapper>
  );
}
