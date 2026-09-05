import { describe, it, expect } from "vitest";
import { settings } from "@/lib/i18n/messages/settings";

/**
 * Audit-fix regression: the settings page used to hard-code Chinese strings, which English users
 * saw raw. Rather than pinning the handful of keys that caused it back then — most of which have
 * since been deleted along with the multi-platform settings page — this guards the invariant
 * itself: every key exists in both locales, and no English value leaks Chinese.
 */
describe("settings i18n：两种语言键齐全，英文无中文泄漏", () => {
  const en = settings.en as Record<string, string>;
  const zh = settings.zh as Record<string, string>;

  it("zh 和 en 的键完全一致（缺键在客户端渲染时才会露出，测试是唯一的拦截点）", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort());
  });

  it("每个键都有非空文案", () => {
    for (const key of Object.keys(zh)) {
      expect(zh[key], `zh:${key}`).toBeTruthy();
      expect(en[key], `en:${key}`).toBeTruthy();
    }
  });

  it("en 文案不含中文字符", () => {
    for (const [key, value] of Object.entries(en)) {
      expect(/[一-鿿]/.test(value), `en:${key} → ${value}`).toBe(false);
    }
  });

  it("连接失败等通用提示两种语言都在", () => {
    for (const key of ["connectFailed", "connectTest", "statusReady", "statusMissing"]) {
      expect(zh[key]).toBeTruthy();
      expect(en[key]).toBeTruthy();
    }
  });
});
