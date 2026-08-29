import { describe, it, expect } from "vitest";
import {
  getVideoParamSpec,
  buildAtlasVideoBody,
  specFromOpenApiInput,
  pickEnumDuration,
  pickResolution,
  pickRatio,
} from "@/lib/providers/atlas-video-params";
import type { VideoOptions } from "@/lib/providers/types";

/**
 * Per-model video request contracts (v0.8.76). Atlas vendors disagree on field names
 * and enums; every expectation here mirrors the model's published input schema
 * (static.atlascloud.ai/model/schema/*.json, fetched 2026-08). A wrong body either
 * rejects pre-billing (lucky) or bills a mis-parameterized video (issue #18's video
 * twin) — these tests pin the mapping.
 */

const i2vBase: VideoOptions = {
  modelId: "",
  mode: "image-to-video",
  prompt: "宣传片",
  firstFrameUrl: "https://example.com/first.png",
  width: 1080,
  height: 1920,
  duration: 3,
};

describe("取值选择器", () => {
  it("pickEnumDuration：就近取整档，平手取更短（更省）", () => {
    expect(pickEnumDuration([4, 5, 6, 7, 8], 3)).toBe(4);
    expect(pickEnumDuration([6, 10], 7)).toBe(6);
    expect(pickEnumDuration([6, 10], 8)).toBe(6); // tie -> shorter
    expect(pickEnumDuration([8, 4, 6], 5)).toBe(4); // tie -> shorter, order-insensitive
    expect(pickEnumDuration([-1, 4, 5], 2)).toBe(4); // -1 auto sentinel filtered out
  });

  it("pickResolution：覆盖请求短边的最小档；无档可覆盖取最大档；同档裸名优先", () => {
    expect(pickResolution(["768P", "2K"], 1080, 1920)).toBe("2K");
    expect(pickResolution(["768P", "2K"], 720, 1280)).toBe("768P");
    expect(pickResolution(["720p", "1080p", "4k"], 1080, 1920)).toBe("1080p");
    expect(pickResolution(["480p", "720p", "720p-SR", "1080p-SR", "1440p-SR"], 1080, 1920)).toBe("1080p-SR");
    expect(pickResolution(["720P", "1080P"], 1440, 2560)).toBe("1080P"); // nothing covers 1440 -> largest
    expect(pickResolution(["720p-SR", "720p"], 720, 1280)).toBe("720p"); // plain over suffixed
  });

  it("pickRatio：数值比例就近；仅 adaptive 时返回 adaptive；已知尺寸时数值优先于 adaptive", () => {
    expect(pickRatio(["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"], 1080, 1920)).toBe("9:16");
    expect(pickRatio(["adaptive"], 1080, 1920)).toBe("adaptive");
    expect(pickRatio(["adaptive", "16:9", "9:16"], 1080, 1920)).toBe("9:16");
    expect(pickRatio(["16:9", "9:16"], 1920, 1080)).toBe("16:9");
  });
});

describe("MiniMax H3 请求体（发布于 2026-07-31 的海螺 3.0）", () => {
  it("i2v：end_image 而非 last_image、时长吸附 4-15 整档、竖屏 1080 取 2K、ratio 只有 adaptive、无音频/seed 字段", () => {
    const spec = getVideoParamSpec("minimax/h3/image-to-video")!;
    const body = buildAtlasVideoBody("minimax/h3/image-to-video", spec, {
      ...i2vBase,
      modelId: "minimax/h3/image-to-video",
      lastFrameUrl: "https://example.com/last.png",
      audioEnabled: true,
      seed: 42,
    }, "宣传片");
    expect(body).toEqual({
      model: "minimax/h3/image-to-video",
      prompt: "宣传片",
      image: "https://example.com/first.png",
      end_image: "https://example.com/last.png",
      duration: 4,
      resolution: "2K",
      ratio: "adaptive",
    });
  });

  it("i2v：缺时长/尺寸时补 schema 必填默认值（duration 8 / resolution 2K），拒绝裸提交被拒", () => {
    const spec = getVideoParamSpec("minimax/h3/image-to-video")!;
    const body = buildAtlasVideoBody("minimax/h3/image-to-video", spec, {
      modelId: "minimax/h3/image-to-video",
      mode: "image-to-video",
      prompt: "x",
      firstFrameUrl: "https://example.com/f.png",
    }, "x");
    expect(body.duration).toBe(8);
    expect(body.resolution).toBe("2K");
  });

  it("t2v：竖屏映射 ratio 9:16", () => {
    const spec = getVideoParamSpec("minimax/h3/text-to-video")!;
    const body = buildAtlasVideoBody("minimax/h3/text-to-video", spec, {
      modelId: "minimax/h3/text-to-video",
      mode: "text-to-video",
      prompt: "x",
      width: 1080,
      height: 1920,
      duration: 6,
    }, "x");
    expect(body.ratio).toBe("9:16");
    expect(body.duration).toBe(6);
  });

  it("reference：refers 混合数组，参考视频排在商品图之前（序数引用「视频1/图1」不错位）", () => {
    const spec = getVideoParamSpec("minimax/h3/reference-to-video")!;
    const body = buildAtlasVideoBody("minimax/h3/reference-to-video", spec, {
      modelId: "minimax/h3/reference-to-video",
      mode: "video-to-video",
      prompt: "x",
      referenceImageUrls: ["https://e.com/p1.png", "https://e.com/p2.png"],
      referenceVideoUrls: ["https://e.com/ref.mp4"],
      referenceAudioUrls: ["https://e.com/voice.wav"],
      duration: 8,
    }, "x");
    expect(body.refers).toEqual(["https://e.com/ref.mp4", "https://e.com/p1.png", "https://e.com/p2.png", "https://e.com/voice.wav"]);
    expect(body).not.toHaveProperty("reference_images");
  });
});

