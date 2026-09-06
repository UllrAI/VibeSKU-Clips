import type * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const emptyStateVariants = cva(
  "border-border flex flex-col items-center justify-center rounded-lg border border-dashed text-center",
  {
    variants: {
      spacing: {
        compact: "gap-2 px-6 py-8",
        default: "gap-3 px-6 py-14",
      },
    },
    defaultVariants: { spacing: "default" },
  },
);

interface EmptyStateProps
  extends
    Omit<React.ComponentProps<"div">, "title">,
    VariantProps<typeof emptyStateVariants> {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
}

/**
 * The one empty state in the product. It is deliberately quiet: a dashed
 * outline rather than a solid card, so an empty list reads as an absence of
 * content instead of a piece of content in its own right.
 */
export function EmptyState({
  className,
  spacing,
  icon,
  title,
  description,
  action,
  ...props
}: EmptyStateProps) {
  return (
    <div className={cn(emptyStateVariants({ spacing }), className)} {...props}>
      {icon && (
        <div className="text-muted-foreground [&_svg]:size-6">{icon}</div>
      )}
      <p className="text-base font-medium">{title}</p>
      {description && (
        <p className="text-muted-foreground max-w-sm text-sm text-balance">
          {description}
        </p>
      )}
      {action && <div className="pt-1">{action}</div>}
    </div>
  );
}
