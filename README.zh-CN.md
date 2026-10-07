# VibeSKU Clips

中文 | [English](README.md)

VibeSKU Clips 把商品链接、图片和 Brief 转化为一条可下载的 15 秒 UGC 商品视频。
选择商品、模特、场景、内容格式、成片语言和目标市场，审核脚本，可选审核分镜，
然后确认生成视频。作品从创建到下载始终保留在同一个列表中。

平台负责产出视频素材。挂车链接、库存、发布和投放表现由发布团队管理。

![VibeSKU Clips](./public/og.png)

## 项目能力

- **商品素材与事实。** 通过 Firecrawl 导入商品页面，或上传最多六张商品图。
  解析成功后事实即可使用，并可在商品页编辑。解析警告仅供参考，缺少必要素材才会阻止生成。
- **可复用模特与场景。** 描述虚构成年模特，或提供已获授权的参考照片。
  模特库和场景库分别生成一张方形参考图，可在不同作品中复用。
- **十一种内容格式。** 人物讲解、场景种草、使用教程、数码演示、美妆流程、食品饮品、
  服装展示、穿搭、试穿、配饰和开箱，各自有独立的脚本结构和镜头要求。
- **两种生成模式。** 一镜到底先绘制开场帧，再生成视频；分镜引导按顺序逐拍绘图，
  等待人工确认。脚本始终停在审核节点，分镜和视频生成均需确认。
- **语言与市场独立。** 成片语言、目标市场和界面语言分别配置。界面支持英文和简体中文；
  成片语言包括英文、西班牙文、葡萄牙文、日文、韩文和简体中文。
- **版本与下载。** 查看生成版本，修改脚本或分镜后重新生成。视频和 SRT 字幕归档到私有 R2；
  脚本保留发布配文和 AI 生成披露文案。
- **持久后台任务。** PostgreSQL、pg-boss 和任务 outbox 保证重启后可继续处理。
  失败和队列停滞会显示在控制台，并提供重试入口。用量记录保留生成成本和产物来源。

每条视频目标时长固定为 **15 秒**，画幅可选 **9:16 或 16:9**。
可用模型和分辨率由供应商决定：

| 视频供应商 | 模型             | 分辨率            |
| ---------- | ---------------- | ----------------- |
| Prism      | H3               | 480p、720p        |
| lk888      | H3               | 720p、1080p、2K   |
| lk888      | Seedance 2.0/2.5 | 480p、720p、1080p |

当前质量报告检查脚本文本长度，并记录请求的目标时长；尚未独立测量视频实际时长，
也未对成片中的商品、人物和语言做视觉或音频核验。使用前仍需人工观看成片。

## 生产流程

默认路径为 **商品 → 脚本审核 → 视频 → 下载**。
分镜模式在脚本与视频之间增加分镜审核。商品仍在解析时作品等待，解析可用后自动开始写脚本。

| 后台任务              | 职责                                 |
| --------------------- | ------------------------------------ |
| `ugc.product.ingest`  | 导入页面素材并提取商品事实           |
| `ugc.talent.generate` | 生成可复用模特参考图                 |
| `ugc.scene.generate`  | 生成可复用场景参考图                 |
| `ugc.work.script`     | 编写脚本并等待审核                   |
| `ugc.work.storyboard` | 顺序绘制关键帧并等待确认             |
| `ugc.work.video`      | 生成视频、归档文件并记录质量检查结果 |

Web 进程负责入队，独立 Node Worker 调用 Firecrawl、LLM 和媒体供应商。
两种视频后端的图片都由 Prism 生成。私有参考图在 Worker 调用边界签发短期读取地址；
供应商临时输出会复制到 R2，避免原始链接过期后无法交付。

## 技术栈

Next.js 16 App Router、React 19、TypeScript、Tailwind CSS v4、shadcn/ui、next-intl、
PostgreSQL、Drizzle ORM、pg-boss、Better Auth、Resend、Cloudflare R2、Stripe 和
Vercel AI SDK v7。仓库 Markdown 通过 Content Collections 构建。

## 快速上手

需要 **Node.js 22.12.0 或更新版本**、**pnpm 10.33.0** 和 PostgreSQL。
视频生成还需要自行配置 LLM、图片/视频供应商和 R2 凭据；这些托管服务独立于源码许可证。

```bash
git clone https://github.com/UllrAI/VibeSKU-Clips.git
cd VibeSKU-Clips
pnpm install --frozen-lockfile
cp .env.example .env
openssl rand -base64 32
```

将生成的随机值填入 `BETTER_AUTH_SECRET`，然后在 `.env` 中配置自己的服务凭据。
示例占位符不能用于实际运行。

### 配置