describe("其余新家族请求体差异", () => {
  it("Hailuo 2.3 Std：时长只吸附 6/10；Pro 版没有时长参数则完全不发", () => {
    const std = getVideoParamSpec("minimax/hailuo-2.3/i2v-standard")!;
    const bodyStd = buildAtlasVideoBody("minimax/hailuo-2.3/i2v-standard", std, {
      ...i2vBase, modelId: "minimax/hailuo-2.3/i2v-standard", duration: 5,
    }, "x");
    expect(bodyStd.duration).toBe(6);
    expect(bodyStd).not.toHaveProperty("resolution");

    const pro = getVideoParamSpec("minimax/hailuo-2.3/i2v-pro")!;
    const bodyPro = buildAtlasVideoBody("minimax/hailuo-2.3/i2v-pro", pro, {
      ...i2vBase, modelId: "minimax/hailuo-2.3/i2v-pro", duration: 5,
    }, "x");
    expect(bodyPro).not.toHaveProperty("duration");
  });

  it("Kling O3 i2v：end_image + sound 布尔；i2v 变体没有 aspect_ratio 字段", () => {
    const spec = getVideoParamSpec("kwaivgi/kling-video-o3-std/image-to-video")!;
    const body = buildAtlasVideoBody("kwaivgi/kling-video-o3-std/image-to-video", spec, {
      ...i2vBase,
      modelId: "kwaivgi/kling-video-o3-std/image-to-video",
      lastFrameUrl: "https://example.com/last.png",
    }, "x");
    expect(body.end_image).toBe("https://example.com/last.png");
    expect(body.sound).toBe(false); // audio not enabled -> explicit off
    expect(body).not.toHaveProperty("aspect_ratio");
    expect(body.duration).toBe(3);
  });

  it("Veo 3.1 i2v：aspect_ratio 9:16、时长吸附 {4,6,8}、generate_audio 跟随开关、seed 透传", () => {
    const spec = getVideoParamSpec("google/veo3.1/image-to-video")!;
    const body = buildAtlasVideoBody("google/veo3.1/image-to-video", spec, {
      ...i2vBase,
      modelId: "google/veo3.1/image-to-video",
      duration: 5,
      audioEnabled: true,
      seed: 7,
    }, "x");
    expect(body.aspect_ratio).toBe("9:16");
    expect(body.duration).toBe(4);
    expect(body.generate_audio).toBe(true);
    expect(body.seed).toBe(7);
    expect(body.resolution).toBe("1080p");
  });

  it("万相 2.7 t2v：自由整数时长四舍五入、分辨率 1080P、ratio 9:16", () => {
    const spec = getVideoParamSpec("alibaba/wan-2.7/text-to-video")!;
    const body = buildAtlasVideoBody("alibaba/wan-2.7/text-to-video", spec, {
      modelId: "alibaba/wan-2.7/text-to-video",
      mode: "text-to-video",
      prompt: "x",
      width: 1080,
      height: 1920,
      duration: 4.6,
    }, "x");
    expect(body.duration).toBe(5);
    expect(body.resolution).toBe("1080P");
    expect(body.ratio).toBe("9:16");
  });

  it("Seedance 2.0 Mini i2v：分辨率枚举无裸 1080p 时取 1080p-SR；带 watermark:false", () => {
    const spec = getVideoParamSpec("bytedance/seedance-2.0-mini/image-to-video")!;
    const body = buildAtlasVideoBody("bytedance/seedance-2.0-mini/image-to-video", spec, {
      ...i2vBase, modelId: "bytedance/seedance-2.0-mini/image-to-video",
    }, "x");
    expect(body.resolution).toBe("1080p-SR");
    expect(body.watermark).toBe(false);
    expect(body.generate_audio).toBe(false);
    expect(body.last_image).toBeUndefined();
  });

  it("万相 2.7 / Kling O3 参考生视频：images+videos 与 images+单video 两种形态", () => {
    const wan = getVideoParamSpec("alibaba/wan-2.7/reference-to-video")!;
    const wanBody = buildAtlasVideoBody("alibaba/wan-2.7/reference-to-video", wan, {
      modelId: "alibaba/wan-2.7/reference-to-video",
      mode: "video-to-video",
      prompt: "x",
      referenceImageUrls: ["https://e.com/p.png"],
      referenceVideoUrls: ["https://e.com/a.mp4", "https://e.com/b.mp4"],
    }, "x");
    expect(wanBody.images).toEqual(["https://e.com/p.png"]);
    expect(wanBody.videos).toEqual(["https://e.com/a.mp4", "https://e.com/b.mp4"]);

    const kling = getVideoParamSpec("kwaivgi/kling-video-o3-std/reference-to-video")!;
    const klingBody = buildAtlasVideoBody("kwaivgi/kling-video-o3-std/reference-to-video", kling, {
      modelId: "kwaivgi/kling-video-o3-std/reference-to-video",
      mode: "video-to-video",
      prompt: "x",
      referenceImageUrls: ["https://e.com/p.png"],
      referenceVideoUrls: ["https://e.com/a.mp4", "https://e.com/b.mp4"],
    }, "x");
    expect(klingBody.images).toEqual(["https://e.com/p.png"]);
    expect(klingBody.video).toBe("https://e.com/a.mp4"); // single-video field takes the first
  });
});

