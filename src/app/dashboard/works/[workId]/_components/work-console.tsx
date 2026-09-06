"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { StepRail } from "@/components/ugc/step-rail";
import { useWorkState } from "@/hooks/use-work-state";
import type { ProductRow, TalentRow } from "@/lib/ugc/queries";
import type { WorkDetail, WorkState } from "@/lib/ugc/works";
import type { VideoResolution } from "@/lib/ugc/constants";
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
  resolutionOptions,
}: {
  detail: WorkDetail;
  products: ProductRow[];
  talents: TalentRow[];
  productState: "empty" | "reading" | "needs_input" | "ready";
  initialState: WorkState;
  resolutionOptions: readonly VideoResolution[];
}) {
  const router = useRouter();
  const refresh = () => router.refresh();
  useWorkState(detail.work.id, initialState);

  const { work, script, clip, frames } = detail;
  // A step is finished with, one way or another: the work row says the
  // handler gave up, or its task run did.
  const failed = work.stepStatus === "failed" || detail.run.failed;

  let body: ReactNode;
  if (work.step === "product") {
    body = (
      <ProductStep
        detail={detail}
        products={products}
        talents={talents}
        productState={productState}
        resolutionOptions={resolutionOptions}
        onRefresh={refresh}
      />
    );
  } else if (work.step === "done" && clip) {
    body = (
      <DoneStep
        workId={work.id}
        clip={clip}
        videoMode={work.videoMode}
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
        step={work.step}
        busy={work.stepStatus === "running"}
        videoMode={work.videoMode}
      />
      <WorkSummary detail={detail} />
      {body}
    </div>
  );
}
