# WD1 part1 镜头表（0s–50s）

实现入口：`src/films/wd1/part1.ts`，各镜头在 `src/films/wd1/part1/sNN-*.ts`。
坐标系 1920×1080；时间为影片绝对秒。同一时刻有多个镜头时按数组顺序叠加（后者在上）。

| # | 时间码 | 镜头 id | 画面与动作 | 文件 |
|---|---|---|---|---|
| 1 | 0.00–2.70 | wd1-000-pegi | PEGI 18 PROVISIONAL 分级卡，0–0.2 淡入，2.2–2.53 淡出（V2 按逐帧亮度重对） | s01-pegi.ts |
| 2 | 2.70–11.80 | wd1-003-earth | （V2 真实贴图 + 近正交相机）暗色地球（北美在上、北极在上方）从远处缓慢推近并上移；背后星座连线 1/5/9/10、十字、方框 HUD；6.8s 起「14 AUGUST 2003」等宽白底打字标签 + 引线指向美国；7.55s 目标方框；10.55s 起黑色弧面从左下扫入吞掉灯光（黑区只剩稀疏点）；11.0s 起标签放大 | s02-earth.ts, earth.ts, geo.ts |
| 3 | 11.80–15.10 | wd1-012-blackout | 「2003 Blackout」大标题 + 长下划线；美国东北斜纹陆地（V2：NE 陆地/五大湖、气泡 = 真实城市） + 点阵底；青色半透明气泡依次弹出；12.15s「Panic / New York State」白底打字，13.95s 从左擦除；整层加速推近，14.85s 淡出 | s03-blackout.ts |
| 4 | 15.00–18.40 | wd1-015-roads | 美国东北灰色道路网 + 海岸/州界（V2：NE 真实海岸/州界，道路节点 = 真实城市），地图缓慢左移；白色半透明圆点（中心小十字）此起彼伏；15.55s「11 PEOPLE DIED IN THE DARK」等宽白底打字；18.1s 地图熄灭、标签从左擦除 | s04-roads.ts |
| 5 | 18.20–22.30 | wd1-018-blame | 18.2 网格拼块转场（V2：整屏按 2 条竖线 × 2 条横线切格，每 0.1s 换切法，格内横线/方格/竖线/点阵/斜菱格；18.45–18.6 用原片量出的四象限）；线描方角「BLAME?」渐亮，19.2 换倒角字形；18.85 起菱形格底 + 中部柔光雾；以「?」下点为锚推近到「ME?」（V2：锚点下移 30–84px，短横落在字母基线、小字紧贴其下）；19.3 发光短横，19.55「a small vulnerability inside_」42 字/秒打字（vulnerability 灰底高亮）；21.3 起 "small" 变暗、21.42 起约 50 字/秒从左删除；21.1 起字母线段从左往右整根熄灭（? 保留到淡出） | s05-blame.ts |
| 6 | 21.75–24.30 | wd1-022-pylons | 电塔阵列：俯视 → 压低视角沿中央塔列推进；23.05 圆环圈住主角塔，推到桁架特写；「_TRANSMISSION_CONTROL_ROOM」深灰渐变底等宽字从 ME? 的光标位置接出，随镜头漂移，24.0 擦除（画在 blame 之下，blame 在 22.0–22.3 淡出） | s06-pylons.ts |
| 7 | 24.35–26.95 | wd1-024-raymond | 「Raymond / Kenney」斜纹白底细体大字逐字打（末字灰色幽灵）、「DISGRUNTLED EMPLOYEE」粗体白底；头像由小放大、X 光全身照 25.5 弹出；× 网格 + 黄绿档案网与小字；26.0 起整层加速左甩出画 | s07-raymond.ts |
| 8 | 26.60–30.60 | wd1-027-virus | USB 图标从左侧横线接入并分叉；5×7 点阵「VIRUS」（每格两条竖短划、斜体）逐格出现；「...and」+「walked away」白底打字，28.45 擦除；28.75 起四个白色饼图扫出并缓慢转动；数据小字列；29.0 起整体缩小淡出 | s08-virus.ts |
| 9 | 29.90–33.35 | wd1-030-overloaded | 迷你文字行拼成的点阵「OVERLOADED」+ 聚向一点的档案网；31.4「the grid shutdown」白底打字；32.6 起整体缩成一点、横向闪光 | s08-virus.ts |
| 10 | 33.30–34.70 | wd1-033-floor | 透视点阵地面前进，中心四列连成亮线；34.2 起横向撕裂、压暗 | s09-city.ts |
| 11 | 34.40–50.00 | wd1-034-city | 3D 灰色城市（带河道）：34.4–38.2 暗色扫描线 + 故障飞越（夹杂点阵地面切片）→ 38.2 低空飞越 → 39.2 远景城市板块 → 42.4 抬高旋转成斜俯视 → 46 更陡俯视；47.85 青色线路 | s09-city.ts |
| 12 | 40.00–43.25 | wd1-040-centralos | 「centralOperatingSystem」斜纹白底打字（前 15 字瞬出，其余 20 字/秒），42.45–43.1 整块加速下滑出画（V2 加快） | s10-ctos.ts |
| 13 | 42.00–47.00 | wd1-042-ctos | c(42.0) / T(42.2) / O(42.3) / S(42.45) 依次分散弹出，42.85–43.4 收拢成「ctOS」（c、T 小型大写 = 0.62×，字重 500）并放大（V2 整体大 12%），46.55 起左滑出画（46.8 只剩 "OS"） | s10-ctos.ts |
| 14 | 46.55–50.00 | wd1-046-control | 「centralized control」右对齐打字；青底白字清单 subway lines(47.95) / traffic lights(48.75) / surveillance(49.38)；48.55 起等宽设施标签 TRAFFIC LIGHTS / CAMERAS / NUCLEAR PLANT / WATER SUPPLY / DOOR LOCK / SECURITY SYSTEM / BRIDGE CTRL 依次弹出并按参考帧轨迹漂移 | s10-ctos.ts |

