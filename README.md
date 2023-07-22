# charts-rs-web

以json的形式定义图表的相关参数，简单易用，可选择svg或png的形式返回。

## HTTP接口

- `GET /font-families`: 返回支持的字体，默认支持两种字体`Noto Sans SC`与`Roboto`
- `POST /charts/png`: 生成PNG图表
- `POST /charts/svg`: 生成SVG图表

## JSON参数

生成PNG与SVG的json参数基本一致，下面针对各参数一下讲解：

### 公共参数

- `type`: 图表类型，默认为`bar`，可选的值为：`line`，`horizontal_bar`，`pie`，`radar`，`table`，以及`bar`
- `theme`: 图表主题，支持`light`, `dark`, `ant`以及`grafana`，默认为`light`
- `width`: 图表宽度，默认为600
- `height`: 图表调试，默认为400
- `margin`: 图表的margin，默认为`{"left":5,"top":5,"right":5,"bottom":5}`
- `font_family`: 图表使用的字体，默认为`Roboto`
- `title_text`: 图表标题
- `title_font_size`: 标题的字体大小，默认为`18`
- `title_font_color`: 标题的字体颜色，不同的主题有不同的默认颜色
- `title_font_weight`: 标题的字体粗细，默认为`bold`
- `title_margin`: 标题的margin，默认为`0`
- `title_align`: 标题的位置，默认为`center`，可选值为：`left`, `center`以及`right`
- `title_height`: 标题高度，默认为`30`
- `sub_title_text`: 子标题
- `sub_title_font_size`: 子标题的字体大小，默认为`14`
- `sub_title_font_color`: 子标题的字体颜色，不同的主题有不同的默认颜色
- `sub_title_margin`: 子标题的margin，默认为`0`
- `sub_title_align`: 子标题的位置，默认为`center`，可选值为：`left`, `center`以及`right`
- `sub_title_height`: 子标题高度，默认为`20`

- `series_list`: 图表数据
