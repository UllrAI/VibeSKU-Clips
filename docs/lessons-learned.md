# Lessons Learned

违反直觉的事实,每条都来自真实踩过的坑。

与 `AGENTS.md` 的分工:`AGENTS.md` 写「必须怎么做」的规则,本文件写「为什么这么做会炸」。规则留在 `AGENTS.md`,不要迁移过来。

## 写入规范

- 只写真实踩过的坑。没踩过的推测和最佳实践复述不要进。
- 每条写清**现象 → 原因 → 正确做法**。只写「不要用 X」而不写为什么,下次仍然会有人踩。
- 一条一个坑,按主题分节即可,不做分类学。
- 过期即删。框架升级后不再成立的条目直接移除,不留考古层。

---

## 数据库

### 数据库 schema 再导出必须保持完整

**现象**:在 `src/database/schema.ts` 加了一张表之后,`pnpm type-check` 在**完全无关**的 `src/lib/billing/stripe/webhook.ts` 报错,信息是 `Property 'xxx' is missing in type 'ExtractTablesWithRelations<...>'`,长达数十行且不指向真正的问题点。

**原因**:`src/database/index.ts` 的 `drizzle(sql, { schema: { ...tables } })` 用的是 `./tables`——一份**手工维护的再导出白名单**,而 `src/lib/database/subscription.ts` 的 `Tx` 类型引用的是 `./schema` 全量。两者不一致时,`db.transaction()` 的回调参数类型与 `Tx` 不兼容,错误在最先使用 `Tx` 的文件爆出来。

**当前修复**:`tables.ts` 直接再导出完整 `schema.ts`，Web 与 Worker 共用 `createDatabaseClient()`，不再维护第二份表白名单。报错位置与真实原因可能不同。

---

## AI

### `onEnd` 回调不携带 token 用量

**现象**:想在 `createAgentUIStreamResponse` 的 `onEnd` 里记录用量,但事件对象上找不到 usage 字段。

**原因**:`ai@7` 的 `UIMessageStreamOnEndCallback` 事件只有 `{ messages, isContinuation, isAborted, responseMessage, finishReason }`。用量在流的 part 上,不在结束回调里。

**正确做法**:用 `messageMetadata` 回调捕获——`part.type === "finish"` 带整轮的 `totalUsage`,`part.type === "finish-step"` 带 `response.modelId`(provider 实际使用的模型,比读配置准确)。捕获到闭包变量,由 `onEnd` 统一落库。

注意两点:`messageMetadata` 的返回值会发给客户端,用量数据不要放进返回值;另外 `finishReason` 本来就在 `onEnd` 事件上,不要跟着一起用闭包捕获。参见 #92。

### `onEnd` 的 `isAborted` 需要真实的 abortSignal

**现象**:按 `isAborted` 给用量记录加了「已中止」标记,写了测试也过了,但线上永远不会出现这个值。

**原因**:`isAborted` 只在流里出现 `abort` chunk 时才为真,而该 chunk 只在 `abortSignal.aborted` 时产生。我们调用 `createAgentUIStreamResponse` 时既没传 `abortSignal` 也没配 `timeout`,并且 `consumeSseStream` 还刻意让浏览器断开后继续消费。测试之所以通过,是因为它直接手工调用 `onEnd({ isAborted: true })`,绕过了真实流程。

**当前修复**:聊天路由已连接请求 signal 与三分钟超时；流结束后持久 run 会结束或保留未知用量。`isAborted` 有意义的前提是接上 `abortSignal`。判断一个回调字段是否可达,要沿 SDK 的 runtime 反查它的触发条件,而不是看类型签名上有没有。

### 手工调用回调的单测证明不了该路径可达

**现象**:测试绿的功能上线后从不触发。

**原因**:mock 掉 SDK 后直接调用 `onEnd`/`messageMetadata` 并自行构造入参,测的是「给定这个输入,函数怎么做」,而非「这个输入真的会出现」。

**正确做法**:这类测试仍然值得写,但新增依赖 SDK 回调字段的分支时,额外确认一次该字段在本项目配置下的可达性。

### 不配 `experimental_toolApprovalSecret` 等于没有审批

**现象**:给写操作工具加了 `needsApproval: true`,UI 也弹出了确认卡片,看起来一切正常。但伪造一个 `{ type: "tool-approval-response", approved: true }` 直接 POST 到 `/api/chat`,工具照样执行,没有任何报错。

**原因**:审批状态存在客户端的消息里,服务端靠签名来判断这份「用户已同意」是不是自己发出的。`validateApprovedToolApprovals` 在没有 secret 时**直接跳过校验**——不是报错,是静默放行。实测对照:配了 secret 抛 `AI_InvalidToolApprovalSignatureError` 且 `executed = 0`;不配则不抛错、`executed = 1`。

