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
| 1.50–4.30 | `wd2-001.5-chicago-sat` | 芝加哥夜景卫星图（东侧湖面）缓旋推近，红色飞机 + 红色虚线航迹 + AF-338 标签，3.55s 起淡出 | `intro.ts chicagoSat` | 构图接近；V2 纹理换成 OSM 芝加哥（建筑/道路/铁路/河道 + 灯点），数据只有 Loop ±4 km，原片视野更广 |
| 3.60–8.75 | `wd2-003.6-ctos-grid` | 3D 透视街网 + 远处青色点云天际线，相机低空前滑；ROUTE 19L/77H/07F/29G 悬空标签、青色节点椭圆环、红色折角框、贴地青色主干道；7.3s 起抬升俯仰到正俯视 | `ctos-city.ts ctosGrid`（three.js，`wireCity` + 点云） | 运镜/元素接近；城市 **ASSET** `buildGrid()` |
| 4.00–10.95 | `wd2-004.0-ctos-logo` | 右上角 ctOS 标志（青底黑字、O 为白芯黑圈）4.0–4.9 逐块打出，下方数据细纹，10.75 起闪烁消失 | `ctos-city.ts ctosBadge` / `lib.ts ctosLogo` | 接近 1:1 |
| 8.30–14.30 | `wd2-008.3-city-map` | V2：俯拍 ctOS 地图按原片 10.6s 重画——黑底 + 6px 灰马赛克街区 + 密集轴向街道（白/青/黄）+ 长直网络连线与节点圆 + 红色方框，湖岸从左 y≈340 斜升到右上；9.7s 起绕焦点持续推近，12.4 起轻微压暗，14.2 起随网格以 124px/s 上移 | `citymap2d.ts drawCtosMap`（经 `ctos-city.ts drawCityMap`） | 构图/线条密度接近；**ASSET** `ctosMapTexture()`（旧 `cityMapTexture` 仅 bay.ts 64 billion 还在用） |
| 8.38–9.58 | `wd2-008.4-dossier` | V2：左侧黑栏（到 x≈480）档案卡，按原片 30fps 逐帧序列（`DOS_SEQ`）每 2–3 帧换一张人脸，多数带红扫描线，夹杂红/黑错位横条帧、8.72/9.08/9.2–9.3 碎片故障帧、9.0/9.5 大方块马赛克、9.32/9.42 照片空黑；9.58 消失 | `ctos-city.ts dossier` | 时序逐帧 1:1；人脸用 part2 `faceTex()` 程序化（**ASSET**） |
| 11.10–13.00 | `wd2-011.1-with-a-few-hundred` | "with / a / few / hundred" 逐词白块擦出、错落排布 → 12.1 归行、few 上移 → 12.4 with 跳到顶部 | `ctos-city.ts fewHundred` | 接近 |
| 12.35–14.75 | `wd2-012.35-code-storm` | V2：execute? Y + 白色代码列；竖向白纸条（PowerShell 代码纸截条）按原片逐帧 32×12 分区亮度（`storm-luma.ts`）决定覆盖率，越铺越满，13.35–13.9 几乎全白，14.0 退去、14.3–14.7 顶部残留；13.1–13.4 黄绿染色条、13.2 暗红竖条 | `hack.ts codeStorm` | 明暗分布/节奏逐帧对齐；纸条内容与精确位置为程序化 |
| 14.20–19.45 | `wd2-014.2-grid-collapse` | V2：地图 + 稀疏白色小方点；155px 带 X 对角线网格（整体以 124px/s 上移，18.6 起拉远到 132px），每格 4 个三角象限的黑/白状态按原片逐帧实测（`grid-tiles.ts`）；WEST SIDE 红色疏排字；17.4–18.1 地图淡出 | `hack.ts gridCollapse` | 方块位置/时序逐帧对齐 |
| 19.35–19.65 | `wd2-019.35-shards` | V2：白色斜条按原片每 0.05s 关键形：左下三角 + 右臂 → 交叉 K/V 形 → 单条右移 → 右缘残片 | `hack.ts shards` | 接近 1:1 |
| 19.40–22.90 | `wd2-019.4-scatter` | V2：19.4–21.38 白色小方块/点簇位置按原片逐帧亮块检测数据（`scatter-dots.ts`）；之后程序化稀疏方块渐少 | `hack.ts scatter` | 19.4–21.4 接近 1:1 |
| 21.35–22.90 | `wd2-021.35-they-were-wrong` | V2：像素字乱码逐字解出 "they were wrong." + 块光标；整行从字宽 97px 缩到 43px（原片逐 0.1s 量），17 格以 x≈955 居中；22.35 起只留光标（x≈1272）闪烁 | `hack.ts theyWereWrong` | 位置/字宽/解字进度接近；VT323 比原片字形略粗 |
| 22.85–27.05 | `wd2-022.85-bar-chart` | 城市部署柱状图：右端几根矮柱长出 → 拉远露出 57 根灰白双色柱 + 旋转城市名 + 边框；24.35 起 56%→100%；25.15 起 ctOS 2.0 标志；26.45 起百分比乱跳、柱子塌成一排矮柱、边框擦除 | `usa.ts barChart` | 接近；柱高数据为程序化 |
| 26.45–31.45 | `wd2-026.45-us-map` | SAN JOSE 放射细线 + 虚线大圆 + 红色虚线航线，SACRAMENTO / CARSON CITY 方框地标；连续拉远经 NEVADA / UTAH / COLORADO 等疏排州名与西部州界；29.3 起全美轮廓点阵 + 青色星状网络（中心城市星芒） | `usa.ts usMap`（经纬度投影） | V2：州界/轮廓换 NE 50m 真实州面；29.0/29.5/30.0 相机关键帧按真实州界量出（含纵向压扁 0.84–0.92）；29.7 起美国本土暗底 + GEBCO 高程浮雕 + 高程亮度点阵 |
| 29.95–31.20 | `wd2-029.95-internet-of-things` | "the internet / of things." 两行白字逐词白块擦出 | `usa.ts internetWords` | 接近 |
| 31.20–31.45 | `wd2-031.2-red-noise` | 切条错位 → 暗红/品红块噪点 | `usa.ts redNoise` | 近似 |
| 31.45–33.45 | `wd2-031.45-64-billion` | 城市卫星切片每 0.1–0.25s 硬切（青/品红/黄绿染色、局部方块替换）+ 数值小标签；"64" 切条出现，"billion" 逐块拼出 | `bay.ts sixtyFourBillion` | 字/节奏接近；V2 切片换成旧金山市中心 OSM 建筑俯视（6 档屋顶灰 + 颗粒），原片是另一座欧洲老城航拍，只能近似 |
| 33.40–37.00 | `wd2-033.4-bay-area` | 湾区卫星地形 + 斜排空心字 GREATER SAN FRANCISCO BAY AREA；34.2 硬切推近（像素块过渡）：红色航班 + 虚线、灰色网络细线、SAN FRANCISCO / SAN MATEO 区域标签与青色饼图；36.7 起大像素溶解 | `bay.ts bayArea` | V2：USGS 晕渲 + OSM 陆地/水面 + 半岛全等级道路/湾区主干道打散成灯点，远景/推近两个视图按参考帧拟合 |
| 36.90–40.75 | `wd2-036.9-peninsula` | 旧金山半岛暗蓝街区 + 白色节点网络 + 数值标签；37.35 起红色斜纹锯齿边界生长；"more secure"（37.9）；38.7 硬切推近；"more invasive / system."（38.9–39.95）；40.3 起向后倾倒 | `bay.ts peninsula` | V2：街区换 OSM 旧金山（陆地 + 建筑 + 小街暗青/主干亮青/高速白），红色锯齿边界沿真实海岸线（sf 陆地面环）生长；38.7 推近机位重调 |
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

