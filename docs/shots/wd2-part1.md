# WD2 part1 镜头表（0s–43s）

实现：`src/films/wd2/part1.ts`（只做镜头编排）+ `src/films/wd2/part1/`：

| 文件 | 内容 |
| --- | --- |
| `lib.ts` | part1 内部通用工具：噪声、程序化卫星图、飞机图标、虚线、数值标签、ctOS 标志、白块擦出大字、切条故障 |
| `subtitles.ts` | 旁白字幕数据表 + 字幕渲染镜头（其他段可直接复用） |
| `intro.ts` | 2013 大字、芝加哥卫星图 |
| `ctos-city.ts` | 3D 透视网格城市、ctOS 标志、俯拍城市地图、马赛克档案卡、with a few hundred |
| `hack.ts` | 代码窗风暴、方格/三角网格碎裂、白色碎片、散落方块、they were wrong. |
| `usa.ts` | 部署柱状图、湾区→全美拉远、internet of things、红色噪点转场 |
| `bay.ts` | 64 billion、湾区地形 + 航班、旧金山半岛 more secure / more invasive system.、3D 竖条、声波、暗网格 |

> 注意：任务说明里「SAN JOSE / NEVADA / 美国网络 38–43s」与原片不符。逐帧核对后，这些在 **26.5–31.2s**；
> 31.45–43s 实际是「64 billion → 湾区 → 旧金山半岛 → 声波」。以下以原片为准。
> 另外 part2 的占位说明里也写了「64 billion、湾区地图」，那部分其实在本段（31.45–37s）。

## 镜头

时间码为原片秒数（切点用 ffmpeg scene 检测 + 10fps 拼图核对，误差约 ±0.05s）。

