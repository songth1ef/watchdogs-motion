import { clamp } from '../engine/math'

/** 点阵网格背景（WD1 气泡地图、"ME?" 镜头的底纹） */
export function dotGrid(ctx: CanvasRenderingContext2D, o: { spacing: number; r?: number; color?: string; ox?: number; oy?: number }) {
  const { width, height } = ctx.canvas
  ctx.fillStyle = o.color ?? 'rgba(255,255,255,0.25)'
  const r = o.r ?? 1.2
  const ox = ((o.ox ?? 0) % o.spacing) - o.spacing
  const oy = ((o.oy ?? 0) % o.spacing) - o.spacing
  for (let y = oy; y < height + o.spacing; y += o.spacing)
    for (let x = ox; x < width + o.spacing; x += o.spacing) ctx.fillRect(x - r, y - r, r * 2, r * 2)
}

/** "×" 十字标记网格（WD1 "Raymond Kenney" 段落里的底纹） */
export function crossGrid(ctx: CanvasRenderingContext2D, o: { spacing: number; size?: number; color?: string; lineWidth?: number; ox?: number; oy?: number }) {
  const { width, height } = ctx.canvas
  const s = (o.size ?? 8) / 2
  ctx.strokeStyle = o.color ?? 'rgba(255,255,255,0.4)'
  ctx.lineWidth = o.lineWidth ?? 1
  ctx.beginPath()
  for (let y = (o.oy ?? 0) % o.spacing; y < height; y += o.spacing)
    for (let x = (o.ox ?? 0) % o.spacing; x < width; x += o.spacing) {
      ctx.moveTo(x - s, y - s)
      ctx.lineTo(x + s, y + s)
      ctx.moveTo(x + s, y - s)
      ctx.lineTo(x - s, y + s)
    }
  ctx.stroke()
}

/** 普通线网格 */
export function lineGrid(ctx: CanvasRenderingContext2D, o: { spacing: number; color?: string; lineWidth?: number; ox?: number; oy?: number; p?: number }) {
  const { width, height } = ctx.canvas
  const p = clamp(o.p ?? 1)
  ctx.strokeStyle = o.color ?? 'rgba(255,255,255,0.12)'
  ctx.lineWidth = o.lineWidth ?? 1
  ctx.beginPath()
  for (let x = (o.ox ?? 0) % o.spacing; x < width; x += o.spacing) {
    ctx.moveTo(x + 0.5, 0)
    ctx.lineTo(x + 0.5, height * p)
  }
  for (let y = (o.oy ?? 0) % o.spacing; y < height; y += o.spacing) {
    ctx.moveTo(0, y + 0.5)
    ctx.lineTo(width * p, y + 0.5)
  }
  ctx.stroke()
}

/** 画一条按进度「生长」的线段 */
export function growLine(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, p: number) {
  const q = clamp(p)
  if (q <= 0) return
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x1 + (x2 - x1) * q, y1 + (y2 - y1) * q)
  ctx.stroke()
}