**正确做法**:所有带审批工具的 agent 都要经过 `withToolApprovalSecret()`(`src/lib/ai/tool-approval.ts`)。secret 从 `BETTER_AUTH_SECRET` 派生而不是新开一个环境变量,正是因为漏配的后果是静默的——新变量忘了设,线上就等于没有审批。`src/lib/ai/tool-approval.test.ts` 里「未签名的审批必须被拒绝」那条用例是这个保证的唯一防线,不要因为「看着像重复测 SDK」而删掉。

---

## 后台任务

### Worker 里不能 import `server-only`,也不能 import `@/env`

**现象**:UGC 渲染 handler 在 Next 里跑得好好的,进了独立 Worker 进程直接崩:要么是 `server-only` 抛出的 "This module cannot be imported from a Client Component",要么是 `@/env` 因为缺少 `NEXT_PUBLIC_*` 之类的变量校验失败。

**原因**:Worker 是一个普通 Node 进程,没有 Next 的模块解析约定,`server-only` 的守卫在这里必然触发;`@/env` 校验的是 Web 侧的完整变量集,Worker 只拿到 `src/lib/jobs/worker-env.ts` 声明的子集。

**正确做法**:job 模块及其依赖一律不引 `server-only` / `@/env`。需要存储和模型时从 `process.env` 现场构造(见 `src/lib/ugc/storage.ts`、`src/lib/ugc/model.ts`),数据库从 `JobHandlerContext` 的 `db` 取。`"server-only"` 只留在 `src/lib/ugc/queries.ts` 这类纯 Web 模块里。

### pg-boss 的 `singleton` 策略会让同一个 key 的任务串行执行

**现象**:一个批次排了 40 条渲染任务,Worker 有并发额度却始终只有一条在跑,整批耗时是单条的 40 倍。

**原因**:队列用了 `singleton` 策略,pg-boss 保证同一 `singletonKey` 同时只有一个 active job。当时 `singletonKey` 取的是用户级 scopeKey,于是一个用户的所有渲染天然排成一队。

**正确做法**:需要并行就把 key 拆成泳道。`renderScopeKey(userId, batchId, laneIndex)` 用 `index % RENDER_LANES` 分配,既保留了「同一用户不会无限并发」的约束,又拿到了固定的并行度。

### 蓝图里记「第几秒」等于把参考片的节奏抄进新片

**现象**:早期的爆款解读把每个视觉事件记成 `{ kind, atMs }`,让写稿模型照着秒数排。产出的片子在换了口播语言之后全面错位——中文 12 个字和英文同义句根本不占同样长的时间,切镜落在句子中间,特写出现在还没提到卖点的位置。

**原因**:参考片的时间轴属于**那个人说那句话**。换了商品、换了语言、换了演员,同一个结构对应的秒数一定不同。把秒数当指令,等于要求新片复现旧片的语速。

**正确做法**:事件只记录它**回应什么**(`respondsTo`),不记录它何时发生。`sourceStart` / `sourceEnd` 只保留给人回跳原片核对,任何生成路径都不读它们。见 `src/lib/ugc/blueprint.ts` 的 system prompt 与 `src/lib/ugc/authoring.ts` 的 `blueprintDirection()`。

### 口播里的 `<显示|朗读>` 标注必须在分词层展开,不能在分词前替换

**现象**:先把 `<GT-7000|gee tee seven thousand>` 替换成朗读文本再去做字幕对齐,字幕里出现的是 "gee tee seven thousand";先替换成显示文本,对齐又整段崩掉,因为 ASR 听到的根本不是 "GT-7000"。

**原因**:这两侧服务于两个不同的消费者——朗读侧要和识别结果对齐(决定时间),显示侧要出现在字幕里(决定内容)。在分词之前做任何一侧的替换,都会丢掉另一侧。

**正确做法**:在 `tokenizeScript()` 里展开:按朗读侧切 token 参与对齐,把显示文本挂在该跨度的**第一个** token 上,其余 token 的 `text` 置空。拼接字幕的 `cueText()` 因此必须跳过空文本 token,否则会多出空格。见 `src/lib/ugc/script-notation.ts` 与 `src/lib/ugc/media/alignment.ts`。

### yt-dlp 的错误文案不能凭印象匹配

**现象**:失败分类写完、单测通过、评审也看不出问题,真正拿真实站点跑一遍才发现两条全落进兜底:「已下架」匹配的是 `video unavailable`,而 yt-dlp 实际说的是 `This video **is** unavailable`;另外从某些 IP 访问时 YouTube 根本不提登录,直接 `unable to download video data: HTTP Error 403`。

**原因**:这类字符串是外部程序的输出,不是我们的契约。凭对「它大概会怎么说」的印象写匹配,单测里又用同样的印象造样本,于是测试和实现一起错,互相背书。

