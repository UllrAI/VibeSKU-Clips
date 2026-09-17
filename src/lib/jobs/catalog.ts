import type { z } from "zod";
import type { JobDefinition } from "./definition";
import { exampleProcessJob } from "./example";
import { workScriptJob } from "./ugc/work-script";
import { workStoryboardJob } from "./ugc/work-storyboard";
import { workVideoJob } from "./ugc/work-video";
import { workSegmentJob } from "./ugc/work-segment";
import { workComposeJob } from "./ugc/work-compose";
import { productIngestJob } from "./ugc/product-ingest";
import { talentGenerateJob } from "./ugc/talent-generate";

/**
 * Element type used where the queue walks the whole registry. Payload types
 * differ per job, so they are erased here; the queue re-validates every payload
 * with the definition's own schema before the handler runs.
 */
export type AnyJobDefinition = JobDefinition<string, z.ZodType, unknown>;

export const jobDefinitions = [
  exampleProcessJob,
  productIngestJob,
  talentGenerateJob,
  workScriptJob,
  workStoryboardJob,
  workVideoJob,
  workSegmentJob,
  workComposeJob,
] as unknown as readonly AnyJobDefinition[];

export const deadLetterQueueName = "jobs.dead-letter";
