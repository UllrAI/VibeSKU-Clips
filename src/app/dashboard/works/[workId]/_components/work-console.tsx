"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { StepRail } from "@/components/ugc/step-rail";
import { useWorkState } from "@/hooks/use-work-state";
import type { ProductRow, TalentRow } from "@/lib/ugc/queries";
import type { WorkDetail, WorkState } from "@/lib/ugc/works";
import type { VideoModelOption } from "@/lib/ugc/constants";
import { videoGenerationPhase } from "@/lib/ugc/video-progress";
import { DoneStep } from "./done-step";
import { PendingStep } from "./pending-step";
import { ProductStep } from "./product-step";
import { ScriptStep } from "./script-step";
import { StoryboardStep } from "./storyboard-step";
import { WorkSummary } from "./work-summary";

/**
 * One work, one step at a time. The rail says where the operator is in the
 * whole flow; the card below is the only thing they have to act on.
 */
export function WorkConsole({
  detail,
  products,
  talents,
  productState,
  initialState,
  modelOptions,
}: {
  detail: WorkDetail;
  products: ProductRow[];
  talents: TalentRow[];
  productState: "empty" | "reading" | "needs_input" | "ready";
  initialState: WorkState;
  modelOptions: readonly VideoModelOption[];
}) {
  const router = useRouter();
  const refresh = () => router.refresh();
  useWorkState(detail.work.id, initialState);

  const { work, script, clip, versions, frames } = detail;
  // A step is finished with, one way or another: the work row says the
  // handler gave up, or its task run did.
  const failed = work.stepStatus === "failed" || detail.run.failed;
  const taskActive =
    detail.run.status === "queued" ||
    detail.run.status === "running" ||
    detail.run.status === "waiting";

  let body: ReactNode;
  const renderingNewVersion = Boolean(
    clip &&
    work.step === "video" &&
    work.stepStatus === "running" &&
    taskActive &&
    !failed,
  );
  const visibleStep = clip && !renderingNewVersion ? "done" : work.step;

  if (clip) {
    body = (
      <DoneStep
        key={clip.id}
        workId={work.id}
        clip={clip}
        versions={versions}
        script={script}
        videoMode={work.videoMode}
        videoModel={work.videoModel}
        resolution={work.resolution}
        modelOptions={modelOptions}
        rendering={renderingNewVersion}
        generationPhase={videoGenerationPhase(
          detail.run.status,
          detail.run.progress,
        )}
        generationFailed={work.step === "video" && failed}
        failureCode={detail.run.failureCode}
        stalled={detail.run.stalled}
        onRefresh={refresh}
      />
    );
  } else if (work.step === "product") {
    body = (
      <ProductStep
        detail={detail}
        products={products}
        talents={talents}
        productState={productState}
        modelOptions={modelOptions}
        onRefresh={refresh}
      />
    );
  } else if (work.step === "script" && work.stepStatus === "review" && script) {
    body = (
      <ScriptStep
        workId={work.id}
        script={script}
        videoMode={work.videoMode}
        onRefresh={refresh}
      />
    );
  } else if (work.step === "storyboard" && !failed && frames.length > 0) {
    body = (
      <StoryboardStep
        workId={work.id}
        frames={frames}
        aspectRatio={work.aspectRatio}
        onRefresh={refresh}
      />
    );
  } else {
    body = (
      <PendingStep
        workId={work.id}
        step={
          work.step === "script"
            ? "script"
            : work.step === "storyboard"
              ? "storyboard"
              : "video"
        }
        failed={failed}
        failureCode={detail.run.failureCode}
        stalled={detail.run.stalled}
        frames={work.step === "video" ? frames : []}
        videoMode={work.videoMode}
        aspectRatio={work.aspectRatio}
        onRefresh={refresh}
      />
    );
  }

  return (
    <div className="space-y-4">
      <StepRail
        step={visibleStep}
        busy={renderingNewVersion || (!clip && work.stepStatus === "running")}
        videoMode={work.videoMode}
      />
      <WorkSummary detail={detail} />
      {body}
    </div>
  );
}
