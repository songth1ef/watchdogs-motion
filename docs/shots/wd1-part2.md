# WD1 · part2 镜头表（50s–100s）

实现入口：`src/films/wd1/part2.ts`（汇总镜头，空档自动补占位）；各镜头在 `src/films/wd1/part2/sNN-*.ts`，文件名数字 = 起始秒。
坐标约定：part2 所有镜头都在**原片 1280×720 坐标**里画（`common.ts` 的 `ref(ctx)` 先 `scale(1.5)`），参考帧上量到的像素可直接写进代码。
镜头运动大多用 `track(t, [[时间, 值], ...])`（Catmull-Rom 关键帧），关键帧值是从原片逐帧量出来的。

对照命令：`pnpm snap wd1 <秒...>`。

## 镜头列表

| 时间码 | 文件 | 画面元素 / 文字 | 运动与转场 |
| --- | --- | --- | --- |
| 50.0–53.4 | `s50-city.ts` | 承接 part1 的俯拍 3D 城市、7 个等宽小标签（TRAFFIC LIGHTS / NUCLEAR PLANT / CAMERAS / DOOR LOCK / SECURITY SYSTEM / BRIDGE CTRL / WATER SUPPLY），右侧 "centralized control" + 青底 subway lines / traffic lights / surveillance / electricity grids | 相机持续后拉+偏转；50.65 打出第 4 行；50.85–51.45 城市灰→青交叉淡变；51.8 起各行自上而下错开擦除（青底右端固定、左缘收窄，文字从尾部截掉，无底块行从头部擦）；52.3 标签文字消失只剩白条；52.7 起斜向溶解到黑 |
| 52.8–57.9 | `s53-computer.ts` | 黑底 "COMPUTER"（119px 粗体）/ "CONTROLS A MAJOR CITY"（62px） | 打字（下一个字符先半透明闪一下）；55.08 起 " A MAJOR CITY" 加速右滑出屏；55.55 巨大 "?" 从左外减速滑入；55.62 CONTROLS、56.26 COMPUTER 被青色高亮笔刷过（字变黑） |
| 57.75–62.7 | `s58-tower.ts` | 白底页面：威利斯塔剪影、深色标签 "THE ANSWER IS..."、"Private companies that have / everything to gain from a..."（Private companies 青高亮）、引线、黑底 "ctOS" 字标（CT 小型大写，O/S 底块更高）、塔身青块、小方块注释、T. Rushmore 引语 4 行 | 57.75 白页从左扩展铺满；镜头从 3.3× 急拉到 1.4×、再指数缓拉到 1×；60.65–61.3 向左上平移；61.3 起页面上移出画，下缘带灰绿色反光，露出黑底 |
| 62.6–69.4 | `s62-skull.ts` | CT 头部扫描；"Personal Data Collection"（青底）/ "is the key commodity"（斜纹浅青底）；两侧白色定位小标记；青色数据点 | 62.9 切片由小放大；单张切片从头顶逐层扫到上颌；65.65 切换为已扫描切片堆成的 3D 体：俯视同心环 → 66.0 正视横条纹 → 67.2 斜俯视侧转 → 68.4 倾斜；文字 65.6 后下移左移并收窄消失；68.8–69.3 缩成网络中心节点；67.6 起网络在头骨后面生长 |
| 69.4–71.92 | `s69-network.ts` | 星状射线网络、"_INDIVIDUAL"、"_DATA CLUSTER"、美国地图（城市名小字 + 短横线）、"_Global Network" | 相机旋转回正并拉远；69.5–70.5 城市小字浮现，70.2–71.1 射线淡出；70.05 起打 "_Global Network"；71.4 起推镜、字放大移出；71.8 一帧急推到五大湖城市名（MINNEAPOLIS/MILWAUKEE/…） |
| 71.9–77.45 | `s72-statue.ts` | 自由女神（远景带水面倒影）、白底黑字 "last year / the / average American"、斜纹大剪影「数字影子」、斜纹字 "Digital Shadow"、深色 "2" + ".3Gb" | 72.0–72.3 急推；逐行打字（底块先出）；73.4 起文字从头擦除、白条依次右滑出画；73.45 斜纹字从左显出；74.3 起 "2" 浮现，74.95 起 ".3Gb" 逐字出现并持续放大；镜头左移，女神移出左侧；77.02 起压暗淡出 |
| 77.0–82.4 | `s77-represent.ts` | "what does that REPRESENT?"（常规 + 粗体）、25 行黑条涂黑文档，空隙小字 Social Networks / Email / Cat Pictures / VoIP / Pornography / Blogs / Pirate Movies / Zip Files / mp3s / Credit Cards / Medical Records / Reading History / Software | 顶线先从左拉出（它就是第 0 行）；条块分块零散弹出；78.1 起小字出现；78.75 Credit Cards、79.0 Medical Records、80.75 Reading History 刷青；80.95–81.35 轻微拉远；81.4 起标题只剩 "REPRESENT?" 变灰淡出，条块随机消失 |
| 81.6–87.1 | `s82-ctos-silos.ts` | "But a / ctOS / includes much / more"（顶线保留自文档第 0 行）、"Data Silos" 6×5 卡片阵列 | 打字；83.97 起整块作为立方体正面向左转走，右侧面是卡片阵列（竖条带仿射模拟透视）；84.9 起卡片各自翻转成放射状；85.85–86.3 阵列绕竖轴翻一圈（中途只剩一条竖线）并变宽；86.9 淡出 |
| 86.3–91.25 | `s86-pixel-words.ts` | 像素字 "HOW  YOU / THINK" → "WHAT  YOU / BELIEVE"（手写 5 行点阵，每个像素是带 3×3 细格的小卡片） | 像素按字母成组从下方升起、翻转着在中部带状区聚集，87.55 起逐个落位；88.3–89.1 镜头从 1.35× 拉回 1×；89.35–89.7 逐像素换字；90.55 起像素四散放大成白块；91.12 整屏白 |
| 91.1–94.72 | `s91-profiles.ts` | 白格面板、白模侧脸、"Citizen Profiles"（青底）、6 列条码柱（4、5 列染青）、档案字段（FILE NO. / Name: A. Pearce / Birthdate / Status / Place of Birth / Citizenship / Criminal Record / CAUTION，值为青底等宽字） | 91.1–91.45 白格面板扩展铺满；人头从中上方推近并穿过淡出；92.5 标题打字、条码柱阶梯长出、字段逐项打出；镜头 0.55×→1×（93.9）→ 4.6×推向 Status 栏 |
| 94.1–96.4 | `s94-sell.ts` | "SELL PRODUCTS"（青底 72px）+ ASCII 字符美元符号 | 在 Status 栏里打出，镜头拉近到 1×，缓推到 1.25×；96.02 起整体透视倾斜、放大上移、淡出 |
| 95.95–100 | `s96-map-ctos.ts` | 世界地图（浮雕灰大陆 + 青色网络 + 细框 + 散点）、"INFLUENCE YOUR WORLD VIEWS"（斜体细 + 粗体）；ctOS 字标；暗色展台（白色发光边线地台、汽车、卫星天线、卫星、ATM） | 地图 95.95 从下方升起并缓推；97.55 起从 ctOS 的 "O" 内孔向后拉出（孔内先是地图 → 变白 → 透明）；字标缩到顶部；97.9 起展台出现，98.4 起其余设备淡入，镜头后退并缓慢偏转（接 part3） |

