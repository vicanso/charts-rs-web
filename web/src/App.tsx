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
    <a
      href="https://github.com/vicanso/charts-rs"
      style={{
        position: "absolute",
        padding: "15px 30px",
        right: 0,
        top: 0,
      }}
    >
      <svg
        height="32"
        viewBox="0 0 16 16"
        width="32"
        aria-hidden="true"
        style={{
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
    value: "bar",
    label: "bar",
  },
  {
    value: "line",
    label: "line",
  },
  {
    value: "mixLineBar",
    label: "mix line bar",
  },
  {
    value: "horizontalBar",
    label: "horizontal bar",
  },
  {
    value: "pie",
    label: "pie",
  },
  {
    value: "radar",
    label: "radar",
  },
  {
    value: "table",
    label: "table",
  },
];
const themeOptions = [
  {
    value: "grafana",
    label: "grafana",
  },
  {
    value: "light",
    label: "light",
  },
  {
    value: "dark",
    label: "dark",
  },
  {
    value: "ant",
    label: "ant",
  },
];
const formatOptions = [
  {
    value: "svg",
    label: "svg",
  },
  {
    value: "png",
    label: "png",
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
  x_boundary_gap: false,
};
const chartDefaultOptions: Record<string, unknown> = {
  bar: Object.assign({}, defaultOption, {
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
        data: [220.0, 182.0, 191.0, 234.0, 290.0, 330.0, 310.0],
      },
    ],
  }),
  line: Object.assign({}, defaultOption, {
    type: "line",
    title_text: "Line Chart",
  }),
};

interface AppState {
  theme: string;
  format: string;
  svg: string;
  png: string;
  width: number;
  height: number;
  editor: editor.IStandaloneCodeEditor | null;
  processing: boolean;
}

class App extends Component<any, AppState> {
  editorInited;
  editorDom:RefObject<HTMLDivElement>;
  constructor(props: any) {
    super(props);
    this.editorDom = createRef();
    this.editorInited = false;
    this.state = {
      theme: themeOptions[0].value,
      format: formatOptions[0].value,
      editor: null,
      width: 0,
      height: 0,
      svg: "",
      png: "",
      processing: false,
    };
  }
  componentDidMount(): void {
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
        this.changeChartOption("bar");
      }
    );
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
      console.dir(data);
      let svg = "";
      let png = "";
      if (isSvg) {
        svg = data;
      } else {
        const base64 = btoa(
          new Uint8Array(data).reduce(
            (data, byte) => data + String.fromCharCode(byte),
            ""
          )
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
    const { svg, png, width, height, format, processing } = this.state;
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

    return (
      <ConfigProvider
        theme={{
          algorithm: isDarkMode() ? darkAlgorithm : defaultAlgorithm,
        }}
      >
        <Layout>
          {getGithubIcon(isDarkMode())}
          <Header className={headerClass}>
            <div className="contentWrapper">
              <Space>
                <span>CHARTS-RS</span>
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
                      }
                    );
                  }}
                />
                <Select
                  size="large"
                  style={{
                    width: 200,
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
                  {processing ? "Processing..." : "Generate"}
                </Button>
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
