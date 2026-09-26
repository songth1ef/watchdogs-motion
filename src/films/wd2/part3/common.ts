/**
 * WD2 part3（94–121s）内部共用小工具。
 * 这些能力目前只在本段使用；可复用的已在 docs/shots/wd2-part3.md 末尾「建议上提到共享库」登记。
 */
import { clamp, hash } from '../../../engine/math'
import { FONT, font } from '../../../fx/text'

/** 原片 59.94fps，这里统一按 60 帧量化（逐帧跳变的故障、闪烁用） */
export const FPS = 60
export const fr = (t: number) => Math.floor(t * FPS + 1e-6)

/** 半开区间判断 */
export const inR = (t: number, a: number, b: number) => t >= a && t < b

/** 白底 + 灰色暗角（execute / 货币 / 代码段的纸白底色） */
export function paperBg(ctx: CanvasRenderingContext2D, W: number, H: number, base = '#f3f2ef', edge = 'rgba(120,120,115,0.35)') {
  ctx.fillStyle = base
  ctx.fillRect(0, 0, W, H)
  vignette(ctx, W, H, edge)
}

export function vignette(ctx: CanvasRenderingContext2D, W: number, H: number, edge = 'rgba(0,0,0,0.25)', inner = 0.35) {
  const g = ctx.createRadialGradient(W / 2, H / 2, H * inner, W / 2, H / 2, W * 0.62)
  g.addColorStop(0, 'rgba(0,0,0,0)')
  g.addColorStop(1, edge)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
}

/** 纯色底 + 轻微暗角 */
export function flatBg(ctx: CanvasRenderingContext2D, W: number, H: number, color: string, edge = 'rgba(0,0,0,0.12)') {
  ctx.fillStyle = color
  ctx.fillRect(0, 0, W, H)
  vignette(ctx, W, H, edge, 0.25)
}

/** 斜向细白线（原片紫色 / 天蓝色色块上那层 "/" 方向的细纹） */
export function diagHatch(ctx: CanvasRenderingContext2D, W: number, H: number, gap = 34, color = 'rgba(255,255,255,0.28)', lw = 1.5) {
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = lw
  ctx.beginPath()
  for (let x = -H; x < W + H; x += gap) {
    ctx.moveTo(x, H)
    ctx.lineTo(x + H, 0)
  }
  ctx.stroke()
  ctx.restore()
}

/**
 * 带色边的文字：先画黄 / 蓝两层错位，再盖主色，模拟原片大字边缘的 RGB 分离（色散）。
 * 比逐像素 rgbSplit 便宜，适合整段大字每帧都画。
 */
export function fringeText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  o: { color?: string; shift?: number; a?: string; b?: string; alpha?: number } = {},
) {
  const s = o.shift ?? 3
  ctx.save()
  ctx.globalAlpha = o.alpha ?? 0.9
  ctx.fillStyle = o.a ?? '#f6d21a'
  ctx.fillText(text, x - s, y)
  ctx.fillStyle = o.b ?? '#3b7bff'
  ctx.fillText(text, x + s, y + s * 0.3)
  ctx.restore()
  ctx.fillStyle = o.color ?? '#f2f2f2'
  ctx.fillText(text, x, y)
}

/** 大号 Helvetica（原片 WD2 大字：紧字距粗体） */
export function big(ctx: CanvasRenderingContext2D, size: number, weight: number | string = 700) {
  font(ctx, size, weight, FONT.sans)
  ctx.letterSpacing = `${-size * 0.025}px`
}

export function resetTrack(ctx: CanvasRenderingContext2D) {
  ctx.letterSpacing = '0px'
}

/** 在矩形裁剪区内绘制 */
export function clipRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, draw: () => void) {
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.clip()
  draw()
  ctx.restore()
}

/** 按帧的伪随机（0..1） */
export const fh = (t: number, salt = 0) => hash(fr(t) * 7919 + salt * 104729)

/** 逐帧闪烁的块状光标：period 为一个亮灭周期（秒） */
export const blink = (t: number, period = 0.4) => Math.floor(t / (period / 2)) % 2 === 0

export const easeStep = (t: number, a: number, b: number) => clamp((t - a) / (b - a))
