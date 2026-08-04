"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n";

/**
 * "Read available models" button + chip list for a model field.
 *
 * Typing a model name from memory is the most common way to misconfigure an endpoint, and the only
 * feedback is a 404 at generation time. Local Ollama makes it worse: `ollama pull qwen2.5:7b-instruct`
 * installs an id with a tag that must be typed in full (issue #19 follow-up). One click lists what the
 * endpoint actually serves; one more fills the field.
 */
export function ModelPicker({
  baseUrl,
  apiKey,
  onPick,
}: {
  baseUrl: string;
  apiKey: string;
  onPick: (model: string) => void;
}) {
  const t = useT("settings");
  const [state, setState] = useState<"idle" | "loading">("idle");
  const [models, setModels] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");

  const load = async () => {
    setState("loading");
    setError("");
    try {
      const res = await fetch("/api/llm/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl, apiKey }),
      });
      const data = await res.json().catch(() => ({ ok: false }));
      setModels(Array.isArray(data.models) ? data.models : []);
      if (!data.ok) setError(data.error || t("modelListFailed"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("modelListFailed"));
    }
    setState("idle");
  };

  // Long catalogues (OpenRouter ships 300+) need a filter to be usable at all.
  const shown = filter ? models.filter((m) => m.toLowerCase().includes(filter.toLowerCase())) : models;

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={load}
        disabled={!baseUrl || state === "loading"}
        className="text-[11px] text-primary underline underline-offset-2 disabled:opacity-50 disabled:no-underline"
      >
        {state === "loading" ? t("modelListLoading") : t("modelListButton")}
      </button>
      {error && <p className="text-[11px] text-destructive break-all">{error}</p>}
      {models.length > 0 && (
        <div className="rounded-md border border-border/50 bg-muted/30 p-2 space-y-1.5">
          {models.length > 12 && (
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t("modelListFilter")}
              className="w-full rounded border border-border/50 bg-background px-2 py-1 text-[11px] font-mono outline-none focus:border-primary/40"
            />
          )}
          <div className="flex max-h-28 flex-wrap gap-1 overflow-y-auto">
            {shown.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => onPick(m)}
                className="rounded border border-border/50 bg-background px-1.5 py-0.5 font-mono text-[10px] hover:border-primary/40 hover:text-primary transition-colors"
              >
                {m}
              </button>
            ))}
            {shown.length === 0 && <span className="text-[11px] text-muted-foreground">{t("modelListNoMatch")}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