## 接近 1:1 的部分

- 所有文字镜头的**文字内容、位置、字号、字重、打字/擦除节奏**：COMPUTER CONTROLS、THE ANSWER IS / Private companies / ctOS、Personal Data Collection、last year / average American、Digital Shadow 2.3Gb、what does that REPRESENT 文档（25 行、12 个标签、3 行青色的顺序与时刻）、But a ctOS includes much more、HOW YOU THINK / WHAT YOU BELIEVE 的像素排布、Citizen Profiles 档案字段、SELL PRODUCTS。
- 镜头运动：塔楼页面的缩放/平移/上移出画、CT 头部的放大与翻转时序、网络镜头的缩放与末尾急推、立方体转面、像素字的镜头拉回，关键帧都取自参考帧实测。
- 黑白底反转与转场时刻：52.7 城市溶解、57.75 白页、61.3 页面上移、77.02 淡出、81.4 文档瓦解、91.12 白屏、97.55 拉出 O。

## 近似替代（ASSET）

| 素材 | 替换位置 | 说明 |
| --- | --- | --- |
| 3D 城市 | `s50-city.ts` → `buildCity()` | 用 `three/city.ts` 程序化楼块；原片灰色阶段是高细节城市 |
| 威利斯塔 | `s58-tower.ts` → `drawTower()` | 分层矩形 + 雾化渐变 |
| CT 切片 / 头部体 | `s62-skull.ts` → `ctSlice(level)`、`widthAt()`/`drawHead()` | 程序化切片（颅骨环、脑回、眼眶、骨块）；换真实 CT 序列：`ctSlice` 返回对应层图片 |
| 美国轮廓 / 城市 | `s69-network.ts` → `US_OUTLINE`、`CITIES` | 约 45 点轮廓 + 约 100 个城市坐标 + 随机填充 |
| 自由女神 | `s72-statue.ts` → `statuePath()` / `drawStatue()` | 手写多边形剪影 + 随机面片明暗；影子复用同一剪影 |
| 白模人头 | `s91-profiles.ts` → `drawHead()` | 侧脸剪影 + 径向渐变 + 扫描线 |
| 世界地图 | `s96-map-ctos.ts` → `CONTINENTS` / `drawWorld()` | 9 个粗多边形 + 阴影 |
| 展台设备 | `s96-map-ctos.ts` → `drawCar/drawDish/drawSatellite/drawATM` | 2D 线框剪影按地面透视缩放 |

