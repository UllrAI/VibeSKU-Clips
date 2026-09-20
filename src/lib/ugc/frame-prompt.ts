import { z } from "zod";
import { PRISM_MEDIA } from "./constants";

/**
 * A generated frame prompt can legitimately run to tens of thousands of
 * characters. Keep edits within the same limit as the image provider instead
 * of applying a shorter form-field limit to the full generated prompt.
 */
export const framePromptSchema = z
  .string()
  .trim()
  .min(1)
  .max(PRISM_MEDIA.maxImagePromptCharacters);
