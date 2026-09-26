# 3D 后期模块（src/three/post.ts）

原片 3D 镜头的质感大半来自后期：素模城市的柔和 AO 与景深、WD1 灰城的白色楼沿与高反差、设备台的强景深与发光边、
天际线的散景光斑、WD2 线框城市的辉光与色差、全片颗粒。`post.ts` 把这些做成一个可组合的后期管线，镜头精修时按需接入。

## 选型：three 自带 examples/jsm/postprocessing

没有引入 pmndrs `postprocessing`，理由：

- **零新依赖、版本锁死**：`three/examples/jsm` 随已安装的 three 0.186.1 一起发布，不会出现两个包对 three 版本要求不一致的问题；
  其他 agent 正在改 `package.json`，不加依赖也避免了锁文件冲突。
- **我们要的效果大多要自己写**：WD1 的亮边描线、带高光增益的散景、固定 0/1 的对比度曲线、按帧号播种的颗粒，
  pmndrs 里也没有现成的；它最大的优势（把多个效果合并进一个 shader）在这里只省一两个全屏 Pass。
- 现成且好用的部分直接复用：`EffectComposer`（Pass 链与缓冲交换）、`UnrealBloomPass`（辉光）、`GTAOPass`（AO）、
  `Pass / FullScreenQuad`。景深、描线、收尾是本文件里的自定义 Pass。
- `BokehPass` 没用：它要额外用 `MeshDepthMaterial` 再画一遍场景取深度，虚化是固定核、亮点散不成圆斑，也不支持画面单位的光圈。
  自写的景深直接复用场景 Pass 的深度纹理。

## API

```ts
import { renderWithPost, presets, mergePost, lastPostStats, disposePost } from '../../../three/post'

// 与 three.render(scene, cam, clear, clearAlpha) 同样返回共享 renderer 的 canvas
const img = renderWithPost(three, scene, cam, mergePost(presets.greyCityEdges, { time: t }))
ctx.drawImage(img, 0, 0)
```

- `renderWithPost(three: ThreeHost, scene, camera, opts): HTMLCanvasElement`
  - 与 `ThreeHost` **共用同一个 WebGLRenderer**，渲染完恢复 renderer 状态（render target、clear 色、autoClear、shadowMap），
    其他仍在用 `three.render()` 的镜头不受影响（实测：后期渲染前后，同一帧裸渲染逐像素比对最大差 1/255、仅 1 个像素）。
  - 管线按「开了哪些效果 + msaa + AO 分辨率」缓存（每个 renderer 一个 Map），**不会每帧重建**；参数都是 uniform，每帧更新。
  - 相机须为 `PerspectiveCamera`（景深/AO/描线要用 near/far 还原视深）。
- `mergePost(base, over)`：合并参数，效果子对象逐字段合并；给 `false` 关掉某个效果。
- `lastPostStats()`：最近一次 `profile: true` 渲染的逐 Pass 耗时（毫秒）。
- `disposePost(three)`：释放该 renderer 上缓存的所有管线（一般不需要）。

### 参数（全部可选、可组合）

所有数值参数类型是 `Anim = number | (t) => number`，按 `opts.time` 求值——渲染仍是时间的纯函数。