## V2 精修记录（G2）

测量数据文件（只存版面/时序数值，由 1080p 原片抽帧统计得到，不含原片图像）：

| 文件 | 内容 | 用途 |
| --- | --- | --- |
| `part1/storm-luma.ts` | 12.35–14.8s 每 1/30s 的 32×12 分区平均亮度 | 代码风暴纸条覆盖率 |
| `part1/grid-tiles.ts` | 14.2–19.4s 每 1/30s、14×9 格 × 4 三角象限的 无/黑/白 状态 | 网格碎裂方块 |
| `part1/scatter-dots.ts` | 19.4–21.38s 每 1/30s 的亮块位置/尺寸 | 散落方块 |
| `part1/citymap2d.ts` | 新的 2D ctOS 地图纹理 + 相机 | 8.3–18.4 地图 |

评分（`pnpm score wd2 8 23 --tag tmp`，step 0.5）：city-map 31.9→39.8、dossier 46.7→56.8、code-storm 16.0→26.1、grid-collapse 23.7→40.2、shards 44.0→约 70（逐 0.05s）、scatter 57.8→77.0、they-were-wrong 62.8→71.0。

字幕（`subtitles.ts`）：用字幕带亮度跳变复核后修正 4.63 / 9.95 / 11.03 / 15.42 / 21.2 / 35.27 / 38.05 等起止点。

