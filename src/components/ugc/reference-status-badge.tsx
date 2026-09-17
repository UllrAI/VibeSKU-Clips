"use client";

import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/lib/i18n/translation/client";

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

const REFERENCE_STATUS: Record<string, { key: string; variant: BadgeVariant }> =
  {
    pending: { key: "ugc_reference_status_pending", variant: "outline" },
    ingesting: { key: "ugc_reference_status_ingesting", variant: "secondary" },
    analyzing: { key: "ugc_reference_status_analyzing", variant: "secondary" },
    review: { key: "ugc_reference_status_review", variant: "secondary" },
    ready: { key: "ugc_reference_status_ready", variant: "default" },
    failed: { key: "ugc_reference_status_failed", variant: "destructive" },
  };

export function ReferenceStatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const entry = REFERENCE_STATUS[status];
  if (!entry) return null;
  return <Badge variant={entry.variant}>{t(entry.key)}</Badge>;
}
