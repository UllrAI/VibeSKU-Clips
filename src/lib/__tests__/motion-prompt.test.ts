import { describe, it, expect } from "vitest";
import { buildMotionPrompt } from "@/lib/motion-prompt";

describe("buildMotionPrompt（i2v 运镜提示词引擎）", () => {
  it("脚本 camera 字段优先，置于提示词开头（运镜是主信息）", () => {
    const p = buildMotionPrompt({ shotType: "hook", camera: "特写 + 缓慢推近", description: "咖啡杯特写" });
    expect(p.startsWith("运镜：特写 + 缓慢推近")).toBe(true);
  });

  it("无 camera 时按分镜类型给默认运镜（product_reveal → 环绕）", () => {
    const p = buildMotionPrompt({ shotType: "product_reveal", description: "商品展示" });
    expect(p).toContain("环绕");
    expect(p).toContain("商品保持静置不动");
  });

  it("未知分镜类型回退通用运镜，不报错", () => {
    const p = buildMotionPrompt({ shotType: "unknown_type", description: "画面" });
    expect(p).toContain("镜头缓慢推近主体");
  });

  it("productShot=true 加商品保真约束（logo/文字不变形）", () => {
    const p = buildMotionPrompt({ shotType: "demo", description: "使用演示", productShot: true });
    expect(p).toContain("logo 与文字必须保持完全不变");
  });

  it("productShot=false 不加保真约束", () => {
    const p = buildMotionPrompt({ shotType: "hook", description: "开场画面" });
    expect(p).not.toContain("logo");
  });

  it("英文脚本 → 全英文提示词（海外项目语言一致性）", () => {
    const p = buildMotionPrompt({ shotType: "product_reveal", camera: "slow orbit around the product", description: "a skincare bottle on marble" });
    expect(p.startsWith("Camera: slow orbit around the product")).toBe(true);
    expect(p).toContain("no flicker");
    expect(p).not.toMatch(/[一-鿿]/);
  });

  it("空输入默认中文（国内为主）且含稳定性约束尾", () => {
    const p = buildMotionPrompt({});
    expect(p).toContain("运镜：");
    expect(p).toContain("无闪烁、无变形");
  });

  it("场景描述截断为语义锚点（首帧已固定构图，不需要全文）", () => {
    const long = "这是一个非常长的场景描述".repeat(20);
    const p = buildMotionPrompt({ shotType: "hook", description: long });
    expect(p.length).toBeLessThan(long.length);
    expect(p).toContain("场景：这是一个非常长的场景描述");
  });

  it("每种已知分镜类型都有专属运镜与动态语言（不共用一句话）", () => {
    const types = ["hook", "pain_point", "product_reveal", "demo", "social_proof", "cta"] as const;
    const prompts = types.map((t) => buildMotionPrompt({ shotType: t, description: "画面" }));
    expect(new Set(prompts).size).toBe(types.length);
  });
});