**正确做法**:匹配串必须来自**真实捕获的输出**,并把捕获到的原句固化进测试(见 `src/lib/ugc/media/reference.test.ts`)。另外「平台不肯给」的几种说法——要登录、判定是机器人、直接 403——对运营是同一件事,合成一个 `platform_refused` 即可,不要按对方的措辞拆成几类。

### Worker 产出给人看的文字时,语言必须提前记在行上

**现象**:参考片解读上线后,中文界面下拿到的蓝图整篇是英文。`analyzeReference` 收了一个 `locale`,看着像是管语言的,实际只作为「这条片说什么语言」的上下文传进 prompt,**输出语言从头到尾没有被指令过**——于是跟着英文 system prompt 走。

**原因**:两个坑叠在一起。一是「传了 locale」不等于「指定了输出语言」,模型默认跟随 prompt 本身的语言;二是解读跑在 worker 里,`getRequestLocale()` 在那儿没有请求可读,所以即使想按界面语言输出也拿不到。

**正确做法**:凡是 worker 产出、最终给人读的文字,创建任务时就把界面语言写进领域行(这里是 `ugc_references.readingLocale`),handler 从行上取,并在 system prompt 里显式写「用 X 语言写每一个字段」。同时要单独交代引用:原片说过的话按原语言逐字引用,不翻译、也不把翻译当引用——否则运营没法拿着蓝图回去核对视频。

### 容器启动快过网络,不该按「发布坏了」处理

**现象**:worker 每次部署都先崩一次——`worker_start_failed: getaddrinfo ENOTFOUND <db-host>`——平台 2 秒后重启,随即迁移成功并就绪。

**原因**:pod 起来的瞬间 DNS 条目还没生效。`migrateDatabase` 是第一个开连接的地方,抛错就退出容器,这本是「发布坏了要大声失败」的正确设计,但它把一次两秒的抖动也当成了发布事故。

**正确做法**:只对「还没连上」这一类错误(`ENOTFOUND`/`EAI_AGAIN`/`ECONNREFUSED`/`ETIMEDOUT`/`ECONNRESET`,含 `cause` 链)做有界重试,10 次 × 2 秒。密码错、迁移 SQL 失败照旧立刻退出。不要改成无限重试:那会让真正配错的部署安静地转圈,而不是在部署页面上红掉。

### job 定义内部引用自身会导致类型循环

**现象**:在 `clipRenderJob` 的 handler 里写 `Parameters<typeof clipRenderJob.handler>[1]`,或者读 `clipRenderJob.queue.retryLimit`,`tsc` 报 "'clipRenderJob' implicitly has type 'any' because it does not have a type annotation and is referenced directly or indirectly in its own initializer"。

**原因**:`defineJob` 的返回类型由传入对象推断,对象内部又反过来引用这个返回类型,推断成环。

**正确做法**:handler 的 context 用独立别名声明 `type RenderContext = JobHandlerContext<RenderPayload>`,重试上限等常量提到模块级(`const RETRY_LIMIT = 2`),定义体内不引用自己。

---

## 测试

### 本机有 FFmpeg 不代表有字幕滤镜

**现象**:分段合成的本机冒烟测试能输出视频，但加入字幕后报 `No such filter: subtitles`。

**原因**:本机安装的 FFmpeg 未编译 libass，`ffmpeg -version` 正常并不证明 `subtitles` 滤镜可用。

**正确做法**:在渲染 Worker 镜像安装带 libass 的 FFmpeg，并在 CI 中用真实的字幕样例运行合成冒烟测试；本机先用 `ffmpeg -filters` 核对字幕滤镜。

### 从 `@jest/globals` 导入 `jest` 会让 `jest.mock` 失效

**现象**:测试顶部写了 `jest.mock("sonner", () => ({ toast: { warning: jest.fn() } }))`,断言时却报 `Matcher error: received value must be a mock or spy function`,拿到的是 sonner 的真实实现。

**原因**:`jest.mock` 依赖转译期的 hoisting 被提到 `import` 之前。SWC 的 hoisting 只认**全局** `jest` 标识符;一旦写了 `import { jest } from "@jest/globals"`,`jest` 变成本地绑定,`jest.mock` 就留在原地,注册时被测模块早已加载完毕,mock 不再生效。实测 `jest.isMockFunction(toast.warning)`:导入 `jest` 时为 `false`,用全局 `jest` 时为 `true`。

**正确做法**:只从 `@jest/globals` 取 `describe`/`it`/`expect`/`beforeEach`,`jest` 用全局的。参考 `src/components/auth/social-login-buttons.test.tsx`。

修复时注意工厂会被提升到所有模块级 `const` 之前执行,`jest.mock("x", () => ({ fn: mockFn }))` 会报 TDZ 的 `Cannot access 'mockFn' before initialization`。工厂里直接写 `jest.fn()`,再从被 mock 的模块 import 出来设实现和断言,参考 `src/hooks/use-admin-table.test.tsx`。

