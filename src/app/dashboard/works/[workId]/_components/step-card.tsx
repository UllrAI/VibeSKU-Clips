import type { ReactNode } from "react";
import { Card, CardContent, CardFooter } from "@/components/ui/card";

/**
 * The shell every step shares: what this step is, the work surface, and the
 * one action that moves on. Keeping the shape identical across steps means
 * the primary action never moves as the operator walks the flow.
 */
export function StepCard({
  title,
  description,
  children,
  action,
  secondary,
}: {
  title: ReactNode;
  description: ReactNode;
  children: ReactNode;
  action: ReactNode;
  secondary?: ReactNode;
}) {
  return (
    <Card>
      <CardContent className="space-y-5 pt-6">
        <div className="space-y-1">
          <h2 className="text-base font-medium">{title}</h2>
          <p className="text-muted-foreground text-sm">{description}</p>
        </div>
        {children}
      </CardContent>
      <CardFooter className="flex flex-wrap items-center justify-between gap-3 border-t">
        <div className="flex items-center gap-2">{secondary}</div>
        {action}
      </CardFooter>
    </Card>
  );
}
