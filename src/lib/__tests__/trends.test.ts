import { describe, it, expect, beforeEach } from "vitest";
import {
  parseTrendsRss,
  normalizeGeo,
  parseDouyinHotSearch,
  parseToutiaoHotBoard,
  formatHotValue,
  cachedTrends,
  clearTrendsCache,
} from "@/lib/trends";

const SAMPLE = `<?xml version="1.0"?><rss><channel>
<title>Daily Search Trends</title>
<item>
  <title>mstr</title>
  <ht:approx_traffic>2000+</ht:approx_traffic>
  <ht:news_item><ht:news_item_title>Strategy Announces &amp; Reserves Plan</ht:news_item_title></ht:news_item>
</item>
<item>
  <title><![CDATA[world cup results]]></title>
  <ht:approx_traffic>5000+</ht:approx_traffic>
</item>
</channel></rss>`;

describe("parseTrendsRss", () => {
  it("只取 <item>，跳过 channel 头部标题；含热度 + 新闻背景 + 实体/CDATA 解码", () => {
    const topics = parseTrendsRss(SAMPLE);
    expect(topics.length).toBe(2); // excludes the channel-level "Daily Search Trends" title
    expect(topics[0]).toEqual({ title: "mstr", traffic: "2000+", context: "Strategy Announces & Reserves Plan" });
    expect(topics[1]).toEqual({ title: "world cup results", traffic: "5000+", context: undefined });
  });
  it("空/无 item → 空数组", () => {
    expect(parseTrendsRss("<rss><channel><title>x</title></channel></rss>")).toEqual([]);
  });
});

describe("normalizeGeo", () => {
  it("合法两字母 → 大写；非法 → US", () => {
    expect(normalizeGeo("jp")).toBe("JP");
    expect(normalizeGeo("US")).toBe("US");
    expect(normalizeGeo("xyz")).toBe("US");
    expect(normalizeGeo(null)).toBe("US");
  });
});

describe("formatHotValue", () => {
  it("万/亿 分档 + 边界", () => {
    expect(formatHotValue(11504605)).toBe("1150万");
    expect(formatHotValue(170276700)).toBe("1.7亿");
    expect(formatHotValue(1_230_000_000)).toBe("12亿");
    expect(formatHotValue(9999)).toBe("9999");
    expect(formatHotValue(0)).toBe("");
    expect(formatHotValue(NaN)).toBe("");
  });
});

describe("parseDouyinHotSearch", () => {
  it("真实结构：word_list → 标题/热度/名次/来源", () => {
    const json = {
      data: {
        word_list: [
          { word: "今日立秋", hot_value: 11359117, video_count: 12000 },
          { word: "  台风白海豚实时路径 ", hot_value: "11504605" },
          { word: 123, hot_value: 1 }, // non-string word dropped
          { hot_value: 999 }, // missing word dropped
          { word: "无热度词条" },
        ],
      },
    };
    const topics = parseDouyinHotSearch(json);
    expect(topics.length).toBe(3);
    expect(topics[0]).toEqual({ title: "今日立秋", hotValue: 11359117, traffic: "1136万", rank: 1, source: "douyin" });
    expect(topics[1].title).toBe("台风白海豚实时路径"); // trimmed; numeric-string hot value accepted
    expect(topics[1].hotValue).toBe(11504605);
    expect(topics[2]).toEqual({ title: "无热度词条", hotValue: undefined, traffic: undefined, rank: 3, source: "douyin" });
  });
  it("畸形输入 → 空数组", () => {
    expect(parseDouyinHotSearch(null)).toEqual([]);
    expect(parseDouyinHotSearch({})).toEqual([]);
    expect(parseDouyinHotSearch({ data: { word_list: "nope" } })).toEqual([]);
  });
});

describe("parseToutiaoHotBoard", () => {
  it("真实结构：data[].Title/HotValue（数字或数字字符串都收）", () => {
    const json = {
      data: [
        { Title: "北京暴雨", HotValue: "17027670" },
        { Title: "进出口超30万亿元", HotValue: 13941077 },
        { NoTitle: true },
      ],
    };
    const topics = parseToutiaoHotBoard(json);
    expect(topics.length).toBe(2);
    expect(topics[0]).toEqual({ title: "北京暴雨", hotValue: 17027670, traffic: "1703万", rank: 1, source: "toutiao" });
    expect(topics[1].source).toBe("toutiao");
  });
  it("畸形输入 → 空数组", () => {
    expect(parseToutiaoHotBoard(undefined)).toEqual([]);
    expect(parseToutiaoHotBoard({ data: {} })).toEqual([]);
  });
});

describe("cachedTrends", () => {
  beforeEach(() => clearTrendsCache());

  it("TTL 内命中缓存不再打源；不同 key 各自取数", async () => {
    let calls = 0;
    const fetcher = async () => {
      calls++;
      return { source: "douyin", topics: [{ title: "x" }] };
    };
    let t = 0;
    const now = () => t;
    await cachedTrends("cn", fetcher, { now });
    t = 1000;
    await cachedTrends("cn", fetcher, { now });
    expect(calls).toBe(1);
    await cachedTrends("geo:US", fetcher, { now });
    expect(calls).toBe(2);
  });

  it("TTL 过期后重取；空结果不缓存（瞬时失败可快速重试）", async () => {
    let calls = 0;
    let payload: { topics: { title: string }[] } = { topics: [] };
    const fetcher = async () => {
      calls++;
      return payload;
    };
    let t = 0;
    const now = () => t;
    await cachedTrends("cn", fetcher, { now, ttlMs: 100 });
    await cachedTrends("cn", fetcher, { now, ttlMs: 100 });
    expect(calls).toBe(2); // empty → uncached → refetched
    payload = { topics: [{ title: "ok" }] };
    await cachedTrends("cn", fetcher, { now, ttlMs: 100 });
    expect(calls).toBe(3);
    t = 99;
    await cachedTrends("cn", fetcher, { now, ttlMs: 100 });
    expect(calls).toBe(3); // within TTL → cached
    t = 101;
    await cachedTrends("cn", fetcher, { now, ttlMs: 100 });
    expect(calls).toBe(4); // expired → refetched
  });
});
