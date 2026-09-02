# VibeSKU Clips × Infinite Canvas 画布节点插件 / Canvas node plugin

把 [basketikun/infinite-canvas](https://github.com/basketikun/infinite-canvas)（AI 无限画布工作台，AGPL-3.0）的画布素材一键变成**可发布的带货短视频**：画布上放一个「🎬 VibeSKU Clips 成片」节点，连上商品图，点「出片」——脚本 → 免费素材 → 免费配音字幕 → FFmpeg 合成全流程由本地 VibeSKU Clips 实例驱动，成片以视频节点落回画布，可继续被引用与二创。

Turn [infinite-canvas](https://github.com/basketikun/infinite-canvas) material into a **publishable commerce short video**: drop a "🎬 VibeSKU Clips" node on the canvas, connect product images, hit run — script → free stock footage → free TTS + captions → FFmpeg compose, driven by a local VibeSKU Clips instance. The finished video lands back on the canvas as a first-class video node.

## 使用 / Usage

1. 启动 VibeSKU Clips（v0.8.79+，自带本地跨端口 CORS）：`pnpm dev` 或桌面版。
2. 在 infinite-canvas 的「节点插件 → 第三方插件」里填本插件 JS 的 URL 安装（把 [`dist/vibesku-clips.js`](dist/vibesku-clips.js) 托管到任意静态地址即可；本地开发可放进其 `web/public/plugins/`）。
3. 画布工具栏 🧩 → 「VibeSKU Clips 成片」建节点 → ⚙ 里填 VibeSKU Clips 地址与 LLM 接口（OpenAI 兼容，仅用于写脚本）→ 填主题或连上游图片节点（自动切带货模式，商品图会上传进项目并出现在成片商品卡上）→ ▶ 出片。

两种模式自动切换 / two modes picked automatically:

- **主题模式 topic**：无上游图，一句话 → 成片（`/api/topic/script` 链）。
- **带货模式 product**：有上游图片节点 → 建项目 + 上传商品图 + 带货脚本链（`/api/project` → `/api/upload` → `/api/llm/script`），合成带商品卡。

## 构建 / Build

插件依赖上游仓库的 `@infinite-canvas/plugin-sdk`（`file:../sdk` 本地依赖），所以要在上游仓库目录里构建：

```bash
git clone https://github.com/basketikun/infinite-canvas.git
cp -r vibesku-clips-node infinite-canvas/plugins/canvas/vibesku-clips
cd infinite-canvas/plugins/canvas/sdk && bun install
cd ../vibesku-clips && bun install && bun run build   # → dist/vibesku-clips.js（同步到 web/public/plugins/）
```

## 许可 / License

上游 infinite-canvas 与 VibeSKU Clips 同为 **AGPL-3.0**，本插件源码随 VibeSKU Clips 仓库以 AGPL-3.0 发布；插件构建产物为宿主加载器契约的 ESM（React external），运行于画布页面内。

## 安全 / Security

VibeSKU Clips v0.8.79 起对 `/api/*` 开放**仅限 localhost 来源**的 CORS（任意端口；可用 `VIBESKU_CLIPS_CORS_ORIGINS` 显式扩展）。远程网页的 origin 永远匹配不上，浏览器侧对本地实例的防线保持完整。