### jsdom 的 `crypto` 没有 `subtle`

**现象**:AI SDK 的工具审批用例在 jest 里报 `TypeError: Cannot read properties of undefined (reading 'importKey')`,同样的代码在 Node 里跑得好好的。

**原因**:jest 的 jsdom 环境提供了 `crypto`(有 `getRandomValues`),但没有 WebCrypto 的 `subtle`。SDK 签名走的是 `crypto.subtle`。

**正确做法**:在 `jest.setup.ts` 里用 Node 自带的 `node:crypto` 的 `webcrypto` 补齐。注意必须用 `Object.defineProperty`——jsdom 把 `crypto` 定义成 getter,直接赋值会失败。

---

## Next.js

### 配 `deploymentId` 会削弱 Next 自带的 skew 检测

**现象**:为了让旧页面在新部署后尽早硬跳转,给 `next.config.ts` 加了 `deploymentId`(取 `package.json` 版本号)。看起来一切正常:静态资源带上了 `?dpl=`,HTML 带上了 `data-dpl-id`,lint / type-check / test / build 全绿。实际效果是**比不加更差**。

**原因**:两处非直觉行为。

其一,`getBuildId`(`node_modules/next/dist/build/index.js`)在检测到 `config.deploymentId` 后**不再生成随机 buildId**,直接返回常量 `build-TfctsWXpff2fKS`。实测:配了以后 `.next/BUILD_ID` 是这个常量,不配则是随机 nanoid。

其二,客户端的比对键随之切换。`app-index.js` 里 `initialRSCPayload.b ? setNavigationBuildId(b) : setNavigationBuildId(getDeploymentId())`——不配 deploymentId 时比的是每次构建都变的 buildId,配了以后比的是 deploymentId。于是检测粒度从「每次构建」降到「每个版本号」,同版本重建(改环境变量触发的 rebuild、预览环境跟分支、同一 tag 重跑)一次都不会触发,而这恰恰是最需要它的场景——同版本重建**必然**产生新的 Server Action ID,因为 action ID 的 hash salt 就是每次构建随机生成的加密密钥(webpack 走 `build/webpack-config.js` 的 `serverReferenceHashSalt`,本仓库默认的 Turbopack 走 `build/turbopack-build/impl.js`,两条路径吃同一个 key)。

**正确做法**:不要配 `deploymentId`,除非能喂给它一个每次构建都变的值(git SHA),而那需要构建时注入。想让同版本重建不产生 skew,对症的是钉住 `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`——它同时是 action ID 的 hash salt,钉住它等于让同源码重建产出相同的 action ID。

顺带两个记下来省得再查的点:`deploymentId` 只接受 `[a-zA-Z0-9_-]`(`build/index.js` 里的正则),语义化版本号带点会让构建直接失败;以及 `NEXT_DEPLOYMENT_ID` 的优先级和官方文档写的相反——文档说 config 优先,源码里 `loadConfig` 是只要该变量非空就用它覆盖 config 的值。

### 本项目的 Next.js 与训练数据不符

**现象**:按记忆写 App Router 代码,遇到 API 签名或文件约定对不上。

**原因**:Next.js 16 有 breaking changes,模型的先验知识往往停留在更早的版本。

**正确做法**:动手前先读 `node_modules/next/dist/docs/` 里的相关指南(从 `AGENTS.md` 所在目录解析)。这条也由 `next dev` 自动写进 `CLAUDE.md` 底部。

---

## 工具链

### zsh 脚本变量不要命名为 `status` 或 `path`

**现象**：部署检查脚本给循环变量取名 `path` 后，后续的 `curl`、`node`、`npx`、`git` 全部报 `command not found`；给状态变量取名 `status` 则直接报 `read-only variable`。

**原因**：zsh 的 `status` 是只读特殊参数，`path` 是与 `PATH` 绑定的数组。给 `path` 赋循环值会同时破坏命令搜索路径。

**正确做法**：在 zsh 脚本中使用带语义前缀的普通变量名，例如 `http_status`、`route` 和 `service_id`，避开 shell 特殊参数。

### 让 agent 跑验证前,先让它读项目脚本

**现象**:agent 自行执行 `npx tsc`、`eslint .` 之类的通用命令,得出「没有错误」或一堆假错误的结论。

**原因**:这些命令绕过了项目实际的配置——本仓库的 `pnpm type-check` 会先构建 content collections 并生成路由类型,`pnpm lint` 有专门的 ESLint 配置,直接跑通用命令得到的结果不可信。

**正确做法**:验证前先读 `AGENTS.md` 第 2 节和 `package.json` 的 scripts,只用其中列出的命令。

### `pnpm install` 之后必须重跑 `prettier:format`

**现象**:本地 `prettier:check` 通过,推上去 CI 在 `prettier:check` 挂掉,只报 `pnpm-lock.yaml` 一个文件。

