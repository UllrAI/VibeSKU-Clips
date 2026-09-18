import { z } from "zod";
import {
  BLUEPRINT_BEAT_ROLES,
  BLUEPRINT_EVENT_KINDS,
  BLUEPRINT_FORMATS,
} from "./types";

/**
 * The shape a blueprint must hold, whether a model wrote it or an operator
 * corrected it. Both paths validate against this, so an edited reading can
 * never be something the script writer cannot consume.
 */
export const cloneBlueprintSchema = z.object({
  format: z.enum(BLUEPRINT_FORMATS),
  hook: z.string().trim().min(1).max(600),
  whyItWorks: z.string().trim().min(1).max(1200),
  beats: z
    .array(
      z.object({
        role: z.enum(BLUEPRINT_BEAT_ROLES),
        purpose: z.string().trim().min(1).max(400),
        sourceStart: z.number().min(0),
        sourceEnd: z.number().min(0),
        spokenGist: z.string().trim().max(400),
        events: z
          .array(
            z.object({
              kind: z.enum(BLUEPRINT_EVENT_KINDS),
              respondsTo: z.string().trim().min(1).max(300),
              purpose: z.string().trim().min(1).max(300),
            }),
          )
          .max(6),
      }),
    )
    .min(1)
    .max(12),
  preserve: z.array(z.string().trim().min(1).max(300)).min(1).max(8),
  redesign: z.array(z.string().trim().min(1).max(300)).max(8),
});
