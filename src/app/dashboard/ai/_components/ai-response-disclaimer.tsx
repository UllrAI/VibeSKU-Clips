"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface AiResponseDisclaimerProps {
  message: string;
}

export function AiResponseDisclaimer({ message }: AiResponseDisclaimerProps) {
  const [open, setOpen] = useState(false);

  // Carries its own provider so it can sit in any chrome without one.
  return (
    <TooltipProvider>
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-muted-foreground/60 hover:text-muted-foreground size-8"
            aria-label={message}
            onClick={() => setOpen(true)}
          >
            <Info className="size-3.5" aria-hidden="true" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6} className="max-w-64">
          {message}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
