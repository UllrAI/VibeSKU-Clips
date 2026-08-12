import { describe, it, expect } from "vitest";
import { buildMotionPrompt, hasCameraConflict, pickBehaviorBeats } from "@/lib/motion-prompt";

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

describe("提示词工程包（强度三档 / 单镜头声明 / 音效 / 冲突消解）", () => {
  it("强度三档：subtle/strong 各有幅度措辞，normal 与不传完全一致（基线不变）", () => {
    const base = buildMotionPrompt({ shotType: "hook", description: "开场" });
    expect(buildMotionPrompt({ shotType: "hook", description: "开场", intensity: "normal" })).toBe(base);
    const subtle = buildMotionPrompt({ shotType: "hook", description: "开场", intensity: "subtle" });
    const strong = buildMotionPrompt({ shotType: "hook", description: "开场", intensity: "strong" });
    expect(subtle).toContain("轻微克制");
    expect(strong).toContain("大胆明显");
    expect(subtle).not.toBe(strong);
  });

  it("强度措辞跟随语言（英文脚本出英文幅度行）", () => {
    const en = buildMotionPrompt({ shotType: "hook", description: "opening scene", intensity: "strong" });
    expect(en).toContain("bold pronounced camera movement");
    expect(en).not.toMatch(/[一-鿿]/);
  });

  it("非链式片段声明连续单镜头（防模型中途切镜）；链式片段用尾帧过渡引导，二者互斥", () => {
    const plain = buildMotionPrompt({ shotType: "demo", description: "演示" });
    expect(plain).toContain("连续单镜头");
    expect(plain).not.toContain("尾帧");
    const chained = buildMotionPrompt({ shotType: "demo", description: "演示", chainToNext: true });
    expect(chained).toContain("尾帧");
    expect(chained).not.toContain("不转场"); // 链式结尾就是要转场，不能自相矛盾
  });

  it("音效行始终存在且禁人声（配音全部来自 TTS，防无配音分镜冒出乱说话）", () => {
    expect(buildMotionPrompt({ shotType: "hook", description: "开场" })).toContain("无人声说话");
    expect(buildMotionPrompt({ shotType: "hook", description: "opening" })).toContain("no speech");
  });

  it("hasCameraConflict：静止+运动并存且无先后词 → 冲突；有先后词/单独出现 → 不冲突", () => {
    expect(hasCameraConflict("固定镜头，环绕拍摄")).toBe(true);
    expect(hasCameraConflict("static camera with a slow orbit")).toBe(true);
    expect(hasCameraConflict("镜头先推近，最后固定")).toBe(false);
    expect(hasCameraConflict("push in, then locked off")).toBe(false);
    expect(hasCameraConflict("固定镜头")).toBe(false);
    expect(hasCameraConflict("缓慢环绕")).toBe(false);
  });

  it("冲突的脚本 camera 被丢弃，回退到分镜类型默认运镜（单一明确指令）", () => {
    const p = buildMotionPrompt({ shotType: "product_reveal", camera: "固定镜头，环绕拍摄", description: "商品" });
    expect(p).not.toContain("固定镜头，环绕拍摄");
    expect(p).toContain("运镜：镜头围绕商品缓慢环绕移动");
  });

  it("talking 分镜换成对镜说话动作 + 两个行为节拍（UGC 反重复方法论）", () => {
    const zh = buildMotionPrompt({ shotType: "hook", description: "小美对镜头说话", talking: true, beatSeed: 0 });
    expect(zh).toContain("对着镜头自然说话");
    expect(zh).toContain("极短的停顿");
    const en = buildMotionPrompt({ shotType: "hook", description: "a woman talks", talking: true, beatSeed: 0 });
    expect(en).toContain("talks naturally to camera");
    // 非 talking 走原有分镜类型动作，完全不变
    expect(buildMotionPrompt({ shotType: "hook", description: "开场" })).toContain("画面主体动态醒目");
  });

  it("行为节拍确定性轮换：同 seed 稳定、不同 seed 组合不同、两条不重复", () => {
    expect(pickBehaviorBeats(3, "zh")).toEqual(pickBehaviorBeats(3, "zh"));
    const a = pickBehaviorBeats(0, "zh");
    const b = pickBehaviorBeats(1, "zh");
    expect(a).not.toEqual(b);
    for (const seed of [0, 1, 2, 3, 7, 12, 25]) {
      const [x, y] = pickBehaviorBeats(seed, "en");
      expect(x).not.toBe(y);
    }
  });

  it("talking 与 personShot/音效互不干扰：肤质由 REAL_FACE 管、音效仍禁人声（TTS 管配音）", () => {
    const p = buildMotionPrompt({ shotType: "hook", description: "小美说话", talking: true, personShot: true, beatSeed: 2 });
    expect(p).toContain("网红脸"); // REAL_FACE 仍在
    expect(p).toContain("无人声说话"); // clip 原生音频仍只要环境音
  });
});
