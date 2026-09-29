# watchdogs-motion

> **English** · A shot-by-shot recreation of two Watch Dogs trailers — the *Watch Dogs* E3 introduction and the *Watch Dogs 2* ctOS introduction — rendered entirely in the browser with **Canvas 2D + three.js**. Every frame is a pure function of time, so the film can be scrubbed, exported frame by frame, and scored against the source.
>
> - Real **OpenStreetMap** buildings for Chicago and the Bay Area, **NASA** Earth imagery, **Natural Earth** vectors
> - Camera moves **solved in Blender** from reference frames (`pnpm solve`), 3D post-processing (AO, DoF, bloom, edges)
> - Built-in player with side-by-side / onion-skin / difference views against a local reference video, plus an SSIM-based **similarity score** per shot (`pnpm score`)
>
> ```bash
> pnpm install && pnpm dev     # player at http://localhost:5173
> ```
>
> The original trailers are **not** included. To compare against them, place your own reference copies at `public/reference/wd1.mp4` and `public/reference/wd2.mp4` (see below).
>
> Fan-made, non-commercial study. *Watch Dogs, ctOS and DedSec are trademarks of Ubisoft; this project is not affiliated with or endorsed by Ubisoft.* Code: MIT. Bundled data keeps its own license (OpenStreetMap data © OpenStreetMap contributors, ODbL) — see [LICENSE](./LICENSE) and [assets/LICENSES.md](./assets/LICENSES.md).

---

用代码逐镜头复刻两支 Watch Dogs 宣传动画，作为可二次开发的动态图形工程：

| id  | 原片 | 时长 | 帧率 |
| --- | --- | --- | --- |
| wd1 | [Watch Dogs · E3 Introduction Trailer](https://www.youtube.com/watch?v=Qs4OcQNOM34) | 151s | 30 |
| wd2 | [Watch Dogs 2 · ctOS Introduction Scene](https://www.youtube.com/watch?v=scyA9cnbja4) | 121s | 60 |

技术栈：Vite + TypeScript + Canvas 2D（排版/图形）+ three.js（3D 城市等）。

## 快速开始

```bash
pnpm install
pnpm dev                    # 打开播放器：拖时间轴、逐帧、与原片并排/叠加/差值对照
pnpm snap wd1 12 13.5       # 无头渲染指定时刻，输出 snaps/：左复刻 | 右原片
pnpm export wd1 0 20        # 逐帧精确导出 MP4 到 dist-video/（加 --audio 混入原片音轨，仅本地）
pnpm typecheck
```

### 原片参考（不入库）

`public/reference/wd1.mp4`、`wd2.mp4` 是对照用原片，`reference/frames/<film>/NNN.jpg` 是 1fps 参考帧（第 N 张 ≈ 第 N-1 秒）。
两者都有版权，已被 `.gitignore` 排除。换机器时重新下载：

```bash
yt-dlp --cookies-from-browser chrome -f "bv*[height<=720][ext=mp4]+ba[ext=m4a]/b" --merge-output-format mp4 \
  -o public/reference/wd1.mp4 "https://www.youtube.com/watch?v=Qs4OcQNOM34"
yt-dlp --cookies-from-browser chrome -f "bv*[height<=720][ext=mp4]+ba[ext=m4a]/b" --merge-output-format mp4 \
  -o public/reference/wd2.mp4 "https://www.youtube.com/watch?v=scyA9cnbja4"
for f in wd1 wd2; do mkdir -p reference/frames/$f; ffmpeg -i public/reference/$f.mp4 -vf "fps=1,scale=960:-2" -q:v 3 reference/frames/$f/%03d.jpg; done
```

## 结构

```
src/
  engine/      时间轴与渲染（types.ts 定义 Scene/Film；render.ts 按时间合成镜头）
  fx/          共享 2D 效果：text（高亮底块/标签/乱码）、glitch、dot-matrix、grid、network、image（马赛克/半调/斜纹）
  three/       程序化 3D 资产（city.ts：素模城市 / 线框城市）
  films/wd1/   part1.ts 0–50s · part2.ts 50–100s · part3.ts 100–151s
  films/wd2/   part1.ts 0–43s · part2.ts 43–94s · part3.ts 94–121s
  theme.ts     两片的取色
docs/shots/    每段的镜头表（时间码、元素、实现位置、与原片的差异）
scripts/       snap / export 无头渲染
```

## 二次开发约定

- **渲染是时间的纯函数**：`render(f)` 只依赖 `f.t / f.lt / f.p`。禁止 `Math.random()`、`Date.now()`；随机用 `rng(seed)` 或 `hash(n)`。这样拖动、逐帧导出、截图对照才一致。
- 坐标系固定 1920×1080（原片 1280×720 × 1.5）。
- 改一个镜头：在 `docs/shots/` 找时间码 → 到对应 `part*.ts` 改 → `pnpm snap` 对照。
- 3D 场景用 `memo(key, build)` 缓存，共用 `f.three` 一个 WebGLRenderer。
- 换成真实素材：镜头里凡是「程序化替代品」都在镜头表里标了 `ASSET`，把对应函数换成加载模型/图片即可。

### 量化评分（精修依据）

- `pnpm score <wd1|wd2> [起 终] [--step 0.5] [--tag v2]`：按 step 渲染复刻帧，与原片同刻帧（wd2 优先 `wd2-1080.mp4`）统一缩到 960×540 灰度比较。
- 综合分 `100 × (0.4·SSIM + 0.4·EDGE + 0.2·HIST)`：EDGE 是 Sobel 边缘图相关（管构图/线条位置），HIST 是亮度直方图 EMD。细节见 `scripts/score.mjs` 文件头。
- 产物：`docs/score/<tag>-<film>.md`（镜头按分数升序 + 热力条 `-heat.png`）、`.json`（逐帧/逐镜头数据，给 agent 读）、`snaps/score/` 最差 10 刻并排图。
- `docs/score/v1-*` 是第一版基线，不要覆盖；精修后换新 tag 重跑，对比同一镜头分数。全片约 1 分钟。
- 分数只排优先级：低分先看并排图再定性（时序错位、亮度、构图都会拉低分数）。

## 版权与许可

- 代码：MIT（见 [LICENSE](./LICENSE)）。
- 随仓库附带的第三方数据与模型各自保留原许可，来源与署名见 [assets/LICENSES.md](./assets/LICENSES.md)；其中 `public/assets/geo/*.wdgeo.gz` 源自 OpenStreetMap，© OpenStreetMap contributors，ODbL 1.0。
- Watch Dogs、ctOS、DedSec 及原片设计归 Ubisoft 所有。本工程为非官方的学习与技术复刻，与 Ubisoft 无关；仓库不含任何原片画面或音频，对照用原片需自行准备、仅限本地使用。
