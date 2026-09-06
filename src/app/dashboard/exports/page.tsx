import Link from "next/link";
import { Download, FolderDown } from "lucide-react";
import { DashboardPageWrapper } from "../_components/dashboard-page-wrapper";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { getServerTranslations } from "@/lib/i18n/translation/server";
import { createMetadataDefaults } from "@/lib/metadata";
import { listExports } from "@/lib/ugc/queries";

export async function generateMetadata() {
  const { locale, t } = await getServerTranslations();
  return {
    ...createMetadataDefaults({ locale }),
    title: t("ugc_exports_title"),
    description: t("ugc_exports_description"),
  };
}

export default async function ExportsPage() {
  const { t, locale } = await getServerTranslations();
  const records = await listExports();

  return (
    <DashboardPageWrapper
      title={<>{t("ugc_exports_title")}</>}
      description={<>{t("ugc_exports_description")}</>}
    >
      {records.length === 0 ? (
        <EmptyState
          icon={<FolderDown />}
          title={t("ugc_exports_empty_title")}
          description={t("ugc_exports_empty_hint")}
          action={
            <Button asChild size="sm">
              <Link href="/dashboard/review">{t("ugc_nav_review")}</Link>
            </Button>
          }
        />
      ) : (
        <ul className="space-y-3">
          {records.map((record) => (
            <li
              key={record.id}
              className="border-border rounded-lg border px-4 py-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                  <p className="font-medium">{record.name}</p>
                  <p className="text-muted-foreground text-sm">
                    {new Date(record.createdAt).toLocaleString(locale)} ·{" "}
                    {t("ugc_export_clip_count", { count: record.clipCount })}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Button asChild size="sm" variant="outline">
                    <a href={`/api/ugc/exports/${record.id}/manifest`}>
                      <Download />
                      {t("ugc_export_download_manifest")}
                    </a>
                  </Button>
                </div>
              </div>
              <ul className="text-muted-foreground mt-3 space-y-1 text-sm">
                {record.manifest.groups.map((group) => (
                  <li key={group.key}>
                    {group.label} · {group.rows.length}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </DashboardPageWrapper>
  );
}
