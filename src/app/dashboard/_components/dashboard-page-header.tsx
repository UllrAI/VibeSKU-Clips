"use client";

import type { ReactNode } from "react";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb-client";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ModeToggle } from "@/components/mode-toggle";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

interface DashboardPageHeaderProps {
  title: ReactNode;
  parentTitle?: ReactNode;
  parentUrl?: string;
  showSidebarTrigger?: boolean;
}

/**
 * Where the operator is, and the two controls that belong to the session
 * rather than to any page. Page actions live with the content they act on, so
 * the header never competes with the work surface for the primary action.
 */
export function DashboardPageHeader({
  title,
  parentTitle,
  parentUrl,
  showSidebarTrigger = true,
}: DashboardPageHeaderProps) {
  return (
    <header className="bg-background/95 supports-backdrop-filter:bg-background/75 sticky top-0 z-20 flex h-(--header-height) shrink-0 items-center gap-2 border-b backdrop-blur">
      <div className="flex w-full items-center justify-between gap-2 px-4 lg:px-6">
        <div className="flex min-w-0 items-center gap-1 lg:gap-2">
          {showSidebarTrigger && (
            <>
              <SidebarTrigger className="-ml-1" />
              <Separator
                orientation="vertical"
                className="mx-2 data-[orientation=vertical]:h-4"
              />
            </>
          )}
          <Breadcrumb>
            <BreadcrumbList>
              {parentTitle && (
                <>
                  <BreadcrumbItem className="hidden md:block">
                    <BreadcrumbLink href={parentUrl}>
                      {parentTitle}
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator className="hidden md:block" />
                </>
              )}
              <BreadcrumbItem className="min-w-0">
                <BreadcrumbPage className="truncate font-semibold">
                  {title}
                </BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <LocaleSwitcher variant="ghost" size="icon" />
          <ModeToggle variant="ghost" size="icon" />
        </div>
      </div>
    </header>
  );
}