**原因**:`prettier --check` 的检查范围包含 `pnpm-lock.yaml`,而 `pnpm install` 重写 lockfile 时不遵循 Prettier 格式。本地若在 install **之前**跑的格式化,改动就漏在检查之外。

**正确做法**:任何改动依赖(含只改 `pnpm.overrides`)的提交,顺序必须是 `pnpm install` → `pnpm prettier:format` → 提交。另外此时 `git diff --stat` 会显示 lockfile 上万行变动,那是 install 产物与格式化产物之间的中间差异;判断真实改动量要用 `git diff origin/main -- pnpm-lock.yaml`。

### 私有文件不能经过无身份信息的图片优化请求

`next/image` 的服务端优化请求不会携带访问者 session。私有上传预览应使用 `unoptimized`，由浏览器请求鉴权地址；仅取消公共桶地址而保留优化路径会让合法预览变成 401。

### 应用内文件地址不能直接交给远程模型

**现象**：商品带有一张已上传图片，读取任务却在 `new URL(image)` 处报 `TypeError: Invalid URL`；同一地址在浏览器预览正常。

**原因**：上传记录保存的是 `/api/files/content?key=...` 这类需要当前会话的应用内相对地址。Worker 没有页面基址，远程模型也没有用户 session；即使补成本站绝对地址，模型请求仍会得到 401。

**正确做法**：数据库继续保存受保护的应用内地址；Worker 在调用模型或媒体服务的边界校验文件归属，并换成短期 R2 签名读取地址。不要在领域数据里持久化会过期的 provider URL。

### AI SDK 的图片消息已经统一为文件消息

**现象**：多图商品读取能运行，但每张图片都会打印 `Deprecated: "image" content part`。

**原因**：AI SDK 仍兼容旧的 `{ type: "image", image }`，但交给模型的消息已统一为 file part。

**正确做法**：图片输入使用 `{ type: "file", data: new URL(url), mediaType: "image" }`。不要屏蔽警告；旧格式仍成功只代表兼容层还没有移除。

### Prism 凭据和 API 主机必须成对配置

**现象**：Worker 向 Prism 提交分镜时持续返回 HTTP 401，自动重试也只会再次失败。

**原因**：开发凭据属于 staging，但客户端把 API 主机硬编码成 production。请求头和路径都正确，凭据在错误的主机上仍然只会得到 401。

**正确做法**：通过 `PRISM_API_BASE_URL` 选择环境，开发默认 staging，部署时显式配置目标主机及其配套凭据。诊断时用同一凭据读取一个不存在的任务：404 说明鉴权通过，401/403 说明环境或凭据不匹配；这类错误必须 fast fail，不能消耗重试次数。

### Drizzle 客户端上的底层 postgres.js JSON fixture

Drizzle 配置过序列化器的底层 sql 连接中，直接用 `tx.json(array)` 写集成测试临时表可能把数组送到字符串编码器。此时显式 `JSON.stringify(value)` 并在参数后加 `::jsonb`，不要误判为数据库迁移失败。

### 跨环境数据库校验需要统一会话时区

**现象**：同一个 PostgreSQL dump 恢复到本机和 Zeabur 后，表行数一致，但含时间字段的整行 JSON 哈希不同。

**原因**：本机 PostgreSQL 默认 `Asia/Shanghai`，Zeabur 默认 `UTC`；`row_to_json` 将相同的 `timestamptz` 按当前会话时区渲染。

**正确做法**：比较恢复前后数据哈希时，两端先执行 `SET timezone='UTC'`，再比较排序后的行哈希；不能把显示时区差异当成数据丢失。

### Zeabur 暂停服务会跳过 Git 自动部署

**现象**：迁库时暂停 Web 和 Worker，release workflow 成功将 `prod` 推进后，Zeabur 仍停在 `SUSPENDED`，没有生成新部署。

**原因**：手动暂停状态会阻止 Git trigger 创建部署，更新分支本身不会恢复服务。

**正确做法**：一次性切换完成且 `prod` 已指向发布提交后，对暂停的服务执行 `service redeploy`，核对新部署 SHA 和 `suspendedAt=null`。普通 `restart` 可能恢复旧镜像；后续日常 tag 发布应保持服务运行。

### 长任务需要一个显式的终结者

**现象**：批次控制台永远显示"生产中"。所有 clip 都已经 ready，进度条仍在转，轮询也停不下来。

**原因**：`ugcBatches.status` 只在 `ugc.batch.run` 结束时被写成 `running`，**代码里没有任何地方把它写成 `completed`**。一条 clip 走到自己的终态，并不会顺带告诉批次它结束了；聚合状态没人负责，就永远停在中间态。

