"use client";

import { useT } from "@/lib/i18n";
import { PresenterManager } from "@/components/presenter-manager";
import { PageContainer, PageHeader } from "@/components/page-layout";

/**
 * Presenter library page (/presenters): first-class sidebar destination for
 * the reusable on-camera people. The manager itself is shared with the
 * settings "characters" tab (see src/components/presenter-manager.tsx).
 */
export default function PresentersPage() {
  const t = useT("presenters");

  return (
    <div className="min-h-screen grid-bg">
      <PageContainer width="standard">
        <PageHeader title={t("pageTitle")} description={t("pageSubtitle")} />
        <PresenterManager />
      </PageContainer>
    </div>
  );
}
