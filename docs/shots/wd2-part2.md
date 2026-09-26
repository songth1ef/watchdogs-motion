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

**时间校准**：镜头内部的时间码是用 ffmpeg `fps` 滤镜抽帧量的，比 seek 取帧（`pnpm snap`、播放器）早约 0.07s。
`part2.ts` 里用 `DT = 0.07` 统一平移（首尾夹紧到 [43, 94)）。下表时间码是**平移后**的影片时间。
字幕表 `subs.ts` 里的数字已经是校准后的值。

## 镜头

| 时间码 | id | 画面 | 实现要点 | 还原度 |
| --- | --- | --- | --- | --- |
| 43.00–45.95 | wd2-043-big-brother | 43.25 一帧黄绿色闪回；43.34–43.63 三份 "BIG" 错位切片故障；"BROTHER" 橙红色逐字打出（43.63–43.75），43.8 变白；之后缓慢推近 4.5% | 版式按原片量：BIG 552px、BROTHER 192px，左对齐整体居中；故障按 30fps 跳变 | 接近 1:1（黄绿闪回帧为近似） |
| 45.95–47.99 | wd2-045-chips | 大字碎成约 1600 个白/灰小方块，向外散开并翻转，云团水平收拢右移；方块翻面露出马赛克人脸；47.4 起镜头急速推进 | 文字光栅化后网格采样；伪 3D 透视（z 推进）；暗青色连线 | 较接近（原片是真 3D 粒子） |
| 47.99–49.32 | wd2-047-face-cards | 三十多张马赛克人脸档案卡（白边 + 眼部白条）翻飞，镜头缓推 | `faceCard()` + 程序化人脸 | 构图接近；人脸为 ASSET |
| 49.32–54.97 | wd2-049-profile | 主卡 + 右侧 ctOS 档案面板（POLITICAL DONATIONS 红条 → UTILITY RECORDS 青条 → SOCIAL MEDIA HISTORY + 柱状图 → 心碎图标/INSURANCE → MEDICAL RECORDS），慢推并回正；51.70 "you"、52.36 "bought"、52.95 "sold"、53.49 "stolen" 彩色底块闪字（色块/彩字颜色逐帧在洋红/天蓝/黄绿/紫之间跳），闪字之间插卡片特写（52.63 推到脸部、53.19 切片故障）；53.78 白底暗角 + 骷髅扒文件线稿图标；54.53 暗红残影淡出 | `ctosPanel(stage)`、`drawFlash()`、`sliceGlitch` | 时机与文字 1:1；骷髅图标为 ASSET |
| 54.97–59.37 | wd2-054-toys | X 光娃娃头部特写（右前方斜看，头占左半），"toys" → "toys study" → "your children." 白块光标逐词打出；56.27 跳切正面、眼睛发光；57.0 起倒删文字；一路拉远，点云弧形墙 + 青色地面线 + 左上 "PLAY HABITS 58%/42%" 标签 | three.js：菲涅尔 X 光着色器 + 内部线框零件；标签挂 3D 锚点投影 | 文字/时机 1:1；娃娃为 ASSET（细节远少于原片） |
| 59.37–65.42 | wd2-059-room | 继续拉远，娃娃移到左侧，坐标数字 HUD；60.07 电视柜白色实体闪现，60.4–61.2 电视、墙窗、扶手椅、茶几、扫描三角网依次闪入；镜头拉远看客厅全景；64 起右侧白色颗粒；最后右摇到门口 | 同一 three.js 场景；线条错位叠加模拟 2px 线宽 | 结构近似；客厅为 ASSET |
| 65.42–70.37 | wd2-065-vin | 下摇到顶视车 + VIN 面板（1GNCST8Z44M0112674 / 1CS8 / TEST CIRCUIT / BRAKING / CODE / YEAR / SERIES / SERIAL / CHECK DIGIT）+ 白色定位针 + 门；一路拉远成街区线稿；70.12 车变红打叉，路面出现 "N. Oak St." | 2D 世界 + 相机（平移/缩放/旋转） | 近景 VIN 面板接近 1:1；拉远段为正交近似（原片是 3D 俯视透视） |
| 70.37–70.62 | wd2-070-hijack | DedSec 劫持三帧：青色 0/1 像素螺旋、红色 LOADING + 红车红叉、洋红漫画 "OMG!!! IT'S DEDSEC!" | 程序化图形 | 近似（ASSET） |
| 70.62–72.37 | wd2-070-oak | N. Oak St. 特写：路带在上方、红车 + 红叉 VIN 卡、定位针、白/青/黄地块线；71.6 起右侧个人资料列表（LAST NAME / FIRST NAME …）逐行出现 | 同上 | 构图接近 1:1 |
| 72.37–77.67 | wd2-072-hood | 更大的街区：湖、12th Ave、N. Oak St.、等距线稿小房子、BROWSER SEARCH HISTORY / SOCIAL MEDIA HISTORY 卡、马赛克头像、红车红叉；持续拉远，数据卡片陆续出现；75.2–76.5 地图淡出只剩卡片 | 2D 世界 + 相机 | 元素齐全，布局近似 |
| 77.67–83.02 | wd2-077-brain | 卡片连成网（白/青/黄线）并被拉向中心，网线勾出大脑；79.5 起纤维状大脑（后脑视角：两半球 + 小脑 + 中线亮脊）显形并充满画面；随后拉远缩小到画面上方 | `brainCanvas()` 离屏画布一次性生成 | 节奏接近；大脑为 ASSET（质感差距较大） |
| 82.82–86.47 | wd2-082-pixel-face | 灰色大方块盖住大脑、飞入落位 → 粗马赛克人脸 → 逐级变细（5→8→12→20→40 格）；卡片边框；83.8 INSURANCE 面板、84.1 红色 MEDICAL RECORDS 条、84.4 红心 "30"；青色网线；人脸卡片急速退入数据宇宙 | `faceTex(seed, res, true)` 深底证件照 | 节奏接近；人脸为 ASSET |
| 84.07–94.00 | wd2-084-universe-world | 数千个小数据块在纵深里漂浮（人脸卡片退入其中），85–88 红色细框、89 "202.56.818"；89.1–92.3 纵深压平汇成世界地图数据点；之后缓慢拉远、变暗偏蓝 | 世界地图 = 手写简化大陆多边形光栅化后采样 6500 点；伪透视 | 近似；地图轮廓为 ASSET |
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
| 世界地图 | `world.ts` `CONTINENTS` | 换成 GeoJSON 大陆多边形，投影 `projX/projY` 保持不变 |

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