[`.env.example`](.env.example) 是配置模板。Web 在 [`env.js`](env.js) 校验配置，
Worker 在 [`worker-env.ts`](src/lib/jobs/worker-env.ts) 校验所需子集。

| 配置项                                                                      | 用途                                                                     |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `DATABASE_URL`                                                              | 必填，PostgreSQL 应用数据库                                              |
| `JOB_DATABASE_URL`                                                          | 可选，独立队列数据库，默认使用 `DATABASE_URL`                            |
| `NEXT_PUBLIC_APP_URL`、`BETTER_AUTH_SECRET`                                 | 公开访问 origin，以及至少 32 字符的随机会话密钥                          |
| `RESEND_API_KEY`、`RESEND_EMAIL_FROM`                                       | 邮件登录，发件地址需使用已验证域名                                       |
| `LLM_API_KEY`、`LLM_BASE_URL`、`AI_DEFAULT_MODEL`                           | LLM 接入，默认 OpenRouter 和 `openai/gpt-5.6-luna`                       |
| `FIRECRAWL_API_KEY`、`FIRECRAWL_API_BASE_URL`                               | Worker 导入商品链接，默认根地址为 `https://api.firecrawl.dev/v2`         |
| `PRISM_API_KEY`、`PRISM_API_SECRET`、`PRISM_API_BASE_URL`                   | Worker 图片生成和 Prism 视频，凭据必须与所选主机匹配                     |
| `VIDEO_GENERATION_PROVIDER`                                                 | `prism`（默认）或 `lk888`，Web 与 Worker 配置需一致                      |
| `LK888_API_KEY`、`LK888_API_BASE_URL`                                       | lk888 视频所需密钥，默认根地址为 `https://api.lk888.ai`                  |
| `R2_ENDPOINT`、`R2_ACCESS_KEY_ID`、`R2_SECRET_ACCESS_KEY`、`R2_BUCKET_NAME` | 私有上传和生成媒体，Web 与 Worker 共用                                   |
| `STRIPE_SECRET_KEY`、`STRIPE_WEBHOOK_SECRET`、`STRIPE_ENVIRONMENT`          | 支付，配置匹配的测试/正式凭据和 webhook 签名密钥                         |
| `GOOGLE_*`、`GITHUB_*`、`LINKEDIN_*`                                        | 可选 OAuth client ID/secret 配对                                         |
| `DB_POOL_SIZE`、`JOB_DB_POOL_SIZE`、`WORKER_GRACEFUL_TIMEOUT_MS`            | 数据库连接预算和 Worker 停机超时                                         |
| `RATE_LIMIT_IP_HEADER`                                                      | 可信入口提供的 IP 请求头，默认 `x-forwarded-for`；代理必须覆盖客户端输入 |
| `BING_SITE_VERIFICATION`、`NEXT_PUBLIC_UMAMI_*`                             | 可选，部署自己的站点验证和统计配置                                       |

[`src/lib/config/site.js`](src/lib/config/site.js) 中的 `SITE_CONFIG` 管理品牌、
联系方式、链接和 `emailAuth`、`billing`、`uploads`、`ai` 功能开关，默认全部开启。
不使用的功能先关闭开关，再移除凭据。关闭邮件登录时，必须配置至少一个完整 OAuth 供应商。
`ai` 开关控制助手；视频生产仍需要相应 Worker 集成。

Prism 在开发环境默认使用 staging，生产构建默认使用 production。
请显式配置与自己账号匹配的 `PRISM_API_BASE_URL`。
开发用 Docker Compose 示例默认指向 staging，尽管容器运行的是生产构建。

R2 桶保持私有，并为应用 origin 设置上传 CORS。直传需要允许 `PUT`、`Content-Type`
和 `If-None-Match`；参见 [Docker 配置](docker/README.md) 和 [架构说明](docs/architecture.md)。

R2 CORS 示例，将 origin 替换为自己的应用地址：

