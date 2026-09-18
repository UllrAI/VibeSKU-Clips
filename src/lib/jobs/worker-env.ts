import { z } from "zod";

import {
  databaseEnvFields,
  mediaEnvFields,
  modelEnvFields,
  scrapingEnvFields,
  storageEnvFields,
} from "@/lib/config/runtime-env.mjs";

const workerEnvSchema = z.object({
  ...databaseEnvFields(5),
  ...storageEnvFields,
  LLM_API_KEY: z.string().trim().min(1).optional(),
  ...modelEnvFields,
  ...scrapingEnvFields,
  ...mediaEnvFields,
});

export function loadWorkerEnv(source: NodeJS.ProcessEnv = process.env) {
  const parsed = workerEnvSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(
      `Invalid worker environment: ${z.prettifyError(parsed.error)}`,
    );
  }

  return {
    ...parsed.data,
    JOB_DATABASE_URL: parsed.data.JOB_DATABASE_URL ?? parsed.data.DATABASE_URL,
  };
}