**正确做法**：每个"父对象的状态由子对象聚合而来"的地方，都要有一个显式的结算函数，并从**每一条**子对象终态路径上调用它——成功、失败、取消都算（`settleBatchIfFinished`）。同时前端的"是否还在进行"要读父对象状态，而不是数子对象：批次刚创建、clip 行还没生成时，子对象计数全是 0，用计数判断会把"还没开始"误判为"已完成"。

### 商品尚未读取完就展开批次，会静默产出 0 条

**现象**：新建批次页支持粘链接即时建商品之后，批次跑完一条视频都没有，界面只显示"生产中 0/1"。

**原因**：`ugc.batch.run` 遇到没有 facts 的商品会跳过整条计划行。而 composer 建的商品此刻还在 ingest 队列里，于是每一行都被跳过，批次却被标成 `running`。

**正确做法**：区分"还在读"（`draft`/`analyzing`，应当等待并重试）和"读不出来"（`needs_input`/`failed`，才应当跳过）。跳过时把原因写进批次的 `note` 并在界面上说出来——没有产出的运行必须解释自己，否则用户只能盯着一个不动的进度条。

### `pnpm dev` 不起 Worker，等于整条生产线没人干活

**现象**：新建批次后永远停在「生产中 0/1」，`pnpm dev` 的日志里全是 Next 的请求，没有任何 `{"component":"job-worker"}`。

**原因**：`dev` 脚本只跑 `next dev`。Worker 是独立进程（`pnpm worker:dev`）。任务被写进 outbox、pg-boss 也收下了，但没有任何消费者，于是批次永远停在入队那一刻。这跟"任务失败"看起来一模一样，但排查方向完全相反。

**正确做法**：`pnpm dev` 同时拉起两个进程（`scripts/dev.mjs`），任一退出就一起停。更重要的是**让界面自己说出来**：`task_runs` 里存在 `queued` 且超过 45 秒没被领取的行，就是"没有 Worker 在消费"，批次页和批次列表直接显示「队列停滞」。任何环境漏跑 Worker 都会立刻可见，而不是让人盯着一个不动的进度条去翻服务器日志。

### Web 热更新不会顺带更新独立 Worker

**现象**：开发环境里刚给任务 payload 加完字段，页面能正常入队，新任务却立刻报 `INVALID_JOB_PAYLOAD`；界面如果没有正确接回轮询状态，还会一直显示生成中，手动刷新后才看见失败。

**原因**：Next 开发服务器会热更新 Web 代码，但 `scripts/dev.mjs` 原先启动的是一个普通、常驻的 Worker 进程。Web 发的是新 payload，Worker 仍拿旧的严格 Zod schema 校验，任务在调用供应商之前就失败了。

**正确做法**：开发 Worker 使用 Node watch mode，让 job 定义和依赖变化后自动重启。新增或修改 payload 后仍要检查一条真实 `task_runs.error`，确认请求确实走到了供应商边界；前端轮询状态也必须同步 Server Component 刷新后传入的新 revision。

### 从 `"use client"` 模块里导入常量到 Server Component，会在运行时炸

**现象**：`/dashboard/works` 列表页直接渲染成「Something went wrong」，构建、类型检查、lint 全绿，本地组件单测也过。

**原因**：`WORK_STEPS` 这个普通数组常量声明在 `step-rail.tsx` 里，而那个文件顶部有 `"use client"`。Server Component 从客户端模块导入任何东西拿到的都是 client reference（一个只能被序列化、不能被读取的占位对象），`WORK_STEPS.indexOf(...)` 于是在服务端抛错。类型系统看到的是原始类型，所以什么都察觉不到。

**正确做法**：两端都要用的纯数据和纯函数，放进不带任何指令的中立模块（`src/lib/ugc/work-steps.ts`），`"use client"` 文件只留组件。顺带一提：这类错误只有真正渲染页面才暴露，所以新页面至少要有一条 E2E 走一遍。

### 消息滚动区的悬浮按钮必须显式高于内容层

**现象**：`keeps the current turn anchored while streaming` 偶发超时。「跳到最新」按钮视觉可见，Playwright 也能定位，但点击始终被消息内容拦截。

**原因**：按钮是滚动器根节点下的绝对定位兄弟元素，但没有 `z-index`；滚动 viewport 的内容绘制在它上面。测试等待期间流式响应还可能结束，让按钮随后变成 `inert`，掩盖最初的点击遮挡。

**正确做法**：悬浮滚动按钮使用明确的层级（当前为 `z-10`），并用真实点击验证，而不是在测试里强制点击。测试只断言流式状态在确定的早期窗口出现，不在后段重复断言瞬时的 Stop 按钮。

### 商品重新解析不能暗中重新导入素材

**现象**：用户在“编辑素材”中移除页面图片后，点击“重新解析”，被移除的图片又出现在商品里。

**原因**：同一个任务同时承担页面素材导入和事实解析，操作入口又直接把 `importMaterial` 设为真，导致“更新理解”产生了“改回素材”的隐藏副作用。

