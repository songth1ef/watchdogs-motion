# WD2 part2 镜头表（43s–94s）

实现入口：`src/films/wd2/part2.ts`（只做组装），各镜头在 `src/films/wd2/part2/`：

| 文件 | 内容 |
| --- | --- |
| `bigbrother.ts` | BIG BROTHER 大字、碎片 |
| `faces.ts` | 人脸档案卡、ctOS 面板、闪字、白底骷髅图标 |
| `home.ts` | X 光娃娃 + 客厅（同一个 three.js 场景） |
| `street.ts` | VIN 车辆、DedSec 故障帧、N. Oak St. 街区 |
| `brain.ts` | 网络 → 大脑 |
| `world.ts` | 像素人脸、数据宇宙 → 世界地图 |
| `subs.ts` | 本段旁白字幕（数据表 `SUBS_PART2` + `drawSubtitle`） |
| `common.ts` | 本段共用：程序化人脸、数据小卡片、ctOS 面板、白块光标打字 |

**时间校准**：（V2 注：face-cards / profile / 街区三镜头逐帧核对后改用影片时间写，见各文件 `T = t + DT`；实测 49.25 切点、闪字起点与 seek 取帧一致，DT 平移并非对所有镜头都成立。）
镜头内部的时间码是用 ffmpeg `fps` 滤镜抽帧量的，比 seek 取帧（`pnpm snap`、播放器）早约 0.07s。
`part2.ts` 里用 `DT = 0.07` 统一平移（首尾夹紧到 [43, 94)）。下表时间码是**平移后**的影片时间。
字幕表 `subs.ts` 里的数字已经是校准后的值。

## 镜头

