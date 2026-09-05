import { describe, it, expect } from "vitest";
import { buildPrismVideoBody } from "@/lib/providers/prism";
import {
  DEFAULT_IMAGE_MODEL,
  DEFAULT_IMAGE_QUALITY,
  DEFAULT_VIDEO_MODEL,
  PRISM_IMAGE_MODELS,
  PRISM_VIDEO_MODELS,
  findVideoModel,
  imageRatio,
  prismModels,
  resolutionTier,
  snapDuration,
  snapRatio,
  snapResolution,
} from "@/lib/providers/prism-catalog";
import type { VideoOptions } from "@/lib/providers/types";

/**
 * The catalog is the only thing standing between a paid request and a 422 that arrives after the
 * user already waited. Every constraint here was transcribed from live API error messages, so
 * these tests are the tripwire for a drifting table, not a restatement of the types.
 */

const video = (over: Partial<VideoOptions> = {}, modelId = DEFAULT_VIDEO_MODEL) =>
  buildPrismVideoBody({ modelId, mode: "text-to-video", prompt: "a cat", ...over }, modelId);

describe("目录默认值", () => {
  it("默认视频模型是 H3，默认图片模型是 image2，图片质量默认 low", () => {
    expect(DEFAULT_VIDEO_MODEL).toBe("minimax-h3");
    expect(DEFAULT_IMAGE_MODEL).toBe("gpt-image-2");
    expect(DEFAULT_IMAGE_QUALITY).toBe("low");
  });

  it("默认模型都在各自目录里，且 id 不重复", () => {
    expect(PRISM_VIDEO_MODELS.some((m) => m.id === DEFAULT_VIDEO_MODEL)).toBe(true);
    expect(PRISM_IMAGE_MODELS.some((m) => m.id === DEFAULT_IMAGE_MODEL)).toBe(true);
    const ids = [...PRISM_VIDEO_MODELS, ...PRISM_IMAGE_MODELS].map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("listModels 按媒体类型过滤", () => {
    expect(prismModels("video").every((m) => m.mediaType === "video")).toBe(true);
    expect(prismModels("image").every((m) => m.mediaType === "image")).toBe(true);
    expect(prismModels().length).toBe(PRISM_VIDEO_MODELS.length + PRISM_IMAGE_MODELS.length);
  });
});

describe("参数吸附（客户端先对齐，避免付费请求撞 422）", () => {
  it("时长取最接近的合法值，超出范围时夹到端点", () => {
    expect(snapDuration([4, 6, 8], 7, 6)).toBe(8); // exact tie → the longer option
    expect(snapDuration([4, 6, 8], 99, 6)).toBe(8);
    expect(snapDuration([4, 6, 8], undefined, 6)).toBe(6);
  });

  it("比例按画面长宽推断，且永远不会选中 adaptive", () => {
    expect(snapRatio(["16:9", "9:16", "1:1"], 1080, 1920)).toBe("9:16");
    expect(snapRatio(["16:9", "9:16", "1:1"], 1920, 1080)).toBe("16:9");
    expect(snapRatio(["16:9", "9:16", "1:1"], 1024, 1024)).toBe("1:1");
    expect(snapRatio(["adaptive", "16:9"], 1920, 1080)).toBe("16:9");
  });

  it("只支持 16:9 的模型无论传什么都返回 16:9", () => {
    expect(snapRatio(["16:9"], 1080, 1920)).toBe("16:9");
  });

  it("分辨率按像素分档，并夹到模型支持的最高档", () => {
    expect(resolutionTier(1920, 1080)).toBe("1080p");
    expect(resolutionTier(1280, 720)).toBe("720p");
    expect(snapResolution(["480p", "720p"], "1080p")).toBe("720p");
    expect(snapResolution(["480p", "720p", "1080p"], "1080p")).toBe("1080p");
  });

  it("图片比例映射到 Prism 的枚举", () => {
    expect(imageRatio(1080, 1920)).toBe("9:16");
    expect(imageRatio(1024, 1024)).toBe("1:1");
  });
});

describe("H3 请求体（默认路径，钱都花在这里）", () => {
  it("原生音频模型不发送 generate_audio —— 该字段会被 422 拒绝", () => {
    const body = video({ audioEnabled: false });
    expect(body).not.toHaveProperty("generate_audio");
    expect(body).not.toHaveProperty("audio");
  });

  it("首尾帧齐全 → 走 first_frame_url / last_frame_url", () => {
    const body = video({ firstFrameUrl: "https://x/f.png", lastFrameUrl: "https://x/l.png" });
    expect(body.first_frame_url).toBe("https://x/f.png");
    expect(body.last_frame_url).toBe("https://x/l.png");
    expect(body).not.toHaveProperty("reference_url");
  });

  it("只有首帧 → 改走 reference_url（H3 拒绝单独的首帧）", () => {
    const body = video({ firstFrameUrl: "https://x/f.png" });
    expect(body.reference_url).toBe("https://x/f.png");
    expect(body).not.toHaveProperty("first_frame_url");
  });

  it("参考图按模型上限截断，不支持的参考视频整字段丢弃", () => {
    const body = video({
      referenceImageUrls: Array.from({ length: 12 }, (_, i) => `https://x/${i}.png`),
      referenceVideoUrls: ["https://x/v.mp4"],
    });
    expect((body.reference_images as string[]).length).toBe(findVideoModel("minimax-h3")!.maxReferenceImages);
    expect(body).not.toHaveProperty("reference_videos");
  });

  it("seed 为 0 时省略字段（H3 把 0 当非法值，而不是「随机」）", () => {
    expect(video({ seed: 0 })).not.toHaveProperty("seed");
    expect(video({ seed: 42 }).seed).toBe(42);
  });

  it("时长与分辨率被吸附到 H3 支持的范围", () => {
    const body = video({ duration: 20, width: 1080, height: 1920 });
    expect(body.duration).toBe(15);
    expect(body.resolution).toBe("720p");
    expect(body.aspect_ratio).toBe("9:16");
  });
});

describe("其他模型的差异", () => {
  it("Seedance 接受单独首帧，并接受 generate_audio 开关", () => {
    const body = buildPrismVideoBody(
      { modelId: "seedance2.0", mode: "image-to-video", prompt: "x", firstFrameUrl: "https://x/f.png", audioEnabled: true },
      "seedance2.0"
    );
    expect(body.first_frame_url).toBe("https://x/f.png");
    expect(body.generate_audio).toBe(true);
  });

  it("Wan 的首帧走 reference_url，而不是 first_frame_url", () => {
    const body = buildPrismVideoBody(
      { modelId: "wan2.6", mode: "image-to-video", prompt: "x", firstFrameUrl: "https://x/f.png" },
      "wan2.6"
    );
    expect(body.reference_url).toBe("https://x/f.png");
    expect(body).not.toHaveProperty("first_frame_url");
  });

  it("Wan 用 audio 而不是 generate_audio 作为开关", () => {
    const body = buildPrismVideoBody({ modelId: "wan2.6", mode: "text-to-video", prompt: "x", audioEnabled: false }, "wan2.6");
    expect(body.audio).toBe(false);
    expect(body).not.toHaveProperty("generate_audio");
  });

  it("未知模型直接抛错，绝不构造请求体", () => {
    expect(() => buildPrismVideoBody({ modelId: "nope", mode: "text-to-video", prompt: "x" }, "nope")).toThrow();
  });
});
