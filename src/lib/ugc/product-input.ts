import { z } from "zod";
import { fileKeyFromUrl } from "@/lib/uploads/url";
import { MAX_PRODUCT_IMAGES } from "./constants";

export const imageReferenceSchema = z
  .string()
  .trim()
  .min(1)
  .max(2000)
  .refine((value) => {
    if (fileKeyFromUrl(value)) return true;
    try {
      return new URL(value).protocol === "https:";
    } catch {
      return false;
    }
  });

export const productInputSchema = z.object({
  name: z.string().trim().max(200),
  sourceUrl: z
    .string()
    .trim()
    .max(2000)
    .refine((value) => {
      if (!value) return true;
      try {
        return new URL(value).protocol === "https:";
      } catch {
        return false;
      }
    }),
  info: z.string().trim().max(40_000),
  images: z.array(imageReferenceSchema).max(MAX_PRODUCT_IMAGES),
});

export type ProductInput = z.infer<typeof productInputSchema>;

export const EMPTY_PRODUCT_INPUT: ProductInput = {
  name: "",
  sourceUrl: "",
  info: "",
  images: [],
};

/** A link can fill the material; a manual product needs a name and a photo. */
export function canCreateProduct(input: ProductInput): boolean {
  return Boolean(
    input.sourceUrl.trim() || (input.name.trim() && input.images.length > 0),
  );
}