**正确做法**：把用户操作语义固定为三条：编辑只保存素材；重新解析只读取当前已保存素材并更新事实；重新导入才从参考链接补充页面素材，并明确提示被移除的页面图片可能回来。后台任务可以复用，但入口必须显式传递操作模式，失败重试也要保持原操作语义。

### 字幕文本只能来自剧本，识别结果只提供时间

**现象**：ASR 识别质量闸门（整体编辑距离 ≤ 0.25）放行后，字幕直接使用识别文本。品牌名"VibeSKU"被识别成"vibe sku"这类局部错误恰好在阈值之内，错误拼写被烧进 MP4，无法撤回。

**原因**：把"什么时候说的"和"说了什么"当成同一个问题。识别器最容易念错的恰好是品牌名、型号、自造词，而这正是电商视频最不能错的部分。

**正确做法**：字幕文本取已审核的剧本，时间由识别结果对齐得到（`src/lib/ugc/media/alignment.ts`）。还有一层容易踩空：对齐算法会做合并与拆分才能解释证据，所以它的"精确配对比例"不能当作镜头质量判据——中文识别器按词输出、剧本按字切分时，对齐完美但几乎没有一对一配对，用配对率判定会误杀全部中文镜头。判定用整段文本距离（`speechMatchesScript`），与对齐分开。

### 校验要放在只损失一个镜头的位置

**现象**：TTS 旁白比镜头长 200ms，整条作品在最后的合成步骤失败——此时所有镜头的生成费用已经全部花完。

**原因**：旁白时长只在 FFmpeg 合成时检查。而通用 Worker 没有 ffmpeg（只有 render worker 有），所以"等 ffmpeg 来量"就等于"等到全部生成完"。

**正确做法**：两道闸门都前移。文案在脚本被接受前按音节速率估算秒数（`src/lib/ugc/speech-estimate.ts`，字符数与朗读时长相关性很弱）；旁白在合成出来的当下用 WAV 头直接量（`src/lib/ugc/media/audio.ts`，不依赖 ffmpeg），失败只作废这一个镜头，并明确告诉运营是哪句台词太长。

### render worker 要在启动时证明自己的 FFmpeg 能力

**现象**：本地 ffmpeg 缺 libass，合成走到烧字幕才失败；镜像若少装一个 filter，线上行为完全相同——正常接单，花完所有生成费用，最后一步炸掉。

**正确做法**：`probeMediaToolchain` 在 render 角色启动时核对实际用到的 encoder 与 filter 清单（检查能力而非版本号），缺失就拒绝上线。CI 在装完 ffmpeg 后跑一次 `WORKER_ROLE=render pnpm worker:smoke`，确保探测在具备工具链的机器上确实通过。

### 迁移路径必须存在于部署网络内部

**现象**：staging 的 render worker 起不来，报 `Queue ugc.work.compose does not exist`。查下去发现 staging 数据库连 `pgboss` schema 都没有——它从来没跑过这个仓库的迁移。

**原因**：当时的规矩是"迁移只能是 CI 里经 SSH 隧道的一次性发布步骤"。生产配了那套 secret，能用；staging 没配，于是它**没有任何合法的迁移路径**，而唯一不改代码的替代是给数据库开公网端口，那是同一份文档明令禁止的。一条规则同时禁掉了所有可行做法，数据库就停在了远古状态。

**正确做法**：Worker 启动时迁移，Web 永不迁移（`src/database/migrate.ts`）。Worker 本来就在部署网络里、本来就持有数据库凭证，所以发布既不需要 CI secret 也不需要公网数据库端口，失败直接退出容器。多个 worker 角色并发启动用 PostgreSQL advisory lock 串行化；drizzle 本身按文件记账、整批一个事务，重复启动是 no-op。`pnpm db:migrate` 走同一个函数，手动、CI、容器三条路是同一个操作。运行时镜像要 COPY `src/database/migrations`，否则 worker 读不到自己要回放的 SQL。

### "识别成功但没有语音"不是识别失败

**现象**：staging 上镜头持续失败，两种报错交替出现——`SEGMENT_ASR_FAILED: SUCCESS_WITH_NO_VALID_FRAGMENT` 和 `SEGMENT_SPEECH_MISMATCH`。

**原因**：两处。一是 `SUCCESS_WITH_NO_VALID_FRAGMENT` 是 DashScope 的一个**成功**状态，字面意思是"跑完了，里面没有有效语音片段"，我们把它归进 `task_status !== "SUCCEEDED"` 的失败分支，于是"这段没人说话"被读成"识别服务挂了"。二是 native 口播模式下无论这一拍有没有台词都要求转写（`audioMode === "native" || hasSpeech`），所以一个**本来就该静默**的镜头必然触发上面那条，正确的沉默被判成错误。