## ASSET 替换清单

| 函数 | 位置 | 换成 |
| --- | --- | --- |
| `chicagoTexture()` | `intro.ts` | **V2 已接 OSM 芝加哥**（`realChicagoTexture()`）；如有真实夜间卫星图仍可直接替换 |
| `satelliteTexture()` | `lib.ts` | 通用：返回任意卫星图 canvas/Image |
| `cityMapTexture()` / `groundTexture()` | `ctos-city.ts` | 俯视芝加哥街道地图（2048²）；3D 地面贴图 |
| `buildGrid()` | `ctos-city.ts` | 真实芝加哥 3D 模型（返回 `{ scene, cam }`） |
| `faceCanvas()` / `fingerprint()` | `ctos-city.ts` | 证件照 / 指纹图 |
| `drawCityTile()` | `bay.ts` | **V2 已接 OSM 旧金山建筑**（`realCityTile()`）；原片是航拍照片，最好换真实航拍 |
| `bayTexture()` | `bay.ts` | **V2 已接湾区晕渲 + OSM**（`realBayMap()` + `bayView()`），`bayTexture()` 只作回退 |
| `penTexture()` | `bay.ts` | **V2 已接 OSM 旧金山**（`realPenTexture()` / `realPen()` 真实海岸轮廓） |

## 已知差距

- 所有卫星/地形/人脸都是程序化近似，质感与原片差距最大（尤其 33–37s 湾区地形、31.5–33.4 城市切片）。
- 3D 网格城市（3.6–8.7）：原片相机俯角更大、天际线是更密的点云；地面没有原片的建筑块体。
- 代码风暴（12.6–14.2）纸条排布为随机，未逐帧还原；原片还有漫画/人物剪影碎片未做。
- V2：美国轮廓/州界已换 NE 真实数据，全美暗色地形用 GEBCO 高程近似；原片 31s 构图比等距圆柱更扁、网络更密（星芒射线），仍有差距。
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

## V2 精修记录（G1 地图与地球组）

- `intro.ts`：只改 `chicagoSat` 的纹理（`realChicagoTexture()`，OSM 芝加哥，纹理坐标沿用 V1 的 2048² 北朝上）与旋转/缩放关键帧；2013 大字未动。
- `usa.ts`：`usPaths()` NE 50m 美国本土州面（Path2D，每帧 `projMatrix()` 变换）；`usCam()` 新增 29.0/29.5/30.0/30.25 关键帧与纵向压扁 `sq`；全美点阵加密一倍、亮度取 GEBCO 高程。
- `bay.ts`：`realBayMap()`（湾区晕渲 + OSM，30 m/px 离屏）+ `bayView()`；`realPenTexture()`/`realPen()`（旧金山 OSM + 真实海岸环）+ `penView()`；`realCityTile()`（64 billion 切片）。
- 评分（`pnpm score wd2 --tag v2-g1`）：chicago-sat 32.8→32.4、us-map 69.5→70.1、64-billion 29.1→34.3、bay-area 42.9→53.3、peninsula 49.9→51.7。
- 建议上提：湾区/半岛这类「多区域（sf 与 bay 原点不同）叠画」可以在 `geo-draw.ts` 加一个 `viewFor(regionId, baseView)` 自动换原点；`drawWater('chicago')` 在大视野下 lake 面会盖住陆地，需要核查 chicago 的 lake 图层环方向。
