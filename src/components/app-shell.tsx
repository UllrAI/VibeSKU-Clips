"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Box,
  ChevronDown,
  ChevronLeft,
  Flame,
  Folder,
  House,
  Layers3,
  Menu,
  Moon,
  ScanLine,
  Settings,
  Sun,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { LanguageToggle } from "@/components/language-toggle";
import { TaskCenter } from "@/components/task-center";
import { useT } from "@/lib/i18n";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/* eslint-disable @next/next/no-img-element -- the logo is a small local SVG */

interface NavItem {
  key: string;
  href: string;
  icon: LucideIcon;
}

/**
 * Two destinations, because there are two things a person comes here to do: make a video, or
 * find one they already made. Everything else is a tool that serves one of those two and lives
 * in the toolbox below, closed until someone goes looking (issue #1).
 */
const NAV_PRIMARY: NavItem[] = [
  { key: "navHome", href: "/start", icon: House },
  { key: "navProjects", href: "/projects", icon: Folder },
];

/** Specialist entry points. Real capabilities, just not the first decision anyone has to make. */
const NAV_TOOLS: NavItem[] = [
  { key: "navClone", href: "/project/clone", icon: Flame },
  { key: "navBatch", href: "/batch", icon: Layers3 },
  { key: "navMediaLab", href: "/media-lab", icon: ScanLine },
  { key: "navProducts", href: "/products", icon: Box },
  { key: "navPresenters", href: "/presenters", icon: UserRound },
];

const NAV_ITEMS = [...NAV_PRIMARY, ...NAV_TOOLS];

const NAV_COLLAPSED_KEY = "clipforge_nav_collapsed";
const THEME_KEY = "clipforge_theme";

