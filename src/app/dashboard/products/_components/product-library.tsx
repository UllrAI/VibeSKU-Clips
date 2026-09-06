"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Package, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchInput } from "@/components/ui/search-input";
import { StatusBadge } from "@/components/ugc/status-badge";
import { marketKey } from "@/components/ugc/labels";
import { useTranslation } from "@/lib/i18n/translation/client";
import type { ProductRow } from "@/lib/ugc/queries";
import { ProductForm } from "./product-form";

/**
 * The gallery is for finding a product; everything you can do to one lives on
 * its own page, next to the material and the facts it was read from.
 */
export function ProductLibrary({ products }: { products: ProductRow[] }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [formOpen, setFormOpen] = useState(false);

  const visible = products.filter((product) =>
    `${product.name} ${product.variant ?? ""}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          value={query}
          onValueChange={setQuery}
          placeholder={t("ugc_product_search_placeholder")}
          clearLabel={t("ugc_common_clear_search")}
          className="w-full max-w-xs"
        />
        <Button onClick={() => setFormOpen(true)}>
          <Plus />
          {t("ugc_product_new_title")}
        </Button>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          spacing="compact"
          icon={<Package />}
          title={t(query ? "ugc_common_no_matches" : "ugc_product_empty_title")}
          description={t(
            query ? "ugc_common_no_matches_hint" : "ugc_product_empty_hint",
          )}
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((product) => (
            <li key={product.id}>
              <Link
                href={`/dashboard/products/${product.id}`}
                className="border-border hover:bg-accent/50 flex h-full gap-4 rounded-lg border p-4 transition-colors"
              >
                <div className="border-border bg-muted relative size-16 shrink-0 overflow-hidden rounded-md border">
                  {product.images[0] ? (
                    <Image
                      src={product.images[0]}
                      alt=""
                      fill
                      sizes="64px"
                      className="object-cover"
                      unoptimized
                    />
                  ) : (
                    <Package
                      className="text-muted-foreground absolute inset-0 m-auto size-5"
                      aria-hidden
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate font-medium">{product.name}</h3>
                    <StatusBadge kind="product" status={product.status} />
                  </div>
                  <p className="text-muted-foreground truncate text-sm">
                    {[
                      product.variant,
                      product.market ? t(marketKey(product.market)) : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || t("ugc_common_not_set")}
                  </p>
                  <p className="text-muted-foreground line-clamp-2 text-sm">
                    {product.issue ?? product.facts?.summary ?? ""}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {formOpen && (
        <ProductForm
          product={null}
          open={formOpen}
          onOpenChange={setFormOpen}
        />
      )}
    </div>
  );
}
