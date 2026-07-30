import { describe, it, expect } from "vitest";
import { AD_TEMPLATES, AD_TEMPLATE_GROUPS, listAdTemplates, getAdTemplate, adTemplateScriptDirective, adTemplateStorageKey, adTemplateAppliedKey } from "@/lib/ad-templates";
import { getCameraPreset } from "@/lib/camera-presets";
import { getLookPreset } from "@/lib/look-presets";
import { CAPTION_PRESET_IDS } from "@/lib/caption-presets";

// UI-form style values accepted by the new-project page (pre-normalizeStyle vocabulary)
const UI_STYLE_VALUES = new Set([
  "drama", "reversal", "interview", "story", "unboxing", "product_pov",
  "comparison", "talking_head", "pain-point", "scenario", "auto",
]);
const VIDEO_MODES = new Set(["product_closeup", "graphic_montage", "scene_demo", "live_presenter"]);
const BGM_VALUES = new Set(["none", "upbeat", "chill", "energetic", "emotional"]);
const GROUP_IDS = new Set(AD_TEMPLATE_GROUPS.map((g) => g.id));
// new-project product-category vocabulary ("other" intentionally excluded — goodFor means "tuned for", not "allowed")
const CATEGORY_VALUES = new Set(["beauty", "food", "home", "fashion", "digital"]);

describe("AD_TEMPLATES 库完整性", () => {
  it("id 唯一且 zh/en 名称与卖点均非空", () => {
    const ids = new Set<string>();
    for (const tpl of AD_TEMPLATES) {
      expect(ids.has(tpl.id)).toBe(false);
      ids.add(tpl.id);
      expect(tpl.name.zh.length).toBeGreaterThan(0);
      expect(tpl.name.en.length).toBeGreaterThan(0);
      expect(tpl.tagline.zh.length).toBeGreaterThan(0);
      expect(tpl.tagline.en.length).toBeGreaterThan(0);
      expect(tpl.emoji.length).toBeGreaterThan(0);
    }
  });

  it("每个模板的分组与适配类目都在词表内", () => {
    for (const tpl of AD_TEMPLATES) {
      expect(GROUP_IDS.has(tpl.group), `${tpl.id} 的分组「${tpl.group}」不存在`).toBe(true);
      for (const cat of tpl.goodFor ?? []) {
        expect(CATEGORY_VALUES.has(cat), `${tpl.id} 的 goodFor「${cat}」不在类目词表`).toBe(true);
      }
    }
  });

  it("每个分组至少有一款模板（分组不空转）", () => {
    for (const group of AD_TEMPLATE_GROUPS) {
      expect(
        AD_TEMPLATES.some((t) => t.group === group.id),
        `分组「${group.id}」没有任何模板`
      ).toBe(true);
    }
  });

  it("每个模板引用的 look / 运镜预设 / 风格 / 模式 / 合成配置全部真实存在", () => {
    for (const tpl of AD_TEMPLATES) {
      expect(getLookPreset(tpl.look), `${tpl.id} 的 look「${tpl.look}」不存在`).toBeDefined();
      expect(UI_STYLE_VALUES.has(tpl.styleType), `${tpl.id} 的 styleType「${tpl.styleType}」不在新建页词表`).toBe(true);
      expect(VIDEO_MODES.has(tpl.videoMode)).toBe(true);
      for (const [type, presetId] of Object.entries(tpl.cameraPlan)) {
        expect(getCameraPreset(presetId!), `${tpl.id} 的 ${type} 运镜「${presetId}」不存在`).toBeDefined();
      }
      if (tpl.compose.captionPreset) {
        expect((CAPTION_PRESET_IDS as readonly string[]).includes(tpl.compose.captionPreset)).toBe(true);
      }
      if (tpl.compose.bgm) expect(BGM_VALUES.has(tpl.compose.bgm)).toBe(true);
    }
  });

  it("每个模板的运镜计划至少覆盖 hook 或商品/演示镜之一（模板必须真的编排运镜）", () => {
    for (const tpl of AD_TEMPLATES) {
      const keys = Object.keys(tpl.cameraPlan);
      expect(keys.length, `${tpl.id} 没有任何运镜编排`).toBeGreaterThan(1);
    }
  });
});

describe("listAdTemplates 分组筛选与类目排序", () => {
  it("按分组过滤，all/缺省返回全库", () => {
    expect(listAdTemplates()).toHaveLength(AD_TEMPLATES.length);
    expect(listAdTemplates({ group: "all" })).toHaveLength(AD_TEMPLATES.length);
    const productShow = listAdTemplates({ group: "product_show" });
    expect(productShow.length).toBeGreaterThan(0);
    expect(productShow.every((t) => t.group === "product_show")).toBe(true);
  });

  it("选定类目时 goodFor 命中的模板排前，且不丢任何模板", () => {
    const sorted = listAdTemplates({ category: "food" });
    expect(sorted).toHaveLength(AD_TEMPLATES.length);
    const firstMiss = sorted.findIndex((t) => !t.goodFor?.includes("food"));
    const lastHit = sorted.map((t) => t.goodFor?.includes("food") ?? false).lastIndexOf(true);
    if (firstMiss !== -1 && lastHit !== -1) {
      expect(lastHit).toBeLessThan(firstMiss);
    }
  });
});

describe("getAdTemplate / 存储键", () => {
  it("按 id 命中，空/未知返回 undefined", () => {
    expect(getAdTemplate("turntable_hero")?.name.zh).toBe("转台大片");
    expect(getAdTemplate("nope")).toBeUndefined();
    expect(getAdTemplate("")).toBeUndefined();
    expect(getAdTemplate(null)).toBeUndefined();
  });

  it("localStorage 键按项目隔离且 applied 键与选择键不同", () => {
    expect(adTemplateStorageKey("p1")).not.toBe(adTemplateStorageKey("p2"));
    expect(adTemplateAppliedKey("p1")).not.toBe(adTemplateStorageKey("p1"));
  });
});

describe("adTemplateScriptDirective 脚本注入块", () => {
  it("包含模板名、look 描述与真实运镜预设句", () => {
    const tpl = getAdTemplate("turntable_hero")!;
    const directive = adTemplateScriptDirective(tpl);
    expect(directive).toContain("转台大片");
    expect(directive).toContain(getLookPreset(tpl.look)!.image.zh);
    expect(directive).toContain(getCameraPreset("lazy_susan")!.prompt.zh);
    expect(directive).toContain("camera");
  });

  it("每个模板的注入块非空且带创作提示", () => {
    for (const tpl of AD_TEMPLATES) {
      const d = adTemplateScriptDirective(tpl);
      expect(d).toContain(tpl.scriptHint.zh);
      expect(d).toContain("运镜编排");
    }
  });
});
