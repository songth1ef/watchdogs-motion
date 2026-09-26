import { offscreen } from './canvas'

type Src = CanvasImageSource & { width: number; height: number }

/** 马赛克：先缩小再放大（关闭平滑）。WD2 人脸档案卡、灰度头像都用它。 */
export function pixelate(ctx: CanvasRenderingContext2D, src: Src, dx: number, dy: number, dw: number, dh: number, block: number) {
  const sw = Math.max(1, Math.round(dw / block))
  const sh = Math.max(1, Math.round(dh / block))
  const { canvas, ctx: s } = offscreen('pixelate', sw, sh)
  s.imageSmoothingEnabled = true
  s.clearRect(0, 0, sw, sh)
  s.drawImage(src, 0, 0, sw, sh)
  const prev = ctx.imageSmoothingEnabled
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(canvas, 0, 0, sw, sh, dx, dy, dw, dh)
  ctx.imageSmoothingEnabled = prev
}

/** 半调网点：WD2 DedSec 拼贴段（骷髅、人物剪影）的印刷质感 */
export function halftone(
  ctx: CanvasRenderingContext2D,
  src: Src,
  o: { x: number; y: number; w: number; h: number; cell: number; color?: string; invert?: boolean; angle?: number },
) {
  const cols = Math.ceil(o.w / o.cell)
  const rows = Math.ceil(o.h / o.cell)
  const { ctx: s } = offscreen('halftone', cols, rows)
  s.clearRect(0, 0, cols, rows)
  s.drawImage(src, 0, 0, cols, rows)
  const d = s.getImageData(0, 0, cols, rows).data
  ctx.fillStyle = o.color ?? '#000'
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const k = (j * cols + i) * 4
      let lum = (0.299 * d[k] + 0.587 * d[k + 1] + 0.114 * d[k + 2]) / 255
      lum *= d[k + 3] / 255
      const v = o.invert ? lum : 1 - lum
      const r = (o.cell / 2) * Math.sqrt(v) * 1.15
      if (r < 0.3) continue
      ctx.beginPath()
      ctx.arc(o.x + i * o.cell + o.cell / 2, o.y + j * o.cell + o.cell / 2, r, 0, Math.PI * 2)
      ctx.fill()
    }
}

/** 斜线阴影填充（WD1 "Digital Shadow" 的人影、"centralOperatingSystem" 字框的斜纹） */
export function hatchRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, gap = 6, color = 'rgba(255,255,255,0.5)', lineWidth = 1) {
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.clip()
  ctx.strokeStyle = color
  ctx.lineWidth = lineWidth
  ctx.beginPath()
  for (let i = -h; i < w; i += gap) {
    ctx.moveTo(x + i, y + h)
    ctx.lineTo(x + i + h, y)
  }
  ctx.stroke()
  ctx.restore()
}

/** 灰度 + 对比度（把 3D 渲染或图片压成原片那种高反差黑白） */
export function monochrome(ctx: CanvasRenderingContext2D, contrast = 1.3, brightness = 1) {
  ctx.filter = `grayscale(1) contrast(${contrast}) brightness(${brightness})`
}
