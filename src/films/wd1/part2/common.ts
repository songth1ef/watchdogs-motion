/**
 * part2 通用小工具。
 * 约定：part2 的镜头都在「原片 1280×720 坐标」里绘制（进入镜头先 ctx.scale(1.5,1.5)），
 * 这样从参考帧量到的像素位置可以直接写进代码，不用每次乘 1.5。
 */
import { clamp, ease, hash } from '../../../engine/math'
import { FONT } from '../../../fx/text'

export const U = 1.5
export const RW = 1280
export const RH = 720

export { clamp, ease, hash, FONT }

/** 进入 1280×720 坐标系 */
export function ref(ctx: CanvasRenderingContext2D) {
  ctx.setTransform(U, 0, 0, U, 0, 0)
}

export function setFont(ctx: CanvasRenderingContext2D, size: number, weight: number | string = 500, family = FONT.sans, trackEm = -0.03) {
  ctx.font = `${weight} ${size}px ${family}`
  ctx.letterSpacing = `${(size * trackEm).toFixed(2)}px`
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
}

export function resetTrack(ctx: CanvasRenderingContext2D) {
  ctx.letterSpacing = '0px'
}

/**
 * 打字进度：从 t0 开始，每秒 cps 个字符。
 * 返回完整显示的字符数 n 和「正在出现」那个字符的透明度（原片打字时下一个字符先以灰色闪一帧）。
 */
export function typed(text: string, t: number, t0: number, cps: number) {
  const k = (t - t0) * cps
  if (k <= 0) return { n: 0, frac: 0, done: false }
  const n = Math.min(text.length, Math.floor(k))
  return { n, frac: n < text.length ? k - n : 0, done: n >= text.length }
}

/** 画打字中的文本：已打出的正常色，下一个字符半透明 */
export function drawTyped(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, t: number, t0: number, cps: number, color: string) {
  const { n, frac } = typed(text, t, t0, cps)
  if (n === 0 && frac === 0) return 0
  ctx.fillStyle = color
  const s = text.slice(0, n)
  ctx.fillText(s, x, y)
  const w = ctx.measureText(s).width
  if (frac > 0 && n < text.length) {
    ctx.save()
    ctx.globalAlpha *= 0.45
    ctx.fillText(text[n], x + w, y)
    ctx.restore()
  }
  return w
}

/** 从右往左擦除：保留前 (1-p) 比例的字符 */
export function eraseTail(text: string, p: number) {
  return text.slice(0, Math.round((1 - clamp(p)) * text.length))
}

/** 从左往右擦除：去掉前 p 比例的字符（原片列表消失时是这种） */
export function eraseHead(text: string, p: number) {
  return text.slice(Math.round(clamp(p) * text.length))
}

/**
 * 高亮笔效果：在 [x, x+w*p] 区域铺色块，并把该区域内的文字改成 inkColor。
 * drawText 负责在当前 fillStyle 下绘制文字（会被调用两次：一次原色、一次剪裁到色块内）。
 */
export function marker(
  ctx: CanvasRenderingContext2D,
  box: { x: number; y: number; w: number; h: number },
  p: number,
  boxColor: string,
  inkColor: string,
  drawText: () => void,
) {
  const w = box.w * clamp(p)
  if (w <= 0) return
  ctx.save()
  ctx.beginPath()
  ctx.rect(box.x, box.y, w, box.h)
  ctx.clip()
  ctx.fillStyle = boxColor
  ctx.fillRect(box.x, box.y, w, box.h)
  ctx.fillStyle = inkColor
  drawText()
  ctx.restore()
}

/** 按帧的确定性抖动 [-1,1] */
export function jitter(frame: number, salt: number) {
  return hash(frame * 7919 + salt * 104729) * 2 - 1
}

/** 平滑步进 */
export const smooth = (t: number) => t * t * (3 - 2 * t)

/** 两个时刻之间的缓动进度 */
export function span(t: number, a: number, b: number, fn: (x: number) => number = (x) => x) {
  return fn(clamp((t - a) / (b - a)))
}

/**
 * 关键帧插值（Catmull-Rom，端点夹紧）。keys = [[时间, 值], ...]，按时间升序。
 * 用于从参考帧量出的若干位置/缩放点拟合一条平滑的运动曲线。
 */
export function track(t: number, keys: [number, number][]) {
  if (t <= keys[0][0]) return keys[0][1]
  const n = keys.length
  if (t >= keys[n - 1][0]) return keys[n - 1][1]
  let i = 0
  while (i < n - 2 && t > keys[i + 1][0]) i++
  const [t1, p1] = keys[i]
  const [t2, p2] = keys[i + 1]
  const p0 = i > 0 ? keys[i - 1][1] : p1
  const p3 = i + 2 < n ? keys[i + 2][1] : p2
  const u = (t - t1) / (t2 - t1)
  const u2 = u * u
  const u3 = u2 * u
  return 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3)
}

/** WD1 深色标签：深灰绿底 + 等宽白字（"THE ANSWER IS..."） */
export function darkLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, w: number, h: number, size: number, bg = '#1f2e2e', fg = '#ffffff') {
  ctx.fillStyle = bg
  ctx.fillRect(x, y, w, h)
  ctx.font = `400 ${size}px ${FONT.mono}`
  ctx.letterSpacing = `${(size * 0.32).toFixed(2)}px`
  ctx.fillStyle = fg
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x + size * 0.8, y + h / 2 + 1)
  ctx.textBaseline = 'alphabetic'
  ctx.letterSpacing = '0px'
}
