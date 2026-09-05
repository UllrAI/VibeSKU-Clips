import type { NamespaceMessages } from "../config";

// generationSettings 命名空间词条：设置页「生成」里的全局生成参数面板
export const generationSettings: NamespaceMessages = {
  zh: {
    // 生成参数
    genParamsTitle: "生成参数（全局默认）",
    genParamsDesc: "生成图片/动态镜头时统一使用，留空的数值项走对应模型默认。",
    imageSection: "图片",
    aspectRatio: "画面比例",
    aspect916: "9:16 竖屏",
    aspect169: "16:9 横屏",
    aspect11: "1:1 方形",
    count: "生成数量",
    seed: "随机种子",
    seedPlaceholder: "随机",
    negativePrompt: "反向提示词（选填）",
    imageNegativePlaceholder: "不希望出现的元素，如 模糊、文字、水印",
    videoSection: "视频（转动态镜头）",
    resolution: "分辨率",
    duration: "时长（秒）",
    videoNegativePlaceholder: "不希望出现的元素",
  },
  en: {
    // Generation params
    genParamsTitle: "Generation params (global defaults)",
    genParamsDesc:
      "Applied to all image/motion-shot generation; blank numeric fields fall back to each model's default.",
    imageSection: "Image",
    aspectRatio: "Aspect ratio",
    aspect916: "9:16 portrait",
    aspect169: "16:9 landscape",
    aspect11: "1:1 square",
    count: "Count",
    seed: "Seed",
    seedPlaceholder: "Random",
    negativePrompt: "Negative prompt (optional)",
    imageNegativePlaceholder: "Elements to avoid, e.g. blur, text, watermark",
    videoSection: "Video (motion shots)",
    resolution: "Resolution",
    duration: "Duration (s)",
    videoNegativePlaceholder: "Elements to avoid",
  },
};
