import { DashboardPageWrapper } from "../_components/dashboard-page-wrapper";
import { getServerTranslations } from "@/lib/i18n/translation/server";
import { createMetadataDefaults } from "@/lib/metadata";
import { listReviewClips } from "@/lib/ugc/queries";
import { ReviewWorkbench } from "./_components/review-workbench";

export async function generateMetadata() {
  const { locale, t } = await getServerTranslations();
  return {
    ...createMetadataDefaults({ locale }),
    title: t("ugc_review_title"),
    description: t("ugc_review_description"),
  };
}

export default async function ReviewPage() {
  const { t } = await getServerTranslations();
  const { clips, hints } = await listReviewClips();

  return (
    <DashboardPageWrapper
      title={<>{t("ugc_review_title")}</>}
      description={<>{t("ugc_review_description")}</>}
    >
      <ReviewWorkbench clips={clips} hints={hints} />
    </DashboardPageWrapper>
  );
}
