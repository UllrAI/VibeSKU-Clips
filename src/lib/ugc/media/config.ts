import { z } from "zod";
import { mediaEnvFields } from "@/lib/config/runtime-env.mjs";

const mediaEnvSchema = z.object(mediaEnvFields);

export type MediaEnv = z.infer<typeof mediaEnvSchema>;

/**
 * Media credentials are read straight from the process environment because the
 * renderer runs in both the Web process and the standalone job worker, which
 * validate their environments separately.
 */
export function loadMediaEnv(
  source: NodeJS.ProcessEnv = process.env,
): MediaEnv {
  const parsed = mediaEnvSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(
      `Invalid media provider environment: ${z.prettifyError(parsed.error)}`,
    );
  }
  return parsed.data;
}