function applyTheme(theme: "light" | "dark") {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
    meta.setAttribute("content", theme === "dark" ? "oklch(0.15 0.02 50)" : "oklch(0.99 0.01 85)");
  });
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const t = useT("common");
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  // Open the toolbox automatically when the current page lives inside it, so the active item is
  // never hidden behind a closed section.
  const [toolsOpen, setToolsOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        setCollapsed(localStorage.getItem(NAV_COLLAPSED_KEY) === "1");
        const savedTheme = localStorage.getItem(THEME_KEY);
        const nextTheme = savedTheme === "light" || savedTheme === "dark"
          ? savedTheme
          : window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
        setTheme(nextTheme);
        applyTheme(nextTheme);
      } catch {
        applyTheme("dark");
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    applyTheme(nextTheme);
    try {
      localStorage.setItem(THEME_KEY, nextTheme);
    } catch {
      // Theme still applies for the current session.
    }
  };

  const toggleCollapsed = () => {
    setCollapsed((current) => {
      const next = !current;
      try {
        localStorage.setItem(NAV_COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        // The visual state still works for the current session.
      }
      return next;
    });
  };

  const active = NAV_ITEMS.reduce<string | null>((best, item) => {
    if (!pathname?.startsWith(item.href)) return best;
    return best && best.length >= item.href.length ? best : item.href;
  }, null);
  const settingsActive = pathname?.startsWith("/settings") ?? false;
  const toolActive = NAV_TOOLS.some((item) => active === item.href);

  const navLink = (item: NavItem) => {
    const Icon = item.icon;
    const isActive = active === item.href;
    return (
      <Link
        key={item.key}
        href={item.href}
        aria-current={isActive ? "page" : undefined}
        title={collapsed ? t(item.key) : undefined}
        className={`flex min-h-9 items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/60 ${collapsed ? "justify-center px-0" : ""} ${
          isActive
            ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        }`}
      >
        <Icon className="size-4 shrink-0" strokeWidth={1.8} aria-hidden="true" />
        {!collapsed && t(item.key)}
      </Link>
    );
  };

  const themeToggle = (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={t(theme === "dark" ? "themeToLight" : "themeToDark")}
      title={t(theme === "dark" ? "themeLight" : "themeDark")}
      className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/60"
    >
      {theme === "dark" ? <Sun className="size-4" aria-hidden="true" /> : <Moon className="size-4" aria-hidden="true" />}
    </button>
  );

  return (
    <div className="flex min-h-screen">
      <a
        href="#main-content"
        className="sr-only z-[100] rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground focus:fixed focus:left-3 focus:top-3 focus:not-sr-only"
      >
        {t("skipToContent")}
      </a>

      <aside
        className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] md:flex ${collapsed ? "w-16" : "w-56"}`}
      >
        <Link
          href="/start"
          className={`flex min-h-16 items-center gap-2.5 border-b border-sidebar-border ${collapsed ? "justify-center px-0" : "px-4"}`}
        >
          <img src="/icon.svg" alt="" width={30} height={30} className="rounded-lg" />
          {!collapsed && <span className="text-base font-semibold tracking-tight">VibeSKU Clips</span>}
        </Link>

        <nav aria-label={t("navMenu")} className={`flex-1 space-y-4 overflow-y-auto py-4 ${collapsed ? "px-2" : "px-3"}`}>
          <div className="space-y-1">{NAV_PRIMARY.map(navLink)}</div>

          {collapsed ? (
            <div className="space-y-1 border-t border-sidebar-border pt-3">{NAV_TOOLS.map(navLink)}</div>
          ) : (
            <Collapsible open={toolsOpen || toolActive} onOpenChange={setToolsOpen} className="border-t border-sidebar-border pt-3">
              <CollapsibleTrigger className="flex w-full items-center justify-between px-3 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground/70">
                {t("navSectionTools")}
                <ChevronDown data-chevron className="size-3.5" aria-hidden="true" />
              </CollapsibleTrigger>
              <CollapsiblePanel>
                <div className="space-y-1 pt-1">{NAV_TOOLS.map(navLink)}</div>
              </CollapsiblePanel>
            </Collapsible>
          )}
        </nav>

        <div className={`space-y-1 border-t border-sidebar-border py-3 ${collapsed ? "px-2" : "px-3"}`}>
          <div className={collapsed ? "flex justify-center" : ""}>
            <TaskCenter collapsed={collapsed} />
          </div>
          <Link
            href="/settings"
            aria-current={settingsActive ? "page" : undefined}
            title={collapsed ? t("settings") : undefined}
            className={`flex min-h-9 items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/60 ${collapsed ? "justify-center px-0" : ""} ${
              settingsActive
                ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <Settings className="size-4 shrink-0" strokeWidth={1.8} aria-hidden="true" />
            {!collapsed && t("settings")}
          </Link>
          <div className={`flex min-h-9 items-center ${collapsed ? "flex-col justify-center gap-1" : "justify-between px-1.5"}`}>
            {!collapsed && <LanguageToggle />}
            <div className="flex items-center gap-1">
              {themeToggle}
              <button
                type="button"
                onClick={toggleCollapsed}
                aria-label={t(collapsed ? "navExpand" : "navCollapse")}
                title={t(collapsed ? "navExpand" : "navCollapse")}
                className={`flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-[color,background-color,transform] hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/60 ${collapsed ? "rotate-180" : ""}`}
              >
                <ChevronLeft className="size-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-50 flex h-12 items-center justify-between border-b border-border bg-background px-4 md:hidden">
          <Link href="/start" className="flex items-center gap-2">
            <img src="/icon.svg" alt="" width={24} height={24} className="rounded-md" />
            <span className="text-sm font-semibold tracking-tight">VibeSKU Clips</span>
          </Link>
          <div className="flex items-center gap-1">
            <TaskCenter collapsed />
            {themeToggle}
            <LanguageToggle />
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label={t("navMenu")}
                className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
              >
                <Menu className="size-4" aria-hidden="true" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {NAV_ITEMS.map((item) => (
                  <DropdownMenuItem key={item.key} onClick={() => router.push(item.href)}>
                    {t(item.key)}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuItem onClick={() => router.push("/settings")}>
                  {t("settings")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <div id="main-content" className="min-w-0 flex-1">
          {children}
        </div>
      </div>
    </div>
  );
}
