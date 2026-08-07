import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  fetchAtlasCatalog,
  fetchAtlasInputSchema,
  getCachedAtlasEntry,
  clearAtlasCatalogCache,
  dynamicVideoModels,
  modesFromCatalogEntry,
  type AtlasCatalogEntry,
} from "@/lib/providers/atlas-catalog";

/**
 * Dynamic model discovery (v0.8.76): GET {baseUrl}/models is merged into the video
 * model picker at runtime. Discovery must be strictly additive — any failure returns
 * [] so the static curated catalog is always the floor.
 */

const BASE = "https://api.atlascloud.ai/api/v1";

function okJson(payload: unknown) {
  return { ok: true, status: 200, json: async () => payload } as unknown as Response;
}

const RAW_ROWS = [
  {
    model: "minimax/h3/text-to-video",
    type: "Video",
    displayName: "MiniMax H3 Text-to-Video",
    profile: "2K cinematic video",
    categories: ["TEXT-TO-VIDEO"],
    schema: "https://static.atlascloud.ai/model/schema/minimax-h3-text-to-video.json",
    priority: 90038,
    price: { actual: { base_price: "0.14" } },
  },
  {
    model: "xai/grok-imagine-video-v1.5/reference-to-video",
    type: "Video",
    displayName: "Grok Imagine v1.5 Reference-to-Video",
    categories: ["IMAGE-TO-VIDEO"],
    priority: 100,
  },
  { model: "bytedance/avatar-omni-human-v1.5", type: "Video", displayName: "OmniHuman", categories: ["AUDIO-TO-VIDEO"], priority: 99999 },
  { model: "kwaivgi/kling-video-o3-pro/video-edit", type: "Video", displayName: "O3 Edit", categories: ["VIDEO-TO-VIDEO"], priority: 99999 },
  { model: "openai/gpt-image-2/text-to-image", type: "Image", displayName: "GPT Image 2", categories: ["TEXT-TO-IMAGE"] },
  { model: "atlascloud/mystery-model", type: "Video", displayName: "Mystery", categories: [] },
  { type: "Video", displayName: "缺 model 字段的脏数据" },
];

beforeEach(() => {
  clearAtlasCatalogCache();
});

describe("fetchAtlasCatalog：拉取 + 缓存 + 失败回退", () => {
  it("解析 {code,data} 包裹格式，脏行被过滤，命中同步缓存查询", async () => {
    const fetchImpl = vi.fn(async () => okJson({ code: "200", data: RAW_ROWS }));
    const entries = await fetchAtlasCatalog(BASE, { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(entries.length).toBe(RAW_ROWS.length - 1); // dirty row dropped
    const h3 = getCachedAtlasEntry("minimax/h3/text-to-video");
    expect(h3?.priceBase).toBe("0.14");
    expect(h3?.schemaUrl).toContain("minimax-h3-text-to-video.json");
  });

  it("TTL 内第二次调用不再发请求", async () => {
    const fetchImpl = vi.fn(async () => okJson({ data: RAW_ROWS }));
    await fetchAtlasCatalog(BASE, { fetchImpl: fetchImpl as unknown as typeof fetch });
    await fetchAtlasCatalog(BASE, { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("网络失败返回 []（不抛错、不破坏静态目录）", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("offline");
    });
    const entries = await fetchAtlasCatalog(BASE, { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(entries).toEqual([]);
  });

  it("失败时保留同 baseUrl 的旧缓存（过期数据优于空列表）", async () => {
    const good = vi.fn(async () => okJson({ data: RAW_ROWS }));
    await fetchAtlasCatalog(BASE, { fetchImpl: good as unknown as typeof fetch });
    const bad = vi.fn(async () => {
      throw new Error("offline");
    });
    const entries = await fetchAtlasCatalog(BASE, {
      fetchImpl: bad as unknown as typeof fetch,
      ttlMs: -1, // force cache expiry so the failed refetch path runs
    });
    expect(entries.length).toBeGreaterThan(0);
  });
});

describe("dynamicVideoModels：可驱动类目过滤 + 精选去重 + 热度排序", () => {
  it("只保留 TEXT/IMAGE-TO-VIDEO 类目；数字人/视频编辑/无类目模型不进下拉", async () => {
    const fetchImpl = vi.fn(async () => okJson({ data: RAW_ROWS }));
    const entries = await fetchAtlasCatalog(BASE, { fetchImpl: fetchImpl as unknown as typeof fetch });
    const models = dynamicVideoModels(entries, new Set());
    expect(models.map((m) => m.id)).toEqual([
      "minimax/h3/text-to-video",
      "xai/grok-imagine-video-v1.5/reference-to-video",
    ]);
  });

  it("已在精选目录的 ID 被去重；描述带单价；modes 按类目派生（reference 追加 video-to-video）", async () => {
    const fetchImpl = vi.fn(async () => okJson({ data: RAW_ROWS }));
    const entries = await fetchAtlasCatalog(BASE, { fetchImpl: fetchImpl as unknown as typeof fetch });
    const models = dynamicVideoModels(entries, new Set(["minimax/h3/text-to-video"]));
    expect(models.map((m) => m.id)).toEqual(["xai/grok-imagine-video-v1.5/reference-to-video"]);
    expect(models[0].modes).toEqual(["image-to-video", "video-to-video"]);
    expect(models[0].extra?.dynamic).toBe(true);

    const all = dynamicVideoModels(entries, new Set());
    expect(all[0].description).toContain("$0.14/次");
  });

  it("modesFromCatalogEntry：类目到统一 modes 的映射", () => {
    const entry: AtlasCatalogEntry = {
      model: "a/b/text-to-video",
      type: "Video",
      categories: ["TEXT-TO-VIDEO", "IMAGE-TO-VIDEO"],
    };
    expect(modesFromCatalogEntry(entry)).toEqual(["text-to-video", "image-to-video"]);
  });
});

describe("fetchAtlasInputSchema：schema 拉取与缓存", () => {
  it("返回 components.schemas.Input 并缓存（第二次不发请求）；失败返回 undefined", async () => {
    const input = { properties: { prompt: { type: "string" } } };
    const fetchImpl = vi.fn(async () => okJson({ components: { schemas: { Input: input } } }));
    const url = "https://static.atlascloud.ai/model/schema/x.json";
    expect(await fetchAtlasInputSchema(url, fetchImpl as unknown as typeof fetch)).toEqual(input);
    expect(await fetchAtlasInputSchema(url, fetchImpl as unknown as typeof fetch)).toEqual(input);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const bad = vi.fn(async () => {
      throw new Error("offline");
    });
    expect(await fetchAtlasInputSchema("https://static.atlascloud.ai/other.json", bad as unknown as typeof fetch)).toBeUndefined();
  });
});