describe("Seedance 2.5 请求体（旗舰 4-30s，schema 无 seed 参数）", () => {
  it("i2v：image/last_image、时长 4-30 整档直取、竖屏 1080 取 1080p-sr、ratio 仅 adaptive、seed 不发", () => {
    const spec = getVideoParamSpec("bytedance/seedance-2.5/image-to-video")!;
    const body = buildAtlasVideoBody("bytedance/seedance-2.5/image-to-video", spec, {
      ...i2vBase,
      modelId: "bytedance/seedance-2.5/image-to-video",
      lastFrameUrl: "https://example.com/last.png",
      duration: 22,
      audioEnabled: true,
      seed: 42,
    }, "宣传片");
    expect(body).toEqual({
      model: "bytedance/seedance-2.5/image-to-video",
      prompt: "宣传片",
      image: "https://example.com/first.png",
      last_image: "https://example.com/last.png",
      duration: 22,
      resolution: "1080p-sr",
      ratio: "adaptive",
      generate_audio: true,
      watermark: false,
    });
  });

  it("r2v：reference_images 数组、显式 ratio 9:16、超上限时长吸附回 30", () => {
    const spec = getVideoParamSpec("bytedance/seedance-2.5/reference-to-video")!;
    const body = buildAtlasVideoBody("bytedance/seedance-2.5/reference-to-video", spec, {
      modelId: "bytedance/seedance-2.5/reference-to-video",
      mode: "video-to-video",
      prompt: "整片",
      referenceImageUrls: ["data:image/png;base64,AAA", "data:image/png;base64,BBB"],
      width: 720,
      height: 1280,
      duration: 35,
      audioEnabled: true,
    }, "整片");
    expect(body).toEqual({
      model: "bytedance/seedance-2.5/reference-to-video",
      prompt: "整片",
      reference_images: ["data:image/png;base64,AAA", "data:image/png;base64,BBB"],
      duration: 30,
      resolution: "720p",
      ratio: "9:16",
      generate_audio: true,
      watermark: false,
    });
  });
});

describe("specFromOpenApiInput：动态模型 schema 派生（动态导入的提交侧）", () => {
  it("从 H3 i2v 真实 schema 派生的 spec 与手写 spec 一致", () => {
    // verbatim subset of static.atlascloud.ai/model/schema/minimax-h3-image-to-video.json
    const input = {
      properties: {
        model: { type: "string", default: "minimax/h3/image-to-video" },
        prompt: { type: "string" },
        image: { type: "string" },
        end_image: { type: "string" },
        resolution: { type: "string", enum: ["768P", "2K"], default: "2K" },
        duration: { type: "number", enum: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], default: 8 },
        ratio: { type: "string", enum: ["adaptive"], default: "adaptive" },
      },
      required: ["model", "prompt", "image", "resolution", "duration"],
    };
    const spec = specFromOpenApiInput(input)!;
    expect(spec).toEqual(getVideoParamSpec("minimax/h3/image-to-video"));
  });

  it("识别 sound 音频键、-1 时长哨兵过滤、seed/watermark 探测", () => {
    const spec = specFromOpenApiInput({
      properties: {
        prompt: { type: "string" },
        image: { type: "string" },
        duration: { type: "integer", enum: [-1, 4, 5], default: 5 },
        sound: { type: "boolean", default: true },
        seed: { type: "integer" },
        watermark: { type: "boolean" },
      },
    })!;
    expect(spec.durationEnum).toEqual([4, 5]);
    expect(spec.audioKey).toBe("sound");
    expect(spec.supportsSeed).toBe(true);
    expect(spec.supportsWatermark).toBe(true);
  });

  it("非 schema 输入返回 undefined（回退旧请求体）", () => {
    expect(specFromOpenApiInput(undefined)).toBeUndefined();
    expect(specFromOpenApiInput({})).toBeUndefined();
    expect(specFromOpenApiInput("nope")).toBeUndefined();
  });
});
