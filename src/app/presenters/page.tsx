"use client";

import { useT } from "@/lib/i18n";
import { PresenterManager } from "@/components/presenter-manager";

/**
 * Presenter library page (/presenters): first-class sidebar destination for
 * the reusable on-camera people. The manager itself is shared with the
 * settings "characters" tab (see src/components/presenter-manager.tsx).
 */
export default function PresentersPage() {
  const t = useT("presenters");

  return (
    <div className="min-h-screen grid-bg">
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">{t("pageTitle")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("pageSubtitle")}</p>
        </div>
        <PresenterManager />
      </main>
    </div>
  );
}
