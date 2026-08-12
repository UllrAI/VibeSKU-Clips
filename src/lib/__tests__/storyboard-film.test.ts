import { describe, it, expect } from "vitest";
import {
  buildStoryboardFilmPrompt,
  filmTotalSeconds,
  filmRequestSeconds,
  FILM_MAX_SECONDS,
} from "@/lib/storyboard-film";
import type { Shot } from "@/lib/db/schema";

/**
 * Grid-to-film prompt contract (v0.8.84). The exact shape was field-proven on a
 * real product (2026-08): timecoded segments + @ImageN citations + per-segment
 * dialogue produced native 4-shot cutting with verbatim speech on Seedance 2.5
 * reference-to-video. These tests pin that shape.
 */

function mkShot(partial: Partial<Shot> & { shotId: number }): Shot {
  return {
    type: "hook",
    duration: 3,
    description: "画面",
    camera: "固定",
    visualSource: "ai_generate",
    transition: "direct_concat",
    voiceover: "",
    ...partial,
  } as Shot;
}

const zhShots: Shot[] = [
  mkShot({ shotId: 1, type: "hook", duration: 3, description: "厨房口播", voiceover: "就这玩意儿救了我的钱包" }),
  mkShot({ shotId: 2, type: "demo", duration: 5, description: "挤咖啡液入冰水", voiceover: "" }),
  mkShot({ shotId: 3, type: "cta", duration: 4, description: "举盒收尾", voiceover: "链接挂这了" }),
];

describe("时长计算", () => {
  it("filmTotalSeconds 求和；filmRequestSeconds 取整并夹在 4-30", () => {
    expect(filmTotalSeconds(zhShots)).toBe(12);
    expect(filmRequestSeconds(zhShots)).toBe(12);
    expect(filmRequestSeconds([mkShot({ shotId: 1, duration: 2 })])).toBe(4);
    expect(
      filmRequestSeconds([mkShot({ shotId: 1, duration: 45 })])
    ).toBe(FILM_MAX_SECONDS);
  });
});

describe("中文整片 prompt", () => {
  const prompt = buildStoryboardFilmPrompt(zhShots);

  it("逐镜 @图片N 引用 + 类型标签 + 时间段按脚本时长铺满全片", () => {
    expect(prompt).toContain("[0-3秒] 镜头1（钩子镜，画面以 @图片1 为基准）");
    expect(prompt).toContain("[3-8秒] 镜头2（演示镜，画面以 @图片2 为基准）");
    expect(prompt).toContain("[8-12秒] 镜头3（转化镜，画面以 @图片3 为基准）");
    expect(prompt).toContain("总时长约 12 秒，共 3 个镜头");
  });

  it("台词逐字进段落；无台词镜头明确只留环境音", () => {
    expect(prompt).toContain("「就这玩意儿救了我的钱包」");
    expect(prompt).toContain("「链接挂这了」");
    expect(prompt).toContain("（无台词，只保留环境音与动作声）");
  });

  it("全局块：一致性 + 口语说话方式 + 无字幕水印", () => {
    expect(prompt).toContain("同一人物");
    expect(prompt).toContain("逐字说出");
    expect(prompt).toContain("不出现任何字幕");
  });

  it("唯一具名角色时台词归属到角色名", () => {
    const withCast = buildStoryboardFilmPrompt(zhShots, [{ name: "小夏", appearance: "邻家" } as never]);
    expect(withCast).toContain("小夏对着镜头自然说话");
  });

  it("脚本里的运镜逐段带进整片（有才带，空 camera 不出现残段）", () => {
    const withCam = buildStoryboardFilmPrompt([
      mkShot({ shotId: 1, camera: "缓慢推近", voiceover: "开场" }),
      mkShot({ shotId: 2, camera: "", voiceover: "" }),
    ]);
    expect(withCam).toContain("运镜：缓慢推近。");
    // 第二镜没有运镜 → 不该出现空的「运镜：」残段
    expect(withCam.match(/运镜：/g)?.length).toBe(1);
  });
});

describe("英文整片 prompt（台词无中文时整体切英文）", () => {
  const enShots: Shot[] = [
    mkShot({ shotId: 1, type: "hook", duration: 6, description: "kitchen talking head", voiceover: "This thing saved my wallet" }),
    mkShot({ shotId: 2, type: "demo", duration: 6, description: "pouring coffee", voiceover: "" }),
  ];
  const prompt = buildStoryboardFilmPrompt(enShots);

  it("@ImageN 引用 + 逐字口播说明 + 时间段", () => {
    expect(prompt).toContain("[0-6s] Shot 1 (hook shot, framing follows @Image1)");
    expect(prompt).toContain('Dialogue (spoken verbatim): "This thing saved my wallet"');
    expect(prompt).toContain("(no dialogue — ambient and action sounds only)");
    expect(prompt).not.toContain("镜头");
  });

  it("英文段落同样带运镜", () => {
    const withCam = buildStoryboardFilmPrompt([
      mkShot({ shotId: 1, description: "kitchen", camera: "slow push-in", voiceover: "Hi" }),
    ]);
    expect(withCam).toContain("Camera: slow push-in. ");
  });
});

describe("定妆参考位（characterSheet 序号偏移）", () => {
  it("sheet 领跑参考数组：@图片1=定妆照声明，分镜引用整体 +1", () => {
    const prompt = buildStoryboardFilmPrompt(zhShots, undefined, { characterSheet: true });
    expect(prompt).toContain("@图片1 是出镜人物的四视图定妆照");
    expect(prompt).toContain("镜头1（钩子镜，画面以 @图片2 为基准）");
    expect(prompt).toContain("镜头3（转化镜，画面以 @图片4 为基准）");
    expect(prompt).not.toContain("画面以 @图片1 为基准");
  });

  it("无 sheet 时不出现定妆声明，分镜仍从 @图片1 起", () => {
    const prompt = buildStoryboardFilmPrompt(zhShots);
    expect(prompt).not.toContain("定妆照");
    expect(prompt).toContain("画面以 @图片1 为基准");
  });
});

describe("超长脚本的时间轴缩放", () => {
  it("原始 40 秒按比例压进 30 秒，最后一段结尾恰好等于总时长", () => {
    const long: Shot[] = [
      mkShot({ shotId: 1, duration: 20, voiceover: "上半场" }),
      mkShot({ shotId: 2, duration: 20, voiceover: "下半场" }),
    ];
    const prompt = buildStoryboardFilmPrompt(long);
    expect(prompt).toContain("[0-15秒] 镜头1");
    expect(prompt).toContain("[15-30秒] 镜头2");
  });
});
