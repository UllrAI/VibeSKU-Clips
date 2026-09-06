# VibeSKU Clips

中文版 | [English](README.md)

VibeSKU Clips 把商品资料转化为一条 15 秒本地化 UGC 视频。运营提交商品链接或
图片与创作要求，平台依次完成商品理解、脚本创作、可选分镜、视听生成与质检，交付
成片及清单。

平台负责素材生产与交付清单；账号登录、内容发布、挂车商品与效果观察由运营
团队通过既有工具完成。

![VibeSKU Clips](./public/og.png)

## ✨ 平台能力

- **商品理解。** 读取商品链接、上传图片与 Brief，沉淀商品外观、规格、卖点与
  使用场景；资料不支持的内容标记为待补充，不会编造。
- **多语言创作。** 输出语言与目标市场独立配置，面向墨西哥与面向西班牙的西班牙语
  是两版脚本，各自生成口播、字幕与发布配文。
- **三类内容模板。** 人物讲解、场景种草、使用介绍，每类都有固定的节拍结构与可轮换
  的开场角度。
- **人物一致性。** 上传获授权的照片，或描述虚构成年形象；生成的开场帧用于锁定整条
  视频的人物与商品外观。
- **一次做好一条。** 商品、模特、脚本、可选分镜与成片是一条引导路径，每个高成本步骤
  都先由人确认。
- **先质检再交付审核。** 逐条检查时长、口播长度、字幕安全区、商品准确性、人物一致性
  与目标语言表达。
- **审核与再生成。** 每条成片可选用、拒绝或重新生成，并保留商品、脚本与模特关系。
- **导出附交付清单。** 每条素材包含编号、商品、语言、市场、模特、授权说明与合规声明。
- **资产与消耗记录。** 商品、模特、脚本与合格成片保留来源、授权与版本关系；解析、
  脚本、生成、重试与再生成分别计量。

成片规格：15 秒，可选 9:16 或 16:9，并按供应商能力选择分辨率；随附封面、字幕、发布配文与合成内容披露说明。

## 🧱 生产流程

| 阶段 | 任务                  | 说明                                                   |
| :--- | :-------------------- | :----------------------------------------------------- |
| 录入 | `ugc.product.ingest`  | 抓取商品页并提取事实，资料缺失时停下等待补充           |
| 脚本 | `ugc.work.script`     | 根据确认的商品、模特、语言和市场写一份脚本             |
| 分镜 | `ugc.work.storyboard` | 每一拍画一张关键帧，画完停下等待确认                   |
| 成片 | `ugc.work.video`      | 根据脚本与所选参考素材生成视频、归档、写字幕并执行质检 |

任务通过 pg-boss 与仓库既有的 task-run 出箱机制执行，每一步都可在重启后继续或
独立重试。视听生成走 Prism（`src/lib/ugc/media`），脚本创作走任意 OpenAI 兼容接口。

业务逻辑位于 `src/lib/ugc`，任务处理器位于 `src/lib/jobs/ugc`，操作界面位于
`src/app/dashboard`。

## 🛠️ 技术栈

