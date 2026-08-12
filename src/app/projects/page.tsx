"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { LuPlus, LuFolderOpen, LuLoader } from "react-icons/lu";
import { useT, useLocale } from "@/lib/i18n";
import { formatRelativeTime } from "@/lib/relative-time";

interface ProjectRow {
  id: string;
  name: string;
  productName: string | null;
  status: string;
  updatedAt: string | null;
}

// project status → the pipeline step to resume at (done lands on export where the film lives)
function stepFor(status: string): string {
  if (status === "done") return "export";
  if (status === "composing" || status === "video") return "video";
  if (status === "assets") return "assets";
  return "script";
}

// project status → common.status* i18n key
function statusKeyFor(status: string): string {
  switch (status) {
    case "done": return "statusDone";
    case "composing": return "statusComposing";
    case "video": return "statusVideo";
    case "assets": return "statusAssets";
    case "scripting": return "statusScripting";
    default: return "statusDraft";
  }
}

/**
 * Full project list page (/projects). Until now the only way back into an
 * old project was the four "recent" cards on /start — this page lists them
 * all, searchable, sorted by last edit, and resumes at the right step.
 */
export default function ProjectsPage() {
  const t = useT("projectsPage");
  const tc = useT("common");
  const locale = useLocale();
  const [rows, setRows] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/project");
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        const list: ProjectRow[] = Array.isArray(data) ? data : [];
        const ts = (p: ProjectRow) => {
          if (!p.updatedAt) return 0;
          const time = new Date(p.updatedAt).getTime();
          return Number.isFinite(time) ? time : 0;
        };
        if (!cancelled) setRows([...list].sort((a, b) => ts(b) - ts(a)));
      } catch {
        if (!cancelled) setLoadError(t("loadError"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch once; t is stable per locale
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((p) =>
      (p.name || "").toLowerCase().includes(q) || (p.productName || "").toLowerCase().includes(q)
    );
  }, [rows, query]);

  return (
    <div className="min-h-screen grid-bg">
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        {/* Page header: title + primary action, same pattern as the other library pages */}
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t("pageTitle")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("pageSubtitle")}</p>
          </div>
          <Link href="/project/new">
            <Button size="sm" className="brand-gradient text-white">
              <LuPlus className="h-4 w-4" />
              <span className="ml-1.5">{t("newProject")}</span>
            </Button>
          </Link>
        </div>

        {rows.length > 0 && (
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="mb-5 max-w-sm text-sm"
          />
        )}

        {loading ? (
          <div className="flex items-center gap-2 py-16 justify-center text-sm text-muted-foreground">
            <LuLoader className="h-4 w-4 animate-spin" />
            {tc("loading")}
          </div>
        ) : loadError ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {loadError}
          </div>
        ) : rows.length === 0 ? (
          <Card className="glass-card">
            <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
              <LuFolderOpen className="h-8 w-8 text-muted-foreground/60" />
              <div>
                <p className="font-medium">{t("empty")}</p>
                <p className="mt-1 text-sm text-muted-foreground">{t("emptyDesc")}</p>
              </div>
              <div className="mt-2 flex gap-2">
                <Link href="/start"><Button size="sm">{t("goStart")}</Button></Link>
                <Link href="/project/new"><Button size="sm" variant="outline">{t("goNew")}</Button></Link>
              </div>
            </CardContent>
          </Card>
        ) : filtered.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">{t("noMatch")}</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((p) => {
              const rel = formatRelativeTime(p.updatedAt, locale);
              return (
                <Link key={p.id} href={`/project/${p.id}/${stepFor(p.status)}`}>
                  <Card className="glass-card card-hover h-full">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 truncate text-sm font-medium">
                          {p.name || p.productName || t("untitled")}
                        </p>
                        <Badge variant={p.status === "done" ? "default" : "secondary"} className="shrink-0 text-[11px]">
                          {tc(statusKeyFor(p.status))}
                        </Badge>
                      </div>
                      <p className="mt-2 truncate text-xs text-muted-foreground">
                        {p.productName || ""}
                        {p.productName && rel ? " · " : ""}
                        {rel || ""}
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
