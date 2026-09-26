import type { ThreeHost } from './three-host'

/**
 * 坐标系：所有镜头都在 1920×1080 的逻辑画布上绘制（参考片是 1280×720，换算系数 1.5）。
 * 渲染必须是时间的纯函数：同一个 t 永远画出同一帧，这样拖动时间轴、逐帧导出、截图对照才可靠。
 * 因此镜头里禁止 Math.random() / Date.now()，随机一律用 `rng(seed)`。
 */
export interface FrameCtx {
  ctx: CanvasRenderingContext2D
  W: number
  H: number
  /** 影片绝对时间（秒） */
  t: number
  /** 镜头内局部时间（秒），= t - scene.start */
  lt: number
  /** 镜头进度 0..1 */
  p: number
  /** 镜头时长（秒） */
  dur: number
  three: ThreeHost
  film: Film
}

export interface Scene {
  /** 唯一 id，建议 `wd1-012-globe` 这种「片名-起始秒-内容」格式，方便对照原片 */
  id: string
  start: number
  end: number
  /** 原片里这一镜头的文字描述，给二次开发的人看 */
  note?: string
  render(f: FrameCtx): void
}

export interface Film {
  id: 'wd1' | 'wd2'
  title: string
  duration: number
  /** 原片帧率，导出与逐帧步进用 */
  fps: number
  background: string
  scenes: Scene[]
  /** 全片后期（整帧故障、暗角、颗粒等），在所有镜头之后执行 */
  post?: (f: FrameCtx) => void
}
