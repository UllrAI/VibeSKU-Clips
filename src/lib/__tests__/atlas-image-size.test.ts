import { describe, it, expect, vi, afterEach } from "vitest";
import { AtlasCloudProvider, buildImageSizeParams } from "@/lib/providers/atlas-cloud";

/**
 * Issue #18 regressions — Atlas image models each have their own size contract.
 *
 * A user generated a 9:16 asset with openai/gpt-image-2/text-to-image; the app sent the
 * raw default size "1080x1920", which gpt-image-2 rejects server-side ("size must be
 * multiples of 16") AFTER the task was billed. The same raw passthrough also broke the
 * other catalog models: seedream v5 only accepts `W*H` presets, and nano-banana has no
 * size field at all (aspect_ratio + resolution instead).
 */

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("buildImageSizeParams：gpt-image-2（issue #18 主案）", () => {
  it("1080x1920（默认 9:16）映射为精确同比例且 16 整除的官方标准尺寸 1152x2048", () => {
    expect(buildImageSizeParams("openai/gpt-image-2/text-to-image", 1080, 1920)).toEqual({
      size: "1152x2048",
    });
  });

  it("横屏 1920x1080 映射为 2048x1152（16:9 也踩这个雷）", () => {
    expect(buildImageSizeParams("openai/gpt-image-2/text-to-image", 1920, 1080)).toEqual({
      size: "2048x1152",
    });
  });

  it("编辑模型（gpt-image-2/edit）同规则：3:4 保持精确比例（1104x1472）", () => {
    expect(buildImageSizeParams("openai/gpt-image-2/edit", 1080, 1440)).toEqual({
      size: "1104x1472",
    });
  });

  it("已是 16 整除的同比例尺寸原样保留（720x1280）", () => {
    expect(buildImageSizeParams("openai/gpt-image-2/text-to-image", 720, 1280)).toEqual({
      size: "720x1280",
    });
  });

  it("本来就是 16 倍数的尺寸原样保留", () => {
    expect(buildImageSizeParams("openai/gpt-image-2/text-to-image", 1024, 1024)).toEqual({
      size: "1024x1024",
    });
  });

  it("任意输入吸附后必然可被 16 整除且不超过 3840 上限", () => {
    for (const [w, h] of [[1080, 1920], [999, 1234], [4500, 100], [720, 1280], [17, 17], [1080, 1440], [750, 1000]]) {
      const size = buildImageSizeParams("openai/gpt-image-2/text-to-image", w, h).size!;
      const [sw, sh] = size.split("x").map(Number);
      expect(sw % 16).toBe(0);
      expect(sh % 16).toBe(0);
      expect(sw).toBeGreaterThanOrEqual(16);
      expect(sw).toBeLessThanOrEqual(3840);
      expect(sh).toBeLessThanOrEqual(3840);
    }
  });
});

describe("buildImageSizeParams：seedream v5（仅接受 * 分隔的预设）", () => {
  it("9:16 映射到最近的竖屏预设 1600*2848", () => {
    expect(buildImageSizeParams("bytedance/seedream-v5.0-lite", 1080, 1920)).toEqual({
      size: "1600*2848",
    });
  });

  it("16:9 映射到 2848*1600", () => {
    expect(buildImageSizeParams("bytedance/seedream-v5.0-lite", 1920, 1080)).toEqual({
      size: "2848*1600",
    });
  });

  it("1:1 映射到 2048*2048", () => {
    expect(buildImageSizeParams("bytedance/seedream-v5.0-lite", 1024, 1024)).toEqual({
      size: "2048*2048",
    });
  });
});

describe("buildImageSizeParams：nano-banana（无 size 字段，用 aspect_ratio+resolution）", () => {
  it("1080x1920 → aspect_ratio 9:16 + 2k，且不带 size 字段", () => {
    const params = buildImageSizeParams("google/nano-banana-2/text-to-image", 1080, 1920);
    expect(params).toEqual({ aspect_ratio: "9:16", resolution: "2k" });
    expect(params.size).toBeUndefined();
  });

  it("1024x1024 → 1:1 + 1k", () => {
    expect(buildImageSizeParams("google/nano-banana-2/text-to-image", 1024, 1024)).toEqual({
      aspect_ratio: "1:1",
      resolution: "1k",
    });
  });
});

describe("buildImageSizeParams：兜底行为", () => {
  it("未知/自定义模型保持旧的 WxH 直传（不改变既有行为）", () => {
    expect(buildImageSizeParams("some/custom-model", 1080, 1920)).toEqual({
      size: "1080x1920",
    });
  });

  it("缺少宽高时返回空对象（用平台默认）", () => {
    expect(buildImageSizeParams("openai/gpt-image-2/text-to-image")).toEqual({});
    expect(buildImageSizeParams("openai/gpt-image-2/text-to-image", 1080)).toEqual({});
  });
});

describe("generateImage 集成：实际发出的请求体（issue #18 复现路径）", () => {
  /** fetch stub: capture the create-task body, then report the task completed */
  function stubAtlasFetch() {
    const bodies: Array<Record<string, unknown>> = [];
    const fakeResponse = (payload: unknown): Response =>
      ({
        ok: true,
        status: 200,
        json: async () => payload,
        text: async () => "",
      }) as unknown as Response;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        if (String(url).includes("/model/generateImage")) {
          bodies.push(JSON.parse(String(init.body)));
          return fakeResponse({ code: 200, data: { id: "task-18" } });
        }
        return fakeResponse({
          id: "task-18",
          status: "completed",
          outputs: ["https://example.com/out.png"],
          model: "openai/gpt-image-2/text-to-image",
        });
      })
    );
    return bodies;
  }

  it("用户默认 9:16（1080x1920）请求 gpt-image-2 时，上行 size 为 1152x2048", async () => {
    const bodies = stubAtlasFetch();
    const p = new AtlasCloudProvider({ name: "atlas-cloud", apiKey: "test-key", baseUrl: "https://example.com" });
    const result = await p.generateImage({
      modelId: "openai/gpt-image-2/text-to-image",
      mode: "text-to-image",
      prompt: "product shot",
      width: 1080,
      height: 1920,
    });
    expect(bodies).toHaveLength(1);
    expect(bodies[0].size).toBe("1152x2048");
    expect(result.imageUrls).toEqual(["https://example.com/out.png"]);
  });

  it("seedream 上行 size 使用 * 分隔预设；nano-banana 不带 size", async () => {
    const bodies = stubAtlasFetch();
    const p = new AtlasCloudProvider({ name: "atlas-cloud", apiKey: "test-key", baseUrl: "https://example.com" });
    await p.generateImage({
      modelId: "bytedance/seedream-v5.0-lite",
      mode: "text-to-image",
      prompt: "poster",
      width: 1080,
      height: 1920,
    });
    await p.generateImage({
      modelId: "google/nano-banana-2/text-to-image",
      mode: "text-to-image",
      prompt: "poster",
      width: 1080,
      height: 1920,
    });
    expect(bodies[0].size).toBe("1600*2848");
    expect(bodies[1].size).toBeUndefined();
    expect(bodies[1].aspect_ratio).toBe("9:16");
    expect(bodies[1].resolution).toBe("2k");
  });
});
