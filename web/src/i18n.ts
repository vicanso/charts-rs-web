export type Lang = "zh" | "en";

/** The language of the visitor's browser: Chinese for any zh locale, English otherwise. */
export function detectLang(): Lang {
  const languages = navigator.languages?.length
    ? navigator.languages
    : [navigator.language];
  return (languages[0] || "").toLowerCase().startsWith("zh") ? "zh" : "en";
}

const zh = {
  githubTooltip: "在 GitHub 查看 charts-rs",
  tabWorkbench: "工作台",
  tabGallery: "图库",
  format: "格式",
  scale: "倍图",
  scaleTooltip: "位图渲染倍率（2× / 3× 适配高分屏）",
  theme: "主题",
  font: "字体",
  run: "运行",
  runTooltip: "运行渲染",
  copyLink: "复制链接",
  copyLinkTooltip: "复制可分享的预览 URL",
  mcpTooltip: "查看 MCP 接入说明",
  switchLang: "EN",
  switchLangTooltip: "Switch to English",
  themeLightTooltip: "切换到浅色界面",
  themeDarkTooltip: "切换到深色界面",
  splitHorizontalTooltip: "切换为左右分屏",
  splitVerticalTooltip: "切换为上下分屏",
  examplesDrawerTooltip: "展开或收起示例目录",

  gallery: "图表图库",
  galleryHeading: "全部图表与 Mermaid 示例",
  galleryLead: "点击任意卡片即可载入工作台进行实时编辑与导出",
  backToWorkbench: "返回工作台",
  categoryAll: "全部",
  searchPlaceholder: "搜索图表名称、类型或用途…",
  galleryEmpty: "无匹配结果，试试其它关键词",
  loadingExamples: "正在加载图库示例…",
  loadExamplesFailed: "图库加载失败",

  categoryFeatured: "精选",

  preview: "图表预览",
  renderTimeTitle: "最近一次渲染耗时",
  outputSizeTitle: "响应体大小",
  rendering: "渲染中",
  ready: "就绪",
  jsonError: "JSON 错误",
  fit: "适应",
  fitTooltip: "适应窗口",
  actualSizeTooltip: "实际尺寸 100%",
  copy: "复制",
  copySvgTooltip: "复制 SVG 源码",
  copyImageTooltip: "复制图片",
  download: "下载",
  downloadTooltip: "下载当前图表",
  generating: "生成中…",
  emptyTitle: "选择一个示例开始",

  jsonOptions: "JSON 配置",
  mermaidSource: "Mermaid 源码",
  editorModeMermaid: "Mermaid",
  editorModeJson: "JSON",
  mermaidModeTooltip: "在纯文本 Mermaid 源码与完整 JSON 配置之间切换",
  parseError: "解析失败",
  resizeEditor: "拖拽调整分屏尺寸",
  compactOn: "压缩",
  compactOff: "原始",
  compactTooltip: "压缩 SVG：去掉空白、合并路径，画面不变，体积更小",
  simpleOn: "简化",
  simpleOff: "完整",
  simpleTooltip: "简化模式只保留常用字段",
  editorCollapse: "收起",
  editorExpand: "展开编辑器",

  invalidJson: "JSON 解析失败",
  renderFailed: "图表生成失败",
  linkCopied: "预览地址已复制到剪贴板",
  shortLinkCopied: "短链已复制到剪贴板",
  shortLinkExpired: "短链不存在或已过期，已切换回默认示例",
  copyFailed: "复制失败",
  nothingToCopy: "暂无可复制的图表",
  svgCopied: "SVG 源码已复制",
  imageCopied: "图片已复制到剪贴板",
  copyImageUnsupported: "当前浏览器不支持复制图片，请使用下载",
  noSvgToDownload: "暂无 SVG 可下载",
  noImageToDownload: "暂无图片可下载",

  mcpTitle: "MCP 接入",
  mcpLead:
    "通过 MCP（Streamable HTTP）让 LLM 直接调用本服务生成 30 类图表与 13 种 Mermaid 图表，可返回 PNG、JPEG、WebP 图片或 SVG 文本。",
  mcpEndpoint: "服务地址",
  mcpEndpointCopied: "MCP 地址已复制",
  mcpTools: "工具（Tools）",
  mcpToolList:
    "列出 30 种图表类型、变体选图指南、主题、已加载字体、已注册地图及 Mermaid 能力。",
  mcpToolSchema:
    "获取指定图表的 JSON Schema（essential/full）、实时主题/字体/地图枚举及验证过的示例。",
  mcpToolValidate:
    "校验图表 JSON 与 RenderLimits，一次返回最多 50 条结构化错误及字体提示。",
  mcpToolRender:
    "按 chart_type、options、format（默认 png）与 scale（1–4，默认 2x）渲染图表，支持图片或 SVG。",
  mcpToolValidateMermaid:
    "校验 Mermaid 源码语法与语义，返回带行号的定位提示。",
  mcpToolRenderMermaid:
    "直接从 Mermaid 源码渲染图表（位图默认 2x，allow_links 默认关闭以保障安全）。",
  mcpResources: "资源（Resources）",
  mcpResourcesDesc:
    "提供 charts://themes、charts://fonts、charts://maps、charts://mermaid/capabilities、charts://llms.txt、charts://llms-full.txt、charts://examples/{type} 与 charts://examples/mermaid/{diagram}（HTTP 侧亦提供 /llms.txt 与 /llms-full.txt）。",
  mcpCommandCopied: "命令已复制",
  mcpConfig: "JSON 配置（.mcp.json）",
  mcpConfigCopied: "配置已复制",
  mcpNote:
    "对不支持 MCP Resources 的客户端，list_chart_types 与 get_chart_schema 也会在工具结果中内嵌完整运行时信息与示例；渲染前会先执行结构化校验，便于模型一次修正所有参数。",
};

