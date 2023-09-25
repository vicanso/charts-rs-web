import { Component, ReactNode, createRef, RefObject } from "react";
import {
  ConfigProvider,
  theme,
  Layout,
  Select,
  Space,
  Button,
  message,
} from "antd";
import { editor } from "monaco-editor/esm/vs/editor/editor.api";
import axios, { AxiosError, AxiosRequestConfig } from "axios";

import "./App.css";

const { defaultAlgorithm, darkAlgorithm } = theme;
const { Header, Content } = Layout;

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
  });
  e.updateOptions({
    fontSize: 14,
    lineNumbersMinChars: 4,
    wordWrap: "on",
  });
  return e;
}

const getGithubIcon = (isDarkMode: boolean) => {
  let color = `rgb(0, 0, 0)`;
  if (isDarkMode) {
    color = `rgb(255, 255, 255)`;
  }
  return (
    <a href="https://github.com/vicanso/charts-rs" style={{}}>
      <svg
        height="32"
        viewBox="0 0 16 16"
        width="32"
        aria-hidden="true"
        style={{
          display: "block",
          marginLeft: "15px",
          fill: color,
        }}
      >
        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
      </svg>
    </a>
  );
};

const chartOptions = [
  {
    value: "barBasic",
    label: "Bar: 常规柱状图",
  },
  {
    value: "lineBasic",
    label: "Line: 常规曲线图",
  },
  {
    value: "lineStartIndexBasic",
    label: "Line: 指定开始点曲线图",
  },
  {
    value: "lineSmooth",
    label: "Line: 常规平滑曲线图",
  },
  {
    value: "lineSmoothFill",
    label: "Line: 填充平滑曲线图",
  },
  {
    value: "barLineMixin",
    label: "BarLine: 柱线混合图",
  },
  {
    value: "horizontalBar",
    label: "HorizontalBar: 水平柱状图",
  },
  {
    value: "pieBasic",
    label: "Pie: 饼图",
  },
  {
    value: "radarBasic",
    label: "Radar: 雷达图",
  },
  {
    value: "scatterBasic",
    label: "Scatter: 散点图",
  },
  {
    value: "candlestick",
    label: "Candlestick: 蜡烛图",
  },
  {
    value: "tableBasic",
    label: "Table: 表格",
  },
  {
    value: "multiChart",
    label: "MultiChart: 多图表",
  },
];
const themeOptions = [
  {
    value: "grafana",
    label: "Grafana",
  },
  {
    value: "light",
    label: "Light",
  },
  {
    value: "dark",
    label: "Dark",
  },
  {
    value: "ant",
    label: "Ant",
  },
  {
    value: "vintage",
    label: "Vintage",
  },
  {
    value: "walden",
    label: "Walden",
  },
  {
    value: "westeros",
    label: "Westeros",
  },
  {
    value: "chalk",
    label: "Chalk",
  },
  {
    value: "shine",
    label: "Shine",
  },
];

