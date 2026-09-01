import type { NamespaceMessages } from "../config";

// showcase 命名空间词条（zh 为原文，en 为翻译）
export const showcase: NamespaceMessages = {
  zh: {
    // 顶部导航
    navTitle: "示例作品",
    navBadge: "示例",
    makeSimilar: "按这个结构创建",
    // 说明区
    introLead: "这个示例由 ClipForge 完成：",
    introMeta: "{style} · {shots} 个镜头 · {duration} 秒 · {resolution} {aspectRatio}。",
    introTail: "查看成片和分镜脚本，确认这套结构是否适合你的内容。",
    // 分镜脚本
    scriptTitle: "分镜脚本",
    // 镜头类型标签
    shotTypeHook: "钩子",
    shotTypePainPoint: "痛点",
    shotTypeProductReveal: "产品",
    shotTypeDemo: "演示",
    shotTypeSocialProof: "背书",
    shotTypeCta: "转化",
    // 模板参考区
    templatesTitle: "其他常用结构",
    templatesBadge: "模板",
    templatesDesc: "比较镜头数量、节奏和叙事方式，再选择适合商品的结构。",
    templateShotsMeta: "{shots} 个镜头 · {duration} 秒",
    // 底部 CTA
    bottomCta: "按这个结构创建",
  },
  en: {
    navTitle: "Example works",
    navBadge: "Demo",
    makeSimilar: "Use this structure",
    introLead: "A complete example built with ClipForge: ",
    introMeta: "{style} · {shots} shots · {duration}s · {resolution} {aspectRatio}.",
    introTail: " Below are the final preview and shot-by-shot script — follow along to make your own.",
    scriptTitle: "Shot script",
    shotTypeHook: "Hook",
    shotTypePainPoint: "Pain point",
    shotTypeProductReveal: "Product",
    shotTypeDemo: "Demo",
    shotTypeSocialProof: "Proof",
    shotTypeCta: "CTA",
    templatesTitle: "More proven structures",
    templatesBadge: "Template",
    templatesDesc: "These are common structures behind high-converting commerce videos — pick a style to follow when starting a project.",
    templateShotsMeta: "{shots} shots · {duration}s",
    bottomCta: "Try making your own",
  },
};