| 键 | 说明 |
| --- | --- |
| `time` / `fps` / `frame` | 影片绝对秒；颗粒种子 = `frame ?? round(time × fps)`（fps 默认 30）。不用 `Math.random()` |
| `clear` / `clearAlpha` | 同 `three.render` 的清屏参数，默认黑、透明（保留透明背景，可叠在 2D 天幕上） |
| `shadows` | 临时打开 `shadowMap`（PCFSoft）渲染这一帧，渲染完恢复（代替 part3 的 `renderShadowed`） |
| `msaa` | 场景 MSAA 采样数，默认 4（裸渲染的 canvas 本来也开了 antialias） |
| `ao` | GTAO：`intensity` 混合量、`radius`/`thickness`（世界单位）、`distanceFallOff`、`scale`、`samples`（默认 12）、`resolution`（默认 0.5，结构参数） |
| `dof` | 景深：`focus`（距离 / 世界坐标点 `{x,y,z}` / 画面自动对焦 `{uv:[u,v]}`）；光圈二选一：`aperture`（无限远虚化直径 px）或物理单位 `fStop`+`focalLength`(mm)+`worldScale`(米/单位)；`maxBlur`、`nearScale`（近景额外倍数）、`highlight`（高光散景增益 0..~60）、`highlightThreshold`、`debug`（输出虚化图） |
| `bloom` | UnrealBloom：`threshold`（线性亮度）、`strength`、`radius` |
| `edge` | 法线/深度描线：`color`、`intensity`、`thickness`(px)、`normalThreshold`、`depthThreshold`、`fadeNear`/`fadeFar`（视深淡出）、`roofBias`（只描楼顶轮廓的偏好）、`faceGain`（非描线处压暗） |
| `grain` | 数字或 `{ amount, size }` |
| `chromatic` | 角落处 R/B 通道错位像素数（径向） |
| `vignette` | 数字或 `{ amount, offset }` |
| `tone` | `exposure`、`toneMap: 'none' \| 'aces' \| 'reinhard'`、`contrast`（固定 0 与 1 的 S 曲线，透明区域不会被抬灰）、`saturation`、`black`/`white`、`gamma` |
| `profile` | 逐 Pass 计时（每个 Pass 前后回读 1 像素同步 GPU，会变慢） |

### 管线顺序

```
scene(MSAA+深度纹理) → normals(只画实体网格) → ao(GTAO, 半分辨率) → edge → dof(预滤波→半分辨率聚集→合成) → bloom → finish
```

- 管线内部是线性色彩空间（HalfFloat）；`finish` 负责色差、曝光/色调映射、sRGB 编码、饱和度/黑白位/对比度、暗角、颗粒。
  所有效果都关掉时输出与 `three.render()` 基本一致。
- `normals` 跳过线、点、精灵、线框材质和不透明度 < 0.35 的半透明材质（全息体、线框城市不参与 AO/描线）。
- 输出是预乘 alpha：透明背景区域里的辉光/描线（rgb > a）在 `drawImage` 到 2D 画布时表现为加亮叠加。

## 预设

参数对照 `reference/frames`（1fps）调出，作为接入起点；随镜头变化的量（焦点、光圈）接入时用 `mergePost` 覆盖。
三联图（裸渲染 | 加后期 | 原片）在 `snaps/post/<预设>-<秒>.png`，由 `node scripts/post-demo.mjs` 生成。

| 预设 | 原片镜头 | 内容 | 三联图结论 |
| --- | --- | --- | --- |
| `clayCity` | WD1 123.4–133.4 素模城市（part3/city.ts，参考帧 125–133） | shadows + GTAO + 画面中心自动对焦景深 + 极弱辉光 + 轻颗粒/暗角 | 楼脚与楼顶台阶处出现柔和遮蔽，斜俯视时远端虚化，更接近原片的「软」；辉光阈值必须贴近 1（白楼本身≈1.0），否则街道被抬灰。原片的移轴虚化更强、楼体细节更多，这是模型问题 |
| `greyCityEdges` | WD1 38.2–50 灰色城市（part1/s09-city.ts，参考帧 040–050） | GTAO + 白色楼沿描线（偏楼顶、远处淡出、楼面压暗）+ 前后景虚化 + 高反差/压黑位 + 颗粒 | 从「均匀灰盒子」变成「暗楼体 + 白色亮边 + 近景虚化」，是五个里提升最明显的；原片亮边是稀疏的高光而不是每栋楼一圈，且远景更暗——精修时可再降 `edge.intensity`、收紧 `fadeFar` |
| `stageDOF` | WD1 98.2–111 设备台（part3/objects.ts，参考帧 099–111） | 对准物件群中心的景深（近景 2.5 倍虚化）+ 强辉光 + 高光散景 | 近处平板白边虚化并发光、物件保持清晰，与原片 100–104 的构图一致；2D 画的平板顶面描边与 ctOS 字不受 3D 后期影响（仍清晰） |
| `skylineBokeh` | WD1 133.4–139.3 手机城市 + 天际线（city.ts / lights.ts，参考帧 134–139） | 大光圈景深 + 高光增益 20（亮点散成实心圆斑）+ 辉光 | 手机段城市的发光与柔化接近原片；天际线目前是 2D（lights.ts），3D 后期作用不到它。`scripts/post-demo` 里的合成测试（`snaps/post/bokeh-test.png`）验证了 3D 窗灯会散成明亮圆斑——天际线改成 3D 后可直接套用 |
| `wireGlow` | WD2 3.6–8.75 线框城市（wd2/part1/ctos-city.ts，参考帧 wd2/005–009） | 低阈值辉光 + 径向色差 3px + 远景轻虚化 + 颗粒 | 青色点云天际线变成发光的雾团，接近原片；但地面街网在裸渲染里就比原片亮、粗，辉光会放大这一点——精修时应先把街网调暗再加辉光 |

