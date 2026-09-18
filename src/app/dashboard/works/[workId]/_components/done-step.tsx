"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  Check,
  ChevronDown,
  Download,
  FileText,
  LayoutGrid,
  Loader2,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  actionMessageKey,
  jobFailureKey,
} from "@/components/ugc/action-message";
import { videoModelKey } from "@/components/ugc/labels";
import { ScriptEditor } from "@/components/ugc/script-editor";
import { useIntlLocale } from "@/hooks/use-intl-locale";
import { useTranslation } from "@/lib/i18n/translation/client";
import { startNewWorkVideoVersion } from "@/lib/ugc/work-actions";
import type { VideoGenerationPhase } from "@/lib/ugc/video-progress";
import type {
  VideoMode,
  VideoModel,
  VideoModelOption,
  VideoResolution,
} from "@/lib/ugc/constants";
import type { ScriptRow } from "@/lib/ugc/queries";
import type { EditableScript } from "@/lib/ugc/types";
import type { ClipRow, WorkVersion } from "@/lib/ugc/works";
import { cn } from "@/lib/utils";
import { StepCard } from "./step-card";

function downloadUrl(url: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}download=1`;
}

/** Finished takes stay immutable and inspectable while a new one is rendering. */
export function DoneStep({
  workId,
  clip,
  versions,
  script,
  videoMode,
  videoModel,
  resolution,
  modelOptions,
  rendering,
  generationPhase,
  generationFailed,
  failureCode,
  stalled,
  onRefresh,
}: {
  workId: string;
  clip: ClipRow;
  versions: WorkVersion[];
  script: ScriptRow | null;
  videoMode: VideoMode;
  videoModel: VideoModel;
  resolution: VideoResolution;
  modelOptions: readonly VideoModelOption[];
  rendering: boolean;
  generationPhase: VideoGenerationPhase;
  generationFailed: boolean;
  failureCode: string | null;
  stalled: boolean;
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  const locale = useIntlLocale();
  const [pending, startTransition] = useTransition();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(clip.id);
  const [nextVideoModel, setNextVideoModel] = useState(videoModel);
  const [nextResolution, setNextResolution] = useState(resolution);
  const [draft, setDraft] = useState<EditableScript | null>(() =>
    script
      ? {
          title: script.title,
          hook: script.hook,
          productionPrompt: script.productionPrompt ?? "",
          beats: script.beats.map((beat) => ({
            ...beat,
            camera: beat.camera ?? t("ugc_script_camera_default"),
          })),
          captions: script.captions.join("\n"),
          publishCaption: script.publishCaption ?? undefined,
        }
      : null,
  );

  const selected =
    versions.find((version) => version.clip.id === selectedId) ??
    versions.find((version) => version.clip.id === clip.id) ??
    ({ clip, script: null } satisfies WorkVersion);
  const selectedClip = selected.clip;
  const checks = selectedClip.quality?.checks ?? [];
  const nextVersion = Math.max(
    clip.version + 1,
    ...versions.map((version) => version.clip.version + 1),
  );

  const openSettings = () => {
    if (!script) return;
    setDraft({
      title: script.title,
      hook: script.hook,
      productionPrompt: script.productionPrompt ?? "",
      beats: script.beats.map((beat) => ({
        ...beat,
        camera: beat.camera ?? t("ugc_script_camera_default"),
      })),
      captions: script.captions.join("\n"),
      publishCaption: script.publishCaption ?? undefined,
    });
    setNextVideoModel(videoModel);
    setNextResolution(resolution);
    setSettingsOpen(true);
  };

  const changeModel = (value: VideoModel) => {
    setNextVideoModel(value);
    const resolutions =
      modelOptions.find((option) => option.model === value)?.resolutions ?? [];
    if (!resolutions.includes(nextResolution)) {
      setNextResolution(resolutions.includes("720p") ? "720p" : resolutions[0]);
    }
  };

  const generate = () => {
    if (!draft) return;
    startTransition(async () => {
      try {
        const result = await startNewWorkVideoVersion(workId, {
          videoModel: nextVideoModel,
          resolution: nextResolution,
          script: {
            title: draft.title.trim(),
            hook: draft.hook.trim(),
            productionPrompt: draft.productionPrompt.trim(),
            beats: draft.beats.map((beat) => ({
              ...beat,
              shot: beat.shot.trim(),
              action: beat.action.trim(),
              camera: beat.camera?.trim() || t("ugc_script_camera_default"),
              voiceover: beat.voiceover.trim(),
            })),
            captions: draft.captions
              .split("\n")
              .map((line) => line.trim())
              .filter(Boolean),
            publishCaption: draft.publishCaption,
          },
        });
        if (!result.ok) {
          toast.error(t(actionMessageKey(result.code)));
          return;
        }
        setSettingsOpen(false);
        toast.success(
          t("ugc_work_new_version_started", { version: nextVersion }),
        );
        onRefresh();
      } catch {
        toast.error(t("ugc_error_unexpected"));
      }
    });
  };

  const inFlight = pending || rendering;
  const phaseKey =
    pending && !rendering
      ? "ugc_work_video_phase_accepted"
      : `ugc_work_video_phase_${generationPhase}`;

  return (
    <StepCard
      title={t("ugc_work_versions_title")}
      description={t("ugc_work_versions_hint")}
      secondary={
        <Button asChild variant="ghost" size="sm">
          <Link href="/dashboard/works">
            <LayoutGrid />
            {t("ugc_work_open_review")}
          </Link>
        </Button>
      }
      action={
        <Button onClick={openSettings} disabled={inFlight || !script}>
          {inFlight ? (
            <Loader2
              className="animate-spin motion-reduce:animate-none"
              aria-hidden
            />
          ) : (
            <RefreshCw />
          )}
          {t(
            inFlight
              ? "ugc_work_new_version_running"
              : generationFailed
                ? "ugc_work_retry_new_version"
                : "ugc_work_generate_new_version",
            { version: nextVersion },
          )}
        </Button>
      }
    >
      {generationFailed ? (
        <Alert variant="destructive">
          <AlertTitle>
            {t(
              failureCode === "INVALID_JOB_PAYLOAD"
                ? "ugc_work_new_version_not_started"
                : "ugc_work_new_version_failed",
              { version: nextVersion },
            )}
          </AlertTitle>
          <AlertDescription className="space-y-1">
            <span className="block">{t(jobFailureKey(failureCode))}</span>
            <span className="block">
              {t("ugc_work_current_version_unchanged", {
                version: clip.version,
              })}
            </span>
          </AlertDescription>
        </Alert>
      ) : stalled ? (
        <Alert variant="destructive">
          <AlertTitle>{t("ugc_work_stalled_title")}</AlertTitle>
          <AlertDescription>{t("ugc_work_stalled_hint")}</AlertDescription>
        </Alert>
      ) : inFlight ? (
        <Alert>
          <Loader2
            className="animate-spin motion-reduce:animate-none"
            aria-hidden
          />
          <AlertTitle>
            {t("ugc_work_new_version_running", { version: nextVersion })}
          </AlertTitle>
          <AlertDescription>{t(phaseKey)}</AlertDescription>
        </Alert>
      ) : null}

      <Tabs value={selectedClip.id} onValueChange={setSelectedId}>
        <TabsList
          variant="line"
          className="h-auto flex-wrap justify-start"
          aria-label={t("ugc_work_versions_title")}
        >
          {versions.map((version) => (
            <TabsTrigger key={version.clip.id} value={version.clip.id}>
              {t("ugc_work_version_label", {
                version: version.clip.version,
              })}
              {version.clip.id === clip.id && (
                <span className="text-muted-foreground">
                  {t("ugc_work_version_current")}
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="flex flex-col gap-5 sm:flex-row">
        <div
          className={cn(
            "border-border bg-muted relative w-full shrink-0 overflow-hidden rounded-lg border",
            selectedClip.aspectRatio === "9:16"
              ? "aspect-9/16 max-w-56"
              : "aspect-video sm:max-w-96",
          )}
        >
          {selectedClip.videoUrl ? (
            <video
              className="size-full object-cover"
              src={selectedClip.videoUrl}
              poster={selectedClip.coverUrl ?? undefined}
              controls
              preload="none"
            />
          ) : (
            <p className="text-muted-foreground p-4 text-sm">
              {selectedClip.failureReason ?? t("ugc_clip_no_preview")}
            </p>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>
              {t("ugc_work_version_label", { version: selectedClip.version })}
            </Badge>
            <span className="font-mono text-xs" translate="no">
              {selectedClip.reference}
            </span>
            <Badge
              variant={selectedClip.quality?.passed ? "secondary" : "outline"}
            >
              {t(
                selectedClip.quality?.passed
                  ? "ugc_work_quality_passed"
                  : "ugc_work_quality_flagged",
              )}
            </Badge>
            <Badge variant="outline">
              {t("ugc_video_model_used", {
                model: t(videoModelKey(selectedClip.videoModel)),
              })}
            </Badge>
          </div>

          <p className="text-muted-foreground text-xs tabular-nums">
            {new Date(selectedClip.createdAt).toLocaleString(locale)}
          </p>

          <ul className="space-y-1.5 text-sm">
            {checks.map((check) => (
              <li key={check.id} className="flex items-start gap-2">
                {check.passed ? (
                  <Check
                    className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                    aria-hidden
                  />
                ) : (
                  <TriangleAlert
                    className="text-destructive mt-0.5 size-4 shrink-0"
                    aria-hidden
                  />
                )}
                <span
                  className={check.passed ? "text-muted-foreground" : undefined}
                >
                  {check.detail}
                </span>
              </li>
            ))}
          </ul>

          {selectedClip.videoUrl && (
            <Button asChild size="sm" variant="outline">
              <a href={downloadUrl(selectedClip.videoUrl)} download>
                <Download />
                {t("ugc_work_download_version", {
                  version: selectedClip.version,
                })}
              </a>
            </Button>
          )}
        </div>
      </div>

      {selected.script && (
        <Collapsible className="border-border rounded-lg border">
          <CollapsibleTrigger className="hover:bg-accent/50 group flex w-full items-center justify-between gap-3 rounded-lg px-4 py-3 text-left transition-colors">
            <span className="flex items-center gap-2 text-sm font-medium">
              <FileText className="size-4" aria-hidden />
              {t("ugc_work_version_script")}
            </span>
            <ChevronDown
              className="text-muted-foreground size-4 shrink-0 transition-transform group-data-[state=open]:rotate-180"
              aria-hidden
            />
          </CollapsibleTrigger>
          <CollapsibleContent className="border-border space-y-4 border-t p-4">
            <div className="space-y-1">
              <p className="font-medium">{selected.script.title}</p>
              <p className="text-muted-foreground text-sm">
                {selected.script.hook}
              </p>
            </div>
            <ol className="divide-border border-border divide-y rounded-lg border">
              {selected.script.beats.map((beat) => (
                <li key={beat.start} className="flex gap-3 p-3 text-sm">
                  <Badge
                    variant="secondary"
                    className="h-5 shrink-0 font-normal tabular-nums"
                    translate="no"
                  >
                    {beat.start}–{beat.end}s
                  </Badge>
                  <div className="min-w-0 space-y-1">
                    <p>{beat.voiceover || beat.action}</p>
                    <p className="text-muted-foreground">{beat.action}</p>
                  </div>
                </li>
              ))}
            </ol>
            {selected.script.productionPrompt && (
              <Collapsible>
                <CollapsibleTrigger className="text-muted-foreground hover:text-foreground group flex items-center gap-1 text-sm">
                  <ChevronDown
                    className="size-4 transition-transform group-data-[state=open]:rotate-180"
                    aria-hidden
                  />
                  {t("ugc_script_production_prompt")}
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <p className="text-muted-foreground mt-2 text-sm whitespace-pre-wrap">
                    {selected.script.productionPrompt}
                  </p>
                </CollapsibleContent>
              </Collapsible>
            )}
          </CollapsibleContent>
        </Collapsible>
      )}

      <Sheet
        open={settingsOpen}
        onOpenChange={(open) => !pending && setSettingsOpen(open)}
      >
        <SheetContent
          side="right"
          className="w-full gap-0 p-0 sm:max-w-3xl"
          showCloseButton={!pending}
        >
          <SheetHeader className="border-border border-b px-5 py-4 pr-12">
            <SheetTitle>
              {t("ugc_work_new_version_settings_title", {
                version: nextVersion,
              })}
            </SheetTitle>
            <SheetDescription>
              {t("ugc_work_new_version_settings_hint")}
            </SheetDescription>
          </SheetHeader>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
            <section className="border-border space-y-3 rounded-lg border p-4">
              <div>
                <h3 className="text-sm font-medium">
                  {t("ugc_work_new_version_render_settings")}
                </h3>
                <p className="text-muted-foreground mt-1 text-xs">
                  {t("ugc_work_new_version_render_settings_hint")}
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="new-version-model">
                    {t("ugc_video_model")}
                  </Label>
                  <Select
                    value={nextVideoModel}
                    onValueChange={(value) => changeModel(value as VideoModel)}
                  >
                    <SelectTrigger id="new-version-model" className="w-full">
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
                  <Label htmlFor="new-version-resolution">
                    {t("ugc_video_resolution")}
                  </Label>
                  <Select
                    value={nextResolution}
                    onValueChange={(value) =>
                      setNextResolution(value as VideoResolution)
                    }
                  >
                    <SelectTrigger
                      id="new-version-resolution"
                      className="w-full"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(
                        modelOptions.find(
                          (option) => option.model === nextVideoModel,
                        )?.resolutions ?? []
                      ).map((value) => (
                        <SelectItem key={value} value={value}>
                          {value === "2k" ? "2K" : value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <div>
                <h3 className="text-sm font-medium">
                  {t("ugc_work_new_version_script_title")}
                </h3>
                <p className="text-muted-foreground mt-1 text-xs">
                  {t("ugc_work_new_version_script_hint")}
                </p>
              </div>
              {draft && (
                <ScriptEditor
                  idPrefix="new-version-script"
                  value={draft}
                  onChange={setDraft}
                  videoMode={videoMode}
                  compact
                />
              )}
            </section>
          </div>

          <div className="border-border bg-background flex flex-col-reverse gap-2 border-t p-4 sm:flex-row sm:items-center sm:justify-end">
            <Button
              variant="outline"
              onClick={() => setSettingsOpen(false)}
              disabled={pending}
            >
              {t("ugc_common_cancel")}
            </Button>
            <Button
              onClick={generate}
              disabled={
                pending ||
                !draft?.title.trim() ||
                !draft.hook.trim() ||
                !draft.beats.some((beat) => beat.voiceover.trim())
              }
            >
              {pending && (
                <Loader2
                  className="animate-spin motion-reduce:animate-none"
                  aria-hidden
                />
              )}
              {t("ugc_work_generate_version", { version: nextVersion })}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </StepCard>
  );
}