| 时间码 | id | 画面 | 实现要点 | 还原度 |
| --- | --- | --- | --- | --- |
| 43.00–45.95 | wd2-043-big-brother | 43.25 一帧黄绿色闪回；43.34–43.63 三份 "BIG" 错位切片故障；"BROTHER" 橙红色逐字打出（43.63–43.75），43.8 变白；之后缓慢推近 4.5% | 版式按原片量：BIG 552px、BROTHER 192px，左对齐整体居中；故障按 30fps 跳变 | 接近 1:1（黄绿闪回帧为近似） |
| 45.95–47.99 | wd2-045-chips | 大字碎成约 1600 个白/灰小方块，45.95–46.7 字形即被打散（V2 提前），向外散开并翻转，云团水平收拢右移；方块翻面露出马赛克人脸；47.4 起镜头急速推进 | 文字光栅化后网格采样；伪 3D 透视（z 推进）；暗青色连线 | 较接近（原片是真 3D 粒子） |
| 47.99–49.25 | wd2-047-face-cards | 19 张马赛克人脸档案卡：47.99–48.07 从推进中落位，之后几乎静止缓漂；49.117–49.25 天蓝→黄绿→紫→品红四色单色化切片故障（每色 2 帧） | V2：卡片位置/尺寸/角度按原片 48.5s 逐张量（`faces.ts LAYOUT`，只取布局）；小卡加景深模糊；时间码按 seek 取帧的影片时间写（本镜头不需要 DT 平移，内部 `T = t + DT`） | 构图接近；人脸为 ASSET |
| 49.25–54.97 | wd2-049-profile | 主卡 + 右侧 ctOS 档案面板（POLITICAL DONATIONS 红条 → UTILITY RECORDS 青条 → SOCIAL MEDIA HISTORY + 柱状图 → 心碎图标/INSURANCE → MEDICAL RECORDS），慢推并回正；49.28–49.35 白色切片错位；周围是镜头 A 同一组卡片（同场景推近主卡）；you 51.70–51.935、bought 52.37–52.60、sold 52.90–53.14、stolen 53.50–53.74 彩色底块闪字（影片时间，逐帧亮度量）；52.60–52.90 主卡马赛克变粗（原片不是推近特写）；53.14–53.50 切片故障；53.74–54.50 白底暗角 + 骷髅扒文件线稿图标；54.50 起暗红残影淡出 | `ctosPanel(stage)`、`drawFlash()`、`sliceGlitch`、`drawCardLayout(skip)` | 时机与文字 1:1；骷髅图标为 ASSET |
| 54.97–59.37 | wd2-054-toys | X 光娃娃头部特写（右前方斜看，头占左半），"toys" → "toys study" → "your children." 白块光标逐词打出；56.27 跳切正面、眼睛发光；57.0 起倒删文字；一路拉远，点云弧形墙 + 青色地面线 + 左上 "PLAY HABITS 58%/42%" 标签 | three.js：菲涅尔 X 光着色器 + 内部线框零件；标签挂 3D 锚点投影 | 文字/时机 1:1；娃娃为 ASSET（细节远少于原片） |
| 59.37–65.42 | wd2-059-room | **V2（G4b）**：客厅重搭。房间坐标由反求 `wd2-room-b` 的 3D 点求得（后墙窗台/墙面 31 点 PCA 拟合墙面，残差 0.029；相机 up 在墙内投影为 +y；×3.9），家具位置用对齐后的反求相机把 62.97/63.0/64.5/65.2 帧的角点反投影；**61.30–64.61 直接用反求相机**，59.4–61.3 从娃娃远景插值到反求首帧，64.61–65.35 微右移/右摇。线稿加密：扶手椅每面细分网格 + 对角线 + 抖动（原片三角网），窗 2×4 窗格 + 进深 + 高窗，护墙板/腰线/挂镜线，右前隔墙双开门；闪入灰面按部件分强度。娃娃移到左扶手椅上（镜头 A/B 相对娃娃，54.9–59.4 构图不变） | `home.ts`（three.js 裸渲染；试过 post 辉光、墙面暗灰底、错位叠线，评分都更低） | 未解决：反求深度并非处处一致（家具需整体抬 0.4、房间整体下移按评分扫描），61.0 原片大面积灰色闪面没复现；密集细线下 SSIM 只有 0.15–0.3 |
| 65.42–70.33 | wd2-065-vin | 从客厅落地窗/双开门下摇到顶视车 + VIN 面板（1GNCST8Z44M0112674 / 1CS8 / …）+ 白色定位针；67.5 最近，随后快速拉远：车卡变成一张黑卡立在灰色路面上，路北侧一排房子；69.6 路面出现 "N. Oak St."；70.26 车变红打叉，70.30–70.33 切片错位 | V2：拆成三层各自一套相机——车卡层 / 门窗层 / 路面层（原片 3D 透视视差大，一个正交相机对不上）；关键帧按原片逐帧量（面板宽度、定位针位置、门框、路沿线与路宽），影片时间 | 构图接近；透视为分层近似 |
| 70.33–70.57 | wd2-070-hijack | DedSec 劫持快切（每帧 2 个原片帧）：70.333 青色 0/1 螺旋 → 70.367 黄绿漫画 → 70.4 紫色漫画切片 + 暗街红车 → 70.433 红色 LOADING → 70.467 暗红切片 → 70.5 暗品红切片 → 70.533 品红 "OMG!!! IT'S DEDSEC!" | 程序化图形；漫画人物借用 part3 `screamerSprite` 剪影（ASSET） | 节奏 1:1；画面近似（ASSET） |
| 70.57–72.37 | wd2-070-oak | 70.57–70.6 切片错位切入；N. Oak St. 特写：路带在上方、红车 + 红叉 VIN 卡、定位针、地块线；70.9 起车卡右侧个人资料列表逐行出现（随镜头移动）；71.5 起镜头上摇并拉远，路北侧房子与另一辆白车小卡进入画面，衔接下一镜头 | 同上；V2 加世界下移 `dy` 与更快的拉远 | 构图接近 |
| 72.37–77.67 | wd2-072-hood | 更大的街区：左上湖、底部 N. Oak St.、右侧弧形 12th Ave 与外圈弯路、路边等距线稿小房子、BROWSER SEARCH HISTORY / SOCIAL MEDIA HISTORY 卡、马赛克头像、红车红叉；持续拉远，数据卡片陆续出现；75.2–76.5 地图淡出只剩卡片 | V2：世界坐标 = 原片 73.0s 屏幕坐标（湖/路/卡片按该帧量），相机按 72.5/73.0/74.8 反算；地图画在离屏层上整体淡出（避免叠出灰路面） | 布局接近；房子为程序化 |
| 77.67–83.02 | wd2-077-brain | 卡片连成网（白/青/黄细线）；78.3 起画面正中长出竖直纤维亮脊，79.3 起从底部向两侧弯出 U 形下缘；80.6 起纤维状大脑（后脑视角：上窄下宽两半球 + 较窄小脑 + 脑干）显形，充满画面时偏暗；随后拉远缩小到画面上方 | `brainCanvas()` 离屏画布一次性生成；`fibers()` 纤维束；缩放按原片大脑宽度反算 | 节奏接近；大脑为 ASSET（质感差距仍大） |
| 82.82–86.47 | wd2-082-pixel-face | 灰色大方块盖住大脑、飞入落位 → 粗马赛克人脸 → 逐级变细（5→8→12→20→40 格）；卡片边框；83.8 INSURANCE 面板、84.1 红色 MEDICAL RECORDS 条、84.4 红心 "30"；青色网线；人脸卡片急速退入数据宇宙 | `faceTex(seed, res, true)` 深底证件照 | 节奏接近；人脸为 ASSET |
| 84.07–94.00 | wd2-084-universe-world | 数千个小数据块在纵深里漂浮（人脸卡片退入其中），85–88 红色细框、89 "202.56.818"；89.1–92.3 纵深压平汇成世界地图数据点；之后缓慢拉远、变暗偏蓝 | V2：NE 50m 陆地遮罩内按 Black Marble 夜光加权采样 6500 点（欧洲/印度/东亚/美东密，撒哈拉/西伯利亚空）；投影按 92.5s 地标拟合 | 世界段（91.5–94）接近；纵深漂浮段近似 |
| 43.00–94.00 | wd2-043-subtitles | 旁白字幕（最后绘制，盖在所有镜头上） | 24px 中粗 Helvetica，基线 y=978，白字 + 3px 半透明黑描边 | 文本与时间 1:1 |