## 接入一个镜头（示例 diff，未实际修改镜头文件）

**s09-city（WD1 34.4–50）**：亮场段走后期，去掉 2D 的 `contrast(1.5)`（由 `tone.contrast` 负责）。暗场故障段保持原样。

```diff
 import { memo } from '../../../engine/three-host'
 import { cityLayout } from '../../../three/city'
+import { mergePost, presets, renderWithPost } from '../../../three/post'
 ...
   render({ ctx, t, three }) {
     const { scene, cam, routes } = cityScene()
     placeCam(cam, t)
-    const gl = three.render(scene, cam)
-
     const dark = t < 38.2
+    const gl = dark
+      ? three.render(scene, cam)
+      : renderWithPost(three, scene, cam, mergePost(presets.greyCityEdges, {
+          time: t,
+          // 46 s 起更陡的俯视：焦点下移到画面下部，近景虚化更强
+          dof: { focus: { uv: [0.5, 0.6] }, nearScale: (tt) => 1.8 + seg(tt, 46, 48) },
+        }))
     ctx.save()
     const bright = dark ? 0.18 + 0.5 * seg(t, 37.0, 38.2) : 1
     const flick = dark && hash(Math.floor(t * 30) * 7) < 0.25 ? 0.5 : 1
-    ctx.filter = `contrast(1.5) brightness(${bright * flick})`
+    ctx.filter = dark ? `contrast(1.5) brightness(${bright * flick})` : 'none'
```

**objects（WD1 98.2–111）**：98.2 交接帧必须与 part2 s96 的清晰线框一致，所以光圈从 0 渐开（`Anim` 函数），并删掉 2D 的 `blur()` 近似。

```diff
+import { mergePost, presets, renderWithPost } from '../../../three/post'
 ...
-    const img = f.three.render(c.scene, c.cam, 0x000000, 0)
+    const img = renderWithPost(f.three, c.scene, c.cam, mergePost(presets.stageDOF, {
+      time: t,
+      clear: 0x000000,
+      clearAlpha: 0, // 天幕是 2D 画的，3D 保持透明背景
+      dof: { aperture: (tt) => 12 * seg(tt, 98.2, 99.0) * (1 - 0.5 * seg(tt, 104.5, 105.5)) },
+    }))
     ctx.save()
-    // 低机位段景深虚化（98.2 交接时为 0，与 s96 的清晰线框一致）
-    const blur = (1.6 * (1 - seg(t, 104.5, 105.5)) + 0.6) * seg(t, 98.2, 99.0)
-    ctx.filter = `blur(${blur}px)`
     ctx.drawImage(img, 0, 0, W, H)
     ctx.restore()
```

**part3/city（WD1 123.4–139.3）**：`renderShadowed` 换成带 `shadows: true` 的预设；俯冲段的虚焦改为景深光圈。

