import {
  Component,
  ReactNode,
  createRef,
  RefObject,
  MouseEvent as ReactMouseEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ConfigProvider,
  theme,
  Select,
  Button,
  message,
  Switch,
  Spin,
  Tooltip,
  Input,
  Modal,
} from "antd";
import zhCN from "antd/locale/zh_CN";
import enUS from "antd/locale/en_US";
import { editor } from "monaco-editor";
import axios, { AxiosError, AxiosRequestConfig } from "axios";

import {
  Lang,
  MessageKey,
  chartTextEn,
  detectLang,
  translate,
} from "./i18n";

import "./App.css";

const { defaultAlgorithm, darkAlgorithm } = theme;

const isDarkMode = () =>
  window.matchMedia("(prefers-color-scheme: dark)").matches;

function createEditor(params: {
  dom: HTMLElement;
}): editor.IStandaloneCodeEditor {
  // * The current out-of-the-box available themes are: 'vs' (default), 'vs-dark', 'hc-black', 'hc-light.
  const e = editor.create(params.dom, {
    readOnly: false,
    language: "json",
    theme: isDarkMode() ? "vs-dark" : "vs",
    automaticLayout: true,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    padding: { top: 12, bottom: 12 },
    renderLineHighlight: "line",
    smoothScrolling: true,
    tabSize: 2,
    bracketPairColorization: { enabled: true },
  });
  e.updateOptions({
    fontSize: 13,
    lineNumbersMinChars: 3,
    wordWrap: "on",
    fontFamily:
      '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    fontLigatures: true,
  });
  return e;
}

const getGithubIcon = (lang: Lang) => {
  if (window.location.host !== "charts.npmtrend.com") {
    return null;
  }
  return (
    <Tooltip title={translate(lang, "githubTooltip")}>
      <a
        href="https://github.com/vicanso/charts-rs"
        className="github-link"
        target="_blank"
        rel="noreferrer"
        aria-label="GitHub repository"
      >
        <svg height="18" viewBox="0 0 16 16" width="18" aria-hidden="true">
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
        </svg>
      </a>
    </Tooltip>
  );
};

type GlyphKind =
  | "bar"
  | "stack"
  | "hbar"
  | "mix"
  | "waterfall"
  | "line"
  | "area"
  | "pie"
  | "radar"
  | "gauge"
  | "sunburst"
  | "scatter"
  | "heat"
  | "calendar"
  | "box"
  | "candle"
  | "funnel"
  | "treemap"
  | "sankey"
  | "tree"
  | "histogram"
  | "polar"
  | "chord"
  | "bubble"
  | "graph"
  | "parallel"
  | "river"
  | "step"
  | "halfpie"
  | "gantt"
  | "map"
  | "table"
  | "multi";

type ChartOption = {
  value: string;
  label: string;
  short: string;
  hint: string;
  glyph: GlyphKind;
};

type ChartCategory = {
  key: string;
  title: MessageKey;
  items: ChartOption[];
};

/** Tiny monoline icons — readable at 18px, no dependency. */
function ChartGlyph({ kind }: { kind: GlyphKind }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 18 18",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };
  switch (kind) {
    case "bar":
      return (
        <svg {...common}>
          <path d="M3 14V9M7 14V5M11 14V7M15 14V4" />
        </svg>
      );
    case "stack":
      return (
        <svg {...common}>
          <path d="M4 14V10H7V14H4ZM8.5 14V6H11.5V14H8.5ZM13 14V8H16V14H13Z" />
          <path d="M4 10V7H7V10M8.5 6V3.5H11.5V6" strokeOpacity="0.55" />
        </svg>
      );
    case "hbar":
      return (
        <svg {...common}>
          <path d="M3 4h10M3 9h13M3 14h7" />
        </svg>
      );
    case "mix":
      return (
        <svg {...common}>
          <path d="M4 14V9M8 14V6M12 14V10" />
          <path d="M3 11l4-3 4 2 4-5" />
        </svg>
      );
    case "waterfall":
      return (
        <svg {...common}>
          <path d="M3 13h3V8H3v5ZM8 8h3V5H8v3ZM13 11h3V7h-3v4Z" />
          <path d="M6 8h2M11 8h2" strokeOpacity="0.55" />
        </svg>
      );
    case "line":
      return (
        <svg {...common}>
          <path d="M2.5 12.5 6 8l3.5 3 5.5-7" />
        </svg>
      );
    case "area":
      return (
        <svg {...common}>
          <path d="M2.5 13.5 6 8l3.5 2.5L15 4.5" />
          <path
            d="M2.5 13.5 6 8l3.5 2.5L15 4.5V13.5H2.5Z"
            fill="currentColor"
            fillOpacity="0.15"
            stroke="none"
          />
        </svg>
      );
    case "pie":
      return (
        <svg {...common}>
          <circle cx="9" cy="9" r="6.2" />
          <path d="M9 2.8V9l5.2 3" />
        </svg>
      );
    case "radar":
      return (
        <svg {...common}>
          <path d="M9 2.5 14.5 6.2 12.4 13.5H5.6L3.5 6.2Z" />
          <path d="M9 6.2 11.6 8l-.9 2.8H7.3L6.4 8Z" strokeOpacity="0.55" />
        </svg>
      );
    case "gauge":
      return (
        <svg {...common}>
          <path d="M3.8 12a6 6 0 1 1 10.4 0" />
          <path d="M9 11.5 12 7" />
          <circle cx="9" cy="11.5" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    case "sunburst":
      return (
        <svg {...common}>
          <circle cx="9" cy="9" r="2.2" />
          <circle cx="9" cy="9" r="4.4" strokeOpacity="0.7" />
          <circle cx="9" cy="9" r="6.4" strokeOpacity="0.4" />
        </svg>
      );
    case "scatter":
      return (
        <svg {...common}>
          <circle cx="5" cy="12" r="1.2" fill="currentColor" stroke="none" />
          <circle cx="8" cy="7" r="1.2" fill="currentColor" stroke="none" />
          <circle cx="12" cy="10" r="1.2" fill="currentColor" stroke="none" />
          <circle cx="14" cy="5" r="1.2" fill="currentColor" stroke="none" />
        </svg>
      );
    case "heat":
      return (
        <svg {...common}>
          <path d="M3.5 3.5h3v3h-3zM7.5 3.5h3v3h-3zM11.5 3.5h3v3h-3zM3.5 7.5h3v3h-3zM7.5 7.5h3v3h-3zM11.5 7.5h3v3h-3zM3.5 11.5h3v3h-3zM7.5 11.5h3v3h-3zM11.5 11.5h3v3h-3z" />
        </svg>
      );
    case "calendar":
      return (
        <svg {...common}>
          <path d="M3.5 5h11v9.5h-11zM3.5 8h11M7 3.5v3M11 3.5v3" />
          <path d="M6 11h1.5M9 11h1.5M12 11h1" />
        </svg>
      );
    case "box":
      return (
        <svg {...common}>
          <path d="M6 4v2M12 4v2M6 12v2M12 12v2M5 6h8v6H5zM9 4v2M9 12v2" />
        </svg>
      );
    case "candle":
      return (
        <svg {...common}>
          <path d="M5 3v12M5 6h3v5H5zM11 3v12M10 5h3v6h-3z" />
        </svg>
      );
    case "funnel":
      return (
        <svg {...common}>
          <path d="M3 4h12l-3.5 4.5v4L9 15l-2.5-2.5v-4Z" />
        </svg>
      );
    case "treemap":
      return (
        <svg {...common}>
          <path d="M3 3h12v12H3zM9 3v12M3 9h6M9 7h6M12 7v8" />
        </svg>
      );
    case "sankey":
      return (
        <svg {...common}>
          <path d="M3 5h3c3 0 4 3 7 3h2M3 13h3c3 0 4-3 7-3h2" />
        </svg>
      );
    case "tree":
      return (
        <svg {...common}>
          <path d="M9 3v5M9 8H5v6M9 8h4v3M13 11v3" />
          <circle cx="9" cy="3" r="1.2" fill="currentColor" stroke="none" />
        </svg>
      );
    case "histogram":
      return (
        <svg {...common}>
          <path d="M3 14v-3h3V7h3V4h3v5h3v5M2 14h14" />
          <path d="M6 11v3M9 7v7M12 9v5" strokeOpacity="0.55" />
        </svg>
      );
    case "polar":
      return (
        <svg {...common}>
          <path d="M9 2.5A6.5 6.5 0 1 1 2.5 9" />
          <path d="M9 5.5A3.5 3.5 0 0 1 9 12.5" strokeOpacity="0.55" />
        </svg>
      );
    case "chord":
      return (
        <svg {...common}>
          <circle cx="9" cy="9" r="6.3" />
          <path d="M4.5 4.6Q9 9 13.5 4.6M3 10.8Q9 9 12.6 14.2" strokeOpacity="0.55" />
        </svg>
      );
    case "bubble":
      return (
        <svg {...common}>
          <circle cx="6" cy="11" r="3.2" />
          <circle cx="12.5" cy="6" r="2.2" />
          <circle cx="13" cy="12.5" r="1.3" />
        </svg>
      );
    case "graph":
      return (
        <svg {...common}>
          <path d="M5 5l7 2M5 5l2 8M12 7l-5 6M12 7l2 6" strokeOpacity="0.55" />
          <circle cx="5" cy="5" r="1.4" fill="currentColor" stroke="none" />
          <circle cx="12" cy="7" r="1.4" fill="currentColor" stroke="none" />
          <circle cx="7" cy="13" r="1.4" fill="currentColor" stroke="none" />
          <circle cx="14" cy="13" r="1.4" fill="currentColor" stroke="none" />
        </svg>
      );
    case "parallel":
      return (
        <svg {...common}>
          <path d="M3.5 3v12M9 3v12M14.5 3v12" />
          <path d="M3.5 6 9 11l5.5-5M3.5 12 9 6l5.5 6" strokeOpacity="0.55" />
        </svg>
      );
    case "river":
      return (
        <svg {...common}>
          <path d="M2.5 8C5 4 7 5 9 6.5S13 8 15.5 5M2.5 10C5 14 7 13 9 11.5S13 10 15.5 13" />
          <path d="M2.5 9h13" strokeOpacity="0.55" />
        </svg>
      );
    case "step":
      return (
        <svg {...common}>
          <path d="M2.5 13H6V9h3.5V6h3V4h3" />
        </svg>
      );
    case "halfpie":
      return (
        <svg {...common}>
          <path d="M3 12a6 6 0 0 1 12 0h-3a3 3 0 0 0-6 0Z" />
          <path d="M9 6v3" strokeOpacity="0.55" />
        </svg>
      );
    case "gantt":
      return (
        <svg {...common}>
          <path d="M3 4h6v2.5H3zM6 8h7v2.5H6zM10 12h5v2.5h-5z" />
        </svg>
      );
    case "map":
      return (
        <svg {...common}>
          <path d="M3 5l4-1.5 4 1.5 4-1.5v10l-4 1.5-4-1.5-4 1.5Z" />
          <path d="M7 3.5v10M11 5v10" strokeOpacity="0.55" />
        </svg>
      );
    case "table":
      return (
        <svg {...common}>
          <path d="M3.5 4h11v10h-11zM3.5 7.5h11M3.5 11h11M7.5 4v10M12 4v10" />
        </svg>
      );
    case "multi":
      return (
        <svg {...common}>
          <path d="M3 3h5.5v5.5H3zM9.5 3H15v5.5H9.5zM3 9.5h5.5V15H3zM9.5 9.5H15V15H9.5z" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <path d="M3 14V9M7 14V5M11 14V7M15 14V4" />
        </svg>
      );
  }
}

const chartCategories: ChartCategory[] = [
  {
    key: "bar",
    title: "categoryBar",
    items: [
      { value: "barBasic", label: "常规柱状图", short: "Bar", hint: "基础分组柱状", glyph: "bar" },
      { value: "barStacked", label: "堆叠柱状图", short: "Stack", hint: "总量对比", glyph: "stack" },
      { value: "barStackPercent", label: "百分比堆叠柱状图", short: "Pct", hint: "占比构成", glyph: "stack" },
      { value: "barErrorBar", label: "误差线柱状图", short: "Err", hint: "误差范围", glyph: "bar" },
      { value: "horizontalBar", label: "水平柱状图", short: "HBar", hint: "排行类数据", glyph: "hbar" },
      { value: "barLineMixin", label: "柱线混合图", short: "Mix", hint: "双轴混合", glyph: "mix" },
      { value: "waterfallChart", label: "瀑布图", short: "Fall", hint: "增减拆解", glyph: "waterfall" },
    ],
  },
  {
    key: "line",
    title: "categoryLine",
    items: [
      { value: "lineBasic", label: "常规曲线图", short: "Line", hint: "基础趋势", glyph: "line" },
      { value: "lineAnimation", label: "动画曲线图", short: "Anim", hint: "入场动画", glyph: "line" },
      { value: "lineStartIndexBasic", label: "指定起点曲线", short: "Start", hint: "序列错位", glyph: "line" },
      { value: "lineSmooth", label: "平滑曲线 (log2)", short: "Log2", hint: "对数坐标", glyph: "line" },
      { value: "lineSmoothFill", label: "填充平滑曲线", short: "Area", hint: "面积填充", glyph: "area" },
      { value: "lineNullData", label: "缺失数据曲线", short: "Null", hint: "断点处理", glyph: "line" },
      { value: "lineBand", label: "区间带曲线", short: "Band", hint: "置信区间", glyph: "area" },
      { value: "lineTimeAxis", label: "时间轴曲线", short: "Time", hint: "非等距采样", glyph: "line" },
      { value: "lineStep", label: "阶梯线图", short: "Step", hint: "阶跃变化", glyph: "step" },
      { value: "lineBump", label: "排名图", short: "Bump", hint: "名次变化", glyph: "line" },
      { value: "themeRiverChart", label: "主题河流图", short: "River", hint: "流量演变", glyph: "river" },
    ],
  },
  {
    key: "radial",
    title: "categoryRadial",
    items: [
      { value: "pieBasic", label: "南丁格尔玫瑰", short: "Pie", hint: "占比分布", glyph: "pie" },
      { value: "pieHalf", label: "半环饼图", short: "Half", hint: "半圆占比", glyph: "halfpie" },
      { value: "pieNested", label: "嵌套饼图", short: "Nested", hint: "两级占比", glyph: "sunburst" },
      { value: "radarBasic", label: "雷达图", short: "Radar", hint: "多维对比", glyph: "radar" },
      { value: "gaugeChart", label: "仪表盘", short: "Gauge", hint: "单值进度", glyph: "gauge" },
      { value: "gaugeSegments", label: "分段仪表盘", short: "Stage", hint: "区间着色", glyph: "gauge" },
      { value: "gaugeRings", label: "多环进度", short: "Rings", hint: "多指标进度", glyph: "polar" },
      { value: "sunburstChart", label: "旭日图", short: "Sun", hint: "层级占比", glyph: "sunburst" },
      { value: "polarBarChart", label: "极坐标柱状图", short: "Polar", hint: "周期对比", glyph: "polar" },
      { value: "polarBarRadial", label: "径向柱状图", short: "Ring", hint: "目标进度", glyph: "polar" },
    ],
  },
  {
    key: "matrix",
    title: "categoryMatrix",
    items: [
      { value: "scatterBasic", label: "散点图", short: "Dot", hint: "相关分布", glyph: "scatter" },
      { value: "scatterRegression", label: "回归散点图", short: "Fit", hint: "趋势拟合", glyph: "scatter" },
      { value: "bubbleChart", label: "气泡图", short: "Bubble", hint: "三维对比", glyph: "bubble" },
      { value: "heatmapBasic", label: "热力图", short: "Heat", hint: "密度矩阵", glyph: "heat" },
      { value: "heatmapScale", label: "分段热力图", short: "Scale", hint: "分级配色", glyph: "heat" },
      { value: "heatmapPunchCard", label: "打卡图", short: "Punch", hint: "时段活跃", glyph: "bubble" },
      { value: "calendarChart", label: "日历图", short: "Cal", hint: "日期贡献", glyph: "calendar" },
      { value: "boxPlotChart", label: "箱线图", short: "Box", hint: "统计分布", glyph: "box" },
      { value: "histogramChart", label: "直方图", short: "Hist", hint: "频数分布", glyph: "histogram" },
      { value: "parallelChart", label: "平行坐标图", short: "Para", hint: "多维记录", glyph: "parallel" },
      { value: "candlestick", label: "蜡烛图", short: "K", hint: "行情走势", glyph: "candle" },
      { value: "candlestickOhlc", label: "OHLC 图", short: "OHLC", hint: "美国线", glyph: "candle" },
      { value: "mapChart", label: "地图", short: "Map", hint: "区域分布", glyph: "map" },
    ],
  },
  {
    key: "flow",
    title: "categoryFlow",
    items: [
      { value: "funnelChart", label: "漏斗图", short: "Funnel", hint: "转化路径", glyph: "funnel" },
      { value: "treemapChart", label: "矩形树图", short: "TreeM", hint: "体量占比", glyph: "treemap" },
      { value: "sankeyChart", label: "桑基图", short: "Sankey", hint: "流量迁移", glyph: "sankey" },
      { value: "sankeyVertical", label: "纵向桑基图", short: "SankeyV", hint: "自上而下", glyph: "sankey" },
      { value: "treeChart", label: "树图", short: "Tree", hint: "层级结构", glyph: "tree" },
      { value: "treeRadial", label: "径向树图", short: "Radial", hint: "放射层级", glyph: "tree" },
      { value: "chordChart", label: "和弦图", short: "Chord", hint: "相互流向", glyph: "chord" },
      { value: "graphChart", label: "关系图", short: "Graph", hint: "节点网络", glyph: "graph" },
      { value: "ganttChart", label: "甘特图", short: "Gantt", hint: "项目排期", glyph: "gantt" },
    ],
  },
  {
    key: "other",
    title: "categoryOther",
    items: [
      { value: "tableBasic", label: "表格", short: "Table", hint: "结构化数据", glyph: "table" },
      { value: "multiChart", label: "多图表拼合", short: "Multi", hint: "组合看板", glyph: "multi" },
    ],
  },
];

const chartOptions: ChartOption[] = chartCategories.flatMap((c) => c.items);
const CHART_COUNT = chartOptions.length;

function findChartOption(value: string): ChartOption | undefined {
  return chartOptions.find((item) => item.value === value);
}

/** Name and use of an example in the given language. */
function chartText(item: ChartOption, lang: Lang) {
  const text = lang === "en" ? chartTextEn[item.value] : undefined;
  return text || { label: item.label, hint: item.hint };
}

// The charts a first visit opens on: the first one is selected by default and
// leads the gallery, the rest follow it ahead of the regular categories.
const FEATURED_CHARTS = [
  "chordChart",
  "sankeyChart",
  "mapChart",
  "sunburstChart",
  "treeRadial",
  "ganttChart",
  "pieNested",
];

const featuredCategory: ChartCategory = {
  key: "featured",
  title: "categoryFeatured",
  items: FEATURED_CHARTS.map(findChartOption).filter(
    (item): item is ChartOption => Boolean(item),
  ),
};

const PREFS_KEY = "charts-rs-lab-prefs-v1";

type LabPrefs = {
  simply?: boolean;
  compact?: boolean;
  editorHeight?: number;
  editorCollapsed?: boolean;
  format?: string;
  theme?: string;
  fontFamily?: string;
  currentChartType?: string;
  previewFit?: boolean;
  lang?: Lang;
};

function loadPrefs(): LabPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as LabPrefs;
  } catch {
    return {};
  }
}