## 字幕（校准后）

| 起 | 止 | 文本 |
| --- | --- | --- |
| 43.17 | 45.27 | Big Brother no longer works alone. |
| 45.27 | 50.87 | Thousands of little brothers monitor and aggregate your every move, building a complete |
| 50.87 | 54.87 | digital profile of YOU, to be bought, sold or stolen in an instant. |
| 54.97 | 59.37 | Toys study your children, reporting their play habits back to marketers. |
| 59.37 | 64.42 | Appliances, consoles and home security systems give corporations a window into your |
| 64.42 | 65.32 | private life. |
| 65.42 | 70.17 | Control of your vehicle and mobile device can now be breached remotely by anyone, |
| 70.17 | 70.92 | at any time. |
| 71.07 | 74.67 | You may think that you are immune or underestimate the risks, |
| 74.67 | 77.57 | but your digital shadow is already compromised. |
| 77.57 | 81.52 | Insurance companies use algorithms to monitor your life habits |
| 81.57 | 83.27 | and limit or deny coverage. |
| 83.37 | 87.17 | Health providers determine if your cancer is worth treating. |
| 87.27 | 90.67 | Search results and news feeds are skewed to bias mood |
| 90.67 | 94.00 | and influence your vote, engineering social uprisings on a massive scale.（原片延续到 94.2s 之后，由下一段接续） |

## ASSET（程序化替代品，换真实素材改这些函数）