注：原片 48s 左右并不是「COMPUTER」，而是 centralized control 清单继续展开；50s 处由 part2 硬切接上。

## ASSET（程序化替代品，换真实素材的位置）

| 替代品 | 函数 | 换法 |
|---|---|---|
| PEGI 标 | `s01-pegi.ts` `drawPegi()` | 换官方矢量/图片，保持 636,91 起 641×783 的外框位置 |
| 地球夜景贴图 | `earth.ts` `earthTexture()` | **V2 已换**：`realEarthCanvas()` 在本目录包了一层合成（Blue Marble 判海陆、测深灰度做海洋、GEBCO 梯度浮雕做陆地、Black Marble 灯光叠加，参数 `REAL_EARTH` 按参考帧取样调）；相机改近正交（`CAM_D = 40`），视角 (-100, 66, roll 2) 由东京/迈阿密/洛杉矶/格陵兰等六点拟合 |
| 大陆轮廓 | `geo.ts` | V2 起只作资产缺失时的回退（地球/停电/道路三镜头都已接 Natural Earth） |
| 气泡分布 | `s03-blackout.ts` `bubbles()` | **V2**：`realBubbles()` = NE 城市点（美/加）半径 ∝ 人口^0.37 + 卫星小泡；斜纹陆地 = NE 50m 陆地减五大湖。投影 `proj()` 用评分网格拟合（带 0.75 剪切）。仍非真实停电范围数据 |
| 道路网 | `s04-roads.ts` `roadNetwork()` / `outlines()` | **V2**：海岸/州界/五大湖换 NE 50m（只画美国），投影 = Albers + 仿射 + 控制点 RBF 橡皮膜（`projA()`）。道路仍是程序化：NE 城市点加密 + k 近邻，未接真实道路（NE 10m roads 或 OSM motorway 可替换 `realRoadNetwork()`） |
| 电塔 | `s06-pylons.ts` `simplePylon()` / `heroPylon()` | 换真实电塔模型（远景 InstancedMesh，主角塔单独） |
| Raymond 头像、X 光照 | `s07-raymond.ts` `drawFace()` / `drawBody()` | 换图片 `drawImage`，保持框位置（V2：头像右缘 1025、X 光照 (1034,201) 368×368） |
| 城市 | `s09-city.ts` `cityScene()` | 当前用 `three/city.ts` `cityLayout()` + 自建实例网格与边线；换真实城市模型（芝加哥素模）并保留相机关键帧 `cityCamera()` |

## 接近 1:1 的部分

- 各镜头起止时间、转场时刻（按 5–10fps 拼图对过）。
- 所有文字内容、位置、字号、字重、字距：14 AUGUST 2003、2003 Blackout、Panic/New York State、11 PEOPLE DIED IN THE DARK、a small vulnerability inside_、_TRANSMISSION_CONTROL_ROOM、Raymond/Kenney/DISGRUNTLED EMPLOYEE、...and walked away、the grid shutdown、centralOperatingSystem、ctOS、centralized control 清单、七个设施标签。
- 打字 / 擦除节奏，底块随字增长、末字幽灵字、右对齐向左打字。
- 构图：地球位置与缩放曲线、BLAME? 推近锚点、Raymond 版式、VIRUS/饼图布局、ctOS 字母分散与收拢位置、设施标签轨迹。

