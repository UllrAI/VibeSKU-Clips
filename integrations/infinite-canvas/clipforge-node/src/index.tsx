// ClipForge video node for Infinite Canvas.
//
// Turns canvas material into a finished, publishable 9:16 short video by driving
// a local ClipForge instance (https://github.com/xixihhhh/clipforge): script LLM
// → free stock footage → free TTS voiceover + captions → FFmpeg compose, with the
// China-compliance stack (AIGC badge, ad-law screening) on by default.
//
// Two modes, picked automatically:
//   - product mode: upstream IMAGE nodes are product photos — they are uploaded
//     into the project (product-card overlay in the final cut) and the node's
//     inputs feed the commerce script chain
//   - topic mode: no upstream images — one sentence in, finished video out
// The finished video lands back on the canvas as a builtin video node, connected
// downstream, so it can be referenced/remixed like any other canvas asset.
import { definePlugin, useEffect, useRef, useState } from "@infinite-canvas/plugin-sdk";
import type { CanvasNodeContentProps } from "@infinite-canvas/plugin-sdk";

type Cfg = { base: string; llmBaseUrl: string; llmApiKey: string; llmModel: string };
const CFG_KEY = "clipforge-config";
const DEFAULT_CFG: Cfg = { base: "http://localhost:3000", llmBaseUrl: "", llmApiKey: "", llmModel: "" };

/** Minimal JSON client against the ClipForge HTTP API */
async function api(base: string, path: string, init?: { method?: string; body?: unknown }): Promise<Record<string, any>> {
    let res: Response;
    try {
        res = await fetch(`${base}${path}`, {
            method: init?.method || "GET",
            headers: init?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
            body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
        });
    } catch {
        throw new Error(`连不上 ClipForge（${base}）。请先启动实例，并确认其版本 ≥ v0.8.79（含跨端口 CORS）。`);
    }
    const text = await res.text();
    let data: Record<string, any>;
    try {
        data = text ? JSON.parse(text) : {};
    } catch {
        data = { raw: text };
    }
    if (!res.ok) throw new Error(data?.error || data?.raw || `HTTP ${res.status}`);
    return data;
}

/** Free-voice default by writing system (mirrors ClipForge MCP's defaultVoiceForTopic) */
function voiceFor(text: string): string | undefined {
    if (/[぀-ヿ]/.test(text)) return "ja-JP-NanamiNeural";
    if (/[가-힣]/.test(text)) return "ko-KR-SunHiNeural";
    if (/[一-鿿]/.test(text)) return undefined; // server-side Chinese default
    return "en-US-AriaNeural";
}

/** Poll the compose run until done/failed (compose is async on the ClipForge side) */
async function pollCompose(base: string, projectId: string, compositionId: string, onTick: (s: string) => void): Promise<string> {
    const deadline = Date.now() + 660_000;
    for (;;) {
        const { composition } = await api(base, `/api/project/${projectId}/compose?compositionId=${encodeURIComponent(compositionId)}`);
        if (composition?.status === "done") {
            if (!composition.url) throw new Error("合成完成但没有视频地址");
            return `${base}${composition.url}`;
        }
        if (composition?.status === "failed") throw new Error("合成失败（FFmpeg/TTS 出错）");
        if (Date.now() > deadline) throw new Error("合成超时，可去 ClipForge 网页端查看结果");
        onTick("合成中（配音+字幕+剪辑）…");
        await new Promise((r) => setTimeout(r, 2500));
    }
}

