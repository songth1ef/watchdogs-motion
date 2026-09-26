/**
 * part3 私有工具。凡是可能被其他段复用的，都在 docs/shots/wd1-part3.md 末尾「建议上提到共享库」里登记。
 */
import { clamp, hash } from '../../../engine/math'
import { offscreen } from '../../../fx/canvas'
import { FONT } from '../../../fx/text'

/** 30fps 帧号（原片帧率），做逐帧故障节奏用 */
export const F30 = (t: number) => Math.floor(t * 30 + 1e-6)

/** 1280×720 参考片坐标 → 1920×1080 逻辑坐标 */
export const S = 1.5

/**
 * 在给定宽度内画「压窄」的粗体字：Helvetica Neue Bold 横向缩放，
 * 近似原片 WATCH_DOGS 标志那种 Condensed Bold。`ASSET`：换成真正的标志字体/矢量标志只改这里。
 */
export function condensedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  baseline: number,
  capH: number,
  width: number,
  weight: number | string = 700,
) {
  const size = capH / 0.72
  ctx.save()
  ctx.font = `${weight} ${size}px ${FONT.sans}`
  ctx.letterSpacing = '0px'
  // macOS 的 Helvetica Neue 自带 Condensed Bold；其他系统没有窄体时浏览器会回落到常规宽度，再靠横向缩放兜底
  ctx.fontStretch = 'condensed'
  const w = ctx.measureText(text).width
  ctx.translate(x, baseline)
  ctx.scale(width / w, 1)
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(text, 0, 0)
  ctx.restore()
}

/** 按左→右揭示的乱码（原片标语用 < > x X 这类字符做乱码） */
export function scrambleLR(text: string, p: number, frame: number, charset = '<>xX> <') {
  const n = text.length
  const shown = Math.floor(clamp(p) * n)
  let out = text.slice(0, shown)
  // 乱码尾巴长度随进度变化，但总长度不超过原文
  for (let i = shown; i < n; i++) {
    const r = hash(frame * 131 + i * 17)
    out += r < 0.25 ? ' ' : charset[Math.floor(hash(frame * 71 + i * 3) * charset.length)]
  }
  return out
}

/** 画一个把 src 按「cover」铺满 W×H 的图（three 渲染结果贴回主画布用） */
export function drawFull(ctx: CanvasRenderingContext2D, src: CanvasImageSource, W: number, H: number, alpha = 1) {
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalAlpha = alpha
  ctx.drawImage(src, 0, 0, W, H)
  ctx.restore()
}

/** 画布快照到指定离屏 key（和 fx/canvas 的 snapshot 一样，但可指定 key 避免互相覆盖） */
export function grab(ctx: CanvasRenderingContext2D, key: string) {
  const { width, height } = ctx.canvas
  const s = offscreen(key, width, height)
  s.ctx.setTransform(1, 0, 0, 1, 0, 0)
  s.ctx.clearRect(0, 0, width, height)
  s.ctx.drawImage(ctx.canvas, 0, 0)
  return s.canvas
}

/** 平滑的 0..1..0 包络：a 淡入到 b，c 淡出到 d */
export function envelope(t: number, a: number, b: number, c: number, d: number) {
  if (t <= a || t >= d) return 0
  if (t < b) return (t - a) / (b - a)
  if (t > c) return 1 - (t - c) / (d - c)
  return 1
}
