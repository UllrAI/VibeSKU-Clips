"use client";

import { ProjectStepper } from "@/components/project-stepper";

/**
 * Slim sticky context strip for the four project pipeline pages
 * (script / assets / video / export). The global chrome (logo, nav,
 * language toggle) lives in AppShell — this strip only carries what is
 * page-specific: the project name and the step navigation.
 *
 * Sticky offset: sits below the mobile top bar (h-12) on small screens,
 * flush to the top on md+ where the sidebar replaces the top bar.
 */
export function ProjectHeader({ projectName }: { projectName?: string }) {
  return (
    <div className="sticky top-12 z-40 border-b border-border/50 bg-background/80 backdrop-blur-xl md:top-0">
      <div className="mx-auto flex h-12 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
        <span className="min-w-0 truncate text-sm font-medium text-muted-foreground">
          {projectName ?? ""}
        </span>
        <ProjectStepper />
      </div>
    </div>
  );
}