| 分类       | 技术                                                                                                                                                  |
| :--------- | :---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **框架**   | [Next.js](https://nextjs.org/) 16                                                                                                                     |
| **语言**   | [TypeScript](https://www.typescriptlang.org/)                                                                                                         |
| **UI**     | [React](https://react.dev/), [shadcn/ui](https://ui.shadcn.com/), [Tailwind v4](https://tailwindcss.com/), [Lucide React](https://lucide.dev/) (图标) |
| **认证**   | [Better-Auth](https://better-auth.com/)                                                                                                               |
| **数据库** | [PostgreSQL](https://www.postgresql.org/)                                                                                                             |
| **ORM**    | [Drizzle ORM](https://orm.drizzle.team/)                                                                                                              |
| **支付**   | [Stripe](https://stripe.com/)                                                                                                                         |
| **AI**     | [Vercel AI SDK](https://ai-sdk.dev/) v7，兼容任意 OpenAI 风格 LLM 端点                                                                                |
| **邮件**   | [Resend](https://resend.com/), [React Email](https://react.email/)                                                                                    |
| **表单**   | [React Hook Form](https://react-hook-form.com/), [Zod](https://zod.dev/)                                                                              |
| **部署**   | [Zeabur](https://zeabur.com/) 或 Docker                                                                                                               |
| **包管理** | [pnpm](https://pnpm.io/)                                                                                                                              |

## 🚀 快速上手

### 1. 环境准备

确保您的开发环境中已安装以下软件：

- [Node.js](https://nodejs.org/en/) 22 或更高版本
- [pnpm](https://pnpm.io/installation)

### 2. 项目克隆与安装

```bash
# 克隆项目仓库
git clone https://github.com/UllrAI/VibeSKU-Clips.git

# 进入项目目录
cd vibesku-clips

# 使用 pnpm 安装依赖
pnpm install
```

### 3. 环境配置

项目通过环境变量进行配置。首先，复制示例文件：

```bash
cp .env.example .env
```

然后编辑 `.env`，填入核心配置，以及
`src/lib/config/site.js` 中已启用功能所需的凭据。

#### 功能开关

`SITE_CONFIG` 是品牌、联系方式、外部链接、静态资源以及 `emailAuth`、`billing`、
`uploads`、`ai` 静态功能开关的客户端安全单一配置源。所有功能默认全部启用。若项目
不需要某项能力，应先在这里关闭，再删除对应环境变量。禁用后，相关导航、页面、API、
插件和 Server Action 都会同步关闭或拦截。

关闭 `emailAuth` 时，必须至少配置一组完整 OAuth Provider，确保 Web 登录仍可用。
所有凭据只能保留在服务端环境变量中，绝不能写入 `SITE_CONFIG`。

#### 环境变量说明

| 变量名                       | 描述                                                  | 示例                                                |
| :--------------------------- | :---------------------------------------------------- | :-------------------------------------------------- |
| `DATABASE_URL`               | **必需。** PostgreSQL 连接字符串。                    | `postgresql://user:password@localhost:5432/db_name` |
| `JOB_DATABASE_URL`           | 可选。pg-boss 数据库，默认使用 `DATABASE_URL`。       | `postgresql://user:password@localhost:5432/db_name` |
| `JOB_DB_POOL_SIZE`           | 可选。每进程 pg-boss 连接池大小，默认 `3`。           | `3`                                                 |
| `WORKER_GRACEFUL_TIMEOUT_MS` | 可选。Worker 收到 SIGTERM 后的排空时限，默认 30 秒。  | `30000`                                             |
| `RATE_LIMIT_IP_HEADER`       | **选填。** 可信客户端 IP 请求头，默认适配 Zeabur。    | `x-forwarded-for`                                   |
| `NEXT_PUBLIC_APP_URL`        | **必需。** 您应用部署后的公开 URL。                   | `http://localhost:3000` 或 `https://yourdomain.com` |
| `BETTER_AUTH_SECRET`         | **必需。** 至少 32 个字符的随机会话密钥。             | 使用 `openssl rand -base64 32` 生成                 |
| `RESEND_API_KEY`             | 启用 `emailAuth` 时必需。Resend API Key。             | `re_xxxxxxxxxxxxxxxx`                               |
| `RESEND_EMAIL_FROM`          | 启用 `emailAuth` 时必需。已验证的发件地址。           | `noreply@your-verified-domain.com`                  |
| `LLM_API_KEY`                | 启用 `ai` 时必需。LLM 端点的 API Key。                | `sk-...`                                            |
| `LLM_BASE_URL`               | 可选的 OpenAI 兼容端点，默认 OpenRouter。             | `https://openrouter.ai/api/v1`                      |
| `AI_DEFAULT_MODEL`           | 可选的模型 id，默认 `openai/gpt-5.6-luna`。           | `openai/gpt-5.6-luna`                               |
| `PRISM_API_BASE_URL`         | Prism 根地址；开发默认 staging，生产默认 production。 | `https://staging-prism.ullrai.com/api/v1`           |
| `PRISM_API_KEY`              | **生成必填。** 当前 Prism 环境的 API Key。            | `pk_...`                                            |
| `PRISM_API_SECRET`           | **生成必填。** 当前 Prism 环境的 API Secret。         | `sk_...`                                            |
| `STRIPE_SECRET_KEY`          | 启用 `billing` 时必需。需与环境模式匹配。             | `sk_test_...` 或 `sk_live_...`                      |
| `STRIPE_ENVIRONMENT`         | Stripe 环境模式，默认为 `test_mode`。                 | `test_mode` 或 `live_mode`                          |
| `STRIPE_WEBHOOK_SECRET`      | 启用 `billing` 时必需。Endpoint 签名密钥。            | `whsec_your_webhook_secret`                         |
| `R2_ENDPOINT`                | 启用 `uploads` 时必需。Cloudflare R2 API 端点。       | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`     |
| `R2_ACCESS_KEY_ID`           | 启用 `uploads` 时必需。R2 访问密钥 ID。               | `your_r2_access_key_id`                             |
| `R2_SECRET_ACCESS_KEY`       | 启用 `uploads` 时必需。R2 秘密访问密钥。              | `your_r2_secret_access_key`                         |
| `R2_BUCKET_NAME`             | 启用 `uploads` 时必需。R2 存储桶名称。                | `your_r2_bucket_name`                               |
| `GITHUB_CLIENT_ID`           | _可选。_ 用于 GitHub OAuth 的 Client ID。             | `your_github_client_id`                             |
| `GITHUB_CLIENT_SECRET`       | _可选。_ 用于 GitHub OAuth 的 Client Secret。         | `your_github_client_secret`                         |
| `GOOGLE_CLIENT_ID`           | _可选。_ 用于 Google OAuth 的 Client ID。             | `your_google_client_id`                             |
| `GOOGLE_CLIENT_SECRET`       | _可选。_ 用于 Google OAuth 的 Client Secret。         | `your_google_client_secret`                         |
| `LINKEDIN_CLIENT_ID`         | _可选。_ 用于 LinkedIn OAuth 的 Client ID。           | `your_linkedin_client_id`                           |
| `LINKEDIN_CLIENT_SECRET`     | _可选。_ 用于 LinkedIn OAuth 的 Client Secret。       | `your_linkedin_client_secret`                       |

> **提示:** 您可以使用以下命令生成一个安全的密钥：
> `openssl rand -base64 32`
>
> **可选的本地 CLI 鉴权方式：** 对于脚本、本地 Agent 或临时终端调用，您可以直接导出 `VIBESKU_CLIPS_CLI_API_KEY=ssk_...`，而不必把凭证写入 CLI 配置文件。

#### 数据统计

项目默认不包含统计服务或跟踪脚本。确有需要时再接入自己的服务；在依法需要用户授权的地区，必须先实现真实有效的同意管理，再加载非必要 Cookie 或跟踪器。

#### Stripe 产品目录配置

`src/lib/billing/stripe/prices.ts` 会明确分开测试与生产 Price ID。先设置
`STRIPE_ENVIRONMENT` 及其对应的 `STRIPE_SECRET_KEY`，再运行
`pnpm stripe:sync-products`。该命令会复用或创建 Stripe Product 与 Price，并且只更新
当前环境的命名空间。部署前请审查并提交这次配置变更；如果当前环境没有 Price ID，
Checkout 会安全失败，不会误用另一环境的目录。

Webhook 的重试、幂等和人工重放语义见
[计费 Webhook 运维说明](docs/webhooks.zh-CN.md)。

### 4. 数据库设置

本项目使用单一 Drizzle 配置文件 `src/database/config.ts`，并维护一套提交到仓库的迁移历史 `src/database/migrations/`。目标数据库仅由 `DATABASE_URL` 决定。

#### 本地开发

如果只是对自己的本地数据库做快速迭代：

```bash
pnpm db:push
```

如果这次 schema 变更需要评审、提交或同步到其他环境，请生成正式迁移：

```bash
pnpm db:generate
pnpm db:migrate
```

#### Staging / Production

共享环境只应使用已提交的 SQL 迁移：

```bash
# 1. 根据 schema 变更生成并提交迁移文件
pnpm db:generate

# 2. 在目标 DATABASE_URL 上执行一次已提交的迁移
pnpm db:migrate

# 3. 迁移成功后再部署应用
```

> **推荐发布实践**
>
> - **不要**在 staging 或 production 使用 `pnpm db:push`。
> - 所有环境共用一套迁移历史，不要再维护 dev/prod 两棵 SQL 目录。
> - 在 CI/CD 或部署平台中，把 `pnpm db:migrate` 作为单次执行的发布步骤。
> - **不要**把迁移挂在每个应用实例启动时自动执行。
> - 尽量保持 schema 变更向后兼容，降低迁移和应用切换的发布风险。

### 5. 内容管理 (Content Collections)

项目使用 Content Collections 配合原生 Markdown 文件来管理博客内容。文章位于 `content/blog/en/*.md`、`content/blog/zh-Hans/*.md` 等按语言划分的目录中，作者信息位于 `content/authors/*.json`，构建时会生成带类型的内容集合供博客页面和 sitemap 使用。

- **编写方式:** 直接在仓库中新增或编辑带 frontmatter 的 Markdown 文件。
- **生成内容数据:** 如需手动刷新生成结果，可运行 `pnpm content:build`。Next.js 插件负责开发与生产构建，测试和类型检查脚本会显式执行生成器。
- **生产行为:** 项目不再提供 CMS 管理后台路由或运行时内容 API，博客内容完全由仓库中的内容文件构建。

### 6. Agent 友好的 API 与 CLI 鉴权

这个模板明确区分了人类用户认证和机器认证：

- **浏览器用户：** Web App 使用 Better Auth session cookie
- **服务对服务、Agent、自动化脚本：** 使用用户自主管理的 API Key
- **本地开发工具：** 使用 `vibesku-clips-cli` 的浏览器批准设备登录

当前已经提供：

- 位于 `/api/v1/*` 下的版本化机器接口
- Dashboard Settings 中的 API Key 创建与撤销
- Dashboard Settings 中的 CLI Sessions 查看与撤销
- 不复用浏览器 session token 的终端登录流程

快速示例：

```bash
# 通过浏览器批准 vibesku-clips-cli 登录
pnpm vibesku-clips-cli -- auth login --base-url http://localhost:3000

# 查看当前 CLI 登录状态
pnpm vibesku-clips-cli -- auth status --base-url http://localhost:3000

# 用 API Key 驱动脚本或 Coding Agent
VIBESKU_CLIPS_CLI_API_KEY=ssk_your_key_here pnpm vibesku-clips-cli -- auth status --base-url http://localhost:3000
```

Web 端对应的管理入口位于 `/dashboard/developer`，可以同时管理 API Key 和已授权 CLI 会话。

### 7. 启动开发服务器

```bash
pnpm dev
```

现在，您的应用应该已经在 [http://localhost:3000](http://localhost:3000) 上运行了！

### 8. 管理员账户设置

为了安全起见，系统不会自动把第一个注册用户提升为超级管理员。请在目标用户正常注册后执行：

```bash
pnpm set:admin --email=your-email@example.com
```

该命令会在存在时自动加载 `.env`，否则直接使用当前进程环境变量，因此本地和服务器都使用同一个命令。

执行成功后，该用户将获得 `super_admin` 权限，并可访问 `/dashboard/admin`。

**安全提示**

- 只将该权限授予可信用户。
- 请在确认 `DATABASE_URL` 正确的安全环境中执行此命令。

## 📜 可用脚本

#### 应用脚本

| 脚本                     | 描述                                            |
| :----------------------- | :---------------------------------------------- |
| `pnpm dev`               | 启动开发服务器。                                |
| `pnpm build`             | 为生产环境构建应用。                            |
| `pnpm start`             | 启动生产服务器。                                |
| `pnpm vibesku-clips-cli` | 运行一等公民 CLI，用于设备登录与 API 鉴权检查。 |
| `pnpm lint`              | 检查代码中的 linting 错误。                     |
| `pnpm dead-code:check`   | 检查未使用的文件、导出与依赖。                  |
| `pnpm type-check`        | 运行 TypeScript 类型检查。                      |
| `pnpm test`              | 运行 Jest 测试套件。                            |
| `pnpm test:coverage`     | 运行 Jest 并生成覆盖率报告。                    |
| `pnpm test:e2e`          | 构建并运行 Playwright E2E 冒烟测试。            |
| `pnpm prettier:format`   | 使用 Prettier 格式化所有代码。                  |
| `pnpm set:admin`         | 将指定邮箱的用户提升为超级管理员。              |

## 🧪 E2E 测试

仓库现在包含基于 Playwright 的 `e2e/` 冒烟测试，当前主要覆盖这些真实浏览器链路：

- 未登录访问 dashboard 的重定向
- 已登录用户访问 dashboard
- admin 权限拦截与后台访问
- marketing 路由的 locale 规范化
- API Key 创建与 machine-auth 校验
- 浏览器批准 device auth 后的 CLI 登录

## 页面宽度约定

- `ShellContainer` 用于 marketing 的 header、footer 以及真正需要大画布的宽布局。
- `SectionContainer` 用于常规 marketing section 和大多数非 dashboard 页面主体。
- `ReadingContainer` 用于博客正文、法律条款等长文本阅读场景。
- `CompactContainer` 用于登录这种窄单卡片流程。
- `FocusContainer` 用于支付状态这类需要更多展示空间的单卡片流程。
- 全宽背景与内容宽度要分开处理。背景可以铺满视口，内容仍应落在一个语义化容器内。

运行方式：

```bash
createdb vibesku_e2e
# 在 .env 中添加 E2E_DATABASE_URL=postgresql://.../vibesku_e2e
pnpm test:e2e
```

`E2E_DATABASE_URL` 为必填项，必须指向专用的本地 PostgreSQL 数据库，且数据库名需包含独立的 `e2e` 或 `test` 片段。CI 之外，runner 会拒绝使用常规 `DATABASE_URL`，防止测试用户、API Key、CLI token、device code 与限流状态写入开发库或共享库。它会统一执行迁移、构建、启动生产服务，并在测试前后清理 E2E 数据。

测试会话入口仅在 Playwright 连接到声明的 E2E 数据库时启用。该入口还要求显式配置至少 32 个字符的 `E2E_TEST_SECRET`，且会在非本机生产部署中禁用。CI 未提供密钥时，Playwright 会为每次运行生成临时密钥。

#### 包体积分析脚本

| 脚本               | 描述                           |
| :----------------- | :----------------------------- |
| `pnpm analyze`     | 构建应用并生成包体积分析报告。 |
| `pnpm analyze:dev` | 在开发模式下启用包体积分析。   |

#### 数据库脚本

| 脚本               | 描述                                                          |
| :----------------- | :------------------------------------------------------------ |
| `pnpm db:generate` | 基于 schema 变更生成 SQL 迁移文件。                           |
| `pnpm db:migrate`  | 对 `DATABASE_URL` 指向的数据库应用已提交的迁移。              |
| `pnpm db:push`     | **仅限本地开发。** 不生成迁移文件，直接把 schema 推到数据库。 |

## 📁 文件上传功能

本项目集成了基于 Cloudflare R2 的安全文件上传系统。浏览器直传与服务端上传共用
短期上传意图、用户字节配额、一次性完成确认和孤儿对象清理流程。

### 1. Cloudflare R2 配置

1.  **创建 R2 存储桶**：登录 Cloudflare Dashboard，导航到 R2 并创建一个新的存储桶。
2.  **获取 API 令牌**：在 R2 概览页面，点击 "Manage R2 API Tokens"，创建一个具有"对象读写"权限的令牌。记下 `Access Key ID` 和 `Secret Access Key`。
3.  **设置环境变量**：将您的 R2 凭证和信息填入 `.env` 文件。
4.  **配置 CORS 策略**：为了允许浏览器直接上传文件，需要在您的 R2 存储桶的"设置"中配置 CORS 策略。添加以下配置，并将 `AllowedOrigins` 中的 URL 替换为您自己的：

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

浏览器直传使用第 2 版协议。预签名响应会明确给出必须发送的 `Content-Type` 与
`If-None-Match: *` 请求头，因此同一个对象键只能成功写入一次。签名链接有效期为
15 分钟，数据库预留有效期为一小时。取消会立即释放额度，但不会缩短原有到期时间。
预留到期后，清理任务先删除对象并保留 24 小时墓碑；移除上传意图前会再次删除对象，
从而清理在签名仍有效时才开始的晚到 PUT。部署该版本时，仍使用旧版未签名请求头协议
的客户端必须刷新。

所有完成请求都必须携带数据库中的上传意图，不存在仅凭对象键即可完成的旁路。
单用户额度为滚动 24 小时 1 GiB、总计 5 GiB，定义在 `src/lib/config/upload.ts`
的 `DAILY_QUOTA_BYTES` 与 `TOTAL_QUOTA_BYTES`。

### 2. 上传清理

Worker 会自行清理过期的上传意向：每隔几秒回收滞留的清理认领、删除废弃的 R2
对象，并移除已标记删除的文件（见 `scripts/worker.ts` 的 `maintain()`）。无需
额外调度，也不需要保存密钥——只要 Worker 在跑，清理就在跑。R2 生命周期规则可以
额外配置为一天后终止未完成的分片上传，但不能替代这个理解数据库状态的清理流程。

### 3. 使用 `FileUploader` 组件

我们提供了一个强大的 `FileUploader` 组件，支持拖拽、进度显示、图片压缩和错误处理。

#### 基本用法

```tsx
import { FileUploader } from "@/components/ui/file-uploader";

function MyComponent() {
  const handleUploadComplete = (files) => {
    console.log("上传完成:", files);
    // 在此处理上传成功的文件信息
  };

  return (
    <FileUploader
      acceptedFileTypes={["image/png", "image/jpeg", "application/pdf"]}
      maxFileSize={5 * 1024 * 1024} // 5MB
      maxFiles={3}
      onUploadComplete={handleUploadComplete}
    />
  );
}
```

> **注意**: 此项目使用 `src` 目录结构，所有组件和库文件都位于 `src/` 目录中，通过 `@/` 路径映射可以直接访问 `src/` 目录下的文件。

#### 图片压缩

组件内置了客户端图片压缩功能，可在上传前减小图片体积，节省带宽和存储空间。

```tsx
<FileUploader
  acceptedFileTypes={["image/png", "image/jpeg", "image/webp"]}
  enableImageCompression={true}
  imageCompressionQuality={0.7} // 压缩质量 (0.1-1.0)
  imageCompressionMaxWidth={1200} // 压缩后最大宽度
/>
```

## 📊 包体积监控与优化

本项目集成了 `@next/bundle-analyzer`，帮助您分析和优化应用的包体积。

### 如何运行分析

```bash
# 分析生产构建
pnpm analyze

# 在开发模式下进行分析
pnpm analyze:dev
```

执行后，会自动在浏览器中打开客户端和服务端的包体积分析报告。

### 优化策略

- **动态导入**：对非首屏必需的大型组件或库使用 `next/dynamic` 进行代码分割。
- **依赖优化**：
  - **Tree Shaking**: 确保只从库中导入您需要的部分，例如 `import { debounce } from 'lodash-es';` 而不是 `import _ from 'lodash';`。
  - **轻量替代**: 考虑使用更轻量的库，例如用 `date-fns` 替代 `moment.js`。
- **图片优化**: 优先使用 Next.js 的 `<Image>` 组件，并启用 WebP 格式。

## ☁️ 部署

生产参考环境部署在 [Zeabur](https://zeabur.com/)，仓库同时提供可独立运行的多阶段
Docker 构建。

> **Zeabur 服务器九折优惠：**前往 [Zeabur](https://zeabur.com/) 购买服务器，并在
> 结账时输入推荐码 `visoar`，即可享受 10% 折扣。

将生产环境 Zeabur 服务的部署分支设为 `prod`，不要监听日常开发使用的默认分支（本仓库
为 `main`）。推送与 `package.json` 版本一致的 `release/vX.Y.Z` tag 后，
[`promote-release-to-prod.yml`](.github/workflows/promote-release-to-prod.yml)
会先确认对应 commit 位于仓库默认分支的历史中，再将 `prod` 指向该 commit；只有分支
更新成功后，Zeabur 才会开始部署。fork 后可沿用同一方案，详见
[Zeabur 部署指南](docs/deployment-zeabur.md#using-the-workflow-in-a-fork)。

1. 将通过审查的 commit 合并到默认分支，并等待 Quality workflow 通过。
2. 配置 `.env.example` 中的全部必需变量。构建前必须把 `NEXT_PUBLIC_APP_URL`
   设置为最终 HTTPS Origin，因为 canonical URL 与客户端配置会在构建时写入。
   用户文件使用私有桶，升级时按[架构说明](docs/architecture.md#deployment-requirements)操作。
3. 在 GitHub `production` 环境配置 `PRODUCTION_DATABASE_URL`；队列使用独立数据库时
   再设置 `PRODUCTION_JOB_DATABASE_URL`。发布流程核验精确 SHA 的 Quality 成功后，
   自动执行一次迁移，再更新生产分支。
4. 更新 `package.json` 中的版本，然后在该 commit 上创建版本一致的
   `release/vX.Y.Z` 附注标签（annotated tag）并推送：

   ```bash
   git tag -a release/v1.2.3 -m "Release v1.2.3"
   git push origin release/v1.2.3
   ```

5. 等待分支更新 workflow 与随后触发的 Zeabur 部署成功。`/api/health` 用于存活
   检查，`/api/ready` 用于包含数据库检查的就绪探针。
6. 验证公开 Origin、两种语言 URL、认证重定向、Dashboard、`robots.txt`、
   `sitemap.xml` 以及应用日志。

Docker Compose 使用相同顺序，并通过一次性的 `migrate` 服务执行迁移。自托管和本地
运行说明见 [docker/README.md](docker/README.md)。
可选的 GitHub 维护任务属于 best-effort，且只从默认分支定时运行。fork 仓库需要显式
启用定时 Actions，并监控最近一次成功执行；若执行时间属于 SLA，请使用平台调度器。

## 📄 许可证

本项目采用 [MIT](./LICENSE) 许可证。