const formatOptions = [
  {
    value: "svg",
    label: "SVG",
  },
  {
    value: "png",
    label: "PNG",
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
  lineBasic: Object.assign({}, defaultOption, {
    type: "line",
    title_text: "Line Chart",
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
  lineStartIndexBasic: Object.assign({}, defaultOption, {
    type: "line",
    title_text: "Line Chart",
    legend_align: "right",
    x_axis_data: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    x_boundary_gap: false,
    legend_category: "circle",
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
  }),
  lineSmooth: Object.assign({}, defaultOption, {
    type: "line",
    title_text: "Line Smooth Chart",
    legend_align: "right",
    x_axis_data: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    series_smooth: true,
    legend_category: "rect",
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
  }),
  lineSmoothFill: Object.assign({}, defaultOption, {
    type: "line",
    title_text: "Line Smooth Fill Chart",
    legend_align: "right",
    x_axis_data: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    series_smooth: true,
    series_fill: true,
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
  }),
  horizontalBar: Object.assign({}, defaultOption, {
    type: "horizontal_bar",
    title_text: "World Population",
    legend_align: "left",
    x_axis_data: ["Brazil", "Indonesia", "USA", "India", "China", "World"],
    series_label_formatter: "{t}",
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
        data: [4200.0, 3000.0, 20000.0, 35000.0, 50000.0, 18000.0],
      },
      {
        name: "Actual Spending",
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
  }),
  scatterBasic: Object.assign({}, defaultOption, {
    type: "scatter",
    title_text: "Male and female height and weight distribution",
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
  candlestick: Object.assign({}, defaultOption, {
    type: "candlestick",
    y_axis_configs: [
      {
        axis_min: 2100,
        axis_max: 2460,
        axis_formatter: "{t}",
      },
    ],
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
    },
  ),
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
  png: string;
  fontFamilies: string[];
  fontFamily: string;
  width: number;
  height: number;
  editor: editor.IStandaloneCodeEditor | null;
  processing: boolean;
}

class App extends Component<any, AppState> {
  editorInited;
  editorDom: RefObject<HTMLDivElement>;
  constructor(props: any) {
    super(props);
    this.editorDom = createRef();
    this.editorInited = false;
    this.state = {
      version: "",
      theme: themeOptions[0].value,
      format: formatOptions[0].value,
      fontFamilies: [],
      fontFamily: "",
      editor: null,
      width: 0,
      height: 0,
      svg: "",
      png: "",
      processing: false,
    };
  }
  async componentDidMount(): Promise<void> {
    if (this.editorInited) {
      return;
    }
    this.editorInited = true;
    const editor = createEditor({
      dom: this.editorDom.current as HTMLElement,
    });
    this.setState(
      {
        editor,
      },
      () => {
        this.changeChartOption(chartOptions[0].value);
      },
    );
    const { data } = await axios.get<{
      families: string[];
      version: string;
    }>("/api/basic-info");
    this.setState({
      fontFamilies: data.families,
      version: data.version,
    });
  }
  getChartOption() {
    const { editor } = this.state;
    if (editor) {
      const value = editor.getValue() as string;
      try {
        return JSON.parse(value);
      } catch (err: any) {
        message.error(err?.message as string);
      }
    }
  }
  changeChartOption(chartType: string) {
    const options = Object.assign({}, chartDefaultOptions[chartType]);
    this.updateChartOption(options);
  }
  updateChartOption(options: Record<string, unknown>) {
    options.theme = this.state.theme;
    if (this.state.fontFamily) {
      options.font_family = this.state.fontFamily;
    }
    const { editor } = this.state;
    if (editor) {
      editor.setValue(JSON.stringify(options, null, 2));
    }
  }
  refreshChartOption() {
    this.updateChartOption(this.getChartOption());
  }
  async generateChart() {
    if (this.state.processing) {
      return;
    }
    const value = this.getChartOption();
    let isSvg = true;
    let url = "/api/charts/svg";
    if (this.state.format == "png") {
      url = "/api/charts/png";
      isSvg = false;
    }
    try {
      this.setState({
        processing: true,
      });
      const config: AxiosRequestConfig = {};
      if (!isSvg) {
        config.responseType = "arraybuffer";
      }

      const { data } = await axios.post(url, value, config);
      let svg = "";
      let png = "";
      if (isSvg) {
        svg = data;
      } else {
        const base64 = btoa(
          new Uint8Array(data).reduce(
            (data, byte) => data + String.fromCharCode(byte),
            "",
          ),
        );
        png = `data:image/png;base64,${base64}`;
      }
      this.setState({
        svg,
        png,
        width: value.width || 0,
        height: value.height || 0,
      });
    } catch (err: any) {
      let msg = err?.message as string;
      const axiosErr = err as AxiosError;
      if (axiosErr?.response?.data) {
        const data = axiosErr.response.data as {
          message: string;
        };
        msg = data.message || "";
      }
      message.error(msg || "generate chart fail", 10);
    } finally {
      this.setState({
        processing: false,
      });
    }
  }
  render(): ReactNode {
    const {
      svg,
      png,
      width,
      height,
      format,
      processing,
      fontFamilies,
      version,
    } = this.state;
    let headerClass = "header";
    if (isDarkMode()) {
      headerClass += " dark";
    }
    const previewStyle: React.CSSProperties = {
      position: "absolute",
      left: "50%",
      top: "50%",
      marginTop: `-${height / 2}px`,
      marginLeft: `-${width / 2}px`,
    };
    if (width === 0) {
      previewStyle.left = "0px";
    }
    if (height === 0) {
      previewStyle.top = "0px";
    }

    const familyOptions = fontFamilies.map((item) => {
      return {
        label: item,
        value: item,
      };
    });

    return (
      <ConfigProvider
        theme={{
          algorithm: isDarkMode() ? darkAlgorithm : defaultAlgorithm,
        }}
      >
        <Layout>
          <Header className={headerClass}>
            <div className="contentWrapper">
              <Space>
                <span
                  style={{
                    fontWeight: "bold",
                  }}
                >
                  CHARTS-RS {version}
                </span>
              </Space>
              <Space
                style={{
                  float: "right",
                }}
              >
                <Select
                  size="large"
                  style={{
                    width: 150,
                  }}
                  options={formatOptions}
                  defaultValue={formatOptions[0].value}
                  onChange={(format) => {
                    this.setState({
                      format,
                    });
                  }}
                />
                <Select
                  size="large"
                  style={{
                    width: 150,
                  }}
                  options={themeOptions}
                  defaultValue={themeOptions[0].value}
                  onChange={(theme) => {
                    this.setState(
                      {
                        theme,
                      },
                      () => {
                        this.refreshChartOption();
                      },
                    );
                  }}
                />
                <Select
                  size="large"
                  style={{
                    width: 150,
                  }}
                  defaultValue={"Roboto"}
                  options={familyOptions}
                  onChange={(fontFamily) => {
                    this.setState(
                      {
                        fontFamily,
                      },
                      () => {
                        this.refreshChartOption();
                      },
                    );
                  }}
                />
                <Select
                  size="large"
                  style={{
                    width: 250,
                  }}
                  options={chartOptions}
                  defaultValue={chartOptions[0].value}
                  onChange={(chartType) => {
                    this.changeChartOption(chartType);
                  }}
                />
                <Button
                  size="large"
                  type="primary"
                  style={{
                    width: 120,
                  }}
                  onClick={() => this.generateChart()}
                >
                  {processing ? "生成中..." : "运行"}
                </Button>
                {getGithubIcon(isDarkMode())}
              </Space>
            </div>
          </Header>
          <Content>
            <div className="editorWrapper" ref={this.editorDom}></div>
            <div className="previewWrapper">
              {format === "svg" && (
                <div
                  style={previewStyle}
                  dangerouslySetInnerHTML={{ __html: svg }}
                ></div>
              )}
              {format !== "svg" && <img style={previewStyle} src={png} />}
            </div>
          </Content>
        </Layout>
      </ConfigProvider>
    );
  }
}

export default App;
