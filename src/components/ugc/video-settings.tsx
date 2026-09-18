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
  VIDEO_ASPECT_RATIOS,
  type VideoAspectRatio,
  type VideoMode,
  type VideoModel,
  type VideoModelOption,
  type VideoResolution,
} from "@/lib/ugc/constants";
import { videoModeKey, videoModelKey } from "./labels";

export function VideoSettings({
  videoMode,
  onVideoModeChange,
  videoModel,
  onVideoModelChange,
  aspectRatio,
  onAspectRatioChange,
  resolution,
  onResolutionChange,
  modelOptions,
}: {
  videoMode: VideoMode;
  onVideoModeChange: (value: VideoMode) => void;
  videoModel: VideoModel;
  onVideoModelChange: (value: VideoModel) => void;
  aspectRatio: VideoAspectRatio;
  onAspectRatioChange: (value: VideoAspectRatio) => void;
  resolution: VideoResolution;
  onResolutionChange: (value: VideoResolution) => void;
  modelOptions: readonly VideoModelOption[];
}) {
  const { t } = useTranslation();
  const resolutionOptions =
    modelOptions.find((option) => option.model === videoModel)?.resolutions ??
    [];

  const changeModel = (value: VideoModel) => {
    onVideoModelChange(value);
    const resolutions =
      modelOptions.find((option) => option.model === value)?.resolutions ?? [];
    if (!resolutions.includes(resolution)) {
      onResolutionChange(
        resolutions.includes("720p") ? "720p" : resolutions[0],
      );
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
          <Label htmlFor="work-video-model">{t("ugc_video_model")}</Label>
          <Select
            value={videoModel}
            onValueChange={(value) => changeModel(value as VideoModel)}
            disabled={modelOptions.length === 1}
          >
            <SelectTrigger id="work-video-model" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {modelOptions.map((option) => (
                <SelectItem key={option.model} value={option.model}>
                  {t(videoModelKey(option.model))}
                </SelectItem>
              ))}
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