## 已知差距

- 城市、塔楼、头骨、女神、人头、地图、展台都是程序化近似，质感（细节、景深、模糊）与原片差距明显。
- 50–53s 与 part1 结尾的城市镜头是各自独立实现的，50.0 处画面可能不连续（需要与 part1 统一相机/城市 seed）。
- 头部 3D 体的斜俯视角度（67–68.4s）只大致对上；原片有面部骨骼碎片。
- 71.9s 的急推城市名只有一两帧，城市位置按真实经纬度摆放，和原片布局不完全一致。
- Data Silos 卡片的翻转图案、86.3–87.5 飞散块的轨迹是近似的；原片是真 3D。
- 像素字换字（89.4–89.9）原片带逐像素的形变扭曲，这里是随机消失/出现 + 横向抖动。
- ASCII 美元符号用光栅化字形自动生成字符，字符分布与原片不同。
- 97.55–98.2 从 O 内孔拉出时，孔内地图的缩放是估计值。
- 展台镜头 98–100s 的相机偏转、设备位置是估计值；原片有景深模糊和点云粒子。

## 建议上提到共享库

- `part2/common.ts`：
  - `ref(ctx)` / 1280 坐标约定：参考帧量尺可直接用，建议作为全局可选坐标系。
  - `track(t, keys)`：Catmull-Rom 关键帧插值，拟合从参考帧量出的运动曲线，各段都用得上。
  - `typed()` / `drawTyped()`：带「下一个字符半透明」的打字效果（WD1 标准打字样式）。
  - `marker()`：高亮笔刷过、笔刷内文字变色（WD1 青色高亮），比 `fx/text.highlight` 更贴原片。
  - `eraseHead()` / `eraseTail()`：两种擦除方向。
  - `darkLabel()`：WD1 深色等宽标签（"THE ANSWER IS..."）。
- `s82-ctos-silos.ts` → `drawFace()`：把 2D 图按竖条仿射贴到 3D 四边形（纯 2D 画布模拟透视贴图），可用于立方体转面、斜放的屏幕等。
- `s86-pixel-words.ts` → `PIX` 像素字体 + `layout()` + `tile()`：WD1 的像素卡片字；`fx/dot-matrix` 基于 VT323 光栅化，字形与原片差距大。
- `s72-statue.ts` → 「斜纹填充文字」（离屏画字 + source-in + 斜线）：`fx/image.hatchRect` 只能填矩形。
- `s94-sell.ts` → `asciiGrid()`：任意字形/图形 → ASCII 字符画。
- `s72-statue.ts` → `poly()`：统一子路径环绕方向，避免非零规则下多部件剪影互相挖洞。
