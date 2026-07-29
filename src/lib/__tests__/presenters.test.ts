import { describe, it, expect } from "vitest";
import { PRESENTER_PRESETS, REAL_FACE_CONSTRAINT, realFaceLine, presenterPromptBlock } from "@/lib/presenters";
import { buildMotionPrompt } from "@/lib/motion-prompt";
import { stylePrompts } from "@/lib/script-engine/prompts";
import { buildAssetRows } from "@/lib/assets-view";
import type { Shot } from "@/lib/db/schema";

describe("内置主播库与真实人脸约束", () => {
  it("6 个预设：id 唯一、性别合法、外观全部带素人特征描述", () => {
    expect(PRESENTER_PRESETS).toHaveLength(6);
    expect(new Set(PRESENTER_PRESETS.map((p) => p.id)).size).toBe(6);
    for (const p of PRESENTER_PRESETS) {
      expect(["female", "male"]).toContain(p.gender);
      expect(p.appearance).toMatch(/耐看|亲和|清爽|自然真实|温和|憨厚|端正/);
    }
  });

  it("真实人脸约束中英：禁网红脸也禁刻意丑化", () => {
    expect(REAL_FACE_CONSTRAINT.zh).toContain("网红脸");
    expect(REAL_FACE_CONSTRAINT.zh).toContain("刻意丑化");
    expect(REAL_FACE_CONSTRAINT.en).toContain("influencer");
    expect(REAL_FACE_CONSTRAINT.en).toContain("deliberately unattractive");
  });

  it("realFaceLine 跟随上下文语言", () => {
    expect(realFaceLine("卧室梳妆台前的女生")).toBe(REAL_FACE_CONSTRAINT.zh);
    expect(realFaceLine("a woman at a vanity table")).toBe(REAL_FACE_CONSTRAINT.en);
    expect(realFaceLine("")).toBe(REAL_FACE_CONSTRAINT.zh);
  });

  it("主播库文本包含全部预设名（供 LLM 选用）", () => {
    const block = presenterPromptBlock();
    for (const p of PRESENTER_PRESETS) expect(block).toContain(p.name);
  });
});

describe("真实人脸约束的注入链路", () => {
  it("motion prompt：personShot=true 注入约束（中英），false 不注入", () => {
    const zh = buildMotionPrompt({ shotType: "hook", description: "女生对镜头说话", personShot: true });
    expect(zh).toContain("网红脸");
    const en = buildMotionPrompt({ shotType: "hook", description: "a woman talks to camera", personShot: true });
    expect(en).toContain("influencer");
    expect(buildMotionPrompt({ shotType: "hook", description: "女生对镜头说话" })).not.toContain("网红脸");
  });

  it("对话/口播风格公式都带素人要求与内置主播库", () => {
    for (const s of ["drama", "interview", "talking_head"] as const) {
      expect(stylePrompts[s], s).toContain("素人");
      expect(stylePrompts[s], s).toContain("内置素人主播库");
    }
  });

  it("buildAssetRows 透传 characterId（触发约束的信号）", () => {
    const shot = {
      shotId: 1, type: "hook", duration: 3, description: "小美说话", camera: "",
      visualSource: "ai_generate", transition: "cut", voiceover: "台词", characterId: "char_a",
    } as unknown as Shot;
    const rows = buildAssetRows([shot], [], []);
    expect(rows[0].characterId).toBe("char_a");
  });
});
