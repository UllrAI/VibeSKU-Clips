# VibeSKU Clips 使用教程

本文介绍 Web 版本的基本安装和使用流程。

## 1. 准备环境

本地开发需要 Node.js 20+、pnpm 10+ 和 FFmpeg。

```bash
# macOS
brew install ffmpeg
corepack enable

# Debian / Ubuntu
sudo apt update
sudo apt install ffmpeg
corepack enable
```

## 2. 启动项目

```bash
git clone <仓库地址>
cd VibeSKU-Clips
pnpm install
pnpm dev
```

浏览器打开 <http://localhost:3000>。

也可以使用 Docker：

```bash
docker build -t ugc-video-generator .
docker run -d \
  -p 3000:3000 \
  -v vibesku-clips-data:/data \
  ugc-video-generator
```

## 3. 配置模型

进入“设置”，填写用于生成脚本的 OpenAI 兼容模型 API 地址、API Key 和模型名称。

图片和视频模型是可选的；不配置时仍可使用上传素材或免费素材完成视频。建议先运行设置页的连接测试。

## 4. 创建视频

进入“创作”，选择一种输入方式：

- 上传商品图
- 粘贴商品链接
- 输入一句话主题

然后选择生成方式：

- 免费快剪：使用已有图片、上传素材或免费素材，并在本地合成
- AI 生成：调用已配置的图片或视频模型生成画面

创建项目后，系统会先生成脚本。

## 5. 检查脚本和素材

生成视频前检查：

- 口播内容是否自然
- 商品名称、规格和卖点是否准确
- 每个镜头的动作是否能实际呈现
- 是否存在夸张描述或未经证实的承诺
- 第三方素材是否符合授权要求

涉及付费模型时，提交前核对模型、时长和参数。

## 6. 合成与导出

素材准备完成后，可配置配音、字幕、背景音乐和转场，再使用 FFmpeg 合成视频。

导出前检查画面、配音和字幕是否同步，字幕是否超出安全区域，以及整体音量是否正常。

## 7. 数据与备份

本地运行时，项目数据库、上传文件和输出视频默认保存在仓库的 `data/` 目录。Docker 使用 `/data`，部署时应挂载 volume。

备份该目录或 Docker volume 即可保存项目数据。

## 8. 常见问题

### FFmpeg 不可用

```bash
ffmpeg -version
```

如果命令不存在，请通过系统包管理器安装 FFmpeg。

### 安装依赖失败

```bash
corepack enable
pnpm install
```

不要在同一工作区混用 npm、yarn 和 pnpm。

### 脚本生成失败

检查模型 API 地址、Key 和模型名称，并重新运行连接测试。

### 视频合成失败

检查 FFmpeg、输入媒体和磁盘空间。服务端日志会显示具体失败阶段。

## 9. 开发检查

```bash
pnpm lint
pnpm test
pnpm design:check
pnpm build
```
