"use client";

import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * A filter box that carries its own affordances: the icon says what the field
 * is for without a label, and the clear button spares the operator from
 * selecting and deleting text to get the full list back.
 */
export function SearchInput({
  value,
  onValueChange,
  placeholder,
  clearLabel,
  className,
}: {
  value: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  clearLabel: string;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <Search
        className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
        aria-hidden="true"
      />
      <Input
        type="search"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="px-9 [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute top-1/2 right-1 size-7 -translate-y-1/2"
          onClick={() => onValueChange("")}
        >
          <X className="size-3.5" aria-hidden="true" />
          <span className="sr-only">{clearLabel}</span>
        </Button>
      )}
    </div>
  );
}
