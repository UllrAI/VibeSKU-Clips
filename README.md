# VibeSKU Clips

一个用于生成 UGC 风格短视频的开源项目。输入商品图片、商品链接或一句话主题，生成脚本、画面、配音、字幕并合成为视频。

## 功能

- 根据商品信息或主题生成分镜脚本
- 使用商品图、上传素材、免费素材或 AI 生成素材
- 生成口播配音与字幕
- 使用 FFmpeg 合成竖屏视频
- 管理项目、商品和出镜人物
- 提供网页界面和可选的 CLI

部分 AI 功能需要自行配置兼容服务的 API Key。使用免费素材和本地合成时，不需要配置图像或视频生成服务。

## 快速开始

### Docker

```bash
docker build -t ugc-video-generator .
docker run -d \
  -p 3000:3000 \
  -v vibesku-clips-data:/data \
  ugc-video-generator
```

打开 <http://localhost:3000>。

### 本地开发

需要 Node.js 20+、pnpm 10+ 和 FFmpeg。

```bash
git clone <仓库地址>
cd VibeSKU-Clips
corepack enable
pnpm install
pnpm dev
```

然后打开 <http://localhost:3000>。

FFmpeg 可通过系统包管理器安装：

```bash
# macOS
brew install ffmpeg

# Debian / Ubuntu
sudo apt install ffmpeg
```

## 基本使用

1. 打开“设置”，配置用于生成脚本的 OpenAI 兼容模型。
2. 如需 AI 图片或视频，在设置中配置对应服务。
3. 回到“创作”，上传商品图、粘贴商品链接或输入一个主题。
4. 选择生成方式并创建项目。
5. 检查脚本和素材后合成视频。

生成内容在发布前应由人工检查。使用第三方素材和模型时，请同时遵守对应的授权条款与平台规则。

更完整的操作说明见 [TUTORIAL.md](TUTORIAL.md)。

## 配置

常用配置可直接在网页的“设置”页面完成，包括：

- 脚本模型的 API 地址、Key 和模型名
- 图片、视频与配音服务
- 免费素材源的可选 API Key
- 默认画幅、时长、字幕和生成参数

项目数据默认保存在本地 `data/` 目录。Docker 部署时请挂载 `/data`，避免容器重建后丢失项目和成片。

## 开发命令

```bash
pnpm dev           # 启动开发服务器
pnpm lint          # 运行 ESLint
pnpm test          # 运行测试
pnpm design:check  # 检查界面规范
pnpm build         # 构建生产版本
pnpm cli -- --help # 查看 CLI 命令
```

修改数据库结构后，可运行：

```bash
pnpm exec drizzle-kit generate
```

## 技术栈

- Next.js 16、React 19、TypeScript
- Tailwind CSS、shadcn/ui
- SQLite、Drizzle ORM
- FFmpeg
- Vercel AI SDK

## 目录

```text
src/app/          页面和 API 路由
src/components/   界面组件
src/lib/          业务逻辑、存储与媒体处理
bin/              CLI
```

## License

[AGPL-3.0-only](LICENSE)
