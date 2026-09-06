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
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

interface DashboardPageHeaderProps {
  title: ReactNode;
  parentTitle?: ReactNode;
  parentUrl?: string;
  actions?: ReactNode;
  showSidebarTrigger?: boolean;
}

export function DashboardPageHeader({
  title,
  parentTitle,
  parentUrl,
  actions,
  showSidebarTrigger = true,
}: DashboardPageHeaderProps) {
  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b">
      <div className="flex w-full items-center justify-between gap-1 px-4 lg:gap-2 lg:px-6">
        <div className="flex items-center gap-1 lg:gap-2">
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
              <BreadcrumbItem>
                <BreadcrumbPage className="font-semibold">
                  {title}
                </BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