| 资产 | 函数 | 替换方法 |
| --- | --- | --- |
| 马赛克人脸 | `common.ts` `faceTex(seed, res, forceDark)` | 改成把真实头像 `drawImage` 到 res×res 小画布（保持缓存 key），所有卡片/像素人脸自动生效 |
| X 光娃娃 | `home.ts` `buildDoll()` | 用 GLTFLoader 加载模型，外壳材质沿用 `xray()`，内部零件用 `LineSegments`；眼睛发光锚点 `eyes` 需同步 |
| 线框客厅 | `home.ts` `buildRoom()` | 加载客厅模型后用 `EdgesGeometry` 生成线框，按 `RoomPart.t0` 分组控制出现时间 |
| 骷髅文件图标 | `faces.ts` `skullIcon()` | 换成 `drawImage(图标)`，以图标中心为原点、约 150px |
| 顶视车 / 房子 | `street.ts` `carTop()` / `isoHouse()` | 换成矢量或位图素材 |
| DedSec 劫持帧 | `street.ts` `renderHijack()` | 三帧各换一张图片 |
| 大脑 | `brain.ts` `brainCanvas()` | 返回一张 1300×1300 透明底大脑图（后视） |
| 世界地图 | `world.ts` `CONTINENTS` | **V2 已换**：`realWorldPoints()` = NE 陆地 + 夜光加权；`CONTINENTS` 仅作回退 |

## 已知差距

- 娃娃、客厅、大脑都是基本体/程序化近似，细节密度明显低于原片（原片是真实 3D 模型渲染）。
- 65–72s 街区原片是 3D 俯视透视、相机有较大旋转；这里用 2D 正交 + 缩放/旋转，69–70s 路带相对车卡的位置与原片不同。
- 72–77s 街区道路/房子布局是示意，不是原片地图的逐线复刻。
- 碎片（46–48s）与数据宇宙（84–91s）是伪 3D，粒子运动轨迹与原片不同，只对齐了密度、范围和节奏。
- 人脸为程序化灰度头像，不是真实照片。
- 43.25s 的黄绿色闪回帧应是 part1 最后一个镜头的画面，这里用噪点近似。

## 建议上提到共享库

- `common.ts` `blockType()`：白块光标打字/删字（WD2 多处出现）→ `fx/text.ts`。
- `common.ts` `faceTex()` / `drawFace()` / `faceCard()`：程序化马赛克证件照 → `fx/image.ts` 或新的 `fx/face.ts`（WD1 人脸档案也可用）。
- `common.ts` `dataCard()`：随机 UI 数据小卡片 → `fx/` 新模块，WD1/WD2 的数据云都能用。
- `common.ts` `ctosPanel()`：ctOS 档案面板 → WD2 其他段也有同款面板。
- `subs.ts` `drawSubtitle()` + 字幕数据表：全片字幕应统一到一个模块（和 part1 的字幕合并）。
- `street.ts` `keyed()` / `home.ts` `camPath()`：关键帧插值（数值 / 3D 机位）→ `engine/math.ts`。
- `common.ts` `cachedCanvas()`：按 key 一次性绘制并缓存的离屏画布（与 `fx/canvas.ts` 的复用池不同，这个是「画一次永久缓存」）→ `fx/canvas.ts`。
- `part2.ts` 的 `DT` 时间平移：如果其他段也用 fps 滤镜量时间，建议在 README 约定统一用 seek 取帧量时间。
- `street.ts` 劫持帧借用了 `part3/art.ts` 的 `screamerSprite()`（尖叫眼镜男剪影）；`art.ts` 的 `sprite()` 系列插画建议整体上提到 `src/fx/`，避免 part 之间互相 import。
- `faces.ts` / `street.ts` 里按帧做的「整屏 multiply 单色化 + sliceGlitch」四色故障帧，WD2 多处出现，可上提为 `fx/glitch.ts` 的 `tintGlitch(ctx, color, seed)`。

## V2 精修记录（G1 地图与地球组）

- `world.ts`：`realWorldPoints()` = NE 50m 陆地遮罩 + Black Marble 夜光（G−0.55·B 去掉陆地蓝底，原分辨率 4096 采样）加权拒绝采样；`projX/projY` 参数按 92.5s 八个地标拟合（等距圆柱，x 4.78 px/° 、y 4.78 px/°）。
- 评分（`--tag v2-g1`）：universe-world 54.4→55.0；其中世界地图段 91.5–94 每帧 +4~9（如 92.0 75→81、94.0 87→91），纵深漂浮段 86–90 因点分布变集中略降 1~3。
