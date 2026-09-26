# 从原片反求相机（camera solve）

3D 镜头的相机原先是看截图手调的关键帧，运镜对不准。这里用 Blender 的运动跟踪（libmv）从原片直接反求出每帧相机，
输出 JSON 给 three.js 用，让 3D 镜头的运镜逐帧对上原片。

```
原片片段 ──ffmpeg 抽帧──▶ Blender MovieClip ──角点检测 + 双向跟踪──▶ 2D 轨迹
   ──短轨清理 + 对极几何预筛──▶ camera solve（迭代删高误差轨迹重解）──▶ 每帧相机 + 3D 点
   ──地面对齐（可选）──▶ assets/cameras/<名>.json ──camera-track.ts──▶ THREE.PerspectiveCamera
                                         └──（--blend）──▶ assets/blender/<名>.blend 供人工检查
```

## 原理

1. **抽帧**：`ffmpeg -ss <起> -i 原片 -t <长>` 抽成 JPG 序列。第 i 帧（1 起）对应影片时间 `起 + (i-1)/fps`。
   WD2 的 59.94fps 容器里内容其实是 30fps，用 `--fps 29.97` 重采样，跟踪量减半、结果不变。
2. **特征**：每隔 `--detect-every` 帧做一次 Harris 角点检测（`detect_features`，阈值 `--threshold`），
   剔除与已有轨迹重合的新点，然后从该帧**向前、向后双向跟踪**（`track_markers`，默认 LocRotScale 模型、PREV_FRAME 匹配）。
   `--ignore` 区域（字幕、Logo、叠加文字）不检测、且轨迹跑进去的那几帧静音；`--roi` 只在指定区域检测。
3. **预筛外点（关键）**：libmv 的 solve 对外点非常敏感，带着 20% 外点直接解常常误差几十像素、关键帧也选歪。
   所以 solve 前先做对极几何预筛：每隔几帧取一对 `(f, f+gap)`，RANSAC 拟合基础矩阵，不满足对极约束的点
   （叠加文字 / 独立运动物体 / 跟踪跳到相邻相似特征）按比例整条删除或只静音出错的那几帧。
   加这一步后电塔、素模城市、灰色城市从「几十像素」降到 < 1px。
4. **解算**：`solve_camera` 自动选关键帧（失败时回退若干手动组合），可 refine 焦距；之后迭代「删误差 > `--max-error` 的轨迹 → 重解」，
   每轮最多删 40%，重解退化时沿用上一轮关键帧。refine 出的焦距超出 `[初值/4, 初值×4]` 视为跑飞，锁定初值重解。
5. **评级**（写进 `solve.grade`，camera-track 会拒绝加载 poor/degenerate）：

   | grade | 条件 |
   | --- | --- |
   | good | 平均误差 < 1px、覆盖 ≥ 95% 帧、≥ 30 个 3D 点 |
   | usable | 误差 < 3px、覆盖 ≥ 80%、≥ 15 个点 |
   | degenerate | 重投影好，但视差太小（基线/深度 < 0.05）或点云共面且相机贴着这个平面：2D 缩放/平面图层的退化解，3D 结构不可信 |
   | poor | 其他 |

   **只看平均误差会被骗**：删到只剩十几条轨迹、只重建出两帧时误差也可以是 0。所以同时卡覆盖率和点数，另外还有
   `warnings`（例如「refine 后焦距几乎没动 = 焦距没被约束住，fov 只是初值」）。
6. **地面对齐**（`--orient floor`，默认开）：RANSAC 找 3D 点的主平面，旋到 z=0、法线朝相机一侧、质心移到原点。
   平面内朝向和尺度仍是任意的。城市类镜头多半会落在屋顶群/地面上；客厅会选中点最多的后墙——接入时用 `alignTrack` 转正。

### 坐标系

| | JSON（Blender） | three.js（camera-track 加载后） |
| --- | --- | --- |
| 世界 | Z-up 右手系 | Y-up 右手系，`(x, y, z)_b → (x, z, -y)`，即绕 X 轴 -90° |
| 相机局部轴 | 看 -Z，+Y 上，+X 右 | 相同，所以四元数只需左乘同一个世界旋转 |
| 四元数 | `q = [x, y, z, w]` | `new THREE.Quaternion(x, y, z, w)` |
| fov | 垂直视场角（度） | `PerspectiveCamera.fov` |
| 像素（points[].px） | 左上原点，原片分辨率 | — |

尺度只有相对意义（反求没有绝对长度）。`source.fps` 是抽帧帧率；`frames[].t` 已是影片绝对时间。

