"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FileUploader } from "@/components/ui/file-uploader";
import { useTranslation } from "@/lib/i18n/translation/client";

const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"] as const;

/**
 * Collects the one video a reference is read from. It goes through the same
 * presigned upload flow as every other file, so only the resulting URL is held
 * here and the worker signs it again when it needs the bytes.
 */
export function VideoField({
  value,
  onChange,
  label,
}: {
  value: string | null;
  onChange: (url: string | null) => void;
  label: string;
}) {
  const { t } = useTranslation();

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">{label}</p>
      {value ? (
        <div className="border-border overflow-hidden rounded-md border">
          <video src={value} controls className="max-h-64 w-full bg-black" />
          <div className="flex justify-end p-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => onChange(null)}
            >
              <X />
              {t("ugc_reference_file_replace")}
            </Button>
          </div>
        </div>
      ) : (
        <FileUploader
          acceptedFileTypes={VIDEO_TYPES}
          clearCompletedOnUpload
          maxFiles={1}
          onUploadComplete={(files) => onChange(files[0]?.url ?? null)}
        />
      )}
    </div>
  );
}
