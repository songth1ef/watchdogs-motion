import { hash, rng } from '../engine/math'
import { snapshot } from './canvas'

export interface SliceOpts {
  /** 0..1 强度 */
  amount: number
  /** 每帧换 seed 就是逐帧跳变的故障；固定 seed 就是静态错位 */
  seed: number
  /** 最大水平位移（px） */
  maxShift?: number
  /** 切片条数 */
  slices?: number
  region?: { x: number; y: number; w: number; h: number }
}

/**
 * 水平切片错位：WD1 片尾 WATCH_DOGS 标志、WD2 转场都用它。
 * 把区域切成若干水平条，每条随机左右平移。
 */
export function sliceGlitch(ctx: CanvasRenderingContext2D, o: SliceOpts) {
  if (o.amount <= 0) return
  const { width, height } = ctx.canvas
  const r = o.region ?? { x: 0, y: 0, w: width, h: height }
  const src = snapshot(ctx, 'glitch')
  const R = rng(o.seed)
  const n = o.slices ?? 18
  const maxShift = (o.maxShift ?? 80) * o.amount
  let y = r.y
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  while (y < r.y + r.h) {
    const h = Math.max(2, Math.round(R.range(0.2, 2) * (r.h / n)))
    if (R.chance(0.55 * o.amount + 0.1)) {
      const dx = Math.round(R.range(-1, 1) * maxShift)
      ctx.clearRect(r.x, y, r.w, h)
      ctx.drawImage(src, r.x, y, r.w, h, r.x + dx, y, r.w, h)
    }
    y += h
  }
  ctx.restore()
}

/** RGB 通道分离（逐像素，开销较大，只对局部区域或短时使用） */
export function rgbSplit(ctx: CanvasRenderingContext2D, shift: number, region?: { x: number; y: number; w: number; h: number }) {
  if (shift < 0.5) return
  const r = region ?? { x: 0, y: 0, w: ctx.canvas.width, h: ctx.canvas.height }
  const img = ctx.getImageData(r.x, r.y, r.w, r.h)
  const d = img.data
  const out = new Uint8ClampedArray(d)
  const s = Math.round(shift)
  for (let y = 0; y < r.h; y++) {
    const row = y * r.w
    for (let x = 0; x < r.w; x++) {
      const i = (row + x) * 4
      const xr = Math.min(r.w - 1, x + s)
      const xb = Math.max(0, x - s)
      out[i] = d[(row + xr) * 4]
      out[i + 2] = d[(row + xb) * 4 + 2]
    }
  }
  img.data.set(out)
  ctx.putImageData(img, r.x, r.y)
}

/** 随机色块噪点（WD1 "Data Shadow" 之后的白块铺屏、WD2 数据碎片） */
export function blockNoise(
  ctx: CanvasRenderingContext2D,
  o: { seed: number; count: number; minSize: number; maxSize: number; color?: string; region?: { x: number; y: number; w: number; h: number } },
) {
  const R = rng(o.seed)
  const r = o.region ?? { x: 0, y: 0, w: ctx.canvas.width, h: ctx.canvas.height }
  ctx.fillStyle = o.color ?? '#ffffff'
  for (let i = 0; i < o.count; i++) {
    const w = R.range(o.minSize, o.maxSize)
    const h = w * R.range(0.6, 1.2)
    ctx.fillRect(Math.round(r.x + R.next() * r.w), Math.round(r.y + R.next() * r.h), Math.round(w), Math.round(h))
  }
}

/** 扫描线 + 颗粒（全片后期可选） */
export function scanlines(ctx: CanvasRenderingContext2D, alpha = 0.08, gap = 3) {
  const { width, height } = ctx.canvas
  ctx.save()
  ctx.fillStyle = `rgba(0,0,0,${alpha})`
  for (let y = 0; y < height; y += gap) ctx.fillRect(0, y, width, 1)
  ctx.restore()
}

/** 按帧闪烁：返回该帧是否「亮」。p=0 常灭，p=1 常亮，中间随机闪。 */
export function flicker(frame: number, p: number, salt = 0) {
  return hash(frame * 977 + salt) < p
}
