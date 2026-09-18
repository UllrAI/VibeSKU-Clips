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
  CLIP_SPEC,
  AUDIO_MODES,
  type AudioMode,
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
  durationSeconds,
  onDurationChange,
  audioMode,
  onAudioModeChange,
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
  durationSeconds: number;
  onDurationChange: (value: number) => void;
  audioMode: AudioMode;
  onAudioModeChange: (value: AudioMode) => void;
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

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="work-duration">{t("ugc_video_duration")}</Label>
          <Select
            value={String(durationSeconds)}
            onValueChange={(value) => onDurationChange(Number(value))}
          >
            <SelectTrigger id="work-duration" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CLIP_SPEC.durations.map((value) => (
                <SelectItem key={value} value={String(value)}>
                  {value}s
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="work-audio-mode">{t("ugc_video_audio_mode")}</Label>
          <Select
            value={audioMode}
            onValueChange={(value) => onAudioModeChange(value as AudioMode)}
          >
            <SelectTrigger id="work-audio-mode" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AUDIO_MODES.map((value) => (
                <SelectItem key={value} value={value}>
                  {t(`ugc_video_audio_${value}`)}
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