```diff
-    const img = renderShadowed(f, c.scene, c.cam, 0x000000, t < 133.4 ? 1 : 0)
+    const img = renderWithPost(f.three, c.scene, c.cam, mergePost(t < 133.4 ? presets.clayCity : presets.skylineBokeh, {
+      time: t,
+      clearAlpha: t < 133.4 ? 1 : 0,
+      dof: { aperture: (tt) => 26 + 60 * (1 - seg(tt, 123.5, 124.4)) },
+    }))
-    const blur = 6 * (1 - seg(t, 123.5, 124.4)) + 1.2 * seg(t, 133.4, 134.5) + 4 * seg(t, 137.6, 138.0)
+    const blur = 4 * seg(t, 137.6, 138.0)
```

注意：切换预设 = 切换缓存的管线（结构不同时会各建一条），切换本身不闪，但两种预设的观感需要在交界时刻对照原片确认。

## 性能（SwiftShader 软件 WebGL，1920×1080，无头 Chromium）

`node scripts/post-demo.mjs`（设 `POST_BENCH=1` 输出基准）在每个预设的第一个时刻连续渲染 3 次，取后两次平均（毫秒）。
机器同时有其他任务在跑，数值有 ±30% 抖动。

| Pass | 耗时 | 说明 |
| --- | --- | --- |
| scene | 230–550（`msaa: 0` 时 130–210） | 场景渲染 + 拷进合成链；MSAA 4× 大约让这一步翻倍 |
| normals | 90–115 | 第二遍几何渲染（只画实体网格） |
| ao | 240–260 | GTAO 半分辨率 12 采样 + 泊松降噪 + 相乘混合 |
| edge | ~120 | 8 邻域法线/深度比较 |
| dof | 315–400 | 半分辨率预滤波 + 48 采样聚集 + 16 个前景探针 + 全分辨率合成 |
| bloom | 120–140 | UnrealBloom 5 级 mip |
| finish | 70–90 | ≈ 一个全屏 Pass 的基准成本 |

| 预设 | 合计 / 帧 |
| --- | --- |
| clayCity | ~1350 ms |
| greyCityEdges | ~1430 ms |
| stageDOF | ~830 ms |
| skylineBokeh | ~1140 ms |
| wireGlow | ~870 ms |

对照：同一镜头裸渲染整帧（含 2D 图层）约 250–900 ms。后期让 3D 镜头的导出每帧多 0.5–1 秒；
真 GPU 上这些 Pass 都在个位数毫秒。首次使用某个组合会多出一次 shader 编译（SwiftShader 上约 1–2 s）。
想省时间：`msaa: 0`（省一半场景时间，边缘会有锯齿）、`ao.resolution: 0.25`、不需要时关 `edge`/`ao`（同时省掉 normals）。

## 已知限制与风险

- **显存**：每条管线约 150–200 MB（HalfFloat 全分辨率缓冲 ×2、MSAA 场景缓冲、法线缓冲、半分辨率景深与辉光 mip）。
  五个预设全用上约 1 GB，SwiftShader 下吃的是内存。组合越少越好，必要时 `disposePost()`。
- **GTAOPass 的构造 bug（three r186）**：构造时直接传外部 G-buffer 会访问不存在的 `normalRenderTarget`，
  所以先默认构造再 `setGBuffer`。升级 three 后要复查。
- **景深是「以聚代散」近似**：清晰前景盖在虚化背景上是对的；虚化前景盖在清晰背景上靠 16 个探针近似，
  前景边缘可能有轻微光晕。线框/半透明物体只在线条处有深度，线条之间的像素按背景深度处理。
  自动对焦（`{uv}`）取 5 点最近深度，物体扫过对焦点时焦点会跳——动画镜头建议给数值或世界坐标。
- **描线**来自不带 MSAA 的法线缓冲，线条有轻微锯齿；线、点不参与描线。
- **透明背景 + 辉光**：透明区域的辉光靠「预乘 alpha 下 rgb > a 的加亮合成」，在 Chromium 里已验证（叠在黑底上）；
  叠到非黑的 2D 背景上的观感未单独验证。
- **2D 图层不受 3D 后期影响**：镜头里在 2D 画的标签、描边、天际线（lights.ts）都保持原样；全片统一的颗粒/暗角更适合放在 `film.post`。
- 颗粒种子按帧号（`time × fps` 取整），同一帧重复渲染逐像素一致（已验证）。