**正确做法**：`getTranscription` 把这个标记回成 `{status:"ready", text:""}`，让调用方自己判断沉默在它那里意味着什么；转写只在这一拍确实有台词时才发起。

### 已经付过钱的镜头不能因为判定不过就消失

**现象**：口播和台词对不上，整条 work 失败。而那一拍的视频其实已经生成、已经计费、已经归档进 R2，界面上只留一行红字——运营看不到片子，也没有重拍入口（`ugc_work_takes.version` 和 `activeTakeId` 早就为重拍准备好，却没有任何 action 用它）。

**原因**：把"质量判定不通过"和"这一步做不下去"混为一谈了。判定的真正目的是别让错的时间轴烧进字幕，不是销毁素材。

**正确做法**：判定不过的 take 进 `review` 而非 `failed`，视频step停在待定夺而不是失败；卡片里能播、能看到"批准的台词 vs 实际听到的"，可以留用也可以重拍。留用时清空识别到的词，`alignScriptToEvidence` 拿不到证据就整拍不出字幕——宁可没有字幕，也不能让批准过的台词配上没人说过的时间轴。

### 兜底文案会变成指令

**现象**：native 口播模式下，没有台词的镜头生成出来是有人在说话的，接着因为"说的和台词对不上"被判失败。

**原因**：提示词是 `Speak exactly this line in ${locale}: ${spokenText(beat.voiceover) || "No speech in this shot."}`。`||` 的兜底值本意是占位，实际发给模型的整句话是"请一字不差地说出：这一拍没有台词"——模型照做了。同一行还把 `zh-Hans` 这样的 locale 代码当语言名传了出去。

**正确做法**：有台词和没台词是两种指令，不是同一句话填不同的值（`speechDirection`）。给模型的语言要用语言名，locale→语言名只有一份（`LANGUAGE_NAMES`），TTS 和视频提示词共用。写提示词时，任何 `||` / `??` 兜底都要通读一遍拼出来的完整句子——占位符在字符串模板里会变成命令。

### 丢掉 provider 的原话，就只能靠猜

**现象**：镜头持续失败，日志里只有 `PRISM_REQUEST_REJECTED: The media generation provider returned HTTP 422.`。为了定位是哪个字段，只能拿 staging 凭证对着真实接口逐项试探——duration 3/8/15/0/-1、两种画幅、480p/720p/1080p、9 张参考图、presigned 形状的 URL、30KB 提示词，全部被接受，依然复现不出来。

**原因**：`call()` 在 `!response.ok` 时直接丢掉响应体。而 Prism 每次都精确说明了是哪个字段：

```json
{
  "detail": [
    {
      "loc": ["body", "resolution"],
      "msg": "无效的分辨率: NOPE，可选值: ['480p','720p','1080p']"
    }
  ]
}
```

一个只剩状态码的错误，等于把"provider 已经告诉你答案"变成了一次逆向工程。

**正确做法**：refused 的响应体要读进错误消息（`rejectionDetail`，两个适配器共用，长度封顶）。顺带记下两件试探出来的事实：Prism 的 `request_id` 必须是合法 UUID（`/tasks/{id}` 路径同理，非 UUID 直接 422）；Prism 校验器接受的分辨率是 `480p/720p/1080p`，而我们的 `PRISM_VIDEO_MODEL_OPTIONS` 只列了 480p/720p——是否放开 1080p 需要确认 minimax-h3 真能出，不能只凭校验器放行就改。

### 提示词有上限时，让出位置的必须是上下文而不是指令

**现象**：Prism 侧镜头提交全部 422，`模型 minimax-h3 的 prompt 不能超过 10000 个字符`。

**原因**：`buildSegmentVideoPrompt` 里全局制作指导写死 `slice(0, 8000)`，加上其余行轻易越过 10000；而 Prism 适配器不做任何长度控制（lk666 有 `fitPrompt` 截到 4096）。**照抄 lk666 的做法是错的**——截尾砍掉的正好是末尾的口播指令和"不要加字幕/水印"，等于静默丢掉最重要的指令，比 422 更糟。

**正确做法**：按预算组装。镜头自己的指令先占满，全局制作指导拿剩下的空间（`buildSegmentVideoPrompt` 的 `maxCharacters`），上限由 `videoPromptLimit()` 从当前 provider 取。provider 按字符数（code point）计，不是 UTF-16 单元，所以要用 `Array.from().length` 而不是 `.length`。

**顺带一个探测陷阱**：为省钱用"故意非法的 `request_id`"触发 422、借 FastAPI 一次列出全部字段错误来试探参数空间——这招对**字段级**校验有效，但 Pydantic 的**模型级**校验器（`@model_validator`）在字段级失败时根本不执行。当时 30KB 提示词因此显示"无错误"，把真正的根因盖住了。`loc` 是 `["body"]` 而不是 `["body","<字段>"]` 就是模型级校验的标志。
