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
import * as monaco from "monaco-editor";
import { editor } from "monaco-editor";
import axios, { AxiosError, AxiosRequestConfig } from "axios";

import { Lang, MessageKey, detectLang, translate } from "./i18n";

import "./App.css";

const { defaultAlgorithm, darkAlgorithm } = theme;

const isDarkMode = () =>
  window.matchMedia("(prefers-color-scheme: dark)").matches;

function createEditor(params: {
  dom: HTMLElement;
}): editor.IStandaloneCodeEditor {
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
  | "bullet"
  | "flows"
  | "mermaid"
  | "table"
  | "multi";

type ExampleItem = {
  id: string;
  chart_type: string;
  diagram_type?: string;
  label_zh: string;
  label_en: string;
  short: string;
  hint_zh: string;
  hint_en: string;
  glyph: GlyphKind;
  options: Record<string, unknown>;
  essential_keys: string[];
};

type ExampleCategory = {
  key: string;
  title_zh: string;
  title_en: string;
  items: ExampleItem[];
};

type ExamplesCatalogResponse = {
  featured: string[];
  categories: ExampleCategory[];
};

type DisplayCategory = {
  key: string;
  title: string;
  isFeatured?: boolean;
  items: ExampleItem[];
};

function itemText(item: ExampleItem, lang: Lang) {
  return {
    label: lang === "en" ? item.label_en : item.label_zh,
    hint: lang === "en" ? item.hint_en : item.hint_zh,
  };
}

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
    case "bullet":
      return (
        <svg {...common}>
          <path d="M3 5.5h12M3 12.5h12" strokeOpacity="0.35" />
          <path d="M3 5.5h8M3 12.5h10" strokeWidth="2.5" />
          <path d="M13 3.5v4M11.5 10.5v4" />
        </svg>
      );
    case "flows":
      return (
        <svg {...common}>
          <path d="M3 13C5 6 10 4 15 5M3 13c4-1 7-3 9-7" />
          <path d="M13 3.5 15 5l-2 1.5" />
          <circle cx="3" cy="13" r="1.2" fill="currentColor" stroke="none" />
        </svg>
      );
    case "mermaid":
      return (
        <svg {...common}>
          <rect x="2.5" y="3" width="5" height="4" rx="1" />
          <rect x="10.5" y="11" width="5" height="4" rx="1" />
          <path d="M7.5 5h3a2 2 0 0 1 2 2v4M5 7v4a2 2 0 0 0 2 2h3.5" />
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
  { value: "svg", label: "Svg" },
  { value: "png", label: "Png" },
  { value: "webp", label: "WebP" },
  { value: "avif", label: "Avif" },
  { value: "jpeg", label: "Jpeg" },
];

// Full-mode base option defaults for standard charts (table, multi and mermaid omit base axis/legend defaults).
const defaultOption: Record<string, unknown> = {
  quality: 80,
  width: 600,
  height: 400,
  margin: { left: 5, top: 5, right: 5, bottom: 5 },
  font_family: "Roboto",
  title_font_size: 18,
  title_font_weight: "bold",
  title_margin: { left: 0, top: 0, right: 0, bottom: 0 },
  title_align: "center",
  title_height: 30,
  sub_title_text: "Sub Title",
  sub_title_font_size: 14,
  sub_title_margin: { left: 0, top: 0, right: 0, bottom: 0 },
  sub_title_align: "center",
  sub_title_height: 20,
  legend_font_size: 14,
  legend_align: "center",
  legend_margin: { left: 0, top: 0, right: 0, bottom: 0 },
  legend_category: "normal",
  legend_show: true,
  x_axis_height: 30,
  x_axis_font_size: 14,
  x_axis_name_gap: 5,
  x_axis_name_rotate: 0,
  x_boundary_gap: true,
  x_axis_margin: { left: 0, top: 0, right: 0, bottom: 0 },
};

function isCommonBaseChart(chartType: string): boolean {
  return (
    chartType !== "table" &&
    chartType !== "multi" &&
    chartType !== "multi_chart" &&
    chartType !== "mermaid"
  );
}

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
  examplesLoaded: boolean;
  featuredIds: string[];
  categories: ExampleCategory[];
  examplesById: Record<string, ExampleItem>;
  currentChartType: string;
  editorMode: "json" | "mermaid";
  mermaidOptions: Record<string, unknown> | null;
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

function loadChartFont() {
  if (typeof FontFace === "undefined") {
    return;
  }
  new FontFace("Roboto", "url(./api/fonts/default)").load().then(
    (face) => document.fonts.add(face),
    () => {
      // static preview fallback
    },
  );
}
loadChartFont();

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

function loadThumb(item: ExampleItem, themeName: string): Promise<string> {
  const key = `${themeName}:${item.id}`;
  let pending = thumbCache.get(key);
  if (!pending) {
    pending = runThumbTask(async () => {
      const options: Record<string, unknown> = {
        ...item.options,
        type: item.chart_type,
        theme: themeName,
        compact: true,
      };
      const { data } = await axios.post<string>("./api/charts/svg", options);
      return data;
    });
    pending.catch(() => thumbCache.delete(key));
    thumbCache.set(key, pending);
  }
  return pending;
}

const THUMB_STYLE =
  "<style>svg{display:block;width:100%;height:100%;pointer-events:none}</style>";

function ChartThumb({
  item,
  themeName,
}: {
  item: ExampleItem;
  themeName: string;
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
        loadThumb(item, themeName).then(
          (svg) => {
            const host = hostRef.current;
            if (cancelled || !host) {
              return;
            }
            const root = host.shadowRoot || host.attachShadow({ mode: "open" });
            root.innerHTML = THUMB_STYLE + svg;
            root
              .querySelector("svg")
              ?.setAttribute("preserveAspectRatio", "xMidYMid slice");
            setReady(true);
          },
          () => {
            // keep glyph on error
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
  }, [item, themeName]);

  return (
    <span className={`chart-thumb${ready ? " is-ready" : ""}`} ref={ref}>
      <span className="chart-thumb-glyph">
        <ChartGlyph kind={item.glyph} />
      </span>
      <span className="chart-thumb-svg" ref={hostRef} aria-hidden="true" />
    </span>
  );
}

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
  ignoreContentChange: boolean;
  savedChartType: string;

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
    this.savedChartType = prefs.currentChartType || "";

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
      examplesLoaded: false,
      featuredIds: [],
      categories: [],
      examplesById: {},
      currentChartType: "",
      editorMode: "json",
      mermaidOptions: null,
      galleryQuery: "",
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
    window.addEventListener("keydown", this.handleGlobalKeydown);
    window.addEventListener("mousemove", this.handleResizeMove);
    window.addEventListener("mouseup", this.handleResizeEnd);
    this.syncDocumentLang();

    if (!this.editorInited) {
      this.editorInited = true;
      const ed = createEditor({
        dom: this.editorDom.current as HTMLElement,
      });
      this.editorInstance = ed;
      this.bindEditorChange();
      this.setState({ editor: ed });
    } else {
      this.bindEditorChange();
    }

    const [basicInfoResult, examplesResult] = await Promise.allSettled([
      axios.get<{
        families: string[];
        version: string;
        themes: string[];
      }>("./api/basic-info"),
      axios.get<ExamplesCatalogResponse>("./api/examples"),
    ]);

    const nextState: Partial<AppState> = {};
    if (basicInfoResult.status === "fulfilled") {
      const data = basicInfoResult.value.data;
      nextState.fontFamilies = data.families;
      nextState.version = data.version;
      nextState.themes = data.themes;
    }

    let initialId = "";
    if (examplesResult.status === "fulfilled") {
      const data = examplesResult.value.data;
      const byId: Record<string, ExampleItem> = {};
      for (const cat of data.categories) {
        for (const item of cat.items) {
          byId[item.id] = item;
        }
      }
      const fallbackId =
        data.featured.find((id) => Boolean(byId[id])) ||
        data.categories[0]?.items[0]?.id ||
        "";
      initialId =
        this.savedChartType && byId[this.savedChartType]
          ? this.savedChartType
          : fallbackId;
      nextState.examplesLoaded = true;
      nextState.featuredIds = data.featured;
      nextState.categories = data.categories;
      nextState.examplesById = byId;
      nextState.currentChartType = initialId;
    } else {
      nextState.examplesLoaded = true;
      message.error(this.t("loadExamplesFailed"));
    }

    this.setState(nextState as AppState, () => {
      if (initialId) {
        this.changeChartOption(initialId);
        if (!this.state.galleryExpanded) {
          requestAnimationFrame(() => this.scrollActiveIntoView());
        }
      }
    });
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
        if (this.state.editorMode === "json") {
          this.syncCompactFromEditor();
        }
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

  setEditorValue(text: string, language: "json" | "plaintext") {
    const ed = this.editorInstance || this.state.editor;
    if (!ed) return;
    this.ignoreContentChange = true;
    const model = ed.getModel();
    if (model && model.getLanguageId() !== language) {
      monaco.editor.setModelLanguage(model, language);
    }
    ed.setValue(text);
    requestAnimationFrame(() => {
      this.ignoreContentChange = false;
    });
  }

  getChartOption(silent = false): Record<string, unknown> | null {
    const ed = this.editorInstance || this.state.editor;
    if (!ed) {
      return null;
    }
    if (this.state.editorMode === "mermaid") {
      if (this.state.jsonError) {
        this.setState({ jsonError: "" });
      }
      const base = Object.assign({}, this.state.mermaidOptions || {});
      base.type = "mermaid";
      base.source = ed.getValue();
      base.theme = this.state.theme;
      base.compact = this.state.compact;
      if (this.state.fontFamily) {
        base.font_family = this.state.fontFamily;
      }
      return base;
    }
    const value = ed.getValue() as string;
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

  buildOptionsForExample(item: ExampleItem): Record<string, unknown> {
    const base =
      !this.state.simply && isCommonBaseChart(item.chart_type)
        ? Object.assign({}, defaultOption, item.options)
        : Object.assign({}, item.options);
    base.type = item.chart_type;
    return base;
  }

  applyThemeFontCompact(
    options: Record<string, unknown>,
  ): Record<string, unknown> {
    const next = Object.assign({}, options);
    next.theme = this.state.theme;
    next.compact = this.state.compact;
    const { fontFamily } = this.state;
    if (fontFamily) {
      if (Array.isArray(next.child_charts)) {
        delete next.font_family;
        next.child_charts = next.child_charts.map(
          (child: Record<string, unknown>) => ({
            ...child,
            font_family: fontFamily,
          }),
        );
      } else {
        next.font_family = fontFamily;
      }
    }
    return next;
  }

  changeChartOption(exampleId: string, autoRun = true) {
    const item = this.state.examplesById[exampleId];
    if (!item) {
      return;
    }
    this.persistPrefs({ currentChartType: exampleId });
    const raw = this.applyThemeFontCompact(this.buildOptionsForExample(item));

    if (item.chart_type === "mermaid") {
      const source = typeof raw.source === "string" ? raw.source : "";
      this.setState(
        {
          editorMode: "mermaid",
          mermaidOptions: raw,
          jsonError: "",
        },
        () => {
          this.setEditorValue(source, "plaintext");
          if (autoRun) {
            void this.generateChart({ silentJsonError: true });
          }
        },
      );
      return;
    }

    this.setState(
      {
        editorMode: "json",
        mermaidOptions: null,
        jsonError: "",
      },
      () => {
        this.setEditorValue(formatJson(raw), "json");
        if (autoRun) {
          void this.generateChart({ silentJsonError: true });
        }
      },
    );
  }

  switchEditorMode(target: "mermaid" | "json") {
    if (target === this.state.editorMode) {
      return;
    }
    const ed = this.editorInstance || this.state.editor;
    if (!ed) return;

    if (target === "json") {
      const full = this.getChartOption(false);
      if (!full) return;
      this.setState({ editorMode: "json", mermaidOptions: full }, () => {
        this.setEditorValue(formatJson(full), "json");
      });
      return;
    }

    const parsed = this.getChartOption(false);
    if (!parsed) {
      return;
    }
    const source = typeof parsed.source === "string" ? parsed.source : "";
    this.setState(
      { editorMode: "mermaid", mermaidOptions: parsed, jsonError: "" },
      () => {
        this.setEditorValue(source, "plaintext");
      },
    );
  }

  syncCompactFromEditor() {
    const ed = this.editorInstance || this.state.editor;
    const { compact } = this.state;
    if (!ed) {
      return;
    }
    try {
      const parsed = JSON.parse(ed.getValue()) as { compact?: unknown };
      if (typeof parsed.compact !== "boolean" || parsed.compact === compact) {
        return;
      }
      this.setState({ compact: parsed.compact });
      this.persistPrefs({ compact: parsed.compact });
    } catch {
      // ignore while typing
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
    const updated = this.applyThemeFontCompact(options);
    if (this.state.editorMode === "mermaid") {
      this.setState({ mermaidOptions: updated });
      return;
    }
    this.setEditorValue(formatJson(updated), "json");
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
      const url = `${window.location.origin}${window.location.pathname}api/charts?format=${format}&opts=${encodeURIComponent(JSON.stringify(value))}`;
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
        width={640}
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
              <code>list_chart_types</code>
              {this.t("mcpToolList")}
            </li>
            <li>
              <code>get_chart_schema</code>
              {this.t("mcpToolSchema")}
            </li>
            <li>
              <code>validate_chart</code>
              {this.t("mcpToolValidate")}
            </li>
            <li>
              <code>render_chart</code>
              {this.t("mcpToolRender")}
            </li>
            <li>
              <code>validate_mermaid</code>
              {this.t("mcpToolValidateMermaid")}
            </li>
            <li>
              <code>render_mermaid</code>
              {this.t("mcpToolRenderMermaid")}
            </li>
          </ul>
        </section>
        <section className="mcp-section">
          <div className="mcp-label">{this.t("mcpResources")}</div>
          <p className="mcp-lead">{this.t("mcpResourcesDesc")}</p>
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
            (acc, byte) => acc + String.fromCharCode(byte),
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

  displayCategories(): DisplayCategory[] {
    const { categories, featuredIds, examplesById, lang, galleryQuery } =
      this.state;
    const regular: DisplayCategory[] = categories.map((cat) => ({
      key: cat.key,
      title: lang === "en" ? cat.title_en : cat.title_zh,
      items: cat.items,
    }));

    const q = galleryQuery.trim().toLowerCase();
    if (!q) {
      const featuredItems = featuredIds
        .map((id) => examplesById[id])
        .filter((item): item is ExampleItem => Boolean(item));
      const featuredCat: DisplayCategory = {
        key: "featured",
        title: this.t("categoryFeatured"),
        isFeatured: true,
        items: featuredItems,
      };
      return featuredItems.length ? [featuredCat, ...regular] : regular;
    }

    return regular
      .map((cat) => ({
        ...cat,
        items: cat.items.filter((item) =>
          [
            item.label_zh,
            item.label_en,
            item.short,
            item.hint_zh,
            item.hint_en,
            item.id,
            item.chart_type,
            item.diagram_type,
          ].some((text) => text?.toLowerCase().includes(q)),
        ),
      }))
      .filter((cat) => cat.items.length > 0);
  }

  totalExampleCount() {
    return Object.keys(this.state.examplesById).length;
  }

  filteredCount(categories: DisplayCategory[]) {
    return categories
      .filter((cat) => !cat.isFeatured)
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
      examplesLoaded,
      examplesById,
      currentChartType,
      editorMode,
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
    const current = examplesById[currentChartType];
    const currentText = current ? itemText(current, lang) : null;
    const isMermaid =
      current?.chart_type === "mermaid" || editorMode === "mermaid";
    const categories = this.displayCategories();
    const totalCount = this.totalExampleCount();
    const matchCount = this.filteredCount(categories);
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
                      ? `${matchCount}/${totalCount}`
                      : `${totalCount}`}
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
                {!examplesLoaded && (
                  <div className="gallery-empty">{t("loadingExamples")}</div>
                )}
                {examplesLoaded && categories.length === 0 && (
                  <div className="gallery-empty">{t("galleryEmpty")}</div>
                )}
                {categories.map((cat) => (
                  <div className="cat-block" key={cat.key}>
                    <div className="cat-title">
                      {cat.title}
                      <span className="cat-count">{cat.items.length}</span>
                    </div>
                    <div
                      className={`chart-list${cat.isFeatured ? " is-featured" : ""}`}
                    >
                      {cat.items.map((item) => {
                        const active = item.id === currentChartType;
                        const text = itemText(item, lang);
                        return (
                          <button
                            type="button"
                            key={item.id}
                            className={`chart-item${active ? " active" : ""}`}
                            aria-current={active ? "true" : undefined}
                            title={text.hint}
                            onClick={() => {
                              this.setState({
                                currentChartType: item.id,
                                galleryExpanded: false,
                              });
                              this.changeChartOption(item.id);
                            }}
                          >
                            <ChartThumb
                              item={item}
                              themeName={this.state.theme}
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
                            从图库挑选图表类型，或直接编辑下方配置。修改后约
                            0.5s 自动渲染，也可按{" "}
                            <kbd className="kbd">{runShortcut}</kbd> 手动运行。
                          </>
                        ) : (
                          <>
                            Pick a chart from the gallery, or edit the options
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
                    <span className="editor-title">
                      {editorMode === "mermaid"
                        ? t("mermaidSource")
                        : t("jsonOptions")}
                    </span>
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
                    {isMermaid && (
                      <Tooltip title={t("mermaidModeTooltip")}>
                        <div
                          className="editor-mode-toggle"
                          role="group"
                          aria-label={t("mermaidModeTooltip")}
                        >
                          <button
                            type="button"
                            className={`editor-mode-btn${editorMode === "mermaid" ? " active" : ""}`}
                            onClick={() => this.switchEditorMode("mermaid")}
                          >
                            {t("editorModeMermaid")}
                          </button>
                          <button
                            type="button"
                            className={`editor-mode-btn${editorMode === "json" ? " active" : ""}`}
                            onClick={() => this.switchEditorMode("json")}
                          >
                            {t("editorModeJson")}
                          </button>
                        </div>
                      </Tooltip>
                    )}
                    <Tooltip title={t("compactTooltip")}>
                      <Switch
                        size="small"
                        checkedChildren={t("compactOn")}
                        unCheckedChildren={t("compactOff")}
                        checked={compact}
                        onChange={(value) => this.setCompact(value)}
                      />
                    </Tooltip>
                    {!(isMermaid && editorMode === "mermaid") && (
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
                    )}
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