## 用法

```bash
# 反求一段（输出 assets/cameras/<名>.json；参数原样透传给 tools/blender/solve_camera.py）
pnpm solve wd1 124.3 133.4 --name wd1-clay-city-a --detect-every 10
pnpm solve wd2 4.35 8.3 --name x --fps 29.97 --ignore 0.78,0,1,0.2   # 忽略右上 ctOS Logo

# 按记录好的参数重跑（tools/blender/presets.json）
pnpm solve presets                         # 列出
pnpm solve preset wd1-clay-city-a          # 重跑一个
pnpm solve preset wd1-clay-city-a --blend  # 同时另存 Blender 工程到 assets/blender/

# 调参时省掉最耗时的跟踪：第一次加 --keep-frames（抽帧与跟踪缓存留在 /tmp/wd-solve/<名>/），之后加 --reuse-tracks 只重解
pnpm solve wd1 38.2 50 --name wd1-gray-city-c --frames-dir /tmp/wd-solve/wd1-gray-city --reuse-tracks --sub 42.8,48.3
```

常用参数（完整见 `solve_camera.py` 顶部）：

| 参数 | 默认 | 说明 |
| --- | --- | --- |
| `--focal` / `--sensor` | 35 / 36 mm | 焦距初值与传感器宽；`--no-refine` 锁定焦距 |
| `--tripod` | 关 | 纯旋转解算（相机只转不移） |
| `--threshold` / `--min-distance` / `--detect-every` | 0.002 / 36px / 8 帧 | 特征检测密度 |
| `--pattern` / `--search` / `--motion` / `--corr` | 21 / 91 / LocRotScale / 0.8 | 跟踪模板；重复纹理（电塔阵列）把 `--search` 调小防跳格 |
| `--epi-thr` / `--epi-gap` | 1.5px / 6 帧 | 对极预筛阈值；0 关闭 |
| `--max-error` / `--passes` / `--min-tracks` | 2px / 6 / 40 | 删高误差轨迹重解的迭代 |
| `--ignore x0,y0,x1,y1` / `--roi` | — | 0..1、左上原点，可多次 |
| `--sub t0,t1` | — | 同一份跟踪只解其中一段（配合 `--reuse-tracks` 做分段） |
| `--orient floor\|none` | floor | 地面对齐 |
| `--points` | 60 | 输出多少个稳定 3D 点 |

耗时参考（M 系列 Mac，单核为主）：短镜头 1–3 分钟；9 秒 720p 素模城市跟踪约 30 分钟，重解约 15 分钟。

## 各镜头反求结果

镜头切点以 `docs/shots/` 为准；跨硬切、跨「运动阶段」都分段解。误差为 libmv 平均重投影误差（原片像素）。
「工程自检」是 `.blend` 里烘焙好的相机对象重投影同一批点的误差。