```json
[
  {
    "AllowedOrigins": ["http://localhost:3000", "https://yourdomain.com"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["Content-Type", "If-None-Match"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

### 数据库与开发

创建 `DATABASE_URL` 指向的数据库，然后应用已提交迁移：

```bash
pnpm db:migrate
pnpm dev
```

访问 [http://localhost:3000](http://localhost:3000)。`pnpm dev` 同时启动 Web 和 Worker，
并监听文件变更。`pnpm dev:web` 仅启动 Web，后台任务需要另外运行 Worker。

Worker 也会在启动时通过 PostgreSQL advisory lock 应用已提交迁移，包括 pg-boss 初始化。
重复启动安全，迁移失败会停止 Worker。Web 不执行迁移，因此 Worker 数据库角色需要迁移权限。
共享 schema 变更使用 `pnpm db:generate`；`pnpm db:push` 仅用于可丢弃的本地迭代。

正常注册后，如需管理员权限，显式执行：

```bash
pnpm set:admin --email=your-email@example.com
```

### 可选支付初始化

开启支付时，配置自己的 Stripe 账号并运行：

```bash
pnpm stripe:sync-products
```

命令会更新 [`src/lib/billing/stripe/prices.ts`](src/lib/billing/stripe/prices.ts)
中所选测试/正式环境的目录。现有 ID 属于参考部署，是公开标识符，但不能在其他 Stripe
账号中复用。部署前检查生成的 diff。详见 [webhook 运维](docs/webhooks.zh-CN.md)。

## API 与 CLI 鉴权

浏览器使用会话 cookie，`/api/v1/*` 机器端点使用用户管理的 API key 或经浏览器批准的
CLI 会话。两者均在 `/dashboard/developer` 管理。

```bash
pnpm vibesku-clips-cli -- auth login --base-url http://localhost:3000
pnpm vibesku-clips-cli -- auth status --base-url http://localhost:3000
```

脚本也可使用 `VIBESKU_CLIPS_CLI_API_KEY`。当前 CLI 支持登录、状态、刷新和退出，
用途是鉴权。详见 [CLI 文档](packages/cli/README.md)。

## 开发检查

| 命令                         | 用途                               |
| ---------------------------- | ---------------------------------- |
| `pnpm lint`                  | ESLint                             |
| `pnpm type-check`            | 构建内容/路由类型并检查 TypeScript |
| `pnpm test --runInBand`      | Jest 测试                          |
| `pnpm test:e2e`              | 构建并运行 Playwright 浏览器测试   |
| `pnpm test:jobs:integration` | 持久任务数据库集成测试             |
| `pnpm dead-code:check`       | 检查未使用文件、导出和依赖         |
| `pnpm prettier:check`        | 格式检查                           |
| `pnpm build`                 | 构建独立 Web 和 Worker 产物        |
| `pnpm worker:start`          | 运行已构建 Worker                  |
| `pnpm analyze`               | 生产包体积分析                     |

E2E 必须设置 `E2E_DATABASE_URL`，指向名称包含独立 `e2e` 或 `test` 段的专用本地数据库。
不能使用常规应用数据库。测试 runner 会应用迁移并清理测试数据；未提供测试密钥时按次生成。

## 部署

同一版本必须运行 **Web 和 Worker 两个进程**。`pnpm build` 生成独立 Web 产物和
`dist/worker/worker.mjs`；`pnpm start` 只运行 Web，需另用 `pnpm worker:start` 启动 Worker，
并通过进程管理器注入环境变量。`NEXT_PUBLIC_APP_URL` 在构建时必须正确。
`/api/health` 用于存活检查，`/api/ready` 用于数据库就绪检查。

- [Docker 配置](docker/README.md)：包含 PostgreSQL、迁移、Web 和 Worker 的开发 Compose 栈。
  示例数据库密码仅用于本地开发。
- [Zeabur 部署](docs/deployment-zeabur.md)：Web/Worker 分离、生产迁移接入、备份配置和 fork 用法。

参考部署跟踪 `prod` 分支。将审核过的默认分支提交打上与 `package.json` 版本匹配的
`release/vX.Y.Z` 标签并推送，发布工作流会验证该 SHA 的 Quality 检查、执行迁移，再推进
`prod`。不要直接推送该分支。Fork 需配置自己的 GitHub `production` secrets、迁移隧道和分支过滤。

## 开源与自部署说明

- 修改部署使用的品牌、支持/法务/隐私邮箱、社交链接和博客作者。
  不要把凭据写进客户端可读取的 `SITE_CONFIG` 或 `NEXT_PUBLIC_*`。
- 使用自己的 Stripe 产品目录、OAuth 应用、邮件验证域名、R2 桶、统计站点 ID 和 Bing 验证值。
- 代码含 Prism production/staging API 根地址。取得源码不会获得服务访问权限，需配置有权限的供应商账号。
- `.env`、私钥、数据库备份、日志、客户素材和生产生成媒体不得提交到 Git。
  `.env.example` 仅包含占位符。
- [开源检查记录](docs/open-source-review.md) 列出本次仓库检查结果，以及尚待处理的依赖和配置问题。

仓库规范见 [AGENTS.md](AGENTS.md)，界面规范见 [design.md](design.md)，
任务运维见 [后台任务](docs/background-jobs.md)，助手架构见 [AI agents](docs/ai-agent.md)。
安全问题请通过 [SECURITY.md](SECURITY.md) 私下报告。

## 许可证

[MIT](LICENSE)。依赖许可证和第三方服务条款各自独立。
首页图片为 AI 生成的概念摄影，来源说明见 [首页素材](docs/landing-assets.md)。
