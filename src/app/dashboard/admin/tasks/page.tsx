import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getAdminTasks } from "@/lib/admin/operations";
import { requireAdmin } from "@/lib/auth/permissions";
import { getServerTranslations } from "@/lib/i18n/translation/server";
import { createMetadataDefaults } from "@/lib/metadata";

import { DashboardPageWrapper } from "../../_components/dashboard-page-wrapper";
import { TaskManagementTable } from "./_components/task-management-table";

export async function generateMetadata() {
  const { locale, t } = await getServerTranslations();
  return {
    ...createMetadataDefaults({ locale }),
    title: t("admin_ops_tasks_title"),
    description: t("admin_ops_tasks_description"),
  };
}

export default async function AdminTasksPage() {
  const { t } = await getServerTranslations();
  await requireAdmin();
  const initial = await getAdminTasks({});

  return (
    <DashboardPageWrapper
      title={<>{t("admin_ops_tasks_title")}</>}
      parentTitle={<>{t("admin_dashboard_page")}</>}
      parentUrl="/dashboard/admin"
      description={<>{t("admin_ops_tasks_description")}</>}
    >
      <Card>
        <CardHeader>
          <CardTitle>{t("admin_ops_all_tasks")}</CardTitle>
          <CardDescription>{t("admin_ops_all_tasks_hint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <TaskManagementTable
            initialData={initial.data}
            initialPagination={initial.pagination}
          />
        </CardContent>
      </Card>
    </DashboardPageWrapper>
  );
}
