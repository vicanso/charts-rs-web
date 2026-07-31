import {
  Component,
  ReactNode,
  createRef,
  RefObject,
  MouseEvent as ReactMouseEvent,
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
} from "antd";
import { editor } from "monaco-editor";
import axios, { AxiosError, AxiosRequestConfig } from "axios";

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

const getGithubIcon = () => {
  if (window.location.host !== "charts.npmtrend.com") {
    return null;
  }
  return (
    <Tooltip title="在 GitHub 查看 charts-rs">
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
  title: string;
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
    title: "柱状 / 条形",
    items: [
      { value: "barBasic", label: "常规柱状图", short: "Bar", hint: "基础分组柱状", glyph: "bar" },
      { value: "barStacked", label: "堆叠柱状图", short: "Stack", hint: "总量对比", glyph: "stack" },
      { value: "horizontalBar", label: "水平柱状图", short: "HBar", hint: "排行类数据", glyph: "hbar" },
      { value: "barLineMixin", label: "柱线混合图", short: "Mix", hint: "双轴混合", glyph: "mix" },
      { value: "waterfallChart", label: "瀑布图", short: "Fall", hint: "增减拆解", glyph: "waterfall" },
    ],
  },
  {
    key: "line",
    title: "折线 / 曲线",
    items: [
      { value: "lineBasic", label: "常规曲线图", short: "Line", hint: "基础趋势", glyph: "line" },
      { value: "lineAnimation", label: "动画曲线图", short: "Anim", hint: "入场动画", glyph: "line" },
      { value: "lineStartIndexBasic", label: "指定起点曲线", short: "Start", hint: "序列错位", glyph: "line" },
      { value: "lineSmooth", label: "平滑曲线 (log2)", short: "Log2", hint: "对数坐标", glyph: "line" },
      { value: "lineSmoothFill", label: "填充平滑曲线", short: "Area", hint: "面积填充", glyph: "area" },
      { value: "lineNullData", label: "缺失数据曲线", short: "Null", hint: "断点处理", glyph: "line" },
    ],
  },
  {
    key: "radial",
    title: "环形 / 径向",
    items: [
      { value: "pieBasic", label: "南丁格尔玫瑰", short: "Pie", hint: "占比分布", glyph: "pie" },
      { value: "radarBasic", label: "雷达图", short: "Radar", hint: "多维对比", glyph: "radar" },
      { value: "guageChart", label: "仪表盘", short: "Gauge", hint: "单值进度", glyph: "gauge" },
      { value: "sunburstChart", label: "旭日图", short: "Sun", hint: "层级占比", glyph: "sunburst" },
    ],
  },
  {
    key: "matrix",
    title: "分布 / 矩阵",
    items: [
      { value: "scatterBasic", label: "散点图", short: "Dot", hint: "相关分布", glyph: "scatter" },
      { value: "heatmapBasic", label: "热力图", short: "Heat", hint: "密度矩阵", glyph: "heat" },
      { value: "calendarChart", label: "日历图", short: "Cal", hint: "日期贡献", glyph: "calendar" },
      { value: "boxPlotChart", label: "箱线图", short: "Box", hint: "统计分布", glyph: "box" },
      { value: "candlestick", label: "蜡烛图", short: "K", hint: "行情走势", glyph: "candle" },
    ],
  },
  {
    key: "flow",
    title: "流程 / 层级",
    items: [
      { value: "funnelChart", label: "漏斗图", short: "Funnel", hint: "转化路径", glyph: "funnel" },
      { value: "treemapChart", label: "矩形树图", short: "TreeM", hint: "体量占比", glyph: "treemap" },
      { value: "sankeyChart", label: "桑基图", short: "Sankey", hint: "流量迁移", glyph: "sankey" },
      { value: "treeChart", label: "树图", short: "Tree", hint: "层级结构", glyph: "tree" },
    ],
  },
  {
    key: "other",
    title: "其他",
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

const PREFS_KEY = "charts-rs-lab-prefs-v1";

type LabPrefs = {
  simply?: boolean;
  editorHeight?: number;
  editorCollapsed?: boolean;
  format?: string;
  theme?: string;
  fontFamily?: string;
  currentChartType?: string;
  previewFit?: boolean;
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
  guageChart: Object.assign({}, defaultOption, {
    type: "guage",
    title_text: "Gauge",
    min: 0,
    max: 200,
    series_list: [{ name: "Speed", data: [120] }]
  }),
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
  editorHeight: number;
  editorCollapsed: boolean;
  jsonError: string;
  renderMs: number | null;
  previewFit: boolean;
  lastOkAt: number | null;
}

function formatJson(data: Record<string, unknown>) {
  const keys = Object.keys(data).sort();
  const result: Record<string, unknown> = {};
  keys.forEach((key) => {
    result[key] = data[key];
  });
  return JSON.stringify(result, null, 2);
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
    this.resizing = false;
    this.resizeStartY = 0;
    this.resizeStartHeight = DEFAULT_EDITOR_HEIGHT;
    this.ignoreContentChange = false;

    const prefs = loadPrefs();
    const initialType =
      prefs.currentChartType && findChartOption(prefs.currentChartType)
        ? prefs.currentChartType
        : chartOptions[0].value;

    this.state = {
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
      editorHeight: prefs.editorHeight || DEFAULT_EDITOR_HEIGHT,
      editorCollapsed: prefs.editorCollapsed ?? false,
      jsonError: "",
      renderMs: null,
      previewFit: prefs.previewFit ?? true,
      lastOkAt: null,
    };
  }

  async componentDidMount(): Promise<void> {
    if (this.editorInited) {
      return;
    }
    this.editorInited = true;

    const ed = createEditor({
      dom: this.editorDom.current as HTMLElement,
    });

    this.contentChangeDisposable = ed.onDidChangeModelContent(() => {
      if (this.ignoreContentChange) {
        return;
      }
      this.scheduleAutoRun();
    });

    window.addEventListener("keydown", this.handleGlobalKeydown);
    window.addEventListener("mousemove", this.handleResizeMove);
    window.addEventListener("mouseup", this.handleResizeEnd);

    this.setState({ editor: ed }, () => {
      this.changeChartOption(this.state.currentChartType);
      requestAnimationFrame(() => this.scrollActiveIntoView());
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
    if (prevState.currentChartType !== this.state.currentChartType) {
      this.scrollActiveIntoView();
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

  persistPrefs(partial: LabPrefs) {
    savePrefs(partial);
  }

  scrollActiveIntoView() {
    const root = this.galleryScrollRef.current;
    if (!root) return;
    const el = root.querySelector(".chart-item.active") as HTMLElement | null;
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  handleGlobalKeydown = (event: KeyboardEvent) => {
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
      const msg = (err?.message as string) || "JSON 解析失败";
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

  updateChartOption(options: Record<string, unknown>) {
    if (!options) {
      return;
    }
    options.theme = this.state.theme;
    if (this.state.fontFamily) {
      options.font_family = this.state.fontFamily;
    }
    const { simply } = this.state;
    const simplyKeys = options.simplyKeys as string[] | undefined;
    if (simply && simplyKeys) {
      const opts: Record<string, unknown> = {};
      simplyKeys.forEach((key) => {
        opts[key] = options[key];
      });
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
      message.success("预览地址已复制到剪贴板");
    } catch (err: any) {
      message.error(err?.message || String(err), 10);
    }
  }

  async copyChartOutput() {
    const { format, svg, imageData } = this.state;
    const hasPreview =
      (format === "svg" && Boolean(svg)) ||
      (format !== "svg" && Boolean(imageData));
    if (!hasPreview) {
      message.warning("暂无可复制的图表");
      return;
    }
    try {
      if (format === "svg") {
        await navigator.clipboard.writeText(svg);
        message.success("SVG 源码已复制");
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
        message.success("图片已复制到剪贴板");
      } else {
        message.info("当前浏览器不支持复制图片，请使用下载");
      }
    } catch (err: any) {
      message.error(err?.message || "复制失败", 8);
    }
  }

  downloadChart() {
    const { format, svg, imageData, currentChartType } = this.state;
    const name = `${currentChartType || "chart"}.${format === "jpeg" ? "jpg" : format}`;
    if (format === "svg") {
      if (!svg) {
        message.warning("暂无 SVG 可下载");
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
      message.warning("暂无图片可下载");
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
      this.setState({
        svg,
        imageData,
        width: Number(value.width) || 0,
        height: Number(value.height) || 0,
        renderMs,
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
      message.error(msg || "图表生成失败", 10);
    } finally {
      if (requestId === this.chartRequestId) {
        this.setState({ processing: false });
      }
    }
  }

  filteredCategories() {
    const q = this.state.galleryQuery.trim().toLowerCase();
    if (!q) {
      return chartCategories;
    }
    return chartCategories
      .map((cat) => ({
        ...cat,
        items: cat.items.filter(
          (item) =>
            item.label.toLowerCase().includes(q) ||
            item.short.toLowerCase().includes(q) ||
            item.hint.toLowerCase().includes(q) ||
            item.value.toLowerCase().includes(q),
        ),
      }))
      .filter((cat) => cat.items.length > 0);
  }

  filteredCount() {
    return this.filteredCategories().reduce(
      (n, cat) => n + cat.items.length,
      0,
    );
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
      editorHeight,
      editorCollapsed,
      jsonError,
      renderMs,
      previewFit,
    } = this.state;

    const dark = isDarkMode();
    const hasPreview =
      (format === "svg" && Boolean(svg)) ||
      (format !== "svg" && Boolean(imageData));
    const current = findChartOption(currentChartType);
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
    const formatLabel = format.toUpperCase();

    return (
      <ConfigProvider
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
                  Chart Lab{version ? ` · v${version}` : ""} · JSON → 矢量/位图
                </div>
              </div>
            </div>

            <div className="topbar-actions">
              <div className="field">
                <span className="field-label">格式</span>
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
                <span className="field-label">主题</span>
                <Select
                  size="middle"
                  style={{ width: 118 }}
                  options={themeOptions}
                  value={this.state.theme}
                  popupMatchSelectWidth={false}
                  placeholder="主题"
                  onChange={(nextTheme) => {
                    this.setState({ theme: nextTheme }, () => {
                      this.persistPrefs({ theme: nextTheme });
                      this.refreshChartOption();
                    });
                  }}
                />
              </div>
              <div className="field">
                <span className="field-label">字体</span>
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
                  placeholder="字体"
                  onChange={(fontFamily) => {
                    this.setState({ fontFamily }, () => {
                      this.persistPrefs({ fontFamily });
                      this.refreshChartOption();
                    });
                  }}
                />
              </div>

              <div className="action-divider" />

              <Tooltip title={`${runShortcut} 运行渲染`}>
                <Button
                  type="primary"
                  loading={processing}
                  onClick={() =>
                    this.generateChart({ silentJsonError: false })
                  }
                >
                  运行
                  <span className="btn-kbd">{runShortcut}</span>
                </Button>
              </Tooltip>
              <Tooltip title="复制可分享的预览 URL">
                <Button onClick={() => this.generateAndCopy()}>复制链接</Button>
              </Tooltip>
              {getGithubIcon()}
            </div>
          </header>

          <div className="main-grid">
            <aside className="gallery">
              <div className="gallery-head">
                <div className="gallery-title-row">
                  <div className="gallery-title">图表图库</div>
                  <div className="gallery-count">
                    {galleryQuery
                      ? `${matchCount}/${CHART_COUNT}`
                      : `${CHART_COUNT}`}
                  </div>
                </div>
                <Input.Search
                  className="gallery-search"
                  allowClear
                  placeholder="搜索类型、用途…"
                  value={galleryQuery}
                  onChange={(e) =>
                    this.setState({ galleryQuery: e.target.value })
                  }
                />
              </div>
              <div className="gallery-scroll" ref={this.galleryScrollRef}>
                {categories.length === 0 && (
                  <div className="gallery-empty">无匹配结果，试试其它关键词</div>
                )}
                {categories.map((cat) => (
                  <div className="cat-block" key={cat.key}>
                    <div className="cat-title">
                      {cat.title}
                      <span className="cat-count">{cat.items.length}</span>
                    </div>
                    <div className="chart-list">
                      {cat.items.map((item) => {
                        const active = item.value === currentChartType;
                        return (
                          <button
                            type="button"
                            key={item.value}
                            className={`chart-item${active ? " active" : ""}`}
                            aria-current={active ? "true" : undefined}
                            onClick={() => {
                              this.setState({ currentChartType: item.value });
                              this.changeChartOption(item.value);
                            }}
                          >
                            <span className="chart-badge" data-glyph={item.glyph}>
                              <ChartGlyph kind={item.glyph} />
                            </span>
                            <span className="chart-meta">
                              <span className="chart-name">{item.label}</span>
                              <span className="chart-hint">{item.hint}</span>
                            </span>
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
                    <span className="preview-label">Live Preview</span>
                    <span className="preview-chart-name">
                      {current ? (
                        <>
                          <span className="preview-glyph">
                            <ChartGlyph kind={current.glyph} />
                          </span>
                          {current.label}
                        </>
                      ) : (
                        "图表预览"
                      )}
                    </span>
                    {current?.hint && (
                      <span className="preview-sub">{current.hint}</span>
                    )}
                  </div>
                  <div className="preview-stats">
                    <span className="stat-chip">{formatLabel}</span>
                    <span className="stat-chip">{sizeLabel}</span>
                    {renderMs != null && !processing && (
                      <span className="stat-chip" title="最近一次渲染耗时">
                        {renderMs}ms
                      </span>
                    )}
                    {processing ? (
                      <span className="stat-chip busy">渲染中</span>
                    ) : hasPreview ? (
                      <span className="stat-chip live">就绪</span>
                    ) : null}
                    {jsonError ? (
                      <span className="stat-chip danger" title={jsonError}>
                        JSON 错误
                      </span>
                    ) : null}
                    <div className="preview-actions">
                      <Tooltip title={previewFit ? "实际尺寸 100%" : "适应窗口"}>
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
                          {previewFit ? "适应" : "1:1"}
                        </Button>
                      </Tooltip>
                      <Tooltip
                        title={
                          format === "svg" ? "复制 SVG 源码" : "复制图片"
                        }
                      >
                        <Button
                          size="small"
                          type="text"
                          className="icon-btn"
                          disabled={!hasPreview}
                          onClick={() => this.copyChartOutput()}
                        >
                          复制
                        </Button>
                      </Tooltip>
                      <Tooltip title="下载当前图表">
                        <Button
                          size="small"
                          type="text"
                          className="icon-btn"
                          disabled={!hasPreview}
                          onClick={() => this.downloadChart()}
                        >
                          下载
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
                      <Spin description="生成中…" size="large">
                        <div style={{ width: 120, height: 72 }} />
                      </Spin>
                    </div>
                  )}

                  {!hasPreview && !processing && (
                    <div className="preview-empty">
                      <div className="empty-orb" aria-hidden="true">
                        <ChartGlyph kind="multi" />
                      </div>
                      <div className="empty-title">选择一个示例开始</div>
                      <div className="empty-desc">
                        从左侧图库挑选图表类型，或直接编辑下方 JSON。修改后约
                        0.5s 自动渲染，也可按{" "}
                        <kbd className="kbd">{runShortcut}</kbd> 手动运行。
                      </div>
                    </div>
                  )}

                  {hasPreview && format === "svg" && (
                    <div
                      className="preview-canvas"
                      key={`${currentChartType}-${format}-${this.state.lastOkAt}-svg`}
                      dangerouslySetInnerHTML={{ __html: svg }}
                    />
                  )}
                  {hasPreview && format !== "svg" && (
                    <div
                      className="preview-canvas"
                      key={`${currentChartType}-${format}-${this.state.lastOkAt}-img`}
                    >
                      <img
                        src={imageData}
                        alt={`${current?.label || "chart"} preview`}
                      />
                    </div>
                  )}
                </div>
              </section>

              <section className="editor-dock" style={{ height: dockHeight }}>
                {!editorCollapsed && (
                  <div
                    className="resize-handle"
                    onMouseDown={this.handleResizeStart}
                    title="拖拽调整编辑器高度"
                  />
                )}
                <div className="editor-toolbar">
                  <div className="editor-title-row">
                    <span className="editor-title">JSON 配置</span>
                    {jsonError ? (
                      <span className="stat-chip danger" title={jsonError}>
                        解析失败
                      </span>
                    ) : (
                      <span className="stat-chip subtle">auto-run · 480ms</span>
                    )}
                  </div>
                  <div className="editor-tools">
                    <Tooltip title="简化模式只保留常用字段">
                      <Switch
                        size="small"
                        checkedChildren="简化"
                        unCheckedChildren="完整"
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
                      {editorCollapsed ? "展开编辑器" : "收起"}
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
        </div>
      </ConfigProvider>
    );
  }
}

export default App;