function savePrefs(partial: LabPrefs) {
  try {
    const next = { ...loadPrefs(), ...partial };
    localStorage.setItem(PREFS_KEY, JSON.stringify(next));
  } catch {
    // ignore quota / private mode
  }
}

function isMac() {
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);
}


const formatOptions = [
  {
    value: "svg",
    label: "Svg",
  },
  {
    value: "png",
    label: "Png",
  },
  {
    value: "webp",
    label: "WebP",
  },
  {
    value: "avif",
    label: "Avif",
  },
  {
    value: "jpeg",
    label: "Jpeg",
  },
];
const defaultOption = {
  quality: 80,
  width: 600,
  height: 400,
  margin: {
    left: 5,
    top: 5,
    right: 5,
    bottom: 5,
  },
  font_family: "Roboto",
  title_font_size: 18,
  title_font_weight: "bold",
  title_margin: {
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
  },
  title_align: "center",
  title_height: 30,
  sub_title_text: "Sub Title",
  sub_title_font_size: 14,
  sub_title_margin: {
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
  },
  sub_title_align: "center",
  sub_title_height: 20,
  legend_font_size: 14,
  legend_align: "center",
  legend_margin: {
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
  },
  legend_category: "normal",
  legend_show: true,
  x_axis_height: 30,
  x_axis_font_size: 14,
  x_axis_name_gap: 5,
  x_axis_name_rotate: 0,
  x_boundary_gap: true,
  x_axis_margin: {
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
  },
};
// Fictional regions for the map example, from asset/map_chart of charts-rs.
const mapGeoJson = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: {
        name: "Alder",
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [100.25, 27.37],
            [101.41, 27.18],
            [102.6, 27.25],
            [103.78, 27.32],
            [104.95, 27.08],
            [105.14, 28.26],
            [104.54, 29.34],
            [104.25, 30.46],
            [104.38, 31.64],
            [103.33, 31.54],
            [102.52, 32.5],
            [101.51, 32.59],
            [100.47, 32.54],
            [100.04, 31.26],
            [100.13, 29.96],
            [100.53, 28.65],
            [100.25, 27.37],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: {
        name: "Birch",
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [104.95, 27.08],
            [105.76, 26.94],
            [106.49, 27.49],
            [107.27, 27.72],
            [108.09, 27.41],
            [108.01, 28.42],
            [108.49, 29.39],
            [108.39, 30.4],
            [108.28, 31.4],
            [107.33, 31.8],
            [106.34, 31.71],
            [105.34, 31.31],
            [104.38, 31.64],
            [104.25, 30.46],
            [104.54, 29.34],
            [105.14, 28.26],
            [104.95, 27.08],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: {
        name: "Cedar",
      },
      geometry: {
        type: "MultiPolygon",
        coordinates: [
          [
            [
              [108.09, 27.41],
              [109.09, 28.13],
              [110.46, 27.83],
              [111.53, 28.37],
              [112.54, 29.05],
              [112.59, 29.69],
              [112.03, 30.22],
              [112.66, 30.96],
              [112.12, 31.49],
              [111.15, 31.91],
              [110.19, 31.74],
              [109.24, 31.57],
              [108.28, 31.4],
              [108.39, 30.4],
              [108.49, 29.39],
              [108.01, 28.42],
              [108.09, 27.41],
            ],
          ],
          [
            [
              [114.75, 30.0],
              [114.56, 30.37],
              [114.27, 30.66],
              [113.75, 30.72],
              [113.28, 30.48],
              [113.17, 30.0],
              [113.5, 29.53],
              [113.7, 29.18],
              [114.2, 29.2],
              [114.79, 29.46],
              [114.75, 30.0],
            ],
          ],
          [
            [
              [115.71, 28.9],
              [115.64, 29.21],
              [115.38, 29.29],
              [115.08, 29.33],
              [114.72, 29.24],
              [114.81, 28.9],
              [114.85, 28.61],
              [115.06, 28.39],
              [115.33, 28.37],
              [115.59, 28.55],
              [115.71, 28.9],
            ],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: {
        name: "Dune",
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [99.52, 23.59],
            [100.56, 24.08],
            [101.61, 24.56],
            [102.92, 24.17],
            [103.89, 24.92],
            [104.27, 25.4],
            [104.41, 26.0],
            [104.55, 26.6],
            [104.95, 27.08],
            [103.78, 27.32],
            [102.6, 27.25],
            [101.41, 27.18],
            [100.25, 27.37],
            [99.82, 26.47],
            [99.78, 25.5],
            [99.74, 24.53],
            [99.52, 23.59],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: {
        name: "Elm",
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [103.89, 24.92],
            [104.83, 24.59],
            [105.78, 24.4],
            [106.81, 25.01],
            [107.74, 24.55],
            [107.93, 25.25],
            [107.88, 25.99],
            [107.82, 26.72],
            [108.09, 27.41],
            [107.27, 27.72],
            [106.49, 27.49],
            [105.76, 26.94],
            [104.95, 27.08],
            [104.55, 26.6],
            [104.41, 26.0],
            [104.27, 25.4],
            [103.89, 24.92],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: {
        name: "Fir",
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [107.74, 24.55],
            [109.08, 24.8],
            [110.27, 23.89],
            [111.58, 23.87],
            [112.89, 23.91],
            [112.44, 25.17],
            [113.1, 26.51],
            [112.87, 27.78],
            [112.54, 29.05],
            [111.53, 28.37],
            [110.46, 27.83],
            [109.09, 28.13],
            [108.09, 27.41],
            [107.82, 26.72],
            [107.88, 25.99],
            [107.93, 25.25],
            [107.74, 24.55],
          ],
          [
            [111.03, 26.2],
            [110.83, 26.56],
            [110.33, 26.7],
            [109.84, 26.56],
            [109.63, 26.2],
            [109.84, 25.85],
            [110.33, 25.7],
            [110.83, 25.85],
            [111.03, 26.2],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: {
        name: "Glen",
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [112.89, 23.91],
            [113.57, 24.36],
            [114.28, 23.96],
            [114.96, 24.13],
            [115.66, 24.04],
            [115.65, 25.02],
            [115.69, 25.99],
            [116.61, 26.79],
            [116.38, 27.81],
            [115.41, 28.08],
            [114.4, 28.25],
            [113.58, 28.98],
            [112.54, 29.05],
            [112.87, 27.78],
            [113.1, 26.51],
            [112.44, 25.17],
            [112.89, 23.91],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: {
        name: "Heath",
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [100.7, 19.82],
            [101.63, 19.54],
            [102.47, 19.81],
            [103.31, 20.09],
            [104.15, 20.36],
            [103.64, 21.47],
            [104.01, 22.64],
            [103.8, 23.77],
            [103.89, 24.92],
            [102.92, 24.17],
            [101.61, 24.56],
            [100.56, 24.08],
            [99.52, 23.59],
            [99.8, 22.64],
            [100.23, 21.74],
            [100.11, 20.67],
            [100.7, 19.82],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: {
        name: "Ivy",
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [104.15, 20.36],
            [105.0, 20.62],
            [105.87, 20.57],
            [106.73, 20.77],
            [107.61, 20.58],
            [107.47, 21.57],
            [107.94, 22.55],
            [107.83, 23.55],
            [107.74, 24.55],
            [106.81, 25.01],
            [105.78, 24.4],
            [104.83, 24.59],
            [103.89, 24.92],
            [103.8, 23.77],
            [104.01, 22.64],
            [103.64, 21.47],
            [104.15, 20.36],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: {
        name: "Juniper",
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [107.61, 20.58],
            [108.64, 20.75],
            [109.42, 19.8],
            [110.4, 19.72],
            [111.39, 19.72],
            [111.42, 20.89],
            [112.2, 21.79],
            [112.44, 22.89],
            [112.89, 23.91],
            [111.58, 23.87],
            [110.27, 23.89],
            [109.08, 24.8],
            [107.74, 24.55],
            [107.83, 23.55],
            [107.94, 22.55],
            [107.47, 21.57],
            [107.61, 20.58],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: {
        name: "Kelp",
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [111.39, 19.72],
            [112.35, 20.28],
            [113.41, 19.99],
            [114.41, 20.27],
            [115.43, 20.26],
            [115.15, 21.23],
            [115.64, 22.14],
            [115.56, 23.1],
            [115.66, 24.04],
            [114.96, 24.13],
            [114.28, 23.96],
            [113.57, 24.36],
            [112.89, 23.91],
            [112.44, 22.89],
            [112.2, 21.79],
            [111.42, 20.89],
            [111.39, 19.72],
          ],
        ],
      },
    },
  ],
};
const chartDefaultOptions: Record<string, unknown> = {
  barBasic: Object.assign({}, defaultOption, {
    type: "bar",
    title_text: "Bar Chart",
    legend_align: "left",
    x_axis_data: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    x_axis_hidden: false,
    y_axis_hidden: false,
    radius: 0,
    series_list: [
      {
        name: "Email",
        label_show: true,
        data: [120.0, 132.0, 101.0, 134.0, 90.0, 230.0, 210.0],
      },
      {
        name: "Union Ads",
        label_show: true,
        data: [220.0, 182.0, 191.0, 234.0, 290.0, 330.0, 310.0],
      },
    ],
    simplyKeys: [
      "width",
      "height",
      "font_family",
      "sub_title_text",
      "legend_align",
      "type",
      "title_text",
      "x_axis_data",
      "series_list",
      "theme",
    ],
  }),
  barStacked: Object.assign({}, defaultOption, {
    type: "bar",
    title_text: "Bar Stacked Chart",
    legend_align: "left",
    x_axis_data: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    x_axis_hidden: false,
    y_axis_hidden: false,
    radius: 0,
    series_list: [
      {
        name: "Email",
        stack: "total",
        data: [120.0, 132.0, 101.0, 134.0, 90.0, 230.0, 210.0],
      },
      {
        name: "Union Ads",
        stack: "total",
        data: [220.0, 182.0, 191.0, 234.0, 290.0, 330.0, 310.0],
      },
    ],
    simplyKeys: [
      "width",
      "height",
      "font_family",
      "sub_title_text",
      "legend_align",
      "type",
      "title_text",
      "x_axis_data",
      "series_list",
      "theme",
    ],
  }),
  barStackPercent: Object.assign({}, defaultOption, {
    type: "bar",
    title_text: "Bar Percent Stacked Chart",
    title_align: "left",
    sub_title_text: "Share of visits",
    sub_title_align: "left",
    legend_align: "right",
    legend_category: "round_rect",
    stack_percent: true,
    x_axis_data: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    x_axis_hidden: false,
    y_axis_hidden: false,
    series_list: [
      {
        name: "Direct",
        stack: "total",
        label_show: true,
        data: [100, 302, 301, 334, 390, 330, 320],
      },
      {
        name: "Email",
        stack: "total",
        label_show: true,
        data: [320, 132, 101, 134, 90, 230, 210],
      },
      {
        name: "Ads",
        stack: "total",
        label_show: true,
        data: [220, 182, 191, 234, 290, 330, 310],
      },
      {
        name: "Search",
        stack: "total",
        label_show: true,
        data: [150, 212, 201, 154, 190, 330, 410],
      },
    ],
    simplyKeys: [
      "width",
      "height",
      "font_family",
      "sub_title_text",
      "sub_title_align",
      "legend_align",
      "legend_category",
      "type",
      "title_text",
      "title_align",
      "stack_percent",
      "x_axis_data",
      "series_list",
      "theme",
    ],
  }),
  barErrorBar: Object.assign({}, defaultOption, {
    type: "bar",
    title_text: "Bar Error Bar Chart",
    title_align: "left",
    sub_title_text: "Yield by plot",
    sub_title_align: "left",
    legend_align: "right",
    legend_category: "round_rect",
    tooltip_show: true,
    x_axis_data: ["A", "B", "C", "D", "E"],
    x_axis_hidden: false,
    y_axis_hidden: false,
    series_list: [
      {
        name: "Spring",
        data: [42, 55, 48, 61, 39],
        error_bar: {
          lower: [37, 49, 44, 52, 35],
          upper: [47, 60, 55, 68, 44],
        },
      },
      {
        name: "Autumn",
        data: [35, 47, 52, 44, 30],
        error_bar: {
          lower: [31, 40, 47, 39, 27],
          upper: [40, 52, 58, 50, 36],
        },
      },
      {
        name: "Rainfall",
        category: "line",
        data: [20, 26, 31, 24, 18],
        error_bar: {
          lower: [16, 22, 25, null, 15],
          upper: [24, 31, 36, 28, 22],
        },
      },
    ],
    simplyKeys: [
      "width",
      "height",
      "font_family",
      "sub_title_text",
      "sub_title_align",
      "legend_align",
      "legend_category",
      "type",
      "title_text",
      "title_align",
      "tooltip_show",
      "x_axis_data",
      "series_list",
      "theme",
    ],
  }),
  lineBasic: Object.assign({}, defaultOption, {
    type: "line",
    title_text: "Line Chart",
    legend_align: "right",
    legend_category: "round_rect",
    x_axis_data: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    x_boundary_gap: false,
    x_axis_hidden: false,
    y_axis_hidden: false,
    margin: {
      left: 15,
      top: 15,
      right: 15,
      bottom: 15,
    },
    series_list: [
      {
        name: "Email",
        label_show: true,
        stroke_dash_array: "4,2",
        data: [120.0, 132.0, 101.0, 134.0, 90.0, 230.0, 210.0],
      },
      {
        name: "Union Ads",
        label_show: true,
        data: [220.0, 182.0, 191.0, 234.0, 290.0, 330.0, 310.0],
      },
    ],
    simplyKeys: [
      "width",
      "height",
      "margin",
      "font_family",
      "sub_title_text",
      "legend_align",
      "legend_category",
      "x_boundary_gap",
      "type",
      "title_text",
      "x_axis_data",
      "series_list",
      "theme",
    ],
  }),
  lineAnimation: Object.assign({}, defaultOption, {
    type: "line",
    title_text: "Line Chart",
    legend_align: "right",
    legend_category: "round_rect",
    x_axis_data: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    x_boundary_gap: false,
    x_axis_hidden: false,
    y_axis_hidden: false,
    margin: {
      left: 15,
      top: 15,
      right: 15,
      bottom: 15,
    },
    series_list: [
      {
        name: "Email",
        label_show: true,
        data: [120.0, 132.0, 101.0, 134.0, 90.0, 230.0, 210.0],
      },
      {
        name: "Union Ads",
        label_show: true,
        data: [220.0, 182.0, 191.0, 234.0, 290.0, 330.0, 310.0],
      },
    ],
    animation: {
      duration: 1000,
      easing: "ease",
      delay: 80
    },
    simplyKeys: [
      "width",
      "height",
      "margin",
      "font_family",
      "sub_title_text",
      "legend_align",
      "legend_category",
      "x_boundary_gap",
      "type",
      "title_text",
      "x_axis_data",
      "series_list",
      "animation",
      "theme",
    ],
  }),
  lineStartIndexBasic: Object.assign({}, defaultOption, {
    type: "line",
    title_text: "Line Chart",
    legend_align: "right",
    x_axis_data: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    x_boundary_gap: false,
    legend_category: "circle",
    x_axis_hidden: false,
    y_axis_hidden: false,
    margin: {
      left: 15,
      top: 15,
      right: 15,
      bottom: 15,
    },
    series_list: [
      {
        name: "Email",
        label_show: true,
        data: [120.0, 132.0, 101.0, 134.0, 90.0, 230.0, 210.0],
      },
      {
        name: "Union Ads",
        label_show: true,
        start_index: 1,
        data: [182.0, 191.0, 234.0, 290.0, 330.0, 310.0],
      },
    ],
    simplyKeys: [
      "width",
      "height",
      "margin",
      "font_family",
      "sub_title_text",
      "legend_align",
      "legend_category",
      "x_boundary_gap",
      "type",
      "title_text",
      "x_axis_data",
      "series_list",
      "theme",
    ],
  }),
  lineSmooth: Object.assign({}, defaultOption, {
    type: "line",
    title_text: "Line Smooth Chart",
    legend_align: "right",
    x_axis_data: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    series_smooth: true,
    legend_category: "rect",
    x_axis_hidden: false,
    y_axis_hidden: false,
    y_axis_configs: [
      {
        "axis_scale": "log2",
      }
    ],
    margin: {
      left: 5,
      top: 5,
      right: 50,
      bottom: 5,
    },
    series_list: [
      {
        name: "Email",
        label_show: true,
        data: [120.0, 132.0, 101.0, 134.0, 90.0, 230.0, 210.0],
        mark_lines: [
          {
            category: "average",
          },
        ],
      },
      {
        name: "Union Ads",
        data: [220.0, 182.0, 191.0, 234.0, 290.0, 330.0, 310.0],
        mark_points: [
          {
            category: "max",
          },
          {
            category: "min",
          },
        ],
      },
    ],
    simplyKeys: [
      "width",
      "height",
      "margin",
      "font_family",
      "sub_title_text",
      "y_axis_configs",
      "legend_align",
      "legend_category",
      "type",
      "title_text",
      "x_axis_data",
      "series_list",
      "series_smooth",
      "theme",
    ],
  }),
  lineSmoothFill: Object.assign({}, defaultOption, {
    type: "line",
    title_text: "Line Smooth Fill Chart",
    legend_align: "right",
    x_axis_data: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    series_smooth: true,
    series_fill: true,
    x_axis_hidden: false,
    y_axis_hidden: false,
    series_list: [
      {
        name: "Email",
        label_show: true,
        data: [120.0, 132.0, 101.0, 134.0, 90.0, 230.0, 210.0],
      },
      {
        name: "Union Ads",
        label_show: true,
        data: [220.0, 182.0, 191.0, 234.0, 290.0, 330.0, 310.0],
      },
    ],
    simplyKeys: [
      "width",
      "height",
      "font_family",
      "sub_title_text",
      "legend_align",
      "type",
      "title_text",
      "x_axis_data",
      "series_list",
      "series_smooth",
      "series_fill",
      "theme",
    ],
  }),
  lineNullData: Object.assign({}, defaultOption, {
    type: "line",
    title_text: "Line Null Data",
    legend_align: "right",
    legend_category: "round_rect",
    x_axis_data: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    x_boundary_gap: false,
    x_axis_hidden: false,
    y_axis_hidden: false,
    margin: {
      left: 15,
      top: 15,
      right: 15,
      bottom: 15,
    },
    series_list: [
      {
        name: "Email",
        label_show: true,
        data: [120.0, null, 101.0, 134.0, null, 230.0, 210.0],
      },
      {
        name: "Union Ads",
        label_show: true,
        data: [220.0, 182.0, null, 234.0, 290.0, null, 310.0],
      },
    ],
    simplyKeys: [
      "width",
      "height",
      "margin",
      "font_family",
      "sub_title_text",
      "legend_align",
      "legend_category",
      "x_boundary_gap",
      "type",
      "title_text",
      "x_axis_data",
      "series_list",
      "theme",
    ],
  }),
  lineBand: Object.assign({}, defaultOption, {
    type: "line",
    title_text: "Line Band Chart",
    sub_title_text: "Forecast with confidence band",
    legend_align: "right",
    legend_category: "round_rect",
    x_axis_data: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    x_boundary_gap: false,
    x_axis_hidden: false,
    y_axis_hidden: false,
    series_smooth: true,
    tooltip_show: true,
    margin: {
      left: 15,
      top: 15,
      right: 15,
      bottom: 15,
    },
    series_list: [
      {
        name: "Actual",
        data: [120.0, 132.0, 101.0, 134.0, 90.0, 230.0, 210.0],
      },
      {
        name: "Forecast",
        data: [220.0, 182.0, 191.0, 234.0, 290.0, 330.0, 310.0],
        band: {
          lower: [205.0, 160.0, 162.0, 196.0, 240.0, 268.0, 236.0],
          upper: [235.0, 204.0, 220.0, 272.0, 340.0, 392.0, 384.0],
        },
      },
    ],
    simplyKeys: [
      "width",
      "height",
      "margin",
      "font_family",
      "sub_title_text",
      "legend_align",
      "legend_category",
      "type",
      "title_text",
      "x_axis_data",
      "x_boundary_gap",
      "series_smooth",
      "tooltip_show",
      "series_list",
      "theme",
    ],
  }),
  lineTimeAxis: Object.assign({}, defaultOption, {
    type: "line",
    title_text: "Line Time Axis Chart",
    sub_title_text: "Unevenly sampled data",
    legend_align: "right",
    legend_category: "round_rect",
    x_axis_type: "time",
    x_axis_values: [
      "2024-03-01 08:00",
      "2024-03-01 08:30",
      "2024-03-01 09:00",
      "2024-03-01 11:00",
      "2024-03-01 12:30",
      "2024-03-01 16:00",
      "2024-03-01 20:00",
    ],
    x_axis_formatter: "%H:%M",
    x_axis_title: "Time",
    x_axis_hidden: false,
    y_axis_hidden: false,
    y_axis_configs: [
      {
        axis_formatter: "{c} ms",
      },
    ],
    margin: {
      left: 15,
      top: 15,
      right: 25,
      bottom: 15,
    },
    series_list: [
      {
        name: "API",
        data: [120.0, 132.0, 101.0, 134.0, 90.0, 230.0, 210.0],
      },
      {
        name: "Web",
        data: [220.0, 182.0, 191.0, 234.0, 290.0, 330.0, 310.0],
      },
    ],
    simplyKeys: [
      "width",
      "height",
      "margin",
      "font_family",
      "sub_title_text",
      "legend_align",
      "legend_category",
      "type",
      "title_text",
      "x_axis_type",
      "x_axis_values",
      "x_axis_formatter",
      "x_axis_title",
      "y_axis_configs",
      "series_list",
      "theme",
    ],
  }),
  lineStep: Object.assign({}, defaultOption, {
    type: "line",
    title_text: "Line Step Chart",
    sub_title_text: "start / middle / end",
    legend_align: "right",
    legend_category: "round_rect",
    x_axis_data: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    x_axis_hidden: false,
    y_axis_hidden: false,
    margin: {
      left: 15,
      top: 15,
      right: 15,
      bottom: 15,
    },
    series_list: [
      {
        name: "Start",
        step: "start",
        data: [120, 132, 101, 134, 90, 230, 210],
      },
      {
        name: "Middle",
        step: "middle",
        data: [220, 282, 201, 234, 290, 430, 410],
      },
      {
        name: "End",
        step: "end",
        data: [450, 432, 401, 454, 590, 530, 510],
      },
    ],
    simplyKeys: [
      "width",
      "height",
      "margin",
      "font_family",
      "sub_title_text",
      "legend_align",
      "legend_category",
      "type",
      "title_text",
      "x_axis_data",
      "series_list",
      "theme",
    ],
  }),
  lineBump: Object.assign({}, defaultOption, {
    type: "line",
    title_text: "Bump Chart",
    title_align: "left",
    sub_title_text: "Ranking by year",
    sub_title_align: "left",
    legend_align: "right",
    series_smooth: true,
    x_boundary_gap: false,
    x_axis_data: ["2019", "2020", "2021", "2022", "2023", "2024"],
    x_axis_hidden: false,
    y_axis_hidden: false,
    margin: {
      left: 5,
      top: 5,
      right: 20,
      bottom: 5,
    },
    y_axis_configs: [
      {
        axis_inverse: true,
        axis_min: 1,
        axis_max: 5,
        axis_split_number: 4,
        axis_title: "Place",
      },
    ],
    series_symbol: {
      type: "circle",
      size: 4,
    },
    series_list: [
      { name: "Alpha", data: [1, 2, 2, 1, 1, 3] },
      { name: "Beta", data: [2, 1, 3, 3, 4, 5] },
      { name: "Gamma", data: [3, 3, 1, 2, 2, 1] },
      { name: "Delta", data: [4, 5, 5, 4, 3, 2] },
      { name: "Epsilon", data: [5, 4, 4, 5, 5, 4] },
    ],
    simplyKeys: [
      "width",
      "height",
      "margin",
      "font_family",
      "sub_title_text",
      "sub_title_align",
      "legend_align",
      "type",
      "title_text",
      "title_align",
      "series_smooth",
      "x_boundary_gap",
      "x_axis_data",
      "y_axis_configs",
      "series_symbol",
      "series_list",
      "theme",
    ],
  }),
  themeRiverChart: {
    type: "theme_river",
    width: 600,
    height: 400,
    font_family: "Roboto",
    title_text: "Theme River",
    legend_show: false,
    series_smooth: true,
    stream_opacity: 0.85,
    x_axis_data: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug"],
    series_list: [
      { name: "News", data: [10, 25, 18, 30, 42, 35, 28, 20] },
      { name: "Sport", data: [15, 12, 22, 16, 20, 38, 45, 30] },
      { name: "Music", data: [8, 14, 30, 36, 24, 18, 22, 34] },
      { name: "Movie", data: [20, 18, 12, 22, 34, 40, 26, 16] },
    ],
    simplyKeys: [
      "width",
      "height",
      "font_family",
      "type",
      "title_text",
      "legend_show",
      "series_smooth",
      "stream_opacity",
      "x_axis_data",
      "series_list",
      "theme",
    ],
  },
  barLineMixin: Object.assign({}, defaultOption, {
    type: "bar",
    title_text: "Bar Line Mixin",
    sub_title_text: "",
    legend_margin: {
      top: 25,
      bottom: 3,
    },
    x_axis_data: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    series_smooth: true,
    x_axis_hidden: false,
    y_axis_hidden: false,
    y_axis_configs: [
      {
        axis_font_size: 14,
        axis_formatter: "{c} ml",
        axis_min: -5,
        axis_max: 25,
      },
      {
        axis_stroke_color: "#EE6666",
        axis_font_color: "#EE6666",
        axis_formatter: "{c} °C",
      },
    ],
    series_list: [
      {
        name: "Evaporation",
        data: [2.0, 4.9, 7.0, 23.2, 25.6, 76.7, 135.6],
      },
      {
        name: "Precipitation",
        data: [2.6, 5.9, 9.0, 26.4, 28.7, 70.7, 175.6],
      },
      {
        name: "Temperature",
        category: "line",
        y_axis_index: 1,
        label_show: true,
        data: [2.0, 2.2, 3.3, 4.5, 6.3, 10.2, 20.3],
      },
    ],
    simplyKeys: [
      "width",
      "height",
      "font_family",
      "legend_margin",
      "type",
      "title_text",
      "x_axis_data",
      "y_axis_configs",
      "series_list",
      "series_smooth",
      "theme",
    ],
  }),
  horizontalBar: Object.assign({}, defaultOption, {
    type: "horizontal_bar",
    title_text: "World Population",
    legend_align: "left",
    x_axis_data: ["Brazil", "Indonesia", "USA", "India", "China", "World"],
    series_label_formatter: "{t}",
    series_label_position: null,
    x_axis_hidden: false,
    y_axis_hidden: false,
    series_list: [
      {
        name: "2011",
        label_show: true,
        data: [18203.0, 23489.0, 29034.0, 104970.0, 131744.0, 630230.0],
      },
      {
        name: "2012",
        label_show: true,
        data: [19325.0, 23438.0, 31000.0, 121594.0, 134141.0, 681807.0],
      },
    ],
    simplyKeys: [
      "width",
      "height",
      "font_family",
      "sub_title_text",
      "legend_align",
      "type",
      "title_text",
      "x_axis_data",
      "series_list",
      "series_smooth",
      "series_fill",
      "series_label_formatter",
      "series_label_position",
      "theme",
    ],
  }),
  pieBasic: Object.assign({}, defaultOption, {
    type: "pie",
    title_text: "Nightingale Chart",
    legend_margin: {
      top: 50,
    },
    rose_type: true,
    radius: 110,
    border_radius: 8,
    inner_radius: 30,
    animation: {
      duration: 800,
      easing: "ease-out",
      delay: 50,
    },
    series_list: [
      {
        name: "rose 1",
        data: [40],
      },
      {
        name: "rose 2",
        data: [38],
      },
      {
        name: "rose 3",
        data: [32],
      },
      {
        name: "rose 4",
        data: [30],
      },
      {
        name: "rose 5",
        data: [28],
      },
      {
        name: "rose 6",
        data: [26],
      },
      {
        name: "rose 7",
        data: [22],
      },
      {
        name: "rose 8",
        data: [18],
      },
    ],
    simplyKeys: [
      "width",
      "height",
      "font_family",
      "sub_title_text",
      "legend_margin",
      "legend_show",
      "type",
      "title_text",
      "x_axis_data",
      "series_list",
      "rose_type",
      "radius",
      "border_radius",
      "inner_radius",
      "animation",
      "theme",
    ],
  }),
  pieHalf: {
    type: "pie",
    width: 600,
    height: 400,
    font_family: "Roboto",
    title_text: "Half Doughnut",
    rose_type: false,
    start_angle: -90,
    end_angle: 90,
    radius: 180,
    inner_radius: 100,
    border_radius: 4,
    series_list: [
      { name: "Search", data: [1048] },
      { name: "Direct", data: [735] },
      { name: "Email", data: [580] },
      { name: "Ads", data: [484] },
      { name: "Video", data: [300] },
    ],
    simplyKeys: [
      "width",
      "height",
      "font_family",
      "type",
      "title_text",
      "rose_type",
      "start_angle",
      "end_angle",
      "radius",
      "inner_radius",
      "border_radius",
      "series_list",
      "theme",
    ],
  },
  pieNested: {
    type: "pie",
    width: 600,
    height: 400,
    font_family: "Roboto",
    title_text: "Nested Pies",
    rose_type: false,
    radius: 150,
    inner_radius: 0,
    border_radius: 2,
    ring_gap: 6,
    tooltip_show: true,
    series_list: [
      { name: "Search", data: [1548], ring: 0 },
      { name: "Direct", data: [775], ring: 0 },
      { name: "Marketing", data: [679], ring: 0 },
      { name: "Baidu", data: [1048], ring: 1 },
      { name: "Google", data: [251], ring: 1 },
      { name: "Bing", data: [147], ring: 1 },
      { name: "Others", data: [102], ring: 1 },
      { name: "Typed", data: [335], ring: 1 },
      { name: "Bookmarks", data: [440], ring: 1 },
      { name: "Email", data: [310], ring: 1 },
      { name: "Ads", data: [234], ring: 1 },
      { name: "Video", data: [135], ring: 1 },
    ],
    simplyKeys: [
      "width",
      "height",
      "font_family",
      "type",
      "title_text",
      "rose_type",
      "radius",
      "inner_radius",
      "ring_gap",
      "tooltip_show",
      "series_list",
      "theme",
    ],
  },
  radarBasic: Object.assign({}, defaultOption, {
    type: "radar",
    title_text: "Radar Chart",
    sub_title_text: "",
    title_margin: {
      top: 20,
    },
    series_list: [
      {
        name: "Allocated Budget",
        label_show: false,
        data: [4200.0, 3000.0, 20000.0, 35000.0, 50000.0, 18000.0],
      },
      {
        name: "Actual Spending",
        label_show: false,
        data: [5000.0, 14000.0, 28000.0, 26000.0, 42000.0, 21000.0],
      },
    ],
    indicators: [
      {
        name: "Sales",
        max: 6500,
      },
      {
        name: "Administration",
        max: 16000,
      },
      {
        name: "Information Technology",
        max: 30000,
      },
      {
        name: "Customer Support",
        max: 38000,
      },
      {
        name: "Development",
        max: 52000,
      },
      {
        name: "Marketing",
        max: 25000,
      },
    ],
    simplyKeys: [
      "width",
      "height",
      "font_family",
      "title_margin",
      "type",
      "title_text",
      "x_axis_data",
      "series_list",
      "indicators",
      "theme",
    ],
  }),
  scatterBasic: Object.assign({}, defaultOption, {
    type: "scatter",
    title_text: "Male and female height and weight distribution",
    title_align: "left",
    sub_title_text: "Data from: Heinz 2003",
    sub_title_align: "left",
    legend_align: "right",
    x_axis_hidden: false,
    y_axis_hidden: false,
    margin: {
      left: 5,
      top: 5,
      right: 20,
      bottom: 5,
    },
    y_axis_configs: [
      {
        axis_min: 40,
        axis_max: 100,
        axis_formatter: "{c} kg",
      },
    ],
    x_axis_config: {
      axis_min: 140,
      axis_max: 200,
      axis_formatter: "{c} cm",
    },
    series_list: [
      {
        name: "Female",
        data: [
          161.2, 51.6, 167.5, 59.0, 159.5, 49.2, 157.0, 63.0, 155.8, 53.6,
          170.0, 59.0, 159.1, 47.6, 166.0, 69.8, 176.2, 66.8, 160.2, 75.2,
          172.5, 55.2, 170.9, 54.2, 172.9, 62.5, 153.4, 42.0, 160.0, 50.0,
          147.2, 49.8, 168.2, 49.2, 175.0, 73.2, 157.0, 47.8, 167.6, 68.8,
          159.5, 50.6, 175.0, 82.5, 166.8, 57.2, 176.5, 87.8, 170.2, 72.8,
        ],
      },
      {
        name: "Male",
        data: [
          174.0, 65.6, 175.3, 71.8, 193.5, 80.7, 186.5, 72.6, 187.2, 78.8,
          181.5, 74.8, 184.0, 86.4, 184.5, 78.4, 175.0, 62.0, 184.0, 81.6,
          180.0, 76.6, 177.8, 83.6, 192.0, 90.0, 176.0, 74.6, 174.0, 71.0,
          184.0, 79.6, 192.7, 93.8, 171.5, 70.0, 173.0, 72.4, 176.0, 85.9,
          176.0, 78.8, 180.5, 77.8, 172.7, 66.2, 176.0, 86.4, 173.5, 81.8,
        ],
      },
    ],
    series_symbol_sizes: [6, 6],
    simplyKeys: [
      "width",
      "height",
      "font_family",
      "title_align",
      "sub_title_text",
      "sub_title_align",
      "legend_align",
      "type",
      "title_text",
      "y_axis_configs",
      "x_axis_config",
      "series_symbol_sizes",
      "series_list",
      "theme",
    ],
  }),
  scatterRegression: Object.assign({}, defaultOption, {
    type: "scatter",
    title_text: "Scatter Regression Chart",
    sub_title_text: "Polynomial fit",
    legend_align: "right",
    margin: {
      left: 5,
      top: 5,
      right: 20,
      bottom: 5,
    },
    regression: "polynomial",
    regression_order: 2,
    regression_label_show: true,
    series_symbol_sizes: [5, 5],
    series_list: [
      {
        name: "Trial A",
        data: [
          1, 4.8, 2, 6.9, 3, 9.6, 4, 11.2, 5, 14.1, 6, 15.3, 7, 18.8, 8, 20.6,
          9, 22.1, 10, 25.9,
        ],
      },
      {
        name: "Trial B",
        data: [
          1, 2.1, 2, 2.4, 3, 3.9, 4, 5.2, 5, 7.9, 6, 10.4, 7, 14.8, 8, 18.9, 9,
          24.6, 10, 30.2,
        ],
      },
    ],
    simplyKeys: [
      "width",
      "height",
      "margin",
      "font_family",
      "sub_title_text",
      "legend_align",
      "type",
      "title_text",
      "regression",
      "regression_order",
      "regression_label_show",
      "series_symbol_sizes",
      "series_list",
      "theme",
    ],
  }),
  bubbleChart: Object.assign({}, defaultOption, {
    type: "scatter",
    title_text: "Bubble Chart",
    sub_title_text: "Bubble size: orders",
    legend_align: "right",
    legend_category: "circle",
    bubble: true,
    bubble_min_size: 4,
    bubble_max_size: 30,
    tooltip_show: true,
    x_axis_title: "Ad spend",
    margin: {
      left: 5,
      top: 5,
      right: 20,
      bottom: 5,
    },
    y_axis_configs: [
      {
        axis_min: 0,
        axis_max: 120,
        axis_formatter: "{c}k",
        axis_title: "Revenue",
      },
    ],
    x_axis_config: {
      axis_min: 0,
      axis_max: 60,
      axis_formatter: "{c}k",
    },
    series_symbols: ["circle", "circle"],
    series_list: [
      {
        name: "Online",
        data: [
          8, 22, 120, 15, 38, 260, 24, 52, 410, 33, 71, 640, 42, 88, 520, 51,
          104, 900,
        ],
      },
      {
        name: "Retail",
        data: [
          6, 12, 80, 14, 20, 150, 22, 34, 300, 30, 40, 220, 40, 58, 480, 54,
          66, 360,
        ],
      },
    ],
    simplyKeys: [
      "width",
      "height",
      "margin",
      "font_family",
      "sub_title_text",
      "legend_align",
      "legend_category",
      "type",
      "title_text",
      "bubble",
      "bubble_min_size",
      "bubble_max_size",
      "x_axis_title",
      "y_axis_configs",
      "x_axis_config",
      "series_symbols",
      "series_list",
      "theme",
    ],
  }),
  candlestick: Object.assign({}, defaultOption, {
    type: "candlestick",
    y_axis_configs: [
      {
        axis_min: 2100,
        axis_max: 2460,
        axis_formatter: "{t}",
      },
    ],
    x_axis_hidden: false,
    y_axis_hidden: false,
    series_list: [
      {
        name: "MA5",
        category: "line",
        start_index: 5,
        data: [
          2352.93, 2378.48, 2394.81, 2409.64, 2420.04, 2426.66, 2429.33,
          2428.01, 2417.97, 2410.51, 2391.99, 2368.35, 2349.2, 2331.29, 2314.49,
          2322.42, 2331.49, 2321.01, 2327.6, 2334.39, 2326.13, 2317.95, 2325.39,
          2317.45, 2300.81, 2290.01, 2281.96, 2267.85, 2262.02, 2272.7, 2283.49,
          2293.46, 2310.8, 2318.85, 2315.63, 2298.04, 2279.71, 2261.25, 2247.26,
          2232.06, 2227.12, 2224.95, 2223.3, 2221.66, 2217.96, 2212.03, 2205.85,
          2199.38, 2194.99, 2202.56, 2214.61, 2212.55, 2217.45, 2217.79,
          2204.45,
        ],
      },
      {
        name: "日K",
        data: [
          2320.26, 2320.26, 2287.3, 2362.94, 2300.0, 2291.3, 2288.26, 2308.38,
          2295.35, 2346.5, 2295.35, 2346.92, 2347.22, 2358.98, 2337.35, 2363.8,
          2360.75, 2382.48, 2347.89, 2383.76, 2383.43, 2385.42, 2371.23,
          2391.82, 2377.41, 2419.02, 2369.57, 2421.15, 2425.92, 2428.15,
          2417.58, 2440.38, 2411.0, 2433.13, 2403.3, 2437.42, 2432.68, 2434.48,
          2427.7, 2441.73, 2430.69, 2418.53, 2394.22, 2433.89, 2416.62, 2432.4,
          2414.4, 2443.03, 2441.91, 2421.56, 2415.43, 2444.8, 2420.26, 2382.91,
          2373.53, 2427.07, 2383.49, 2397.18, 2370.61, 2397.94, 2378.82,
          2325.95, 2309.17, 2378.82, 2322.94, 2314.16, 2308.76, 2330.88,
          2320.62, 2325.82, 2315.01, 2338.78, 2313.74, 2293.34, 2289.89,
          2340.71, 2297.77, 2313.22, 2292.03, 2324.63, 2322.32, 2365.59,
          2308.92, 2366.16, 2364.54, 2359.51, 2330.86, 2369.65, 2332.08, 2273.4,
          2259.25, 2333.54, 2274.81, 2326.31, 2270.1, 2328.14, 2333.61, 2347.18,
          2321.6, 2351.44, 2340.44, 2324.29, 2304.27, 2352.02, 2326.42, 2318.61,
          2314.59, 2333.67, 2314.68, 2310.59, 2296.58, 2320.96, 2309.16, 2286.6,
          2264.83, 2333.29, 2282.17, 2263.97, 2253.25, 2286.33, 2255.77,
          2270.28, 2253.31, 2276.22, 2269.31, 2278.4, 2250.0, 2312.08, 2267.29,
          2240.02, 2239.21, 2276.05, 2244.26, 2257.43, 2232.02, 2261.31,
          2257.74, 2317.37, 2257.42, 2317.86, 2318.21, 2324.24, 2311.6, 2330.81,
          2321.4, 2328.28, 2314.97, 2332.0, 2334.74, 2326.72, 2319.91, 2344.89,
          2318.58, 2297.67, 2281.12, 2319.99, 2299.38, 2301.26, 2289.0, 2323.48,
          2273.55, 2236.3, 2232.91, 2273.55, 2238.49, 2236.62, 2228.81, 2246.87,
          2229.46, 2234.4, 2227.31, 2243.95, 2234.9, 2227.74, 2220.44, 2253.42,
          2232.69, 2225.29, 2217.25, 2241.34, 2196.24, 2211.59, 2180.67,
          2212.59, 2215.47, 2225.77, 2215.47, 2234.73, 2224.93, 2226.13,
          2212.56, 2233.04, 2236.98, 2219.55, 2217.26, 2242.48, 2218.09,
          2206.78, 2204.44, 2226.26, 2199.91, 2181.94, 2177.39, 2204.99,
          2169.63, 2194.85, 2165.78, 2196.43, 2195.03, 2193.8, 2178.47, 2197.51,
          2181.82, 2197.6, 2175.44, 2206.03, 2201.12, 2244.64, 2200.58, 2250.11,
          2236.4, 2242.17, 2232.26, 2245.12, 2242.62, 2184.54, 2182.81, 2242.62,
          2187.35, 2218.32, 2184.11, 2226.12, 2213.19, 2199.31, 2191.85,
          2224.63, 2203.89, 2177.91, 2173.86, 2210.58,
        ],
      },
    ],
    x_axis_data: [
      "2013/1/24",
      "2013/1/25",
      "2013/1/28",
      "2013/1/29",
      "2013/1/30",
      "2013/1/31",
      "2013/2/1",
      "2013/2/4",
      "2013/2/5",
      "2013/2/6",
      "2013/2/7",
      "2013/2/8",
      "2013/2/18",
      "2013/2/19",
      "2013/2/20",
      "2013/2/21",
      "2013/2/22",
      "2013/2/25",
      "2013/2/26",
      "2013/2/27",
      "2013/2/28",
      "2013/3/1",
      "2013/3/4",
      "2013/3/5",
      "2013/3/6",
      "2013/3/7",
      "2013/3/8",
      "2013/3/11",
      "2013/3/12",
      "2013/3/13",
      "2013/3/14",
      "2013/3/15",
      "2013/3/18",
      "2013/3/18",
      "2013/3/20",
      "2013/3/21",
      "2013/3/22",
      "2013/3/25",
      "2013/3/26",
      "2013/3/27",
      "2013/3/28",
      "2013/3/29",
      "2013/4/1",
      "2013/4/2",
      "2013/4/3",
      "2013/4/8",
      "2013/4/9",
      "2013/4/10",
      "2013/4/11",
      "2013/4/12",
      "2013/4/15",
      "2013/4/16",
      "2013/4/17",
      "2013/4/18",
      "2013/4/19",
      "2013/4/22",
      "2013/4/23",
      "2013/4/24",
      "2013/4/25",
      "2013/4/26",
    ],
    x_axis_margin: {
      left: 1,
      top: 0,
      right: 0,
      bottom: 0,
    },
    candlestick_up_color: "rgb(236, 0, 0)",
    candlestick_up_border_color: "rgb(138, 0, 0)",
    candlestick_down_color: "rgb(0, 218, 60)",
    candlestick_down_border_color: "rgb(0, 143, 40)",
  }),
  candlestickOhlc: Object.assign({}, defaultOption, {
    type: "candlestick",
    title_text: "OHLC Chart",
    sub_title_text: "open / close / lowest / highest",
    legend_show: false,
    candlestick_style: "ohlc",
    y_axis_configs: [
      {
        axis_min: 2150,
        axis_max: 2270,
        axis_formatter: "{t}",
      },
    ],
    x_axis_hidden: false,
    y_axis_hidden: false,
    series_list: [
      {
        name: "日K",
        data: [
          2232.69, 2225.29, 2217.25, 2241.34, 2196.24, 2211.59, 2180.67,
          2212.59, 2215.47, 2225.77, 2215.47, 2234.73, 2224.93, 2226.13,
          2212.56, 2233.04, 2236.98, 2219.55, 2217.26, 2242.48, 2218.09,
          2206.78, 2204.44, 2226.26, 2199.91, 2181.94, 2177.39, 2204.99,
          2169.63, 2194.85, 2165.78, 2196.43, 2195.03, 2193.8, 2178.47,
          2197.51, 2181.82, 2197.6, 2175.44, 2206.03, 2201.12, 2244.64, 2200.58,
          2250.11, 2236.4, 2242.17, 2232.26, 2245.12, 2242.62, 2184.54, 2182.81,
          2242.62, 2187.35, 2218.32, 2184.11, 2226.12, 2213.19, 2199.31,
          2191.85, 2224.63, 2203.89, 2177.91, 2173.86, 2210.58,
        ],
      },
    ],
    x_axis_data: [
      "2013/4/3",
      "2013/4/8",
      "2013/4/9",
      "2013/4/10",
      "2013/4/11",
      "2013/4/12",
      "2013/4/15",
      "2013/4/16",
      "2013/4/17",
      "2013/4/18",
      "2013/4/19",
      "2013/4/22",
      "2013/4/23",
      "2013/4/24",
      "2013/4/25",
      "2013/4/26",
    ],
    candlestick_up_color: "rgb(236, 0, 0)",
    candlestick_up_border_color: "rgb(138, 0, 0)",
    candlestick_down_color: "rgb(0, 218, 60)",
    candlestick_down_border_color: "rgb(0, 143, 40)",
    simplyKeys: [
      "width",
      "height",
      "font_family",
      "sub_title_text",
      "legend_show",
      "type",
      "title_text",
      "candlestick_style",
      "y_axis_configs",
      "series_list",
      "x_axis_data",
      "candlestick_up_color",
      "candlestick_up_border_color",
      "candlestick_down_color",
      "candlestick_down_border_color",
      "theme",
    ],
  }),
  tableBasic: Object.assign(
    {
      quality: 80,
      width: 600,
      height: 400,
      spans: [0.5, 0.3, 0.2],
      text_aligns: ["left", "center", "right"],
      header_row_padding: {
        left: 10,
        top: 10,
        right: 10,
        bottom: 10,
      },
      header_row_height: 30.0,
      header_font_size: 16.0,
    },
    {
      type: "table",
      title_height: 45,
      title_text: "NASDAQ",
      sub_title_text: "",
      data: [
        ["Name", "Price", "Change"],
        ["Datadog Inc", "97.32", "-7.49%"],
        ["Hashicorp Inc", "28.66", "-9.25%"],
        ["Gitlab Inc", "51.63", "+4.32%"],
      ],
      header_font_weight: "bold",
      text_aligns: ["left", "center", "right"],
      cell_styles: [
        {
          font_color: "#fff",
          font_weight: "bold",
          background_color: "#2d7c2b",
          indexes: [1, 2],
        },
      ],
      outlined: false,
      simplyKeys: [
        "width",
        "height",
        "spans",
        "text_aligns",
        "header_row_padding",
        "header_font_size",
        "type",
        "title_text",
        "data",
        "header_font_weight",
        "cell_styles",
        "theme",
      ],
    },
  ),
  heatmapBasic: Object.assign({}, defaultOption, {
    type: "heatmap",
    y_axis_data: [
      "Saturday",
      "Friday",
      "Thursday",
      "Wednesday",
      "Tuesday",
      "Monday",
      "Sunday",
    ],
    x_axis_data: [
      "12a",
      "1a",
      "2a",
      "3a",
      "4a",
      "5a",
      "6a",
      "7a",
      "8a",
      "9a",
      "10a",
      "11a",
      "12p",
      "1p",
      "2p",
      "3p",
      "4p",
      "5p",
      "6p",
      "7p",
      "8p",
      "9p",
      "10p",
      "11p",
    ],
    x_axis_hidden: false,
    y_axis_hidden: false,
    series: {
      min: 0,
      max: 10,
      min_color: "#f0d99c",
      max_color: "#bf444c",
      min_font_color: "#464646",
      max_font_color: "#eee",
      data: [
        [0, 9.0],
        [1, 3.0],
        [7, 3.0],
        [12, 3.0],
        [24, 12.0],
        [28, 10.0],
        [31, 8.0],
        [50, 4.0],
        [63, 2.0],
      ],
    },
    simplyKeys: [
      "width",
      "height",
      "theme",
      "y_axis_data",
      "x_axis_data",
      "series",
      "type",
    ],
  }),
  heatmapScale: {
    type: "heatmap",
    width: 600,
    height: 400,
    font_family: "Roboto",
    title_text: "Air Quality by Hour",
    tooltip_show: true,
    x_axis_data: ["0h", "3h", "6h", "9h", "12h", "15h", "18h", "21h"],
    y_axis_data: ["Mon", "Tue", "Wed", "Thu", "Fri"],
    series: {
      colors: ["#1a9850", "#a6d96a", "#fee08b", "#f46d43", "#a50026"],
      thresholds: [50, 100, 150, 200],
      data: [
        [0, 32], [1, 28], [2, 45], [3, 88], [4, 120], [5, 135], [6, 162],
        [7, 96], [8, 41], [9, 35], [10, 52], [11, 104], [12, 148], [13, 171],
        [14, 205], [15, 143], [16, 55], [17, 47], [18, 66], [19, 125],
        [20, 182], [21, 214], [22, 236], [23, 158], [24, 38], [25, 30],
        [26, 49], [27, 92], [28, 110], [29, 128], [30, 151], [31, 87],
        [32, 22], [33, 18], [34, 27], [35, 61], [36, 74], [37, 83], [38, 98],
        [39, 54],
      ],
    },
    simplyKeys: [
      "width",
      "height",
      "font_family",
      "type",
      "title_text",
      "tooltip_show",
      "x_axis_data",
      "y_axis_data",
      "series",
      "theme",
    ],
  },
  heatmapPunchCard: {
    type: "heatmap",
    width: 600,
    height: 400,
    font_family: "Roboto",
    title_text: "Commits by Hour",
    tooltip_show: true,
    x_axis_data: [
      "0h", "2h", "4h", "6h", "8h", "10h", "12h", "14h", "16h", "18h", "20h",
      "22h",
    ],
    y_axis_data: ["Sun", "Sat", "Fri", "Thu", "Wed", "Tue", "Mon"],
    series: {
      symbol: "circle",
      min: 0,
      min_color: "#9ecae1",
      max_color: "#08519c",
      data: [
        [1, 1], [5, 2], [6, 3], [7, 1], [9, 2], [10, 1], [14, 1], [17, 2],
        [18, 4], [19, 3], [20, 2], [22, 1], [28, 3], [29, 8], [30, 6], [31, 9],
        [32, 7], [33, 4], [34, 2], [40, 5], [41, 11], [42, 8], [43, 12],
        [44, 10], [45, 5], [46, 3], [47, 1], [51, 1], [52, 6], [53, 12],
        [54, 9], [55, 14], [56, 11], [57, 6], [58, 2], [64, 4], [65, 10],
        [66, 7], [67, 13], [68, 9], [69, 7], [70, 4], [71, 2], [75, 2], [76, 7],
        [77, 9], [78, 6], [79, 10], [80, 8], [81, 3], [82, 1],
      ],
    },
    simplyKeys: [
      "width",
      "height",
      "font_family",
      "type",
      "title_text",
      "tooltip_show",
      "x_axis_data",
      "y_axis_data",
      "series",
      "theme",
    ],
  },
  calendarChart: {
    type: "calendar",
    title_text: "2024 Contributions",
    start_date: "2024-01-01",
    end_date: "2024-12-31",
    cell_size: 11,
    cell_gap: 2,
    min_color: "#ebedf0",
    max_color: "#216e39",
    data: [
      ["2024-01-05", 2],
      ["2024-02-14", 8],
      ["2024-06-15", 9],
      ["2024-09-01", 4],
      ["2024-12-25", 10],
    ],
    simplyKeys: [
      "type",
      "title_text",
      "start_date",
      "end_date",
      "cell_size",
      "cell_gap",
      "min_color",
      "max_color",
      "data",
      "theme",
    ],
  },
  funnelChart: Object.assign({}, defaultOption, {
    type: "funnel",
    title_text: "Funnel Chart",
    series_label_position: "inside",
    funnel_gap: 4,
    series_list: [
      { name: "Impression", data: [60000] },
      { name: "Click", data: [40000] },
      { name: "Inquiry", data: [20000] },
      { name: "Order", data: [8000] },
      { name: "Re-order", data: [2000] }
    ]
  }),
  waterfallChart: Object.assign({}, defaultOption, {
    type: "waterfall",
    title_text: "Waterfall Chart",
    x_axis_data: ["Initial", "Revenue", "Services", "Purchases", "Marketing", "Profit"],
    data: [
      [900, false],
      [345, false],
      [393, false],
      [-108, false],
      [-154, false],
      [0, true]
    ]
  }),
  gaugeChart: Object.assign({}, defaultOption, {
    type: "gauge",
    title_text: "Gauge",
    min: 0,
    max: 200,
    series_list: [{ name: "Speed", data: [120] }]
  }),
  gaugeSegments: {
    type: "gauge",
    width: 600,
    height: 400,
    font_family: "Roboto",
    title_text: "Speed",
    title_align: "left",
    legend_show: false,
    min: 0,
    max: 200,
    split_number: 4,
    thresholds: [80, 140],
    colors: ["#91cc75", "#fac858", "#ee6666"],
    value_formatter: "{c} km/h",
    series_list: [{ name: "Now", data: [156] }],
    simplyKeys: [
      "width",
      "height",
      "font_family",
      "type",
      "title_text",
      "title_align",
      "legend_show",
      "min",
      "max",
      "split_number",
      "thresholds",
      "colors",
      "value_formatter",
      "series_list",
      "theme",
    ],
  },
  gaugeRings: {
    type: "gauge",
    width: 600,
    height: 400,
    font_family: "Roboto",
    title_text: "Activity",
    legend_show: false,
    multi_ring: true,
    start_angle: 360,
    sweep_angle: 360,
    arc_width: 22,
    value_formatter: "{c}%",
    series_list: [
      { name: "Move", data: [82] },
      { name: "Exercise", data: [64] },
      { name: "Stand", data: [45] },
    ],
    simplyKeys: [
      "width",
      "height",
      "font_family",
      "type",
      "title_text",
      "legend_show",
      "multi_ring",
      "start_angle",
      "sweep_angle",
      "arc_width",
      "value_formatter",
      "series_list",
      "theme",
    ],
  },
  treemapChart: Object.assign({}, defaultOption, {
    type: "treemap",
    title_text: "Disk Usage",
    item_gap: 3,
    series_list: [
      { name: "nodeExcel", data: [600] },
      { name: "nodePPT", data: [500] },
      { name: "nodeDoc", data: [400] },
      { name: "nodeWeb", data: [300] },
      { name: "nodeWord", data: [200] },
      { name: "nodeOther", data: [100] },
    ],
    simplyKeys: [
      "width",
      "height",
      "font_family",
      "type",
      "title_text",
      "item_gap",
      "series_list",
      "theme",
    ],
  }),
  boxPlotChart: {
    type: "box_plot",
    width: 600,
    height: 400,
    font_family: "Roboto",
    title_text: "Box Plot",
    x_axis_data: ["Cat A", "Cat B", "Cat C"],
    box_series: [
      {
        name: "Group 1",
        data: [
          [3, 10, 18, 28, 40],
          [5, 14, 22, 32, 45],
          [1,  8, 15, 24, 35],
        ],
      },
      {
        name: "Group 2",
        data: [
          [5, 13, 21, 31, 43],
          [2,  9, 17, 26, 38],
          [4, 11, 19, 29, 41],
        ],
      },
    ],
    simplyKeys: [
      "width",
      "height",
      "font_family",
      "type",
      "title_text",
      "x_axis_data",
      "box_series",
      "theme",
    ],
  },
  sunburstChart: {
    type: "sunburst",
    width: 600,
    height: 400,
    font_family: "Roboto",
    title_text: "Sunburst",
    inner_radius: 20,
    level_thickness: [2.0, 1.0, 1.0],
    animation: {
      duration: 1000,
      easing: "ease-out",
      delay: 100,
    },
    series_data: [
      {
        name: "Grandpa",
        children: [
          {
            name: "Uncle Leo",
            children: [
              { name: "Cousin Jack", value: 18 },
              { name: "Cousin Mary", value: 12 },
            ],
          },
          {
            name: "Father",
            children: [
              { name: "Me", value: 40 },
              { name: "Brother Peter", value: 20 },
            ],
          },
        ],
      },
      {
        name: "Nancy",
        children: [
          {
            name: "Uncle Nike",
            children: [
              { name: "Cousin Betty", value: 10 },
              { name: "Cousin Jenny", value: 30 },
            ],
          },
        ],
      },
    ],
    simplyKeys: [
      "width",
      "height",
      "font_family",
      "type",
      "title_text",
      "inner_radius",
      "level_thickness",
      "series_data",
      "animation",
      "theme",
    ],
  },
  sankeyChart: {
    type: "sankey",
    width: 600,
    height: 400,
    font_family: "Roboto",
    title_text: "Energy Flow",
    node_align: "justify",
    link_gradient: true,
    animation: {
      duration: 1000,
      easing: "ease-out",
      delay: 100,
    },
    nodes: [
      { name: "Coal" },
      { name: "Gas" },
      { name: "Solar" },
      { name: "Electricity" },
      { name: "Heat" },
      { name: "Residential" },
      { name: "Industrial" },
      { name: "Commercial" },
    ],
    links: [
      { source: "Coal", target: "Electricity", value: 25 },
      { source: "Coal", target: "Heat", value: 10 },
      { source: "Gas", target: "Electricity", value: 15 },
      { source: "Gas", target: "Heat", value: 20 },
      { source: "Solar", target: "Electricity", value: 10 },
      { source: "Electricity", target: "Residential", value: 18 },
      { source: "Electricity", target: "Industrial", value: 22 },
      { source: "Electricity", target: "Commercial", value: 10 },
      { source: "Heat", target: "Residential", value: 12 },
      { source: "Heat", target: "Industrial", value: 18 },
    ],
    simplyKeys: [
      "width",
      "height",
      "font_family",
      "type",
      "title_text",
      "node_align",
      "link_gradient",
      "nodes",
      "links",
      "animation",
      "theme",
    ],
  },
  sankeyVertical: {
    type: "sankey",
    width: 600,
    height: 400,
    font_family: "Roboto",
    title_text: "Energy Flow",
    orient: "vertical",
    node_align: "justify",
    link_gradient: true,
    tooltip_show: true,
    nodes: [
      { name: "Coal" },
      { name: "Gas" },
      { name: "Solar" },
      { name: "Electricity" },
      { name: "Heat" },
      { name: "Residential" },
      { name: "Industrial" },
      { name: "Commercial" },
    ],
    links: [
      { source: "Coal", target: "Electricity", value: 25 },
      { source: "Coal", target: "Heat", value: 10 },
      { source: "Gas", target: "Electricity", value: 15 },
      { source: "Gas", target: "Heat", value: 20 },
      { source: "Solar", target: "Electricity", value: 10 },
      { source: "Electricity", target: "Residential", value: 18 },
      { source: "Electricity", target: "Industrial", value: 22 },
      { source: "Electricity", target: "Commercial", value: 10 },
      { source: "Heat", target: "Residential", value: 12 },
      { source: "Heat", target: "Industrial", value: 18 },
    ],
    simplyKeys: [
      "width",
      "height",
      "font_family",
      "type",
      "title_text",
      "orient",
      "node_align",
      "link_gradient",
      "nodes",
      "links",
      "theme",
    ],
  },
  treeChart: {
    type: "tree",
    width: 600,
    height: 400,
    font_family: "Roboto",
    title_text: "Tree",
    orient: "LR",
    symbol_size: 6,
    series_data: [
      {
        name: "Root",
        children: [
          {
            name: "Branch A",
            children: [
              { name: "Leaf A1", value: 10 },
              { name: "Leaf A2", value: 8 },
            ],
          },
          {
            name: "Branch B",
            children: [
              { name: "Leaf B1", value: 12 },
              { name: "Leaf B2", value: 6 },
              { name: "Leaf B3", value: 4 },
            ],
          },
        ],
      },
    ],
    simplyKeys: [
      "width",
      "height",
      "font_family",
      "type",
      "title_text",
      "orient",
      "symbol_size",
      "series_data",
      "theme",
    ],
  },
  treeRadial: {
    type: "tree",
    width: 700,
    height: 680,
    font_family: "Roboto",
    title_text: "Radial Tree",
    layout: "radial",
    edge_shape: "curve",
    tooltip_show: true,
    series_data: [
      {
        name: "flare",
        children: [
          {
            name: "analytics",
            children: [
              {
                name: "cluster",
                children: [
                  { name: "Agglomerative" },
                  { name: "Community" },
                  { name: "Hierarchical" },
                ],
              },
              {
                name: "graph",
                children: [
                  { name: "Betweenness" },
                  { name: "LinkDistance" },
                  { name: "MaxFlow" },
                  { name: "ShortestPaths" },
                ],
              },
            ],
          },
          {
            name: "animate",
            children: [
              { name: "Easing" },
              { name: "Parallel" },
              { name: "Pause" },
              { name: "Scheduler" },
              { name: "Sequence" },
              { name: "Transition" },
            ],
          },
          {
            name: "data",
            children: [
              {
                name: "converters",
                children: [
                  { name: "Converters" },
                  { name: "GraphML" },
                  { name: "JSON" },
                ],
              },
              { name: "DataField" },
              { name: "DataSchema" },
              { name: "DataSet" },
            ],
          },
          {
            name: "display",
            children: [
              { name: "DirtySprite" },
              { name: "LineSprite" },
              { name: "RectSprite" },
              { name: "TextSprite" },
            ],
          },
        ],
      },
    ],
    simplyKeys: [
      "width",
      "height",
      "font_family",
      "type",
      "title_text",
      "layout",
      "edge_shape",
      "tooltip_show",
      "series_data",
      "theme",
    ],
  },
  histogramChart: Object.assign({}, defaultOption, {
    type: "histogram",
    title_text: "Height Distribution",
    sub_title_text: "Data from: Heinz 2003",
    legend_align: "right",
    legend_category: "rect",
    bin_width: 5,
    bar_gap: 1,
    percent: false,
    x_axis_title: "Height (cm)",
    tooltip_show: true,
    series_list: [
      {
        name: "Female",
        data: [
          161.2, 167.5, 159.5, 157.0, 155.8, 170.0, 159.1, 166.0, 176.2, 160.2,
          172.5, 170.9, 172.9, 153.4, 160.0, 147.2, 168.2, 175.0, 157.0, 167.6,
          159.5, 175.0, 166.8, 176.5, 170.2,
        ],
      },
      {
        name: "Male",
        data: [
          174.0, 175.3, 193.5, 186.5, 187.2, 181.5, 184.0, 184.5, 175.0, 184.0,
          180.0, 177.8, 192.0, 176.0, 174.0, 184.0, 192.7, 171.5, 173.0, 176.0,
          176.0, 180.5, 172.7, 176.0, 173.5,
        ],
      },
    ],
    simplyKeys: [
      "width",
      "height",
      "font_family",
      "type",
      "title_text",
      "sub_title_text",
      "legend_align",
      "legend_category",
      "bin_width",
      "percent",
      "x_axis_title",
      "tooltip_show",
      "series_list",
      "theme",
    ],
  }),
  polarBarChart: {
    type: "polar_bar",
    width: 600,
    height: 400,
    font_family: "Roboto",
    title_text: "Polar Bar",
    legend_align: "left",
    legend_category: "rect",
    category_axis: "angle",
    inner_radius: 30,
    category_gap: 0.2,
    tooltip_show: true,
    y_axis_configs: [
      {
        axis_max: 600,
        axis_split_number: 4,
      },
    ],
    animation: {
      duration: 1000,
      easing: "ease-out",
      delay: 80,
    },
    x_axis_data: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    series_list: [
      {
        name: "Email",
        stack: "total",
        data: [120.0, 132.0, 101.0, 134.0, 90.0, 230.0, 210.0],
      },
      {
        name: "Union Ads",
        stack: "total",
        data: [220.0, 182.0, 191.0, 234.0, 290.0, 330.0, 310.0],
      },
    ],
    simplyKeys: [
      "width",
      "height",
      "font_family",
      "type",
      "title_text",
      "legend_align",
      "legend_category",
      "category_axis",
      "inner_radius",
      "y_axis_configs",
      "x_axis_data",
      "series_list",
      "animation",
      "theme",
    ],
  },
  polarBarRadial: {
    type: "polar_bar",
    width: 600,
    height: 400,
    font_family: "Roboto",
    title_text: "Daily Goals",
    legend_show: false,
    category_axis: "radius",
    round_cap: true,
    start_angle: 0,
    end_angle: 270,
    tooltip_show: true,
    series_label_formatter: "{c}%",
    y_axis_configs: [
      {
        axis_max: 100,
        axis_split_number: 5,
      },
    ],
    x_axis_data: ["Sleep", "Steps", "Water", "Reading"],
    series_list: [
      {
        name: "Done",
        label_show: true,
        data: [92, 74, 61, 48],
        colors: ["#5470c6", "#91cc75", "#fac858", "#ee6666"],
      },
    ],
    simplyKeys: [
      "width",
      "height",
      "font_family",
      "type",
      "title_text",
      "legend_show",
      "category_axis",
      "round_cap",
      "end_angle",
      "series_label_formatter",
      "y_axis_configs",
      "x_axis_data",
      "series_list",
      "theme",
    ],
  },
  chordChart: {
    type: "chord",
    width: 600,
    height: 400,
    font_family: "Roboto",
    title_text: "Trade Flows",
    node_width: 12,
    node_gap: 3,
    link_opacity: 0.5,
    link_gradient: true,
    tooltip_show: true,
    animation: {
      duration: 1000,
      easing: "ease-out",
      delay: 100,
    },
    nodes: [
      { name: "Asia" },
      { name: "Europe" },
      { name: "Americas" },
      { name: "Africa" },
      { name: "Oceania" },
    ],
    links: [
      { source: "Asia", target: "Europe", value: 60 },
      { source: "Asia", target: "Americas", value: 45 },
      { source: "Asia", target: "Oceania", value: 15 },
      { source: "Europe", target: "Americas", value: 50 },
      { source: "Europe", target: "Africa", value: 25 },
      { source: "Americas", target: "Asia", value: 30 },
      { source: "Africa", target: "Asia", value: 20 },
      { source: "Oceania", target: "Europe", value: 10 },
    ],
    simplyKeys: [
      "width",
      "height",
      "font_family",
      "type",
      "title_text",
      "link_gradient",
      "nodes",
      "links",
      "animation",
      "theme",
    ],
  },
  parallelChart: {
    type: "parallel",
    width: 600,
    height: 400,
    font_family: "Roboto",
    title_text: "Parallel",
    title_align: "left",
    legend_align: "right",
    x_axis_data: ["Price", "Weight", "Battery", "Rating"],
    y_axis_configs: [
      { axis_min: 0, axis_max: 200, axis_formatter: "${c}" },
      { axis_min: 0, axis_max: 6, axis_formatter: "{c} kg" },
      { axis_min: 0, axis_max: 24, axis_formatter: "{c} h" },
      { axis_min: 0, axis_max: 5 },
    ],
    series_list: [
      { name: "Model A", data: [120, 3.2, 12, 4.5] },
      { name: "Model B", data: [90, 4.1, 18, 3.8] },
      { name: "Model C", data: [160, 2.4, 9, 4.8] },
      { name: "Model D", data: [60, 5.2, 21, 3.1] },
    ],
    simplyKeys: [
      "width",
      "height",
      "font_family",
      "type",
      "title_text",
      "title_align",
      "legend_align",
      "x_axis_data",
      "y_axis_configs",
      "series_list",
      "theme",
    ],
  },
  graphChart: {
    type: "graph",
    width: 600,
    height: 400,
    font_family: "Roboto",
    title_text: "Team Graph",
    layout: "force",
    symbol_size: 10,
    tooltip_show: true,
    categories: ["Team", "Tool", "Service"],
    nodes: [
      { name: "Ann", category: 0, value: 5 },
      { name: "Bob", category: 0, value: 3 },
      { name: "Cid", category: 0, value: 2 },
      { name: "Git", category: 1, value: 4 },
      { name: "CI", category: 1, value: 3 },
      { name: "Docs", category: 1, value: 1 },
      { name: "API", category: 2, value: 4 },
      { name: "Web", category: 2, value: 2 },
    ],
    links: [
      { source: "Ann", target: "Bob", value: 3 },
      { source: "Ann", target: "Cid", value: 1 },
      { source: "Bob", target: "Cid", value: 1 },
      { source: "Ann", target: "Git", value: 2 },
      { source: "Bob", target: "Git", value: 2 },
      { source: "Cid", target: "Git", value: 1 },
      { source: "Ann", target: "Docs", value: 1 },
      { source: "Cid", target: "Docs", value: 2 },
      { source: "Git", target: "CI", value: 3 },
      { source: "CI", target: "API", value: 2 },
      { source: "CI", target: "Web", value: 1 },
      { source: "Bob", target: "API", value: 2 },
      { source: "Cid", target: "Web", value: 1 },
      { source: "API", target: "Web", value: 2 },
      { source: "Docs", target: "Web", value: 1 },
    ],
    simplyKeys: [
      "width",
      "height",
      "font_family",
      "type",
      "title_text",
      "layout",
      "categories",
      "nodes",
      "links",
      "theme",
    ],
  },
  ganttChart: {
    type: "gantt",
    width: 600,
    height: 400,
    font_family: "Roboto",
    title_text: "Website Relaunch",
    title_align: "left",
    legend_align: "right",
    legend_category: "round_rect",
    tooltip_show: true,
    now: "2024-03-19",
    tasks: [
      {
        name: "Research",
        category: "Plan",
        start: "2024-03-04",
        end: "2024-03-08",
        progress: 1,
      },
      {
        name: "Wireframes",
        category: "Design",
        start: "2024-03-07",
        end: "2024-03-14",
        progress: 1,
      },
      {
        name: "Visual design",
        category: "Design",
        start: "2024-03-12",
        end: "2024-03-22",
        progress: 0.7,
      },
      { name: "Design sign-off", category: "Design", start: "2024-03-22" },
      {
        name: "Frontend",
        category: "Build",
        start: "2024-03-18",
        end: "2024-04-05",
        progress: 0.1,
      },
      {
        name: "Backend",
        category: "Build",
        start: "2024-03-14",
        end: "2024-04-02",
        progress: 0.3,
      },
      {
        name: "Testing",
        category: "Launch",
        start: "2024-04-01",
        end: "2024-04-10",
      },
      { name: "Go live", category: "Launch", start: "2024-04-11" },
    ],
    simplyKeys: [
      "width",
      "height",
      "font_family",
      "type",
      "title_text",
      "title_align",
      "legend_align",
      "legend_category",
      "tooltip_show",
      "now",
      "tasks",
      "theme",
    ],
  },
  mapChart: {
    type: "map",
    width: 600,
    height: 400,
    font_family: "Roboto",
    title_text: "Population by Region",
    title_align: "left",
    sub_title_text: "thousands",
    sub_title_align: "left",
    projection: "mercator",
    label_show: true,
    tooltip_show: true,
    colors: ["#eff3ff", "#bdd7e7", "#6baed6", "#3182bd", "#08519c"],
    thresholds: [100, 250, 400, 550],
    data: [
      ["Alder", 412],
      ["Birch", 268],
      ["Cedar", 530],
      ["Dune", 145],
      ["Elm", 96],
      ["Fir", 325],
      ["Glen", 610],
      ["Heath", 204],
      ["Ivy", 78],
      ["Juniper", 356],
    ],
    geo_json: mapGeoJson,
    simplyKeys: [
      "width",
      "height",
      "font_family",
      "type",
      "title_text",
      "title_align",
      "sub_title_text",
      "sub_title_align",
      "label_show",
      "tooltip_show",
      "colors",
      "thresholds",
      "data",
      "geo_json",
      "theme",
    ],
  },
  multiChart: {
    type: "multi_chart",
    margin: {
      left: 10,
      top: 10,
      right: 10,
      bottom: 10,
    },
    background_color: "#fff",
    child_charts: [
      Object.assign({}, defaultOption, {
        width: 400,
        height: 300,
        type: "bar",
        title_text: "Bar Chart",
        title_align: "right",
        legend_align: "left",
        x_axis_data: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
        series_list: [
          {
            name: "Email",
            label_show: true,
            data: [120.0, 132.0, 101.0, 134.0, 90.0, 230.0, 210.0],
          },
          {
            name: "Union Ads",
            label_show: true,
            data: [220.0, 182.0, 191.0, 234.0, 290.0, 330.0, 310.0],
          },
        ],
      }),
      Object.assign({}, defaultOption, {
        width: 400,
        height: 300,
        x: 420,
        y: 10,
        type: "line",
        title_text: "Line Chart",
        title_align: "left",
        legend_align: "right",
        legend_category: "round_rect",
        x_axis_data: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
        x_boundary_gap: false,
        margin: {
          left: 15,
          top: 15,
          right: 15,
          bottom: 15,
        },
        series_list: [
          {
            name: "Email",
            label_show: true,
            data: [120.0, 132.0, 101.0, 134.0, 90.0, 230.0, 210.0],
          },
          {
            name: "Union Ads",
            label_show: true,
            data: [220.0, 182.0, 191.0, 234.0, 290.0, 330.0, 310.0],
          },
        ],
      }),
      Object.assign({}, defaultOption, {
        width: 400,
        height: 300,
        x: 10,
        y: 320,
        type: "scatter",
        title_text: "Height and weight",
        title_align: "left",
        sub_title_text: "Data from: Heinz 2003",
        sub_title_align: "left",
        legend_align: "right",
        margin: {
          left: 5,
          top: 5,
          right: 20,
          bottom: 5,
        },
        y_axis_configs: [
          {
            axis_min: 40,
            axis_max: 100,
            axis_formatter: "{c} kg",
          },
        ],
        x_axis_config: {
          axis_min: 140,
          axis_max: 200,
          axis_formatter: "{c} cm",
        },
        series_list: [
          {
            name: "Female",
            data: [
              161.2, 51.6, 167.5, 59.0, 159.5, 49.2, 157.0, 63.0, 155.8, 53.6,
              170.0, 59.0, 159.1, 47.6, 166.0, 69.8, 176.2, 66.8, 160.2, 75.2,
              172.5, 55.2, 170.9, 54.2, 172.9, 62.5, 153.4, 42.0, 160.0, 50.0,
              147.2, 49.8, 168.2, 49.2, 175.0, 73.2, 157.0, 47.8, 167.6, 68.8,
              159.5, 50.6, 175.0, 82.5, 166.8, 57.2, 176.5, 87.8, 170.2, 72.8,
            ],
          },
          {
            name: "Male",
            data: [
              174.0, 65.6, 175.3, 71.8, 193.5, 80.7, 186.5, 72.6, 187.2, 78.8,
              181.5, 74.8, 184.0, 86.4, 184.5, 78.4, 175.0, 62.0, 184.0, 81.6,
              180.0, 76.6, 177.8, 83.6, 192.0, 90.0, 176.0, 74.6, 174.0, 71.0,
              184.0, 79.6, 192.7, 93.8, 171.5, 70.0, 173.0, 72.4, 176.0, 85.9,
              176.0, 78.8, 180.5, 77.8, 172.7, 66.2, 176.0, 86.4, 173.5, 81.8,
            ],
          },
        ],
        series_symbol_sizes: [6, 6],
      }),
      Object.assign({}, defaultOption, {
        width: 400,
        height: 300,
        x: 420,
        y: 320,
        type: "pie",
        title_text: "Nightingale Chart",
        legend_margin: {
          top: 50,
        },
        series_list: [
          {
            name: "rose 1",
            data: [40],
          },
          {
            name: "rose 2",
            data: [38],
          },
          {
            name: "rose 3",
            data: [32],
          },
          {
            name: "rose 4",
            data: [30],
          },
          {
            name: "rose 5",
            data: [28],
          },
          {
            name: "rose 6",
            data: [26],
          },
          {
            name: "rose 7",
            data: [22],
          },
          {
            name: "rose 8",
            data: [18],
          },
        ],
      }),
    ],
  },
};

interface AppState {
  lang: Lang;
  version: string;
  theme: string;
  format: string;
  svg: string;
  imageData: string;
  fontFamilies: string[];
  themes: string[];
  fontFamily: string;
  width: number;
  height: number;
  editor: editor.IStandaloneCodeEditor | null;
  processing: boolean;
  simply: boolean;
  currentChartType: string;
  galleryQuery: string;
  galleryExpanded: boolean;
  editorHeight: number;
  editorCollapsed: boolean;
  jsonError: string;
  renderMs: number | null;
  outputBytes: number | null;
  previewFit: boolean;
  compact: boolean;
  lastOkAt: number | null;
  mcpOpen: boolean;
}

// The server lays charts out with its embedded Roboto, and a browser has no
// such font unless it happens to be installed: an svg would then be drawn in a
// substitute the layout was not measured for. Load the server's own copy.
function loadChartFont() {
  if (typeof FontFace === "undefined") {
    return;
  }
  new FontFace("Roboto", "url(./api/fonts/default)").load().then(
    (face) => document.fonts.add(face),
    () => {
      // no server (static preview): the browser keeps its substitute
    },
  );
}
loadChartFont();

// Gallery thumbnails are the examples themselves, rendered by the server in
// the current theme. A few at a time, so opening the page does not queue fifty
// renders in front of the chart the visitor is looking at.
const THUMB_CONCURRENCY = 4;
const thumbCache = new Map<string, Promise<string>>();
const thumbQueue: Array<() => void> = [];
let thumbRunning = 0;

function runThumbTask<T>(task: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const run = () => {
      thumbRunning++;
      task()
        .then(resolve, reject)
        .finally(() => {
          thumbRunning--;
          thumbQueue.shift()?.();
        });
    };
    if (thumbRunning < THUMB_CONCURRENCY) {
      run();
    } else {
      thumbQueue.push(run);
    }
  });
}

function loadThumb(chartType: string, theme: string): Promise<string> {
  const key = `${theme}:${chartType}`;
  let pending = thumbCache.get(key);
  if (!pending) {
    pending = runThumbTask(async () => {
      const options: Record<string, unknown> = {
        ...(chartDefaultOptions[chartType] as Record<string, unknown>),
        theme,
        compact: true,
      };
      delete options.simplyKeys;
      const { data } = await axios.post<string>("./api/charts/svg", options);
      return data;
    });
    // a failed render may succeed later (server restarted, theme registered)
    pending.catch(() => thumbCache.delete(key));
    thumbCache.set(key, pending);
  }
  return pending;
}

// The thumbnail svg lives in a shadow root: its ids and styles stay its own,
// and unlike an svg shown as an image it can use the fonts of the page.
const THUMB_STYLE =
  "<style>svg{display:block;width:100%;height:100%;pointer-events:none}</style>";

function ChartThumb({
  chartType,
  theme,
  glyph,
}: {
  chartType: string;
  theme: string;
  glyph: GlyphKind;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const hostRef = useRef<HTMLSpanElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    let cancelled = false;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) {
          return;
        }
        observer.disconnect();
        loadThumb(chartType, theme).then(
          (svg) => {
            const host = hostRef.current;
            if (cancelled || !host) {
              return;
            }
            const root = host.shadowRoot || host.attachShadow({ mode: "open" });
            root.innerHTML = THUMB_STYLE + svg;
            // fill the frame like object-fit: cover
            root
              .querySelector("svg")
              ?.setAttribute("preserveAspectRatio", "xMidYMid slice");
            setReady(true);
          },
          () => {
            // keep the glyph: the gallery still works without thumbnails
          },
        );
      },
      { rootMargin: "240px" },
    );
    observer.observe(el);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [chartType, theme]);

  return (
    <span className={`chart-thumb${ready ? " is-ready" : ""}`} ref={ref}>
      <span className="chart-thumb-glyph">
        <ChartGlyph kind={glyph} />
      </span>
      <span className="chart-thumb-svg" ref={hostRef} aria-hidden="true" />
    </span>
  );
}

// Like JSON.stringify(value, null, 2), but an array of plain values stays on
// one line while it fits, so data and coordinates read as rows, not columns.
function stringifyJson(value: unknown, indent = ""): string {
  const next = `${indent}  `;
  if (Array.isArray(value)) {
    if (value.every((item) => item === null || typeof item !== "object")) {
      const line = `[${value.map((item) => JSON.stringify(item) ?? "null").join(", ")}]`;
      if (indent.length + line.length <= 80) {
        return line;
      }
    }
    const items = value.map((item) => next + stringifyJson(item, next));
    return `[\n${items.join(",\n")}\n${indent}]`;
  }
  if (value !== null && typeof value === "object") {
    const items = Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(
        ([key, item]) =>
          `${next}${JSON.stringify(key)}: ${stringifyJson(item, next)}`,
      );
    return items.length ? `{\n${items.join(",\n")}\n${indent}}` : "{}";
  }
  return JSON.stringify(value) ?? "null";
}

function formatJson(data: Record<string, unknown>) {
  const keys = Object.keys(data).sort();
  const result: Record<string, unknown> = {};
  keys.forEach((key) => {
    result[key] = data[key];
  });
  return stringifyJson(result);
}

function formatBytes(size: number) {
  if (size < 1024) {
    return `${size} B`;
  }
  const kb = size / 1024;
  return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
}

const DEFAULT_EDITOR_HEIGHT = 280;
const MIN_EDITOR_HEIGHT = 140;
const MAX_EDITOR_HEIGHT_RATIO = 0.62;

class App extends Component<any, AppState> {
  editorInited: boolean;
  editorDom: RefObject<HTMLDivElement | null>;
  galleryScrollRef: RefObject<HTMLDivElement | null>;
  chartRequestId: number;
  debounceTimer: ReturnType<typeof setTimeout> | null;
  contentChangeDisposable: { dispose: () => void } | null;
  editorInstance: editor.IStandaloneCodeEditor | null;
  resizing: boolean;
  resizeStartY: number;
  resizeStartHeight: number;
  /** Skip auto-run when we programmatically set editor value. */
  ignoreContentChange: boolean;

  constructor(props: any) {
    super(props);
    this.editorDom = createRef();
    this.galleryScrollRef = createRef();
    this.editorInited = false;
    this.chartRequestId = 0;
    this.debounceTimer = null;
    this.contentChangeDisposable = null;
    this.editorInstance = null;
    this.resizing = false;
    this.resizeStartY = 0;
    this.resizeStartHeight = DEFAULT_EDITOR_HEIGHT;
    this.ignoreContentChange = false;

    const prefs = loadPrefs();
    const initialType =
      prefs.currentChartType && findChartOption(prefs.currentChartType)
        ? prefs.currentChartType
        : featuredCategory.items[0]?.value || chartOptions[0].value;

    this.state = {
      lang: prefs.lang === "zh" || prefs.lang === "en" ? prefs.lang : detectLang(),
      version: "",
      theme: prefs.theme || "grafana",
      format: prefs.format || formatOptions[0].value,
      fontFamilies: [],
      fontFamily: prefs.fontFamily || "",
      themes: [],
      editor: null,
      width: 0,
      height: 0,
      svg: "",
      imageData: "",
      processing: false,
      simply: prefs.simply ?? true,
      currentChartType: initialType,
      galleryQuery: "",
      // the page opens on the gallery: browse first, then pick a chart
      galleryExpanded: true,
      editorHeight: prefs.editorHeight || DEFAULT_EDITOR_HEIGHT,
      editorCollapsed: prefs.editorCollapsed ?? false,
      jsonError: "",
      renderMs: null,
      outputBytes: null,
      previewFit: prefs.previewFit ?? true,
      compact: prefs.compact ?? true,
      lastOkAt: null,
      mcpOpen: false,
    };
  }

  async componentDidMount(): Promise<void> {
    // In development React StrictMode mounts, unmounts and mounts again:
    // whatever componentWillUnmount tears down is set up on every mount, and
    // only the editor itself is created once.
    window.addEventListener("keydown", this.handleGlobalKeydown);
    window.addEventListener("mousemove", this.handleResizeMove);
    window.addEventListener("mouseup", this.handleResizeEnd);
    this.syncDocumentLang();
    if (this.editorInited) {
      this.bindEditorChange();
      return;
    }
    this.editorInited = true;

    const ed = createEditor({
      dom: this.editorDom.current as HTMLElement,
    });
    this.editorInstance = ed;
    this.bindEditorChange();

    this.setState({ editor: ed }, () => {
      this.changeChartOption(this.state.currentChartType);
      // the gallery opens from its top, not at the chart of the last visit
      if (!this.state.galleryExpanded) {
        requestAnimationFrame(() => this.scrollActiveIntoView());
      }
    });

    try {
      const { data } = await axios.get<{
        families: string[];
        version: string;
        themes: string[];
      }>("./api/basic-info");
      this.setState({
        fontFamilies: data.families,
        version: data.version,
        themes: data.themes,
      });
    } catch {
      // basic-info is optional for local static preview
    }
  }

  componentDidUpdate(_prev: Readonly<any>, prevState: Readonly<AppState>) {
    if (
      prevState.currentChartType !== this.state.currentChartType ||
      prevState.galleryExpanded !== this.state.galleryExpanded
    ) {
      this.scrollActiveIntoView();
    }
    if (prevState.lang !== this.state.lang) {
      this.syncDocumentLang();
    }
  }

  componentWillUnmount(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.contentChangeDisposable?.dispose();
    window.removeEventListener("keydown", this.handleGlobalKeydown);
    window.removeEventListener("mousemove", this.handleResizeMove);
    window.removeEventListener("mouseup", this.handleResizeEnd);
    this.state.editor?.dispose();
  }

  t = (key: MessageKey) => translate(this.state.lang, key);

  syncDocumentLang() {
    document.documentElement.lang = this.state.lang === "zh" ? "zh-CN" : "en";
  }

  setLang(lang: Lang) {
    this.setState({ lang });
    this.persistPrefs({ lang });
  }

  bindEditorChange() {
    this.contentChangeDisposable?.dispose();
    this.contentChangeDisposable =
      this.editorInstance?.onDidChangeModelContent(() => {
        if (this.ignoreContentChange) {
          return;
        }
        this.syncCompactFromEditor();
        this.scheduleAutoRun();
      }) ?? null;
  }

  persistPrefs(partial: LabPrefs) {
    savePrefs(partial);
  }

  scrollActiveIntoView() {
    const root = this.galleryScrollRef.current;
    if (!root) return;
    const items = Array.from(
      root.querySelectorAll<HTMLElement>(".chart-item.active"),
    );
    const view = root.getBoundingClientRect();
    const inView = items.some((item) => {
      const rect = item.getBoundingClientRect();
      return (
        rect.top >= view.top &&
        rect.bottom <= view.bottom &&
        rect.left >= view.left &&
        rect.right <= view.right
      );
    });
    if (!inView) {
      items[0]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }

  handleGlobalKeydown = (event: KeyboardEvent) => {
    if (event.key === "Escape" && this.state.galleryExpanded) {
      this.setState({ galleryExpanded: false });
      return;
    }
    const mod = event.metaKey || event.ctrlKey;
    if (mod && event.key === "Enter") {
      event.preventDefault();
      void this.generateChart({ silentJsonError: false });
      return;
    }
    if (mod && event.key.toLowerCase() === "s") {
      // Prevent browser save; treat as run
      event.preventDefault();
      void this.generateChart({ silentJsonError: false });
    }
  };

  scheduleAutoRun = () => {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      void this.generateChart({ silentJsonError: true });
    }, 480);
  };

  handleResizeStart = (event: ReactMouseEvent) => {
    event.preventDefault();
    this.resizing = true;
    this.resizeStartY = event.clientY;
    this.resizeStartHeight = this.state.editorHeight;
    document.body.style.cursor = "ns-resize";
    document.body.style.userSelect = "none";
  };

  handleResizeMove = (event: MouseEvent) => {
    if (!this.resizing) {
      return;
    }
    const delta = this.resizeStartY - event.clientY;
    const maxHeight = Math.floor(window.innerHeight * MAX_EDITOR_HEIGHT_RATIO);
    const next = Math.min(
      maxHeight,
      Math.max(MIN_EDITOR_HEIGHT, this.resizeStartHeight + delta),
    );
    this.setState({ editorHeight: next, editorCollapsed: false }, () => {
      this.state.editor?.layout();
      this.persistPrefs({ editorHeight: next, editorCollapsed: false });
    });
  };

  handleResizeEnd = () => {
    if (!this.resizing) {
      return;
    }
    this.resizing = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  };

  setEditorValue(text: string) {
    const { editor } = this.state;
    if (!editor) return;
    this.ignoreContentChange = true;
    editor.setValue(text);
    // monaco may fire content change async
    requestAnimationFrame(() => {
      this.ignoreContentChange = false;
    });
  }

  getChartOption(silent = false): Record<string, unknown> | null {
    const { editor } = this.state;
    if (!editor) {
      return null;
    }
    const value = editor.getValue() as string;
    try {
      const parsed = JSON.parse(value) as Record<string, unknown>;
      if (this.state.jsonError) {
        this.setState({ jsonError: "" });
      }
      return parsed;
    } catch (err: any) {
      const msg = (err?.message as string) || this.t("invalidJson");
      if (!silent) {
        message.error(msg);
      }
      this.setState({ jsonError: msg });
      return null;
    }
  }

  changeChartOption(chartType: string, autoRun = true) {
    const options = Object.assign({}, chartDefaultOptions[chartType]);
    this.updateChartOption(options);
    this.persistPrefs({ currentChartType: chartType });
    if (autoRun) {
      void this.generateChart({ silentJsonError: true });
    }
  }

  syncCompactFromEditor() {
    const { editor, compact } = this.state;
    if (!editor) {
      return;
    }
    try {
      const parsed = JSON.parse(editor.getValue()) as { compact?: unknown };
      if (typeof parsed.compact !== "boolean" || parsed.compact === compact) {
        return;
      }
      this.setState({ compact: parsed.compact });
      this.persistPrefs({ compact: parsed.compact });
    } catch {
      // invalid json while typing; keep the switch until it parses
    }
  }

  setCompact(compact: boolean) {
    const current = this.getChartOption(false);
    if (!current) {
      return;
    }
    this.setState({ compact }, () => {
      this.persistPrefs({ compact });
      current.compact = compact;
      this.updateChartOption(current);
      void this.generateChart({ silentJsonError: true });
    });
  }

  updateChartOption(options: Record<string, unknown>) {
    if (!options) {
      return;
    }
    options.theme = this.state.theme;
    const { fontFamily } = this.state;
    if (fontFamily) {
      if (Array.isArray(options.child_charts)) {
        // A multi chart has no font of its own (the key is rejected): the
        // font belongs to its children.
        delete options.font_family;
        options.child_charts = options.child_charts.map(
          (child: Record<string, unknown>) => ({
            ...child,
            font_family: fontFamily,
          }),
        );
      } else {
        options.font_family = fontFamily;
      }
    }
    options.compact = this.state.compact;
    const { simply } = this.state;
    const simplyKeys = options.simplyKeys as string[] | undefined;
    if (simply && simplyKeys) {
      const opts: Record<string, unknown> = {};
      simplyKeys.forEach((key) => {
        opts[key] = options[key];
      });
      opts.compact = options.compact;
      this.setEditorValue(formatJson(opts));
    } else {
      delete options["simplyKeys"];
      this.setEditorValue(formatJson(options));
    }
  }

  refreshChartOption(autoRun = true) {
    const current = this.getChartOption(true);
    if (!current) {
      return;
    }
    this.updateChartOption(current);
    if (autoRun) {
      void this.generateChart({ silentJsonError: true });
    }
  }

  async generateAndCopy() {
    const value = this.getChartOption(false);
    if (!value) {
      return;
    }
    const { format } = this.state;
    try {
      const url = `${window.location.href}api/charts?format=${format}&opts=${JSON.stringify(value)}`;
      console.info(url);
      await navigator.clipboard.writeText(url);
      message.success(this.t("linkCopied"));
    } catch (err: any) {
      message.error(err?.message || String(err), 10);
    }
  }

  async copyText(text: string, okMessage: string) {
    try {
      await navigator.clipboard.writeText(text);
      message.success(okMessage);
    } catch (err: any) {
      message.error(err?.message || this.t("copyFailed"), 8);
    }
  }

  renderMcpCode(text: string, okMessage: string) {
    return (
      <div className="mcp-code">
        <pre>{text}</pre>
        <Button
          size="small"
          type="text"
          onClick={() => this.copyText(text, okMessage)}
        >
          {this.t("copy")}
        </Button>
      </div>
    );
  }

  renderMcpGuide() {
    // 与接口地址一致，按当前页面所在路径拼接，兼容部署在子路径的场景
    const url = new URL("mcp", window.location.href).href;
    const command = `claude mcp add --transport http charts ${url}`;
    const config = JSON.stringify(
      { mcpServers: { charts: { type: "http", url } } },
      null,
      2,
    );
    return (
      <Modal
        title={this.t("mcpTitle")}
        open={this.state.mcpOpen}
        footer={null}
        width={600}
        onCancel={() => this.setState({ mcpOpen: false })}
      >
        <p className="mcp-lead">{this.t("mcpLead")}</p>
        <section className="mcp-section">
          <div className="mcp-label">{this.t("mcpEndpoint")}</div>
          {this.renderMcpCode(url, this.t("mcpEndpointCopied"))}
        </section>
        <section className="mcp-section">
          <div className="mcp-label">{this.t("mcpTools")}</div>
          <ul className="mcp-tools">
            <li>
              <code>get_chart_options</code>
              {this.t("mcpToolOptions")}
            </li>
            <li>
              <code>render_chart</code>
              {this.state.lang === "zh" ? (
                <>
                  按 <code>chart_type</code>、<code>options</code>、
                  <code>format</code> 生成图表。<code>format</code> 默认为{" "}
                  <code>png</code>，可选 <code>jpeg</code>、<code>webp</code>、
                  <code>svg</code>。
                </>
              ) : (
                <>
                  Renders a chart from <code>chart_type</code>,{" "}
                  <code>options</code> and <code>format</code>.{" "}
                  <code>format</code> is <code>png</code> by default;{" "}
                  <code>jpeg</code>, <code>webp</code> and <code>svg</code> are
                  available too.
                </>
              )}
            </li>
          </ul>
        </section>
        <section className="mcp-section">
          <div className="mcp-label">Claude Code</div>
          {this.renderMcpCode(command, this.t("mcpCommandCopied"))}
        </section>
        <section className="mcp-section">
          <div className="mcp-label">{this.t("mcpConfig")}</div>
          {this.renderMcpCode(config, this.t("mcpConfigCopied"))}
        </section>
        <p className="mcp-note">{this.t("mcpNote")}</p>
      </Modal>
    );
  }

  async copyChartOutput() {
    const { format, svg, imageData } = this.state;
    const hasPreview =
      (format === "svg" && Boolean(svg)) ||
      (format !== "svg" && Boolean(imageData));
    if (!hasPreview) {
      message.warning(this.t("nothingToCopy"));
      return;
    }
    try {
      if (format === "svg") {
        await navigator.clipboard.writeText(svg);
        message.success(this.t("svgCopied"));
        return;
      }
      const res = await fetch(imageData);
      const blob = await res.blob();
      // ClipboardItem may not support all image types in all browsers
      const type = blob.type || `image/${format}`;
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard.write) {
        await navigator.clipboard.write([
          new ClipboardItem({ [type]: blob }),
        ]);
        message.success(this.t("imageCopied"));
      } else {
        message.info(this.t("copyImageUnsupported"));
      }
    } catch (err: any) {
      message.error(err?.message || this.t("copyFailed"), 8);
    }
  }

  downloadChart() {
    const { format, svg, imageData, currentChartType } = this.state;
    const name = `${currentChartType || "chart"}.${format === "jpeg" ? "jpg" : format}`;
    if (format === "svg") {
      if (!svg) {
        message.warning(this.t("noSvgToDownload"));
        return;
      }
      const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }
    if (!imageData) {
      message.warning(this.t("noImageToDownload"));
      return;
    }
    const a = document.createElement("a");
    a.href = imageData;
    a.download = name;
    a.click();
  }

  async generateChart(opts?: { silentJsonError?: boolean }) {
    const silent = opts?.silentJsonError ?? false;
    const value = this.getChartOption(silent);
    if (!value) {
      return;
    }
    const requestId = ++this.chartRequestId;
    let isSvg = true;
    const { format } = this.state;
    let url = "./api/charts/svg";
    if (format != "svg") {
      url = `./api/charts/${format}`;
      isSvg = false;
    }
    const started = performance.now();
    try {
      this.setState({ processing: true });
      const config: AxiosRequestConfig = {};
      if (!isSvg) {
        config.responseType = "arraybuffer";
      }

      const { data } = await axios.post(url, value, config);
      if (requestId !== this.chartRequestId) {
        return;
      }
      let svg = "";
      let imageData = "";
      if (isSvg) {
        svg = data;
      } else {
        const base64 = btoa(
          new Uint8Array(data).reduce(
            (data, byte) => data + String.fromCharCode(byte),
            "",
          ),
        );
        imageData = `data:image/${format};base64,${base64}`;
      }
      const renderMs = Math.round(performance.now() - started);
      const outputBytes = isSvg
        ? new TextEncoder().encode(svg).length
        : (data as ArrayBuffer).byteLength;
      this.setState({
        svg,
        imageData,
        width: Number(value.width) || 0,
        height: Number(value.height) || 0,
        renderMs,
        outputBytes,
        lastOkAt: Date.now(),
      });
    } catch (err: any) {
      if (requestId !== this.chartRequestId) {
        return;
      }
      let msg = err?.message as string;
      const axiosErr = err as AxiosError;
      if (axiosErr?.response?.data) {
        const raw = axiosErr.response.data as ArrayBuffer | { message: string };
        if (raw instanceof ArrayBuffer) {
          try {
            const parsed = JSON.parse(new TextDecoder().decode(raw)) as {
              message?: string;
            };
            msg = parsed.message || msg;
          } catch {
            // keep original message
          }
        } else {
          msg = raw.message || msg;
        }
      }
      message.error(msg || this.t("renderFailed"), 10);
    } finally {
      if (requestId === this.chartRequestId) {
        this.setState({ processing: false });
      }
    }
  }

  filteredCategories() {
    const q = this.state.galleryQuery.trim().toLowerCase();
    if (!q) {
      return [featuredCategory, ...chartCategories];
    }
    return chartCategories
      .map((cat) => ({
        ...cat,
        items: cat.items.filter((item) =>
          [
            item.label,
            item.short,
            item.hint,
            item.value,
            chartTextEn[item.value]?.label,
            chartTextEn[item.value]?.hint,
          ].some((text) => text?.toLowerCase().includes(q)),
        ),
      }))
      .filter((cat) => cat.items.length > 0);
  }

  filteredCount() {
    return this.filteredCategories()
      .filter((cat) => cat !== featuredCategory)
      .reduce((n, cat) => n + cat.items.length, 0);
  }

  render(): ReactNode {
    const {
      svg,
      imageData,
      width,
      height,
      format,
      processing,
      fontFamilies,
      version,
      simply,
      currentChartType,
      themes,
      galleryQuery,
      galleryExpanded,
      editorHeight,
      editorCollapsed,
      jsonError,
      renderMs,
      outputBytes,
      previewFit,
      compact,
      lang,
    } = this.state;
    const t = this.t;

    const dark = isDarkMode();
    const hasPreview =
      (format === "svg" && Boolean(svg)) ||
      (format !== "svg" && Boolean(imageData));
    const current = findChartOption(currentChartType);
    const currentText = current ? chartText(current, lang) : null;
    const categories = this.filteredCategories();
    const matchCount = this.filteredCount();
    const toolbarH = jsonError && !editorCollapsed ? 72 : 44;
    const dockHeight = editorCollapsed ? 44 : editorHeight;
    const runShortcut = isMac() ? "⌘↵" : "Ctrl+↵";

    const familyOptions = fontFamilies.map((item) => ({
      label: item,
      value: item,
    }));
    const themeOptions = themes.map((item) => ({
      label: item.substring(0, 1).toUpperCase() + item.substring(1),
      value: item,
    }));

    const sizeLabel =
      width > 0 && height > 0 ? `${width}×${height}` : "auto";
    // Fit mode: as large as the stage allows. A vector chart may grow past its
    // own size (up to 2x); a bitmap would only blur, so it stops at 100%.
    const fitWidth =
      previewFit && width > 0 && height > 0
        ? `min(${width * (format === "svg" ? 2 : 1)}px, 100cqw, 100cqh * ${(width / height).toFixed(4)})`
        : undefined;
    const formatLabel = format.toUpperCase();

    return (
      <ConfigProvider
        locale={lang === "zh" ? zhCN : enUS}
        theme={{
          algorithm: dark ? darkAlgorithm : defaultAlgorithm,
          token: {
            borderRadius: 9,
            colorPrimary: dark ? "#38bdf8" : "#0284c7",
            fontFamily:
              '"IBM Plex Sans", "Segoe UI", system-ui, -apple-system, sans-serif',
          },
        }}
      >
        <div className="app-shell">
          <header className="topbar">
            <div className="brand">
              <div className="brand-glyph" aria-hidden="true" />
              <div className="brand-copy">
                <div className="brand-name">CHARTS-RS</div>
                <div className="brand-tag">
                  Chart Lab{version ? ` · v${version}` : ""} · {t("brandTag")}
                </div>
              </div>
            </div>

            <div className="topbar-actions">
              <div className="field">
                <span className="field-label">{t("format")}</span>
                <Select
                  size="middle"
                  style={{ width: 96 }}
                  options={formatOptions}
                  value={format}
                  popupMatchSelectWidth={false}
                  onChange={(nextFormat) => {
                    this.setState({ format: nextFormat }, () => {
                      this.persistPrefs({ format: nextFormat });
                      void this.generateChart({ silentJsonError: true });
                    });
                  }}
                />
              </div>
              <div className="field">
                <span className="field-label">{t("theme")}</span>
                <Select
                  size="middle"
                  style={{ width: 118 }}
                  options={themeOptions}
                  value={this.state.theme}
                  popupMatchSelectWidth={false}
                  placeholder={t("theme")}
                  onChange={(nextTheme) => {
                    this.setState({ theme: nextTheme }, () => {
                      this.persistPrefs({ theme: nextTheme });
                      this.refreshChartOption();
                    });
                  }}
                />
              </div>
              <div className="field">
                <span className="field-label">{t("font")}</span>
                <Select
                  size="middle"
                  style={{ width: 132 }}
                  value={this.state.fontFamily || "Roboto"}
                  options={
                    familyOptions.length
                      ? familyOptions
                      : [{ label: "Roboto", value: "Roboto" }]
                  }
                  popupMatchSelectWidth={false}
                  placeholder={t("font")}
                  onChange={(fontFamily) => {
                    this.setState({ fontFamily }, () => {
                      this.persistPrefs({ fontFamily });
                      this.refreshChartOption();
                    });
                  }}
                />
              </div>

              <div className="action-divider" />

              <Tooltip title={`${t("runTooltip")} (${runShortcut})`}>
                <Button
                  type="primary"
                  loading={processing}
                  onClick={() =>
                    this.generateChart({ silentJsonError: false })
                  }
                >
                  {t("run")}
                  <span className="btn-kbd">{runShortcut}</span>
                </Button>
              </Tooltip>
              <Tooltip title={t("copyLinkTooltip")}>
                <Button onClick={() => this.generateAndCopy()}>
                  {t("copyLink")}
                </Button>
              </Tooltip>
              <Tooltip title={t("mcpTooltip")}>
                <Button onClick={() => this.setState({ mcpOpen: true })}>
                  MCP
                </Button>
              </Tooltip>
              <Tooltip title={t("switchLangTooltip")}>
                <Button
                  type="text"
                  className="lang-switch"
                  lang={lang === "zh" ? "en" : "zh-CN"}
                  onClick={() => this.setLang(lang === "zh" ? "en" : "zh")}
                >
                  {t("switchLang")}
                </Button>
              </Tooltip>
              {getGithubIcon(lang)}
            </div>
          </header>

          <div
            className={`main-grid${galleryExpanded ? " is-gallery-expanded" : ""}`}
          >
            <aside className="gallery">
              <div className="gallery-head">
                <div className="gallery-title-row">
                  <div className="gallery-title">{t("gallery")}</div>
                  <div className="gallery-count">
                    {galleryQuery
                      ? `${matchCount}/${CHART_COUNT}`
                      : `${CHART_COUNT}`}
                  </div>
                  <Tooltip
                    title={t(
                      galleryExpanded
                        ? "galleryCollapseTooltip"
                        : "galleryExpandTooltip",
                    )}
                  >
                    <Button
                      size="small"
                      type="text"
                      className="icon-btn gallery-toggle"
                      aria-expanded={galleryExpanded}
                      onClick={() =>
                        this.setState({ galleryExpanded: !galleryExpanded })
                      }
                    >
                      {t(galleryExpanded ? "galleryCollapse" : "galleryExpand")}
                    </Button>
                  </Tooltip>
                </div>
                <Input.Search
                  className="gallery-search"
                  allowClear
                  placeholder={t("searchPlaceholder")}
                  value={galleryQuery}
                  onChange={(e) =>
                    this.setState({ galleryQuery: e.target.value })
                  }
                />
              </div>
              <div className="gallery-scroll" ref={this.galleryScrollRef}>
                {categories.length === 0 && (
                  <div className="gallery-empty">{t("galleryEmpty")}</div>
                )}
                {categories.map((cat) => (
                  <div className="cat-block" key={cat.key}>
                    <div className="cat-title">
                      {t(cat.title)}
                      <span className="cat-count">{cat.items.length}</span>
                    </div>
                    <div
                      className={`chart-list${cat === featuredCategory ? " is-featured" : ""}`}
                    >
                      {cat.items.map((item) => {
                        const active = item.value === currentChartType;
                        const text = chartText(item, lang);
                        return (
                          <button
                            type="button"
                            key={item.value}
                            className={`chart-item${active ? " active" : ""}`}
                            aria-current={active ? "true" : undefined}
                            title={text.hint}
                            onClick={() => {
                              this.setState({
                                currentChartType: item.value,
                                galleryExpanded: false,
                              });
                              this.changeChartOption(item.value);
                            }}
                          >
                            <ChartThumb
                              chartType={item.value}
                              theme={this.state.theme}
                              glyph={item.glyph}
                            />
                            <span className="chart-name">{text.label}</span>
                            {galleryExpanded && (
                              <span className="chart-hint">{text.hint}</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </aside>

            <div className="stage">
              <section className="preview-pane">
                <div className="preview-toolbar">
                  <div className="preview-heading">
                    <span className="preview-chart-name">
                      {current ? (
                        <>
                          <span className="preview-glyph">
                            <ChartGlyph kind={current.glyph} />
                          </span>
                          {currentText?.label}
                        </>
                      ) : (
                        t("preview")
                      )}
                    </span>
                    {currentText?.hint && (
                      <span className="preview-sub">{currentText.hint}</span>
                    )}
                  </div>
                  <div className="preview-stats">
                    <span className="stat-chip">{formatLabel}</span>
                    <span className="stat-chip">{sizeLabel}</span>
                    {renderMs != null && !processing && (
                      <span className="stat-chip" title={t("renderTimeTitle")}>
                        {renderMs}ms
                      </span>
                    )}
                    {outputBytes != null && !processing && (
                      <span className="stat-chip" title={t("outputSizeTitle")}>
                        {formatBytes(outputBytes)}
                      </span>
                    )}
                    {processing ? (
                      <span className="stat-chip busy">{t("rendering")}</span>
                    ) : hasPreview ? (
                      <span className="stat-chip live">{t("ready")}</span>
                    ) : null}
                    {jsonError ? (
                      <span className="stat-chip danger" title={jsonError}>
                        {t("jsonError")}
                      </span>
                    ) : null}
                    <div className="preview-actions">
                      <Tooltip
                        title={t(previewFit ? "actualSizeTooltip" : "fitTooltip")}
                      >
                        <Button
                          size="small"
                          type="text"
                          className="icon-btn"
                          disabled={!hasPreview}
                          onClick={() => {
                            const next = !previewFit;
                            this.setState({ previewFit: next });
                            this.persistPrefs({ previewFit: next });
                          }}
                        >
                          {previewFit ? t("fit") : "1:1"}
                        </Button>
                      </Tooltip>
                      <Tooltip
                        title={
                          format === "svg"
                            ? t("copySvgTooltip")
                            : t("copyImageTooltip")
                        }
                      >
                        <Button
                          size="small"
                          type="text"
                          className="icon-btn"
                          disabled={!hasPreview}
                          onClick={() => this.copyChartOutput()}
                        >
                          {t("copy")}
                        </Button>
                      </Tooltip>
                      <Tooltip title={t("downloadTooltip")}>
                        <Button
                          size="small"
                          type="text"
                          className="icon-btn"
                          disabled={!hasPreview}
                          onClick={() => this.downloadChart()}
                        >
                          {t("download")}
                        </Button>
                      </Tooltip>
                    </div>
                  </div>
                </div>

                <div
                  className={`preview-viewport${previewFit ? " is-fit" : " is-actual"}`}
                >
                  {processing && (
                    <div className="preview-loading">
                      <Spin description={t("generating")} size="large">
                        <div style={{ width: 120, height: 72 }} />
                      </Spin>
                    </div>
                  )}

                  {!hasPreview && !processing && (
                    <div className="preview-empty">
                      <div className="empty-orb" aria-hidden="true">
                        <ChartGlyph kind="multi" />
                      </div>
                      <div className="empty-title">{t("emptyTitle")}</div>
                      <div className="empty-desc">
                        {lang === "zh" ? (
                          <>
                            从图库挑选图表类型，或直接编辑下方 JSON。修改后约
                            0.5s 自动渲染，也可按{" "}
                            <kbd className="kbd">{runShortcut}</kbd> 手动运行。
                          </>
                        ) : (
                          <>
                            Pick a chart from the gallery, or edit the JSON
                            below. It renders about 0.5s after a change, or
                            press <kbd className="kbd">{runShortcut}</kbd> to
                            run it yourself.
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {hasPreview && (
                    <div
                      className="preview-canvas"
                      style={fitWidth ? { width: fitWidth } : undefined}
                    >
                      {format === "svg" ? (
                        // Remount per render so the chart's own SVG animation
                        // replays; the canvas itself stays mounted, otherwise
                        // its entrance animation would flash on every render.
                        <div
                          key={this.state.lastOkAt}
                          dangerouslySetInnerHTML={{ __html: svg }}
                        />
                      ) : (
                        <img
                          src={imageData}
                          alt={currentText?.label || t("preview")}
                        />
                      )}
                    </div>
                  )}
                </div>
              </section>

              <section className="editor-dock" style={{ height: dockHeight }}>
                {!editorCollapsed && (
                  <div
                    className="resize-handle"
                    onMouseDown={this.handleResizeStart}
                    title={t("resizeEditor")}
                  />
                )}
                <div className="editor-toolbar">
                  <div className="editor-title-row">
                    <span className="editor-title">{t("jsonOptions")}</span>
                    {jsonError ? (
                      <span className="stat-chip danger" title={jsonError}>
                        {t("parseError")}
                      </span>
                    ) : (
                      <span className="stat-chip subtle editor-hint">
                        auto-run · 480ms
                      </span>
                    )}
                  </div>
                  <div className="editor-tools">
                    <Tooltip title={t("compactTooltip")}>
                      <Switch
                        size="small"
                        checkedChildren={t("compactOn")}
                        unCheckedChildren={t("compactOff")}
                        checked={compact}
                        onChange={(value) => this.setCompact(value)}
                      />
                    </Tooltip>
                    <Tooltip title={t("simpleTooltip")}>
                      <Switch
                        size="small"
                        checkedChildren={t("simpleOn")}
                        unCheckedChildren={t("simpleOff")}
                        checked={simply}
                        onChange={(value) => {
                          this.setState({ simply: value }, () => {
                            this.persistPrefs({ simply: value });
                            this.changeChartOption(currentChartType);
                          });
                        }}
                      />
                    </Tooltip>
                    <Button
                      size="small"
                      type="text"
                      className="icon-btn"
                      onClick={() => {
                        this.setState(
                          (s) => ({
                            editorCollapsed: !s.editorCollapsed,
                          }),
                          () => {
                            this.persistPrefs({
                              editorCollapsed: this.state.editorCollapsed,
                            });
                            requestAnimationFrame(() => {
                              this.state.editor?.layout();
                            });
                          },
                        );
                      }}
                    >
                      {t(editorCollapsed ? "editorExpand" : "editorCollapse")}
                    </Button>
                  </div>
                </div>
                {jsonError && !editorCollapsed && (
                  <div className="editor-error" title={jsonError}>
                    <span className="editor-error-label">JSON</span>
                    {jsonError}
                  </div>
                )}
                <div
                  className="editor-body"
                  ref={this.editorDom}
                  style={{
                    height: editorCollapsed
                      ? 0
                      : Math.max(0, editorHeight - toolbarH),
                    overflow: "hidden",
                    opacity: editorCollapsed ? 0 : 1,
                    pointerEvents: editorCollapsed ? "none" : "auto",
                  }}
                />
              </section>
            </div>
          </div>
          {this.renderMcpGuide()}
        </div>
      </ConfigProvider>
    );
  }
}

export default App;