## 已知差距

- 地球：V2 已换真实贴图，地形浮雕与灯光分布对上；原片浮雕更「塑料感」、海洋测深纹理更强。黑色吞没弧面仍是椭圆近似，原片是球面切片。
- 3D 城市：原片是带真实细节的高反差素模（亮边、屋顶设备），这里是平顶方块 + 边线，质感偏「CG 默认」；34.4–38.2 的点云扫描质感只用扫描线 + 切片故障近似。
- 电塔低角度段（23.0–23.2）相机与原片仍有偏差；远处塔是方块近似。
- 道路网仍是 k 近邻程序化网（节点换成真实城市）；原片地图是风格化的美东底图，Albers + 仿射对 18 个控制点残差约 64px，RBF 修正后海岸位置仍有偏差（见 V2 未解决项）。
- BLAME 段的网格拼块转场是随机矩形近似；字母崩散的运动方式凭印象。
- VIRUS 段饼图的转动角度、OVERLOADED 迷你文字块的纹理为近似。
- 字体：macOS 无 Helvetica Neue 细体时会回落，细节字重可能不同。

## 建议上提到共享库

- `part1/util.ts` `kf()` / `spline()`：关键帧插值（单调三次 Hermite，速度连续），相机与层运动都需要，建议进 `engine/math.ts`。
- `part1/util.ts` `typeBox()`：底块随已打字符增长 + 光标 + 左/右擦除的打字标签，比 `fx/text.ts` `highlight()` 更贴近 WD1 原片，建议并入 `fx/text.ts`。
- `part1/util.ts` `bitmap57()`（5×7 点阵字库）和 `rasterText()`（导出位图本身）：`fx/dot-matrix.ts` 只能画固定形状，建议导出位图以便自定义格子画法（竖双短划、迷你文字行）。
- `part1/util.ts` `roughen()`：折线中点位移（海岸线化），地图类镜头通用。
- `part1/util.ts` `fitText()`：水平压缩文字到指定宽度。
- `part1/earth.ts`：程序化地球 + `projectLonLat()`，WD1 part2 的世界地图 / WD2 地图段可复用，建议进 `src/three/earth.ts`。
- `part1/geo.ts`：粗略大陆经纬度多边形，建议进共享资源目录。
- `snaps/p1snap.mjs`（本地、不入库）：`scripts/harness.mjs` 的 vite dev server 开着 HMR，多 agent 并行改文件时页面会被重载导致 `Execution context was destroyed`。建议 harness 用 `server: { hmr: false, watch: null }`。

## V2 精修（G3，tag `v2-g3`）

| 镜头 | V1 → V2 | 关键改动 | 瓶颈 |
|---|---|---|---|
| wd1-000-pegi | 91.1 → 92.5 | 淡出时刻按逐帧亮度改为 2.2–2.53 | PEGI 标仍是文字拼的 |
| wd1-018-blame | 47.7 → 52 | 拼块转场改整屏切格、锚点/短横/小字位置、删除节奏、线段整根熄灭 | 背景格纹原片随镜头多层视差缩放（19.2→22.0 周期 24→83px），相位对不上，提高亮度反而掉分 |
| wd1-024-raymond | 75.6 → ≈76 | 头像/X 光照尺寸位置 | 照片是程序化剪影 |
| wd1-040-centralos | 68.0 → 70.9 | 打字提前 1 帧、下滑加快 | 背景 3D 城市（3D 组） |
| wd1-042-ctos | 40.7 → 43.8 | 时序、字号、小型大写比例、字重、滑出提前 | 画面 80% 是 3D 城市（SSIM 0.06–0.25），文字层已基本对齐 |

## V2 精修记录（G1 地图与地球组）

- 调参钩子：`part1/tune.ts`（wd2 为 `wd2/part1/tune.ts`）的 `tune(key, 默认值)`，只在无头调参脚本往 `window.__g1` 塞覆盖值时生效；正常播放/导出恒为默认值，不破坏纯函数约定。
- 评分（`pnpm score wd1 --tag v2-g1`，全片 step 0.5）：earth 72.3→71.4、blackout 57.7→60.2、roads 59.4→58.0、global-network 46.2→55.9、world-views（95.95–97.55 子段）79.3→79.7。
- 建议上提到共享库：`part1/earth.ts realEarthCanvas()`（按海陆分开调增益的地球合成，`assets/earth.ts earthComposite` 做不到）；`s04-roads.ts` 的 Albers 投影 + 控制点 RBF 橡皮膜（`projA`），可进 `assets/projection.ts`。
