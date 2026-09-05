"use client";

import { LuChevronDown } from "react-icons/lu";

import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

/**
 * One labelled, collapsed-by-default block of advanced controls.
 *
 * This is the replacement for the old global "simple / pro" switch. That switch asked people to
 * classify themselves before they had made anything, and it hid whole features from beginners
 * so thoroughly that the features stopped being discoverable at all. Disclosing per section
 * keeps every capability one click away, in the place it applies, for everyone.
 *
 * `summary` is what the section is worth knowing about while it stays shut — the current values,
 * not a description of the controls inside.
 */
export function DisclosureSection({
  title,
  summary,
  defaultOpen = false,
  className,
  children,
}: {
  title: string;
  summary?: string;
  defaultOpen?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Collapsible
      defaultOpen={defaultOpen}
      className={cn("rounded-xl border border-border/50 bg-muted/10", className)}
    >
      <CollapsibleTrigger className="flex w-full items-center justify-between px-3 py-2.5 text-left">
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="text-xs font-semibold tracking-wide text-foreground">{title}</span>
          {summary && <span className="truncate text-xs text-muted-foreground">{summary}</span>}
        </span>
        <LuChevronDown data-chevron className="size-4" aria-hidden="true" />
      </CollapsibleTrigger>
      <CollapsiblePanel>
        <div className="flex flex-wrap items-center gap-2 border-t border-border/50 px-3 py-2.5">{children}</div>
      </CollapsiblePanel>
    </Collapsible>
  );
}
