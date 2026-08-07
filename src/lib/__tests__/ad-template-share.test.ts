import { describe, it, expect } from "vitest";
import {
  AD_TEMPLATE_SHARE_KIND,
  AD_TEMPLATE_SHARE_VERSION,
  exportAdTemplateShare,
  parseAdTemplateShare,
  encodeStoredAdTemplate,
  decodeStoredAdTemplate,
  getAdTemplate,
  AD_TEMPLATES,
  CUSTOM_AD_TEMPLATE_ID,
  type AdTemplate,
} from "@/lib/ad-templates";

/**
 * Template economy (v0.8.77): recipes travel as a small JSON envelope. Export must
 * round-trip through import; imports are clamped to the preset vocabularies and
 * screened against the ad-law lexicon — hits surface as warnings only (a recipe is
 * a creative directive, not published copy; the hard gate scans the finished
 * video's actual voiceover/captions at compose time). A shared file must never
 * crash the pipeline with unknown preset ids.
 */

const builtin = AD_TEMPLATES[0];

describe("导出/导入往返", () => {
  it("导出信封含 kind/version、不含 id；导入后配方字段完整还原", () => {
    const text = exportAdTemplateShare(builtin);
    const doc = JSON.parse(text);
    expect(doc.kind).toBe(AD_TEMPLATE_SHARE_KIND);
    expect(doc.version).toBe(AD_TEMPLATE_SHARE_VERSION);
    expect(doc.template.id).toBeUndefined();

    const result = parseAdTemplateShare(text);
    expect(result.error).toBeUndefined();
    const tpl = result.template!;
    // importer mints its own id; every recipe field must survive the round trip
    expect(tpl.id).toBe(CUSTOM_AD_TEMPLATE_ID);
    expect(tpl.name).toEqual(builtin.name);
    expect(tpl.styleType).toBe(builtin.styleType);
    expect(tpl.videoMode).toBe(builtin.videoMode);
    expect(tpl.look).toBe(builtin.look);
    expect(tpl.cameraPlan).toEqual(builtin.cameraPlan);
    expect(tpl.compose.captionPreset).toBe(builtin.compose.captionPreset);
    expect(tpl.scriptHint.zh).toBe(builtin.scriptHint.zh);
  });

  it("全库 391+ 款模板全部可无损往返（防未来字段漂移）", () => {
    for (const tpl of AD_TEMPLATES) {
      const result = parseAdTemplateShare(exportAdTemplateShare(tpl));
      expect(result.template, `模板 ${tpl.id} 应可往返`).toBeTruthy();
      expect(result.template!.cameraPlan).toEqual(tpl.cameraPlan);
    }
  });
});

describe("导入校验与合规筛查", () => {
  const wrap = (template: unknown) =>
    JSON.stringify({ kind: AD_TEMPLATE_SHARE_KIND, version: AD_TEMPLATE_SHARE_VERSION, template });

  it("坏 JSON / 错误 kind / 版本过新 / 非对象模板分别报对应错误码", () => {
    expect(parseAdTemplateShare("{oops").error).toBe("invalid_json");
    expect(parseAdTemplateShare(JSON.stringify({ kind: "other", version: 1, template: {} })).error).toBe("wrong_kind");
    expect(
      parseAdTemplateShare(JSON.stringify({ kind: AD_TEMPLATE_SHARE_KIND, version: 999, template: {} })).error
    ).toBe("unsupported_version");
    expect(parseAdTemplateShare(wrap("not-an-object")).error).toBe("invalid_template");
  });

  it("未知预设 id 被钳制为安全默认而不是报错（跨版本兼容）", () => {
    const result = parseAdTemplateShare(
      wrap({
        name: { zh: "未来模板", en: "Future" },
        styleType: "style_from_the_future",
        videoMode: "hologram",
        look: "nonexistent_look",
        cameraPlan: { hook: "warp_drive" },
      })
    );
    const tpl = result.template!;
    expect(tpl.styleType).toBe("pain-point");
    expect(tpl.videoMode).toBe("product_closeup");
    expect(tpl.look).toBe("daylight_clean");
    expect(Object.keys(tpl.cameraPlan).length).toBeGreaterThanOrEqual(2); // fallback plan injected
  });

  it("广告法词库命中 → 只警告不拦截（模板是创作指令，硬闸在成片 gate；护栏语句「不得宣称疗效」词面上必命中）", () => {
    const result = parseAdTemplateShare(
      wrap({ name: { zh: "养生体", en: "Wellness" }, scriptHint: { zh: "不得宣称疗效，三天见效类话术禁用；今晚最后一天特价" } })
    );
    expect(result.error).toBeUndefined();
    expect(result.template).toBeTruthy();
    expect(result.warnings).toEqual(expect.arrayContaining(["疗效", "三天见效", "最后一天"]));
  });
});

describe("encodeStoredAdTemplate 对「我的模板」的内联化", () => {
  it("内置模板存 id；非内置 id（我的模板）内联 JSON，decode 后配方可还原", () => {
    expect(encodeStoredAdTemplate(builtin)).toBe(builtin.id);

    const mine: AdTemplate = { ...builtin, id: "3f2b7a9c-0000-4000-8000-000000000001" };
    const stored = encodeStoredAdTemplate(mine);
    expect(stored.startsWith("custom:")).toBe(true);
    const decoded = decodeStoredAdTemplate(stored)!;
    expect(decoded.styleType).toBe(builtin.styleType);
    expect(decoded.cameraPlan).toEqual(builtin.cameraPlan);
    // sanity: the bare uuid would have been unresolvable via the builtin lookup
    expect(getAdTemplate(mine.id)).toBeUndefined();
  });
});
