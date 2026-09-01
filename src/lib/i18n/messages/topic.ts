import type { NamespaceMessages } from "../config";

// topic 命名空间词条（zh 为原文，en 为翻译）
export const topic: NamespaceMessages = {
  zh: {
    // 页面标题区
    heroBadge: "无需商品素材",
    heroTitle: "一句话主题成片",
    heroSubtitle:
      "输入一个主题，生成旁白脚本并匹配免费素材；确认素材后即可合成竖屏视频。",
    // 未配置 LLM 引导
    llmBannerTitle: "先配置 LLM 才能生成脚本",
    llmBannerDesc: "需要在「设置」里填写用于写脚本的 LLM（API 地址、API Key 和模型）。",
    llmBannerCta: "配置脚本模型",
    // 主题输入
    topicLabel: "一句话主题",
    topicPlaceholder: "例如：在家如何泡一杯手冲咖啡",
    tryLabel: "试试：",
    exampleTopic1: "在家如何泡一杯手冲咖啡",
    exampleTopic2: "城市夜景为什么这么治愈",
    exampleTopic3: "三个让早晨更高效的小习惯",
    exampleTopic4: "雨天适合做的五件小事",
    exampleTopic5: "为什么我们总是怀念童年",
    // 旁白风格
    narrationLabel: "旁白风格",
    narration_knowledge_label: "知识科普",
    narration_knowledge_desc: "讲清一个主题，长知识",
    narration_story_label: "情感故事",
    narration_story_desc: "有代入感的叙事，引共鸣",
    narration_lifestyle_label: "生活方式",
    narration_lifestyle_desc: "精致 vlog 旁白，有质感",
    narration_inspiration_label: "励志金句",
    narration_inspiration_desc: "节奏明快，适合点赞收藏",
    narration_travel_label: "旅行风光",
    narration_travel_desc: "目的地 + 风景，想出发",
    // 时长
    durationLabel: "目标时长",
    planTitle: "生成前确认",
    planScript: "先生成可编辑的旁白脚本",
    planFootage: "确认脚本后自动匹配免费素材",
    planCost: "脚本使用你配置的 LLM；素材匹配与本地合成不消耗视频模型额度",
    planRequired: "输入至少 2 个字即可生成",
    // 生成按钮
    generatingScript: "AI 正在写脚本…",
    ctaGenerate: "生成脚本",
    // 流程提示
    flowStep1: "1 写脚本",
    flowStep2: "2 自动配画面",
    flowStep3: "3 合成成片",
    // 错误提示
    errorNoLlm: "尚未配置 LLM，请先到「设置」填写 API Key",
    errorGenerateCheckLlm: "脚本生成失败，请检查 LLM 设置",
    errorGenerate: "脚本生成失败",
  },
  en: {
    // 页面标题区
    heroBadge: "No product assets required",
    heroTitle: "One-sentence to video",
    heroSubtitle:
      "Enter a topic to draft a voiceover script and match free stock footage; review the assets, then render a vertical video.",
    // 未配置 LLM 引导
    llmBannerTitle: "Set up an LLM to generate scripts",
    llmBannerDesc: "Add the script-writing LLM (base URL / API key / model) in Settings.",
    llmBannerCta: "Configure script model",
    // 主题输入
    topicLabel: "Your topic in one sentence",
    topicPlaceholder: "e.g. How to brew a pour-over coffee at home",
    tryLabel: "Try:",
    exampleTopic1: "How to brew a pour-over coffee at home",
    exampleTopic2: "Why city nightscapes feel so soothing",
    exampleTopic3: "Three small habits for a more productive morning",
    exampleTopic4: "Five little things to do on a rainy day",
    exampleTopic5: "Why we always miss our childhood",
    // 旁白风格
    narrationLabel: "Narration style",
    narration_knowledge_label: "Explainer",
    narration_knowledge_desc: "Break down a topic and teach something new",
    narration_story_label: "Emotional story",
    narration_story_desc: "Immersive narrative that strikes a chord",
    narration_lifestyle_label: "Lifestyle",
    narration_lifestyle_desc: "Polished vlog voiceover with a refined feel",
    narration_inspiration_label: "Inspiring quotes",
    narration_inspiration_desc: "Snappy pacing, great for likes and saves",
    narration_travel_label: "Travel & scenery",
    narration_travel_desc: "Destinations and views that make you want to go",
    // 时长
    durationLabel: "Target length",
    planTitle: "Before you generate",
    planScript: "Start with an editable voiceover script",
    planFootage: "Match free stock footage after you approve the script",
    planCost: "Script writing uses your configured LLM; footage matching and local rendering use no video-model credits",
    planRequired: "Enter at least 2 characters to generate",
    // 生成按钮
    generatingScript: "AI is writing the script…",
    ctaGenerate: "Generate script",
    // 流程提示
    flowStep1: "1 Write script",
    flowStep2: "2 Auto-fill footage",
    flowStep3: "3 Render video",
    // 错误提示
    errorNoLlm: "No LLM configured yet — add your API key in Settings first",
    errorGenerateCheckLlm: "Script generation failed. Check your LLM settings",
    errorGenerate: "Script generation failed",
  },
};