| 名 | 原片时间 | 评级 | 误差 px | 重建帧 | 3D 点 | 焦距 / vfov | 工程自检 px | 可用性 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `wd1-pylons` | 21.75–23.72 | good | 0.66 | 60/60 | 224 | 50.0mm / 22.9° | 0.27 | ✅ 电塔阵列整段（俯视→压低推进） |
| `wd1-gray-city-a` | 34.40–38.20 | poor | 10.7 | 50/114 | 30 | — | — | ❌ 见下 |
| `wd1-gray-city-b` | 38.20–42.80 | good | 0.94 | 139/139 | 139 | 46.4mm / 24.6° | 0.70 | ✅ 低空飞越 → 远景城市板块 |
| `wd1-gray-city-c` | 42.80–48.30 | usable | 1.13 | 144/166 | 163 | 49.5mm / 23.1° | 1.21 | ✅ 抬高旋转成斜俯视（43.6、48.2 附近有几帧缺口靠插值） |
| `wd1-ctos-objects-a` | 98.30–104.40 | poor | 48.9 | 134/183 | 22 | — | — | ❌ 见下 |
| `wd1-clay-city-a` | 124.30–133.37 | good | 0.78 | 273/273 | 1054 | 37.4mm / 30.3° | 0.24 | ✅ **端到端验证镜头** |
| `wd1-clay-city-b` | 133.40–138.97 | good | 0.99 | 168/168 | 156 | 34.1mm / 33.1° | 0.58 | ✅ 压低后拉露出手机（大字被解成一组浮空 3D 点，与原片「字贴在 3D 空间里」一致） |
| `wd1-skyline` | 133.40–139.27 | poor | 33.6 | 144/177 | 17 | — | — | ❌ 见下 |
| `wd2-ctos-grid-a` | 4.35–6.29 | good | 0.98 | 59/59 | 189 | 35mm*（约束不住）| 0.56 | ✅ 低空前滑；fov 用初值，改 fov 需同时调 `alignTrack` 的 scale |
| `wd2-ctos-grid-b` | 6.19–8.25 | poor | 4.64 | 41/63 | 64 | — | — | ❌ 见下 |
| `wd2-bay-a` | 33.40–34.15 | degenerate | 0.17 | 22/22 | 507 | — | — | ❌ 2D 平面图缓推 |
| `wd2-bay-b` | 34.30–36.75 | degenerate | 0.44 | 73/73 | 294 | — | — | ❌ 2D 平面图推近 |
| `wd2-bay-c` | 37.05–38.65 | good | 0.53 | 47/49 | 325 | 71.5mm / 16.1° | 0.18 | ⚠️ 可用，但本质是多层 2.5D 图层；焦距多次运行在 28–72mm 间漂 |
| `wd2-bay-d` | 38.75–40.52 | good | 0.48 | 54/54 | 226 | 50.3mm / 22.8° | 0.31 | ⚠️ 同上；视差 0.06 贴近退化线，重跑可能判 degenerate |
| `wd2-room` | 59.40–65.37 | poor | 0.87 | 141/180 | 80 | — | — | ❌ 整段不可用，用下面的 b 段 |
| `wd2-room-b` | 61.30–64.61 | good | 0.77 | 100/100 | 165 | 42.1mm / 27.0° | 0.57 | ✅ 闪入结束后的客厅拉远段（地面对齐选中了后墙） |

没有解或解不了的原因：

- **WD1 34.4–38.2 暗色扫描线城市**：画面大部分是扫描线点云 + 逐帧横向切片故障（每帧随机错位），特征在帧间不连续，
  对极预筛后只剩 40 条轨迹，覆盖 44%。建议继续手调，或只用 38.2 起的 b 段反推回去。
- **WD1 48.3–50.0**：青色线路和设施标签盖满画面（2D 叠加层），城市角点被遮挡，c 段在 48.3 截止。
- **WD1 98.2–111 设备台**：98.3–104.4 大面积纯黑地面 + 渐变天幕，只有平板边线和少数物件可跟，物件还在 98.4 陆续弹出，
  误差 49px；104.5 后熄灯、物件各自浮起重新排列（非刚体），不满足「只有相机在动」的前提，没有尝试。
- **WD1 123.4–124.3 虚焦俯冲**：强景深模糊 + 高速，没有稳定角点，a 段从 124.3 起。
- **WD1 133.4–139.3 天际线**：背景层是虚焦光斑（没有角点），137.6 才对焦、随即窗灯闪烁熄灭，只剩 17 个点。原片里它是独立背景层，
  和城市不是同一个相机，按 2D 背景处理即可。
- **WD2 3.6–4.35**：芝加哥卫星图淡出过渡；**6.2–8.3** 抬升到正俯视：满屏等距细线网格，模板跟踪频繁跳到相邻格子，预筛后只剩 64 条。
- **WD2 33.4–36.75 湾区地形**：平面地图的 2D 缩放/平移。重投影误差很小（0.17/0.44px），但视差 ≈ 0、点云共面且相机贴着平面，
  焦距完全约束不住——这是纯 2D 运动的退化解，按 2D 变换（缩放/平移）复刻即可，不要当 3D 相机用。
- **WD2 59.4–61.3 客厅闪入段**：物件逐帧白色闪入、HUD 数字、满屏细线；64.6 后右侧白色颗粒噪点盖住画面。

> 结果不完全确定：libmv 自动选关键帧有随机性，同样参数重跑误差会有 ±0.3px、焦距会有漂移（尤其 bay 两段）。
> `presets.json` 记录的是本次评级；重跑后看 `solve.grade` 和 `warnings`，必要时多跑几次挑最好的。

## 验证

1. **three.js 端到端**（`scripts/verify-camera.mjs`，临时脚本，不改镜头）：用 `camera-track.ts` 的公开 API（`loadTrack → applyTrack → projectTrackPoints`）
   在无头 Chromium 里渲染地面网格 + 反求 3D 点（绿十字），叠在原片同一时刻上，输出 `snaps/camera/<名>-<t>.png` 和拼图 `<名>-sheet.png`：

   ```bash
   node scripts/verify-camera.mjs wd1-clay-city-a --n 6
   ```

   `wd1-clay-city-a`：绿十字全程钉在楼顶角点上（125.1 俯拍旋转、128.1 "HACKED" 段、131.1/132.6 抬成斜俯视），
   地面网格的透视消失方向与街道一致；`wd1-pylons` 的网格线直接落在电塔行列上；`wd1-clay-city-b` 地面网格贴合手机/桌面平面。
