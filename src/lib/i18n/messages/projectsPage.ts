import type { NamespaceMessages } from "../config";

// projectsPage namespace: the full project list page (/projects)
export const projectsPage: NamespaceMessages = {
  zh: {
    pageTitle: "我的项目",
    pageSubtitle: "按最近编辑排序，点开直接回到上次的步骤",
    newProject: "新建项目",
    searchPlaceholder: "搜索项目名或商品…",
    untitled: "未命名项目",
    empty: "还没有项目",
    emptyDesc: "从工作台丢一张商品图开始，或用完整表单精细配置",
    goStart: "去工作台",
    goNew: "用完整表单新建",
    noMatch: "没有匹配的项目",
    loadError: "项目列表加载失败",
  },
  en: {
    pageTitle: "My projects",
    pageSubtitle: "Sorted by last edit — click to jump back to where you left off",
    newProject: "New project",
    searchPlaceholder: "Search projects or products…",
    untitled: "Untitled project",
    empty: "No projects yet",
    emptyDesc: "Start from the workspace with a product photo, or use the full form",
    goStart: "Go to workspace",
    goNew: "New via full form",
    noMatch: "No matching projects",
    loadError: "Failed to load projects",
  },
};