| 时间 | 镜头 id | 内容 | 实现 | 还原度 |
| --- | --- | --- | --- | --- |
| 0.10–1.00 | `wd2-000-2013` | 0.1s 品红切条故障闪出巨大 "2013"，背后暗灰美国 HUD（国界折线、方点标签、THURSDAY, MAY 9） | `intro.ts year2013` | 构图/字号接近 1:1；HUD 细节为近似 |
| 1.00–1.60 | 同上 | 相机指数冲进 "0" 的右笔画并逆时针倾斜 ~30°，1.35s 起沿倾斜方向切成横条 | 同上 | 接近 |
| 1.50–2.75 | 同上 + `wd2-001.5-chicago-sat` | 白色斜条两端收短、错位、消失，露出芝加哥卫星图；地图从大马赛克块解析清晰 | `intro.ts` | 节奏接近；卫星图 **ASSET** |
| 1.50–4.30 | `wd2-001.5-chicago-sat` | 芝加哥夜景卫星图（东侧湖面）缓旋推近，红色飞机 + 红色虚线航迹 + AF-338 标签，3.55s 起淡出 | `intro.ts chicagoSat` | 构图接近；**ASSET** `chicagoTexture()` |
| 3.60–8.75 | `wd2-003.6-ctos-grid` | 3D 透视街网 + 远处青色点云天际线，相机低空前滑；ROUTE 19L/77H/07F/29G 悬空标签、青色节点椭圆环、红色折角框、贴地青色主干道；7.3s 起抬升俯仰到正俯视 | `ctos-city.ts ctosGrid`（three.js，`wireCity` + 点云） | 运镜/元素接近；城市 **ASSET** `buildGrid()` |
| 4.00–10.95 | `wd2-004.0-ctos-logo` | 右上角 ctOS 标志（青底黑字、O 为白芯黑圈）4.0–4.9 逐块打出，下方数据细纹，10.75 起闪烁消失 | `ctos-city.ts ctosBadge` / `lib.ts ctosLogo` | 接近 1:1 |
| 8.30–14.30 | `wd2-008.3-city-map` | 俯拍芝加哥街道地图（左上是湖），缓慢平移 | `ctos-city.ts cityTopDown` | **ASSET** `cityMapTexture()` |
| 8.38–9.40 | `wd2-008.4-dossier` | 左侧黑栏马赛克人脸档案卡（字段框、指纹），8.65 红色扫描线，9.15 起碎片化消失 | `ctos-city.ts dossier` | 版式近似；人脸/指纹 **ASSET** `faceCanvas()`/`fingerprint()` |
| 11.10–13.00 | `wd2-011.1-with-a-few-hundred` | "with / a / few / hundred" 逐词白块擦出、错落排布 → 12.1 归行、few 上移 → 12.4 with 跳到顶部 | `ctos-city.ts fewHundred` | 接近 |
| 12.35–14.35 | `wd2-012.35-code-storm` | execute? Y + 带 + 号的白色代码列；12.6 起 PowerShell 脚本白纸条、黑条、暗红/青色条逐帧闪现铺满（"$script:AgentDelay"、"$Retries = 1" 等） | `hack.ts codeStorm`（`PS_LINES`） | 节奏与密度近似；纸条排布为随机 |
| 14.20–19.45 | `wd2-014.2-grid-collapse` | 地图 + 白色「骰子点」簇 + 红色疏排字 WEST SIDE；15.3 起 155px 带 X 对角线的方格逐格翻出黑块/白块/白三角并每 3 帧跳变；17.4 起地图淡出，18.0 后方块退去只剩网格与点 | `hack.ts gridCollapse` | 接近 |
| 19.35–19.65 | `wd2-019.35-shards` | 两块巨大白色斜向碎片一闪扫过 | `hack.ts shards` | 近似 |
| 19.40–22.90 | `wd2-019.4-scatter` | 黑底散落白色小方块/小三角/少量红块，逐帧闪烁、逐渐变少 | `hack.ts scatter` | 接近 |
| 21.35–22.90 | `wd2-021.35-they-were-wrong` | 像素字 "they were wrong." 乱码逐字解出 + 块光标，22.3 起只留光标闪烁 | `hack.ts theyWereWrong` | 接近 |
| 22.85–27.05 | `wd2-022.85-bar-chart` | 城市部署柱状图：右端几根矮柱长出 → 拉远露出 57 根灰白双色柱 + 旋转城市名 + 边框；24.35 起 56%→100%；25.15 起 ctOS 2.0 标志；26.45 起百分比乱跳、柱子塌成一排矮柱、边框擦除 | `usa.ts barChart` | 接近；柱高数据为程序化 |
| 26.45–31.45 | `wd2-026.45-us-map` | SAN JOSE 放射细线 + 虚线大圆 + 红色虚线航线，SACRAMENTO / CARSON CITY 方框地标；连续拉远经 NEVADA / UTAH / COLORADO 等疏排州名与西部州界；29.3 起全美轮廓点阵 + 青色星状网络（中心城市星芒） | `usa.ts usMap`（经纬度投影） | 运镜近似；美国轮廓/州界为简化折线 |
| 29.95–31.20 | `wd2-029.95-internet-of-things` | "the internet / of things." 两行白字逐词白块擦出 | `usa.ts internetWords` | 接近 |
| 31.20–31.45 | `wd2-031.2-red-noise` | 切条错位 → 暗红/品红块噪点 | `usa.ts redNoise` | 近似 |
| 31.45–33.45 | `wd2-031.45-64-billion` | 城市卫星切片每 0.1–0.25s 硬切（青/品红/黄绿染色、局部方块替换）+ 数值小标签；"64" 切条出现，"billion" 逐块拼出 | `bay.ts sixtyFourBillion` | 字/节奏接近；切片 **ASSET** `drawCityTile()` |
| 33.40–37.00 | `wd2-033.4-bay-area` | 湾区卫星地形 + 斜排空心字 GREATER SAN FRANCISCO BAY AREA；34.2 硬切推近（像素块过渡）：红色航班 + 虚线、灰色网络细线、SAN FRANCISCO / SAN MATEO 区域标签与青色饼图；36.7 起大像素溶解 | `bay.ts bayArea` | 版式近似；地形 **ASSET** `bayTexture()` |
| 36.90–40.75 | `wd2-036.9-peninsula` | 旧金山半岛暗蓝街区 + 白色节点网络 + 数值标签；37.35 起红色斜纹锯齿边界生长；"more secure"（37.9）；38.7 硬切推近；"more invasive / system."（38.9–39.95）；40.3 起向后倾倒 | `bay.ts peninsula` | 文字/时机接近；街区 **ASSET** `penTexture()` |
| 40.70–41.25 | `wd2-040.7-bars3d` | 3D 透视青色网格 + 白色竖条（数据柱）升起抖动 | `bay.ts bars3d` | 近似 |
| 41.25–42.37 | `wd2-041.25-waveforms` | 声波：品红单行 → 紫色两行 → 白色两行 → 红色三行 | `bay.ts waveforms` | 近似（波形为程序化） |
| 42.37–43.00 | `wd2-042.25-dark-grid` | 近黑暗网格 + 三条暗红虚线，让位给 43.2 的下一段 | `bay.ts darkGrid` | 近似 |
| 0–43 | `wd2-part1-subs` | 旁白字幕（见下） | `subtitles.ts` | 文本 1:1，时间 ±0.05s |

## 旁白字幕

数据在 `subtitles.ts` 的 `PART1_SUBS`（逐句，从原片 10fps 裁切字幕带人工读出）：

