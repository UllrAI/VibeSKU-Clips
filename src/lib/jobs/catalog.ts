import type { z } from "zod";
import type { JobDefinition } from "./definition";
import { exampleProcessJob } from "./example";
import { batchRunJob } from "./ugc/batch-run";
import { workScriptJob } from "./ugc/work-script";
import { workStoryboardJob } from "./ugc/work-storyboard";
import { workVideoJob } from "./ugc/work-video";
import { clipRenderJob } from "./ugc/clip-render";
import { productIngestJob } from "./ugc/product-ingest";

/**
 * Element type used where the queue walks the whole registry. Payload types
 * differ per job, so they are erased here; the queue re-validates every payload
 * with the definition's own schema before the handler runs.
 */
export type AnyJobDefinition = JobDefinition<string, z.ZodType, unknown>;

export const jobDefinitions = [
  exampleProcessJob,
  productIngestJob,
  batchRunJob,
  workScriptJob,
  workStoryboardJob,
  workVideoJob,
  clipRenderJob,
] as unknown as readonly AnyJobDefinition[];

export const deadLetterQueueName = "jobs.dead-letter";
