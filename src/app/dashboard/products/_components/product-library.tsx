"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Plus, RefreshCw, Trash2, SquarePen } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ugc/status-badge";
import { actionMessageKey } from "@/components/ugc/action-message";
import { marketKey } from "@/components/ugc/labels";
import { useTranslation } from "@/lib/i18n/translation/client";
import { deleteProduct, startProductAnalysis } from "@/lib/ugc/actions";
import type { ProductRow } from "@/lib/ugc/queries";
import { ProductForm } from "./product-form";

export function ProductLibrary({ products }: { products: ProductRow[] }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<ProductRow | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const visible = products.filter((product) =>
    `${product.name} ${product.variant ?? ""}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );

  const run = (
    action: () => Promise<{ ok: boolean; code?: string }>,
    successKey: string,
  ) =>
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        toast.error(t(actionMessageKey(result.code)));
        return;
      }
      toast.success(t(successKey));
      router.refresh();
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("ugc_product_search_placeholder")}
          className="max-w-xs"
          aria-label={t("ugc_product_search_placeholder")}
        />
        <Button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <Plus />
          {t("ugc_product_new_title")}
        </Button>
      </div>

      {visible.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm font-medium">
              {t("ugc_product_empty_title")}
            </p>
            <p className="text-muted-foreground mt-1 text-sm">
              {t("ugc_product_empty_hint")}
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {visible.map((product) => (
            <li key={product.id}>
              <Card className="h-full">
                <CardContent className="flex gap-4 pt-6">
                  {product.images[0] ? (
                    <div className="border-border relative size-20 shrink-0 overflow-hidden rounded-md border">
                      <Image
                        src={product.images[0]}
                        alt=""
                        fill
                        sizes="80px"
                        className="object-cover"
                        unoptimized
                      />
                    </div>
                  ) : null}
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate font-medium">{product.name}</h3>
                      <StatusBadge kind="product" status={product.status} />
                    </div>
                    <p className="text-muted-foreground text-sm">
                      {[
                        product.variant,
                        product.market ? t(marketKey(product.market)) : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || t("ugc_common_not_set")}
                    </p>
                    {product.facts?.summary && (
                      <p className="text-muted-foreground line-clamp-2 text-sm">
                        {product.facts.summary}
                      </p>
                    )}
                    {product.issue && (
                      <p className="text-destructive text-sm">
                        {product.issue}
                      </p>
                    )}
                    {!product.shopUrl && (
                      <p className="text-muted-foreground text-xs">
                        {t("ugc_product_no_shop_url")}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => {
                          setEditing(product);
                          setFormOpen(true);
                        }}
                      >
                        <SquarePen />
                        {t("ugc_common_edit")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() =>
                          run(
                            () => startProductAnalysis(product.id),
                            "ugc_product_analysis_queued",
                          )
                        }
                      >
                        <RefreshCw />
                        {t("ugc_product_reanalyze")}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() =>
                          run(
                            () => deleteProduct(product.id),
                            "ugc_product_deleted",
                          )
                        }
                      >
                        <Trash2 />
                        {t("ugc_common_delete")}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {formOpen && (
        <ProductForm
          key={editing?.id ?? "new"}
          product={editing}
          open={formOpen}
          onOpenChange={setFormOpen}
        />
      )}
    </div>
  );
}
