import { describe, it, expect } from "vitest";
import { isLLMReady, isMediaReady, migrateSettings, type SettingsState } from "@/lib/stores/settings-store";
import { applyLLMPreset, LLM_PRESETS, RECOMMENDED_PRESET } from "@/lib/llm-presets";

const ollama = LLM_PRESETS.find((p) => p.apiKey)!;

describe("isLLMReady / isMediaReady（所有页面共用同一个「已配置」判定）", () => {
  it("端点、Key、模型三者齐全才算就绪", () => {
    expect(isLLMReady({ provider: "", baseUrl: "https://x/v1", apiKey: "k", model: "m" })).toBe(true);
    expect(isLLMReady({ provider: "", baseUrl: "", apiKey: "k", model: "m" })).toBe(false);
    expect(isLLMReady({ provider: "", baseUrl: "https://x/v1", apiKey: "  ", model: "m" })).toBe(false);
    expect(isLLMReady({ provider: "", baseUrl: "https://x/v1", apiKey: "k", model: "" })).toBe(false);
    expect(isLLMReady(undefined)).toBe(false);
  });

  it("媒体网关需要 Key 与 Secret 两项", () => {
    expect(isMediaReady({ apiKey: "k", apiSecret: "s" })).toBe(true);
    expect(isMediaReady({ apiKey: "k", apiSecret: "" })).toBe(false);
  });
});

describe("applyLLMPreset（切换预设不残留占位 Key）", () => {
  const current = { provider: "", baseUrl: "https://old/v1", apiKey: "sk-real", model: "old", visionModel: "old-v" };

  it("换到别的带 Key 端点时保留用户自己的 Key", () => {
    const next = applyLLMPreset(RECOMMENDED_PRESET, current);
    expect(next.baseUrl).toBe(RECOMMENDED_PRESET.baseUrl);
    expect(next.model).toBe(RECOMMENDED_PRESET.model);
    expect(next.apiKey).toBe("sk-real");
  });

  it("Ollama 预设填占位 Key；再切回带 Key 端点时占位 Key 被清空", () => {
    const local = applyLLMPreset(ollama, current);
    expect(local.apiKey).toBe(ollama.apiKey);
    expect(applyLLMPreset(RECOMMENDED_PRESET, local).apiKey).toBe("");
  });
});

describe("migrateSettings v7（删掉重复的分辨率/比例默认值，下架模型的 id 复位）", () => {
  it("defaultResolution / defaultAspectRatio 不再带入新状态", () => {
    const out = migrateSettings({ defaultResolution: "1080p", defaultAspectRatio: "16:9" }) as SettingsState & Record<string, unknown>;
    expect(out.defaultResolution).toBeUndefined();
    expect(out.defaultAspectRatio).toBeUndefined();
  });

  it("已下架的 Sora 模型 id 回到默认视频模型", () => {
    expect(migrateSettings({ defaultVideoModel: "sora2" }).defaultVideoModel).toBe("minimax-h3");
    expect(migrateSettings({ defaultVideoModel: "sora2-pro" }).defaultVideoModel).toBe("minimax-h3");
  });
});