export type MessageKey = keyof typeof zh;

const en: Record<MessageKey, string> = {
  githubTooltip: "View charts-rs on GitHub",
  tabWorkbench: "Workbench",
  tabGallery: "Gallery",
  format: "Format",
  scale: "Scale",
  scaleTooltip: "Raster pixel scale (2× / 3× for HiDPI displays)",
  theme: "Theme",
  font: "Font",
  run: "Run",
  runTooltip: "Render the chart",
  copyLink: "Copy link",
  copyLinkTooltip: "Copy a shareable preview URL",
  mcpTooltip: "How to connect over MCP",
  switchLang: "中文",
  switchLangTooltip: "切换到中文",
  themeLightTooltip: "Switch to light mode",
  themeDarkTooltip: "Switch to dark mode",
  splitHorizontalTooltip: "Side-by-side split",
  splitVerticalTooltip: "Top-bottom split",
  examplesDrawerTooltip: "Toggle examples list",

  gallery: "Gallery",
  galleryHeading: "Chart & Mermaid gallery",
  galleryLead: "Select any card to load it into the workbench for editing and export",
  backToWorkbench: "Back to workbench",
  categoryAll: "All",
  searchPlaceholder: "Search charts, types, uses…",
  galleryEmpty: "No chart matches. Try another keyword.",
  loadingExamples: "Loading gallery examples…",
  loadExamplesFailed: "Failed to load examples",

  categoryFeatured: "Featured",

  preview: "Preview",
  renderTimeTitle: "Time of the last render",
  outputSizeTitle: "Size of the response",
  rendering: "Rendering",
  ready: "Ready",
  jsonError: "JSON error",
  fit: "Fit",
  fitTooltip: "Fit to the stage",
  actualSizeTooltip: "Actual size (100%)",
  copy: "Copy",
  copySvgTooltip: "Copy the SVG source",
  copyImageTooltip: "Copy the image",
  download: "Download",
  downloadTooltip: "Download this chart",
  generating: "Rendering…",
  emptyTitle: "Pick an example to start",

  jsonOptions: "JSON options",
  mermaidSource: "Mermaid source",
  editorModeMermaid: "Mermaid",
  editorModeJson: "JSON",
  mermaidModeTooltip: "Switch between raw Mermaid syntax and full JSON options",
  parseError: "Parse error",
  resizeEditor: "Drag to resize split pane",
  compactOn: "Compact",
  compactOff: "Plain",
  compactTooltip:
    "Compact SVG: no whitespace, merged paths. Same picture, fewer bytes.",
  simpleOn: "Simple",
  simpleOff: "Full",
  simpleTooltip: "Simple mode keeps only the common options",
  editorCollapse: "Collapse",
  editorExpand: "Show editor",

  invalidJson: "Invalid JSON",
  renderFailed: "Could not render the chart",
  linkCopied: "Preview URL copied",
  shortLinkCopied: "Short preview link copied",
  shortLinkExpired: "Short link not found or expired",
  copyFailed: "Copy failed",
  nothingToCopy: "No chart to copy yet",
  svgCopied: "SVG source copied",
  imageCopied: "Image copied",
  copyImageUnsupported:
    "This browser cannot copy images. Use download instead.",
  noSvgToDownload: "No SVG to download yet",
  noImageToDownload: "No image to download yet",

  mcpTitle: "Connect over MCP",
  mcpLead:
    "Let an LLM render 30 chart types and 13 Mermaid diagram types over MCP (Streamable HTTP). Returns PNG, JPEG, WebP images or SVG text.",
  mcpEndpoint: "Endpoint",
  mcpEndpointCopied: "Endpoint copied",
  mcpTools: "Tools",
  mcpToolList:
    "Lists all 30 chart types, variant guide, themes, loaded fonts, registered maps, and Mermaid capabilities.",
  mcpToolSchema:
    "Returns Draft 2020-12 JSON Schema (essential/full), live enums, and verified examples (all 13 diagrams for mermaid).",
  mcpToolValidate:
    "Validates JSON options and RenderLimits, returning up to 50 structured issues and CJK/font warnings.",
  mcpToolRender:
    "Renders a chart from chart_type, options, format (png by default; jpeg, webp, svg), and scale (1–4, default 2x).",
  mcpToolValidateMermaid:
    "Validates Mermaid syntax & semantics with 1-based line numbers and typo suggestions.",
  mcpToolRenderMermaid:
    "Renders Mermaid source directly (raster scale defaults to 2x; allow_links defaults to false for safety).",
  mcpResources: "Resources",
  mcpResourcesDesc:
    "Exposes charts://themes, charts://fonts, charts://maps, charts://mermaid/capabilities, charts://llms.txt, charts://llms-full.txt, charts://examples/{type}, and charts://examples/mermaid/{diagram} (also served via HTTP at /llms.txt and /llms-full.txt).",
  mcpCommandCopied: "Command copied",
  mcpConfig: "JSON config (.mcp.json)",
  mcpConfigCopied: "Config copied",
  mcpNote:
    "Clients that do not read MCP Resources still receive all runtime themes, fonts, maps, and examples inside tool responses. Pre-validation returns all issues in one pass so models can fix and retry.",
};

const messages: Record<Lang, Record<MessageKey, string>> = { zh, en };

export function translate(lang: Lang, key: MessageKey): string {
  return messages[lang][key];
}
