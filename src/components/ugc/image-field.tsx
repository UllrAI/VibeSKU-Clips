"use client";

import Image from "next/image";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FileUploader } from "@/components/ui/file-uploader";
import { useTranslation } from "@/lib/i18n/translation/client";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/**
 * Collects reference images for a product or a talent. Files go through the
 * existing presigned upload flow, so only the resulting URLs are held here.
 */
export function ImageField({
  value,
  onChange,
  maxFiles,
  label,
}: {
  value: string[];
  onChange: (urls: string[]) => void;
  maxFiles: number;
  label: string;
}) {
  const { t } = useTranslation();

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">{label}</p>
      {value.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {value.map((url) => (
            <li
              key={url}
              className="border-border relative aspect-square overflow-hidden rounded-md border"
            >
              <Image
                src={url}
                alt=""
                fill
                sizes="120px"
                className="object-cover"
                unoptimized
              />
              <Button
                type="button"
                size="icon-xs"
                variant="secondary"
                className="absolute top-1 right-1"
                onClick={() => onChange(value.filter((item) => item !== url))}
                aria-label={t("ugc_common_remove_image")}
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {value.length < maxFiles && (
        <FileUploader
          acceptedFileTypes={IMAGE_TYPES}
          maxFiles={maxFiles - value.length}
          onUploadComplete={(files) =>
            onChange([...value, ...files.map((file) => file.url)])
          }
        />
      )}
    </div>
  );
}
