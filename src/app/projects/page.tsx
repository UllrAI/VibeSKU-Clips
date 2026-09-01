"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { LuChevronRight, LuPlus, LuFolderOpen, LuLoader, LuTrash2, LuDownload, LuImage, LuPlay } from "react-icons/lu";
import { useT, useLocale } from "@/lib/i18n";
import { formatRelativeTime } from "@/lib/relative-time";
import { PageContainer, PageHeader } from "@/components/page-layout";

interface ProjectRow {
  id: string;
  name: string;
  productName: string | null;
  productImages?: string[] | null;
  status: string;
  updatedAt: string | null;
}

interface WorkRow {
  id: string;
  projectId: string;
  projectName: string | null;
  productName: string | null;
  label: string | null;
  duration: number | null;
  createdAt: string | null;
  url: string;
  thumbnailUrl: string | null;
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
 * Project library with two views:
 * - Projects: every project, searchable, resuming at the right step — now with a poster
 *   (latest render's first frame, falling back to the product photo) and a delete entrance.
 * - Works: the cross-project feed of finished videos, newest first, found by their pictures
 *   instead of by opening N export pages one by one.
 */
export default function ProjectsPage() {
  const t = useT("projectsPage");
  const tc = useT("common");
  const locale = useLocale();
  const [rows, setRows] = useState<ProjectRow[]>([]);
  const [works, setWorks] = useState<WorkRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"projects" | "works">("projects");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [projRes, workRes] = await Promise.all([
          fetch("/api/project"),
          fetch("/api/works").catch(() => null),
        ]);
        if (!projRes.ok) throw new Error(String(projRes.status));
        const data = await projRes.json();
        const list: ProjectRow[] = Array.isArray(data) ? data : [];
        const ts = (p: ProjectRow) => {
          if (!p.updatedAt) return 0;
          const time = new Date(p.updatedAt).getTime();
          return Number.isFinite(time) ? time : 0;
        };
        if (!cancelled) setRows([...list].sort((a, b) => ts(b) - ts(a)));
        if (workRes?.ok) {
          const w = await workRes.json().catch(() => ({}));
          if (!cancelled && Array.isArray(w?.works)) setWorks(w.works as WorkRow[]);
        }
      } catch {
        if (!cancelled) setLoadError(t("loadError"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch once; t is stable per locale
  }, []);

  // works are newest-first → first occurrence per project = its latest poster
  const posterByProject = useMemo(() => {
    const m = new Map<string, string>();
    for (const w of works) {
      if (w.thumbnailUrl && !m.has(w.projectId)) m.set(w.projectId, w.thumbnailUrl);
    }
    return m;
  }, [works]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((p) =>
      (p.name || "").toLowerCase().includes(q) || (p.productName || "").toLowerCase().includes(q)
    );
  }, [rows, query]);

  // delete = destructive: text-level confirm first; the row disappears only after the API succeeds
  const handleDelete = async (p: ProjectRow) => {
    if (!window.confirm(t("deleteConfirm", { name: p.name || p.productName || t("untitled") }))) return;
    try {
      const res = await fetch(`/api/project/${p.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(String(res.status));
      setRows((prev) => prev.filter((r) => r.id !== p.id));
      setWorks((prev) => prev.filter((w) => w.projectId !== p.id));
    } catch {
      window.alert(t("deleteFailed"));
    }
  };

  return (
    <div className="min-h-screen page-canvas">
      <PageContainer width="standard">
        <PageHeader
          title={t("pageTitle")}
          description={t("pageSubtitle")}
          actions={
            <Button render={<Link href="/project/new" />} className="brand-fill text-white">
              <LuPlus className="h-4 w-4" />
              <span className="ml-1.5">{t("newProject")}</span>
            </Button>
          }
        />

        {/* projects / works view switch */}
        <div className="mb-6 flex flex-col gap-3 rounded-xl border border-border bg-card p-2.5 sm:flex-row sm:items-center">
          <div className="flex rounded-lg border border-border/50 p-0.5">
            {(["projects", "works"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                aria-pressed={view === v}
                className={`rounded-md px-4 py-1.5 text-xs font-medium transition-colors ${
                  view === v ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t(v === "projects" ? "tabProjects" : "tabWorks")}
                {v === "works" && works.length > 0 && <span className="ml-1 opacity-70">({works.length})</span>}
              </button>
            ))}
          </div>
          {view === "projects" && rows.length > 0 && (
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("searchPlaceholder")}
              aria-label={t("searchPlaceholder")}
              className="w-full text-sm sm:ml-auto sm:max-w-md"
            />
          )}
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-16 justify-center text-sm text-muted-foreground">
            <LuLoader className="h-4 w-4 animate-spin" />
            {tc("loading")}
          </div>
        ) : loadError ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {loadError}
          </div>
        ) : view === "works" ? (
          works.length === 0 ? (
            <Card className="surface-panel">
              <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
                <LuImage className="h-8 w-8 text-muted-foreground/60" />
                <div>
                  <p className="font-medium">{t("worksEmpty")}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{t("worksEmptyDesc")}</p>
                </div>
                <Button render={<Link href="/start" />} size="sm" className="mt-2">{t("goStart")}</Button>
              </CardContent>
            </Card>
          ) : (
            <>
              <p className="mb-3 text-xs text-muted-foreground">{t("worksCount", { n: works.length })}</p>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
                {works.map((w) => {
                  const rel = formatRelativeTime(w.createdAt, locale);
                  return (
                    <Card key={w.id} className="surface-panel interactive-surface group overflow-hidden">
                      <CardContent className="p-0">
                        <Link href={`/project/${w.projectId}/export`} className="block">
                          <div className="relative aspect-[3/4] bg-muted/30">
                            {w.thumbnailUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element -- local file server, next/image adds nothing
                              <img src={w.thumbnailUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                            ) : (
                              <div className="absolute inset-0 flex items-center justify-center">
                                <LuPlay className="h-7 w-7 text-muted-foreground/50" />
                              </div>
                            )}
                            {w.label && (
                              <span className="absolute left-1.5 top-1.5 max-w-[85%] truncate rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                                {w.label}
                              </span>
                            )}
                          </div>
                        </Link>
                        <div className="flex items-center justify-between gap-1 p-2.5">
                          <div className="min-w-0">
                            <p className="truncate text-xs font-medium">{w.productName || w.projectName || t("untitled")}</p>
                            <p className="truncate text-[11px] text-muted-foreground">{rel}</p>
                          </div>
                          <a
                            href={`${w.url}?download=1`}
                            title={t("download")}
                            aria-label={`${t("download")}：${w.productName || w.projectName || t("untitled")}`}
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                          >
                            <LuDownload className="h-3.5 w-3.5" />
                          </a>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </>
          )
        ) : rows.length === 0 ? (
          <Card className="surface-panel">
            <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
              <LuFolderOpen className="h-8 w-8 text-muted-foreground/60" />
              <div>
                <p className="font-medium">{t("empty")}</p>
                <p className="mt-1 text-sm text-muted-foreground">{t("emptyDesc")}</p>
              </div>
              <div className="mt-2 flex gap-2">
                <Button render={<Link href="/start" />} size="sm">{t("goStart")}</Button>
                <Button render={<Link href="/project/new" />} size="sm" variant="outline">{t("goNew")}</Button>
              </div>
            </CardContent>
          </Card>
        ) : filtered.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">{t("noMatch")}</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card divide-y divide-border">
            {filtered.map((p) => {
              const rel = formatRelativeTime(p.updatedAt, locale);
              const poster = posterByProject.get(p.id) ?? (p.productImages?.[0] || null);
              return (
                <div key={p.id} className="group flex min-w-0 items-center gap-3 p-3 transition-colors hover:bg-muted/20 sm:gap-4 sm:p-4">
                  <Link href={`/project/${p.id}/${stepFor(p.status)}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:gap-4">
                      <div className="relative h-16 w-24 shrink-0 overflow-hidden rounded-lg bg-muted/30 sm:h-[72px] sm:w-28">
                        {poster ? (
                          // eslint-disable-next-line @next/next/no-img-element -- local file server, next/image adds nothing
                          <img src={poster} alt="" loading="lazy" className="h-full w-full object-cover" />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <LuImage className="h-7 w-7 text-muted-foreground/40" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium sm:text-base">
                          {p.name || p.productName || t("untitled")}
                        </p>
                        {p.productName && <p className="mt-1 truncate text-sm text-muted-foreground">{p.productName}</p>}
                        {rel && <p className="mt-1 text-xs text-muted-foreground sm:hidden">{rel}</p>}
                      </div>
                      <Badge variant={p.status === "done" ? "default" : "secondary"} className="hidden text-xs sm:inline-flex">
                        {tc(statusKeyFor(p.status))}
                      </Badge>
                      <span className="hidden w-28 text-right text-xs text-muted-foreground lg:block">{rel}</span>
                      <LuChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    </Link>
                  <button
                    type="button"
                    onClick={() => handleDelete(p)}
                    title={t("deleteProject")}
                    aria-label={`${t("deleteProject")}：${p.name || p.productName || t("untitled")}`}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <LuTrash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </PageContainer>
    </div>
  );
}
