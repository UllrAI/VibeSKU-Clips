"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { actionMessageKey } from "@/components/ugc/action-message";
import { ProductFields } from "@/components/ugc/product-fields";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTranslation } from "@/lib/i18n/translation/client";
import { createProduct, updateProduct } from "@/lib/ugc/actions";
import {
  canCreateProduct,
  EMPTY_PRODUCT_INPUT,
  type ProductInput,
} from "@/lib/ugc/product-input";
import type { ProductRow } from "@/lib/ugc/queries";

function initialValue(product: ProductRow | null): ProductInput {
  return product
    ? {
        name: product.name,
        sourceUrl: product.sourceUrl ?? "",
        info: product.info,
        images: product.images,
      }
    : EMPTY_PRODUCT_INPUT;
}

export function ProductForm({
  product,
  open,
  onOpenChange,
}: {
  product: ProductRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState<ProductInput>(() => initialValue(product));

  const submit = () =>
    startTransition(async () => {
      const result = product
        ? await updateProduct(product.id, value)
        : await createProduct(value);
      if (!result.ok) {
        toast.error(t(actionMessageKey(result.code)));
        return;
      }

      toast.success(
        t(product ? "ugc_product_material_updated" : "ugc_product_created"),
      );
      onOpenChange(false);
      if (!product && result.id) {
        router.push(`/dashboard/products/${result.id}`);
        return;
      }
      router.refresh();
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {product ? t("ugc_product_edit_title") : t("ugc_product_new_title")}
          </DialogTitle>
          <DialogDescription>
            {t(
              product
                ? "ugc_product_form_description"
                : "ugc_product_create_description",
            )}
          </DialogDescription>
        </DialogHeader>

        <ProductFields
          idPrefix={product ? "edit-product" : "new-product"}
          value={value}
          onChange={setValue}
        />

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            {t("ugc_common_cancel")}
          </Button>
          <Button
            onClick={submit}
            disabled={
              pending ||
              !canCreateProduct(value) ||
              Boolean(product && !value.name.trim())
            }
          >
            {product ? t("ugc_common_save") : t("ugc_product_create_and_read")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
