"use client";

import Image from "next/image";
import { Loader2 } from "lucide-react";
import { useTranslation } from "@/lib/i18n/translation/client";
import type { ReferenceView } from "@/lib/ugc/types";

/**
 * The views of a talent or a scene beside its cover. What makes a library
 * entry trustworthy is seeing the same person or the same room from more than
 * one angle, so the extra views are shown rather than counted.
 */
export function ViewStrip({
  views,
  labelKey,
  drawing,
}: {
  views: ReferenceView[];
  labelKey: (angle: string) => string;
  drawing: boolean;
}) {
  const { t } = useTranslation();
  if (views.length === 0 && !drawing) return null;

  return (
    <ul className="flex gap-1.5">
      {views.map((view) => (
        <li
          key={view.angle}
          className="border-border relative aspect-square w-10 overflow-hidden rounded border"
        >
          <Image
            src={view.imageUrl}
            alt={t(labelKey(view.angle))}
            fill
            sizes="40px"
            className="object-cover"
            unoptimized
          />
        </li>
      ))}
      {drawing && (
        <li className="border-border text-muted-foreground flex aspect-square w-10 items-center justify-center rounded border border-dashed">
          <Loader2
            className="size-3.5 animate-spin motion-reduce:animate-none"
            aria-hidden
          />
        </li>
      )}
    </ul>
  );
}
