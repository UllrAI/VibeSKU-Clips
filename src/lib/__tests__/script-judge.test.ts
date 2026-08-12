import { describe, it, expect } from "vitest";
import { buildJudgePrompt, parseJudgeResponse, JUDGE_IDS } from "@/lib/script-judge";

const SHOTS = [
  { shotId: 1, voiceover: "这款纸巾我回购了十次，真的谁用谁知道" },
  { shotId: 2, voiceover: "它的克重是同价位的两倍，一张顶别人三张" },
  { shotId: 3, voiceover: "现在点下方链接就能买到" },
];

describe("buildJudgePrompt", () => {
  it("四判官各就位 + 口语铁律注入 + 长度约束 + 合规红线", () => {
    const p = buildJudgePrompt(SHOTS, { styleLabel: "达人口播" });
    expect(p).toContain("节奏官");
    expect(p).toContain("口语官");
    expect(p).toContain("创意官");
    expect(p).toContain("结构官");
    expect(p).toContain("说出来的"); // SPOKEN_VOICE_RULES 是口语官判准
    expect(p).toContain("±20%"); // TTS 时长钉在分镜槽
    expect(p).toContain("不新增任何功效/价格承诺"); // 广告合规红线
    expect(p).toContain("shotId 1：「这款纸巾我回购了十次");
    expect(p).not.toContain("in English");
  });

  it("全英文台词 → 附加英文输出指令", () => {
    const p = buildJudgePrompt([{ shotId: 1, voiceover: "I bought this ten times." }]);
    expect(p).toContain("in English");
  });
});

describe("parseJudgeResponse", () => {
  it("正常解析：钳制 judge 枚举、补齐缺席判官、rewrite 只收真实分镜", () => {
    const content = JSON.stringify({
      verdicts: [
        { judge: "pace", issues: [{ shotId: 1, issue: "第一句钩不住" }, { shotId: 99, issue: "幽灵镜头" }] },
        { judge: "hallucinated", issues: [{ issue: "不存在的判官" }] },
      ],
      rewrites: [
        { shotId: 3, voiceover: "反正链接我放下面了，你们自己看" },
        { shotId: 99, voiceover: "幽灵重写" },
        { shotId: 3, voiceover: "重复的 shotId 应被去重" },
      ],
      summary: "整体广告腔偏重",
    });
    const r = parseJudgeResponse(content, SHOTS);
    expect(r.verdicts.map((v) => v.judge)).toEqual([...JUDGE_IDS]); // 四判官始终齐全
    const pace = r.verdicts.find((v) => v.judge === "pace")!;
    expect(pace.issues.length).toBe(2);
    expect(pace.issues[0].shotId).toBe(1);
    expect(pace.issues[1].shotId).toBeUndefined(); // 幽灵 shotId 被剥掉但意见保留
    expect(r.verdicts.find((v) => v.judge === "voice")!.issues).toEqual([]);
    expect(r.rewrites).toEqual([{ shotId: 3, voiceover: "反正链接我放下面了，你们自己看" }]);
    expect(r.summary).toBe("整体广告腔偏重");
  });

  it("长度比钳制：重写超出 0.4x–2.5x 丢弃（保 TTS 时长与防内容失真）", () => {
    const content = JSON.stringify({
      verdicts: [],
      rewrites: [
        { shotId: 1, voiceover: "短" }, // 远短于原句 → 丢
        { shotId: 2, voiceover: "它" + "特别好用".repeat(30) }, // 远超原句 → 丢
      ],
    });
    expect(parseJudgeResponse(content, SHOTS).rewrites).toEqual([]);
  });

  it("markdown 包裹的 JSON 可解析；彻底非法 JSON 抛可读错误", () => {
    const wrapped = "```json\n" + JSON.stringify({ verdicts: [], rewrites: [] }) + "\n```";
    expect(parseJudgeResponse(wrapped, SHOTS).verdicts.length).toBe(4);
    expect(() => parseJudgeResponse("这不是 JSON", SHOTS)).toThrow("判官团返回的不是合法 JSON");
  });
});
