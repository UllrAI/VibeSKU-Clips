"use client";

import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/lib/i18n/translation/client";

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

const PRODUCT_STATUS: Record<string, { key: string; variant: BadgeVariant }> = {
  draft: { key: "ugc_product_status_draft", variant: "outline" },
  analyzing: { key: "ugc_product_status_analyzing", variant: "secondary" },
  ready: { key: "ugc_product_status_ready", variant: "default" },
  needs_input: {
    key: "ugc_product_status_needs_input",
    variant: "destructive",
  },
  failed: { key: "ugc_product_status_failed", variant: "destructive" },
};

const CLIP_STATUS: Record<string, { key: string; variant: BadgeVariant }> = {
  pending: { key: "ugc_clip_status_pending", variant: "outline" },
  scripting: { key: "ugc_clip_status_scripting", variant: "secondary" },
  rendering: { key: "ugc_clip_status_rendering", variant: "secondary" },
  reviewing: { key: "ugc_clip_status_reviewing", variant: "secondary" },
  ready: { key: "ugc_clip_status_ready", variant: "default" },
  failed: { key: "ugc_clip_status_failed", variant: "destructive" },
  cancelled: { key: "ugc_clip_status_cancelled", variant: "outline" },
};

const TALENT_STATUS: Record<string, { key: string; variant: BadgeVariant }> = {
  generating: { key: "ugc_talent_status_generating", variant: "secondary" },
  ready: { key: "ugc_talent_status_ready", variant: "default" },
  failed: { key: "ugc_talent_status_failed", variant: "destructive" },
};

const MAPS = {
  product: PRODUCT_STATUS,
  clip: CLIP_STATUS,
  talent: TALENT_STATUS,
} as const;

export function StatusBadge({
  kind,
  status,
}: {
  kind: keyof typeof MAPS;
  status: string;
}) {
  const { t } = useTranslation();
  const entry = MAPS[kind][status];
  if (!entry) return null;
  return <Badge variant={entry.variant}>{t(entry.key)}</Badge>;
}