2. **Blender 工程**（`scripts/verify-blend.mjs`）：打开 `.blend`，打印工程设置，用 Workbench 渲染代理几何（透明底）叠到同帧原片：

   ```bash
   node scripts/verify-blend.mjs wd1-clay-city-a 4   # → snaps/camera/wd1-clay-city-a-blend-sheet.png
   ```

## 接入镜头的步骤（示例：WD1 素模城市）

1. 反求并确认评级：`pnpm solve preset wd1-clay-city-a`，看输出 `[good]`；`node scripts/verify-camera.mjs wd1-clay-city-a --n 6` 读图确认。
2. 在镜头里取轨迹、对齐到镜头场景坐标：

   ```ts
   import { cameraTrack, alignTrack, applyTrack, projectTrackPoints } from '../../../engine/camera-track'

   // 反求坐标 → 场景坐标：先缩放（反求只有相对尺度），再绕 Y 转（让街道方向对上 blockLayout 的网格），再平移
   const clayTrack = alignTrack(cameraTrack('wd1-clay-city-a'), { scale: 60, rotation: [0, 32, 0], offset: [0, 0, 0] })

   // src/films/wd1/part3/city.ts 的 render 里，把
   //   applyOrbit(c.cam, orbitAt(t, KEYS))
   // 换成（124.3–133.4 用 a 段，133.4 起用 b 段，其余时间保留原手调关键帧）：
   render(f) {
     const c = memo('p3-city', buildCity)
     if (f.t >= clayTrack.start && f.t <= clayTrack.end) applyTrack(c.cam, clayTrack, f.t)
     else applyOrbit(c.cam, o)
     // applyTrack 覆盖 position/quaternion/fov、清掉移轴并更新矩阵；之后不要再 lookAt()
     const img = renderShadowed(f, c.scene, c.cam, 0x000000, 1)
     …
   }
   ```

3. 定 `scale / rotation / offset`：
   - **scale**：看楼高或街宽。反求 3D 点里楼顶的 `y`（`clayTrack.points`）与场景里同一类楼的高度之比即 scale。
   - **rotation**：`--orient floor` 已经把地面放平，只剩绕 Y 的转角——把 `projectTrackPoints(cam, clayTrack)` 画成十字叠在复刻画面上，
     转到十字沿着复刻场景的街道走即可。
   - **offset**：把某个特征点（例如 "HACKED" 所在街区）平移到场景里对应的位置。
   - 场景本身是程序化布局、与原片不是同一座城，对齐只能「运镜一致」，楼块不会一一对上；需要逐楼对上就得换原片同款模型（镜头表里的 ASSET）。
4. 相邻两段（如 `wd1-gray-city-b` → `-c`、`wd1-clay-city-a` → `-b`）是**各自独立的坐标系**，要分别对齐；
   交界帧用两段在同一时刻的相机做一次 `alignTrack` 让它们重合，或在交界处硬切/淡化。
5. 超出轨迹时间范围时 `applyTrack` 夹紧到首/尾帧；缺口（`solve.missingFrames`）按相邻帧插值。
6. `pnpm snap wd1 125 128 131` 对照原片，读图检查。

## 文件

| 文件 | 作用 |
| --- | --- |
| `tools/blender/solve_camera.py` | Blender 无头反求脚本（抽帧、跟踪、预筛、解算、评级、地面对齐、输出 JSON、可选 .blend） |
| `tools/blender/presets.json` | 各镜头的反求参数与本次评级 |
| `scripts/solve-camera.mjs` | `pnpm solve` 入口 |
| `src/engine/camera-track.ts` | `loadTrack / cameraTrack / sampleTrack / applyTrack / alignTrack / projectTrackPoints` |
| `assets/cameras/*.json` | 反求结果（含失败/退化的，便于对照） |
| `assets/blender/*.blend` + `README.md` | 可用结果的 Blender 检查工程（原片抽帧不入库） |
| `scripts/verify-camera.mjs`、`scripts/verify-camera/scene.js`、`scripts/verify-blend.mjs` | 临时验证脚本（输出到 `snaps/camera/`） |