| 时间 | 字幕 |
| --- | --- |
| 0.20–4.05 | In 2013, Chicago realized the promise of smart cities with ctOS, |
| 4.50–9.85 | a citywide operating system merging big data with surveillance, security, and transit |
| 10.00–10.45 | programs. |
| 10.80–15.25 | With a few hundred lines of code, hackers were able to hijack its central servers |
| 15.40–16.95 | and cripple the entire grid. |
| 17.10–21.15 | Many believed the attack would be a killing blow for smart city development. |
| 21.30–22.15 | They were wrong. |
| 22.90–27.85 | Coordinated from the heart of Silicon Valley, ctOS 2.0 has been implemented across |
| 27.90–31.35 | the United States, ushering in the “Internet of Things”. |
| 31.50–35.40 | 6.4 billion connected devices now serve as collection points, |
| 35.40–37.95 | mapping and recording our daily routines, |
| 37.95–40.95 | making a more secure...and more invasive system. |
| 41.10–42.65 | But who else is listening? |

版式：Helvetica Neue Bold，白字 + 淡黑描边，底部居中基线 y=978（1080p），字号用一句原片实测宽度（871px）自动标定。硬切出现/消失。

**其他 WD2 段复用方式**：

```ts
import { subtitleScene, type SubCue } from './part1/subtitles'
const SUBS: SubCue[] = [{ start: 43.3, end: 46.1, text: '...' }]
export const part2 = [...shots, subtitleScene('wd2-part2-subs', 43, 94, SUBS)]  // 放在数组最后
```

## ASSET 替换清单

| 函数 | 位置 | 换成 |
| --- | --- | --- |
| `chicagoTexture()` | `intro.ts` | 芝加哥夜景卫星图（2048²） |
| `satelliteTexture()` | `lib.ts` | 通用：返回任意卫星图 canvas/Image |
| `cityMapTexture()` / `groundTexture()` | `ctos-city.ts` | 俯视芝加哥街道地图（2048²）；3D 地面贴图 |
| `buildGrid()` | `ctos-city.ts` | 真实芝加哥 3D 模型（返回 `{ scene, cam }`） |
| `faceCanvas()` / `fingerprint()` | `ctos-city.ts` | 证件照 / 指纹图 |
| `drawCityTile()` | `bay.ts` | 按 seed 取真实卫星图块 |
| `bayTexture()` | `bay.ts` | 湾区卫星图（2400×1600） |
| `penTexture()` | `bay.ts` | 旧金山街区地图 |

## 已知差距

- 所有卫星/地形/人脸都是程序化近似，质感与原片差距最大（尤其 33–37s 湾区地形、31.5–33.4 城市切片）。
- 3D 网格城市（3.6–8.7）：原片相机俯角更大、天际线是更密的点云；地面没有原片的建筑块体。
- 代码风暴（12.6–14.2）纸条排布为随机，未逐帧还原；原片还有漫画/人物剪影碎片未做。
- 美国轮廓与州界是手写简化折线；全美网络的卫星底图（29.5–31.2 原片有暗色地形）未做。
- 半岛红色锯齿边界是虚线描边近似，原片是斜纹粗齿；3D 倾倒（40.3–40.75）是 2D 纵向压扁近似。
- 声波段（41.25–42.4）颜色切换时刻 ±0.1s，波形形状为程序化。
- 原片整体有轻微色差/辉光（RGB 分离、黄蓝边），本段未做全片后期。

## 建议上提到共享库

- `subtitles.ts` 整个文件 → `src/fx/subtitles.ts`（WD2 全片共用字幕层）。
- `lib.ts`：
  - `wordReveal()`（白块擦出大字，WD2 全片标志性大字动画）→ `src/fx/text.ts`
  - `ctosLogo()`（ctOS 标志逐块打出，WD2 多段出现）→ `src/fx/` 新文件
  - `numLabel()`（□ 494.21 数值小标签）、`spacedLabel()`、`boxDot()` → `src/fx/text.ts`
  - `plane()`、`dashLine()` → `src/fx/`（地图类镜头通用）
  - `vnoise()` / `fbm()` / `h2()` → `src/engine/math.ts`
  - `satelliteTexture()` → `src/fx/image.ts`（程序化卫星图 ASSET 占位）
  - `sliceDraw()`（对矢量绘制做切条错位，不读像素）→ `src/fx/glitch.ts`
  - `fr()`（按 30fps 量化；原片 60fps 容器里内容是 30fps）→ `src/engine/math.ts`
- `snaps/wd2p1-tools/snap.mjs`：关闭 HMR/文件监听的 snap。多个 agent 同时改文件时，原 `scripts/snap.mjs` 的 vite dev server 会因 HMR 整页重载导致截图中途报错；建议 `scripts/harness.mjs` 的 `createServer` 加 `server: { hmr: false, watch: null }`。
