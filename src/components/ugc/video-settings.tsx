"use client";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTranslation } from "@/lib/i18n/translation/client";
import {
  PRISM_VIDEO_RESOLUTIONS,
  VIDEO_ASPECT_RATIOS,
  type VideoAspectRatio,
  type VideoMode,
  type VideoResolution,
} from "@/lib/ugc/constants";
import { videoModeKey } from "./labels";

export function VideoSettings({
  videoMode,
  onVideoModeChange,
  aspectRatio,
  onAspectRatioChange,
  resolution,
  onResolutionChange,
  resolutionOptions = PRISM_VIDEO_RESOLUTIONS,
}: {
  videoMode: VideoMode;
  onVideoModeChange: (value: VideoMode) => void;
  aspectRatio: VideoAspectRatio;
  onAspectRatioChange: (value: VideoAspectRatio) => void;
  resolution: VideoResolution;
  onResolutionChange: (value: VideoResolution) => void;
  resolutionOptions?: readonly VideoResolution[];
}) {
  const { t } = useTranslation();

  return (
    <div className="space-y-3">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="work-video-mode">{t("ugc_video_mode")}</Label>
          <Select
            value={videoMode}
            onValueChange={(value) => onVideoModeChange(value as VideoMode)}
          >
            <SelectTrigger id="work-video-mode" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="one_take">
                {t(videoModeKey("one_take"))}
              </SelectItem>
              <SelectItem value="storyboard">
                {t(videoModeKey("storyboard"))}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="work-aspect-ratio">
            {t("ugc_video_aspect_ratio")}
          </Label>
          <Select
            value={aspectRatio}
            onValueChange={(value) =>
              onAspectRatioChange(value as VideoAspectRatio)
            }
          >
            <SelectTrigger id="work-aspect-ratio" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VIDEO_ASPECT_RATIOS.map((value) => (
                <SelectItem key={value} value={value}>
                  {value} ·{" "}
                  {t(
                    value === "9:16"
                      ? "ugc_video_aspect_ratio_portrait"
                      : "ugc_video_aspect_ratio_landscape",
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="work-resolution">{t("ugc_video_resolution")}</Label>
          <Select
            value={resolution}
            onValueChange={(value) =>
              onResolutionChange(value as VideoResolution)
            }
          >
            <SelectTrigger id="work-resolution" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {resolutionOptions.map((value) => (
                <SelectItem key={value} value={value}>
                  {value === "2k" ? "2K" : value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <p className="text-muted-foreground text-xs">
        {t(`ugc_video_mode_${videoMode}_hint`)}
      </p>
    </div>
  );
}
