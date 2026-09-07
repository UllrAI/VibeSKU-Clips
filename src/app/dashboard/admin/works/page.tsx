import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth/permissions";
import { getAdminWorks } from "@/lib/admin/operations";
import { getServerTranslations } from "@/lib/i18n/translation/server";
import { createMetadataDefaults } from "@/lib/metadata";

import { DashboardPageWrapper } from "../../_components/dashboard-page-wrapper";
import { WorkManagementTable } from "./_components/work-management-table";

export async function generateMetadata() {
  const { locale, t } = await getServerTranslations();
  return {
    ...createMetadataDefaults({ locale }),
    title: t("admin_ops_works_title"),
    description: t("admin_ops_works_description"),
  };
}

export default async function AdminWorksPage() {
  const { t } = await getServerTranslations();
  await requireAdmin();
  const initial = await getAdminWorks({});

  return (
    <DashboardPageWrapper
      title={<>{t("admin_ops_works_title")}</>}
      parentTitle={<>{t("admin_dashboard_page")}</>}
      parentUrl="/dashboard/admin"
      description={<>{t("admin_ops_works_description")}</>}
    >
      <Card>
        <CardHeader>
          <CardTitle>{t("admin_ops_all_works")}</CardTitle>
          <CardDescription>{t("admin_ops_all_works_hint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <WorkManagementTable
            initialData={initial.data}
            initialPagination={initial.pagination}
          />
        </CardContent>
      </Card>
    </DashboardPageWrapper>
  );
}
