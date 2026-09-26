# 反求相机的 Blender 检查工程

每个 `.blend` 对应 `assets/cameras/<同名>.json` 里一段「可用」的反求结果（原理、全部结果表见 `docs/camera-solve.md`）。
打开就能在相机视图里按空格播放，对照原片看运镜是否贴合。

```bash
open -a Blender assets/blender/wd1-clay-city-a.blend
```

## 工程里有什么

- **场景设置**：分辨率、帧率、帧范围与原片这一段一致；渲染器 Workbench，透明底。
- **原片**：MovieClip `<名>`（原片抽帧序列，路径 `//<名>.frames/00001.jpg`），已设为相机背景（Camera 属性 → Background Images），
  相机视图里直接看到原片。
- **反求相机** `反求相机`：逐帧关键帧（线性插值），已应用 JSON 里的地面对齐，与 JSON 同一坐标（Blender Z-up）。
- **跟踪标记**：顶部标签切到 **Motion Tracking** 工作区，左边 Movie Clip Editor 里能看到全部 2D 轨迹与重建误差。
- **反求3D点** 集合：每个重建点一个 Empty（十字）。
- **代理几何** 集合：`地面网格`（z=0，青色）+ `点柱`（从地面立到 3D 点的黄色细柱）。相机视图里它们应当钉在原片对应的角点/地面上。

场景帧号 = 抽帧序号（1 起），换算影片时间：`t = clipStart + (帧 - 1) / fps`（下表）。

| 工程 | 原片 | 影片时间 | 场景帧 | clipStart | fps | solve 误差 | 工程自检 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `wd1-pylons.blend` | WD1 电塔阵列 | 21.75–23.72 | 1–60 | 21.75 | 30 | 0.66px | 0.27px |
| `wd1-gray-city-b.blend` | WD1 灰色城市（低空飞越→远景） | 38.20–42.80 | 1–139 | 38.2 | 30 | 0.94px | 0.70px |
| `wd1-gray-city-c.blend` | WD1 灰色城市（抬高旋转成斜俯视） | 42.80–48.30 | 139–304 | 38.2 | 30 | 1.13px | 1.21px |
| `wd1-clay-city-a.blend` | WD1 素模城市（俯拍旋转→斜俯视） | 124.30–133.37 | 1–273 | 124.3 | 30 | 0.78px | 0.24px |
| `wd1-clay-city-b.blend` | WD1 素模城市（后拉露出手机） | 133.40–138.97 | 1–168 | 133.4 | 30 | 0.99px | 0.58px |
| `wd2-ctos-grid-a.blend` | WD2 线框城市网格（低空前滑） | 4.35–6.29 | 1–59 | 4.35 | 29.97 | 0.98px | 0.56px |
| `wd2-bay-c.blend` | WD2 旧金山半岛 | 37.05–38.65 | 1–49 | 37.05 | 29.97 | 0.53px | 0.18px |
| `wd2-bay-d.blend` | WD2 半岛推近 + 后倒 | 38.75–40.52 | 1–54 | 38.75 | 29.97 | 0.48px | 0.31px |
| `wd2-room-b.blend` | WD2 线框客厅（拉远段） | 61.30–64.61 | 58–157 | 59.4 | 29.97 | 0.77px | 0.57px |

「工程自检」= 用工程里烘焙好的相机对象（关键帧 + 镜头参数）把 3D 点投回画面、与跟踪标记比较的平均误差，
证明 `.blend` 里的相机与 JSON 一致。`node scripts/verify-blend.mjs <名>` 会渲染代理几何叠在原片上输出 `snaps/camera/<名>-blend-sheet.png`。

## 入库与重新生成

- `.blend` 本身很小（< 1MB），可以入库。
- `<名>.frames/` 是原片抽帧（版权素材，每个 4–40MB），已在 `.gitignore` 里排除；换机器后先按 README「原片参考」下载原片，再重新生成：

  ```bash
  pnpm solve preset wd1-clay-city-a --blend      # 重跑反求 + 重新导出工程与抽帧
  ```

  重跑会覆盖同名 JSON 与 `.blend`；libmv 选关键帧有随机性，误差/焦距会有小幅波动。
- 地面网格是 RANSAC 找的点云主平面：城市镜头落在屋顶群/地面上，`wd2-room-b` 落在后墙上（点最多），`wd1-clay-city-b` 落在手机/桌面上。
- 芝加哥建筑（`public/assets/geo/chicago.wdgeo.gz`）没有导入：原片城市没有地理参照，反求坐标与真实经纬度之间的对齐只能人工做。