function ClipForgeContent({ ctx }: CanvasNodeContentProps) {
    const [cfg, setCfg] = useState<Cfg>(DEFAULT_CFG);
    const [cfgOpen, setCfgOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [stage, setStage] = useState("");
    const [error, setError] = useState("");
    const cfgLoaded = useRef(false);

    // plugin-scoped persisted settings (instance URL + LLM config), loaded once
    useEffect(() => {
        ctx.storage.get<Cfg>(CFG_KEY).then((saved) => {
            if (saved) setCfg({ ...DEFAULT_CFG, ...saved });
            cfgLoaded.current = true;
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const saveCfg = (patch: Partial<Cfg>) => {
        const next = { ...cfg, ...patch };
        setCfg(next);
        if (cfgLoaded.current) void ctx.storage.set(CFG_KEY, next);
    };

    const name = String(ctx.node.metadata?.cfName || "");
    const points = String(ctx.node.metadata?.cfPoints || "");
    const duration = Number(ctx.node.metadata?.cfDuration || 25);
    const upstreamImages = ctx
        .getUpstream()
        .filter((n) => n.type === "image" && typeof n.metadata?.content === "string" && n.metadata.content)
        .map((n) => String(n.metadata!.content));
    const productMode = upstreamImages.length > 0;

    const llmReady = !!(cfg.llmBaseUrl && cfg.llmApiKey && cfg.llmModel);
    const llmConfig = { baseUrl: cfg.llmBaseUrl, apiKey: cfg.llmApiKey, model: cfg.llmModel };
    const base = cfg.base.replace(/\/+$/, "");

    const run = async () => {
        if (busy) return;
        if (!name.trim()) return setError(productMode ? "先填商品名" : "先填一句话主题");
        if (!llmReady) {
            setCfgOpen(true);
            return setError("先在 ⚙ 设置里配置 LLM（OpenAI 兼容接口）");
        }
        setBusy(true);
        setError("");
        try {
            let projectId: string;
            if (productMode) {
                // commerce chain: project → upload product photos → commerce script
                setStage("创建项目…");
                const proj = await api(base, "/api/project", {
                    method: "POST",
                    body: { name: name.trim(), productName: name.trim(), productDescription: points.trim(), productImages: [] },
                });
                projectId = proj.id;
                setStage(`上传商品图（${upstreamImages.length} 张）…`);
                const fd = new FormData();
                for (let i = 0; i < upstreamImages.length; i++) {
                    const blob = await (await fetch(upstreamImages[i])).blob();
                    const ext = blob.type.includes("png") ? "png" : blob.type.includes("webp") ? "webp" : "jpg";
                    fd.append("files", blob, `canvas-${i + 1}.${ext}`);
                }
                fd.append("projectId", projectId);
                const upRes = await fetch(`${base}/api/upload`, { method: "POST", body: fd });
                const up = await upRes.json();
                if (!upRes.ok || !Array.isArray(up.paths)) throw new Error(up?.error || "商品图上传失败");
                await api(base, `/api/project/${projectId}`, { method: "PATCH", body: { productImages: up.paths } });
                setStage("AI 写带货脚本…");
                await api(base, "/api/llm/script", {
                    method: "POST",
                    body: {
                        projectId,
                        productName: name.trim(),
                        productDescription: points.trim(),
                        productImages: up.paths,
                        styleType: "auto",
                        targetDuration: duration,
                        llmConfig,
                    },
                });
            } else {
                // topic chain: one sentence → script + project in one call
                setStage("AI 写旁白脚本…");
                const scriptRes = await api(base, "/api/topic/script", {
                    method: "POST",
                    body: { topic: [name.trim(), points.trim()].filter(Boolean).join("，"), narrationStyle: "knowledge", targetDuration: duration, llmConfig },
                });
                projectId = scriptRes.projectId;
            }

            setStage("免费素材库配画面…");
            const fill = await api(base, `/api/project/${projectId}/stock-fill`, {
                method: "POST",
                body: { source: "all", mediaType: "image", llmConfig },
            });
            if (!fill.filled) throw new Error("素材库没配到画面，换个更具体的主题重试");

            setStage("提交合成…");
            const composeBody: Record<string, unknown> = { freeTts: { enabled: true }, freeBgm: true, bgmDuck: true };
            const voice = voiceFor(name);
            if (voice) (composeBody.freeTts as Record<string, unknown>).voice = voice;
            if (productMode) composeBody.productCard = true;
            const { compositionId } = await api(base, `/api/project/${projectId}/compose`, { method: "POST", body: composeBody });
            const videoUrl = await pollCompose(base, projectId, compositionId, setStage);

            // land the finished video on the canvas as a first-class builtin video node
            const outId = `clipforge-out-${ctx.node.id}-${Date.now().toString(36)}`;
            ctx.applyOps([
                {
                    type: "add_node",
                    id: outId,
                    nodeType: "video",
                    title: name.trim().slice(0, 24) || "ClipForge 成片",
                    x: ctx.node.position.x + ctx.node.width + 60,
                    y: ctx.node.position.y,
                    width: 270,
                    height: 480,
                    metadata: { content: videoUrl, status: "success", mimeType: "video/mp4" },
                },
                { type: "connect_nodes", fromNodeId: ctx.node.id, toNodeId: outId },
            ]);
            ctx.updateMetadata({ cfVideoUrl: videoUrl, cfProjectId: projectId });
            setStage(`完成 ✓ 项目 ${projectId.slice(0, 8)}…（ClipForge 网页端可继续多平台导出）`);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
            setStage("");
        } finally {
            setBusy(false);
        }
    };

    const t = ctx.theme;
    const inputStyle = { width: "100%", boxSizing: "border-box", padding: "5px 8px", borderRadius: 8, border: `1px solid ${t.node.stroke}`, background: t.node.panel, color: t.node.text, fontSize: 12, outline: "none" } as const;
    const labelStyle = { fontSize: 11, color: t.node.muted } as const;
    const btn = { padding: "6px 12px", borderRadius: 8, border: `1px solid ${t.node.activeStroke}`, background: t.toolbar.activeBg, color: t.toolbar.activeText, cursor: "pointer", fontSize: 12, fontWeight: 600 } as const;

    return (
        <div data-canvas-no-zoom onMouseDown={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()} style={{ height: "100%", width: "100%", display: "flex", flexDirection: "column", gap: 6, padding: 12, boxSizing: "border-box", color: t.node.text, overflow: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700 }}>🎬 ClipForge 成片</span>
                <span style={{ ...labelStyle, marginLeft: "auto" }}>{productMode ? `带货 · ${upstreamImages.length} 图` : "主题模式"}</span>
                <button type="button" title="设置" onClick={() => setCfgOpen((v) => !v)} style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 13, color: t.node.muted }}>⚙</button>
            </div>
            {cfgOpen && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: 8, borderRadius: 8, border: `1px dashed ${t.node.stroke}` }}>
                    <span style={labelStyle}>ClipForge 地址</span>
                    <input style={inputStyle} value={cfg.base} onChange={(e) => saveCfg({ base: e.target.value })} placeholder="http://localhost:3000" />
                    <span style={labelStyle}>LLM 接口（OpenAI 兼容，用于写脚本）</span>
                    <input style={inputStyle} value={cfg.llmBaseUrl} onChange={(e) => saveCfg({ llmBaseUrl: e.target.value })} placeholder="https://api.atlascloud.ai/v1" />
                    <input style={inputStyle} type="password" value={cfg.llmApiKey} onChange={(e) => saveCfg({ llmApiKey: e.target.value })} placeholder="API Key" />
                    <input style={inputStyle} value={cfg.llmModel} onChange={(e) => saveCfg({ llmModel: e.target.value })} placeholder="模型 ID" />
                </div>
            )}
            <span style={labelStyle}>{productMode ? "商品名（连上游图片节点=商品图）" : "一句话主题（连上游图片节点切带货模式）"}</span>
            <input style={inputStyle} value={name} onChange={(e) => ctx.updateMetadata({ cfName: e.target.value })} placeholder={productMode ? "如：黑胡桃木手机支架" : "如：在家如何手冲一杯好咖啡"} />
            <span style={labelStyle}>卖点/补充（可空）</span>
            <input style={inputStyle} value={points} onChange={(e) => ctx.updateMetadata({ cfPoints: e.target.value })} placeholder="如：实木质感，稳固不晃，办公桌高级感" />
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <select style={{ ...inputStyle, width: "auto" }} value={duration} onChange={(e) => ctx.updateMetadata({ cfDuration: Number(e.target.value) })}>
                    <option value={15}>15s</option>
                    <option value={25}>25s</option>
                    <option value={40}>40s</option>
                </select>
                <button type="button" style={{ ...btn, opacity: busy ? 0.5 : 1, cursor: busy ? "wait" : "pointer" }} disabled={busy} onClick={run}>
                    {busy ? "出片中…" : "▶ 出片"}
                </button>
            </div>
            {stage && <div style={{ fontSize: 11, color: t.node.muted }}>{stage}</div>}
            {error && <div style={{ fontSize: 11, color: "#ef4444", whiteSpace: "pre-wrap" }}>{error}</div>}
            {typeof ctx.node.metadata?.cfVideoUrl === "string" && !busy && (
                <a href={String(ctx.node.metadata.cfVideoUrl)} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: t.node.label }}>↗ 打开成片 mp4</a>
            )}
        </div>
    );
}

export default definePlugin({
    id: "clipforge",
    name: "ClipForge 成片",
    version: "1.0.0",
    description: "画布素材一键变成可发布的带货短视频：脚本→素材→配音字幕→合成，全流程本地 ClipForge 驱动。",
    nodes: [
        {
            type: "clipforge:ad-video",
            title: "ClipForge 成片",
            icon: "🎬",
            description: "连上商品图，一键出 9:16 带货成片（本地 ClipForge 实例驱动）",
            defaultSize: { width: 320, height: 330 },
            defaultMetadata: { cfName: "", cfPoints: "", cfDuration: 25 },
            minimapColor: "#7c3aed",
            // downstream consumers see the finished video as this node's resource
            resource: (node) =>
                typeof node.metadata?.cfVideoUrl === "string" && node.metadata.cfVideoUrl
                    ? { kind: "video", url: node.metadata.cfVideoUrl }
                    : null,
            Content: ClipForgeContent,
        },
    ],
});
