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
  initialState,
  modelOptions,
}: {
  detail: WorkDetail;
  products: ProductRow[];
  talents: TalentRow[];
  initialState: WorkState;
  modelOptions: readonly VideoModelOption[];
}) {
  const router = useRouter();
  const refresh = () => router.refresh();
  const liveState = useWorkState(detail.work.id, initialState);

  const { work, script, clip, versions, frames } = detail;
  // A step is finished with, one way or another: the work row says the
  // handler gave up, or its task run did.
  const failed = liveState.stepStatus === "failed" || liveState.run.failed;
  const taskActive =
    liveState.run.status === "queued" ||
    liveState.run.status === "running" ||
    liveState.run.status === "waiting";

  let body: ReactNode;
  const renderingNewVersion = Boolean(
    clip &&
    liveState.step === "video" &&
    liveState.stepStatus === "running" &&
    taskActive &&
    !failed,
  );
  const visibleStep = clip && !renderingNewVersion ? "done" : liveState.step;

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
          liveState.run.status,
          liveState.run.progress,
        )}
        generationFailed={liveState.step === "video" && failed}
        failureCode={liveState.run.failureCode}
        stalled={liveState.run.stalled}
        onRefresh={refresh}
      />
    );
  } else if (work.step === "product") {
    body = (
      <ProductStep
        detail={detail}
        products={products}
        talents={talents}
        productState={liveState.productState}
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
        failureCode={liveState.run.failureCode}
        stalled={liveState.run.stalled}
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
        busy={
          renderingNewVersion || (!clip && liveState.stepStatus === "running")
        }
        videoMode={work.videoMode}
      />
      <WorkSummary detail={detail} />
      {body}
    </div>
  );
}
