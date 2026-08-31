import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const containerWidth = {
  compact: "max-w-5xl",
  standard: "max-w-6xl",
  wide: "max-w-[1500px]",
  fluid: "max-w-none",
} as const;

export function PageContainer({
  children,
  className,
  width = "standard",
}: {
  children: ReactNode;
  className?: string;
  width?: keyof typeof containerWidth;
}) {
  return (
    <main
      className={cn(
        "mx-auto w-full px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10",
        containerWidth[width],
        className,
      )}
    >
      {children}
    </main>
  );
}

export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "mb-8 flex flex-col gap-4 border-b border-border/60 pb-6 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0 max-w-3xl">
        {eyebrow && (
          <div className="mb-2 text-xs font-semibold tracking-[0.14em] text-primary">
            {eyebrow}
          </div>
        )}
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        {description && (
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
