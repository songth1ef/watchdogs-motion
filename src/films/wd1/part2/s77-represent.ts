/**
 * 77.05–82.4  黑底 "what does that REPRESENT?" + 25 行黑条文档（涂黑文件）：
 * 顶线先从左向右拉出 → 标题打字 → 各行条块零散弹出 → 空隙里出现小字（Social Networks / Email / …）
 * → Credit Cards / Medical Records / Reading History 依次刷青 → 81.4 起标题从头擦除、条块随机消失（接 But a ctOS）。
 * 文档坐标 = 原片 81.35s 的屏幕坐标（文档框 x 434–852，行距 16.4）。
 */
import type { Scene } from '../../../engine/types'
import { rng } from '../../../engine/math'
import { WD1 } from '../../../theme'
import { FONT, ease, ref, span, track, typed } from './common'

export const DOC = { x: 434, y: 158, w: 418, pitch: 16.4, bar: 7 }

/** 行定义：每行的「空隙」= [起点比例, 终点比例, 文字, 是否青色] */
const GAPS: Record<number, [number, number, string, boolean][]> = {
  1: [[0.6, 0.82, 'Social Networks', false]],
  3: [[0.405, 0.525, 'Email', false]],
  7: [[0.265, 0.435, 'Cat Pictures', false]],
  9: [[0.875, 0.955, 'VoIP', false]],
  11: [[0.655, 0.85, 'Pornography', false]],
  13: [[0.865, 0.955, 'Blogs', false]],
  15: [
    [0.135, 0.315, 'Pirate Movies', false],
    [0.54, 0.665, 'Zip Files', false],
  ],
  18: [[0.87, 0.955, 'mp3s', false]],
  19: [[0.34, 0.74, 'Credit Cards', true]],
  21: [[0.36, 0.81, 'Medical Records', true]],
  23: [[0.125, 0.37, 'Reading History', true]],
  24: [[0.655, 0.785, 'Software', false]],
}
/** 各青色块开始刷色的时间 */
const CYAN_T: Record<string, number> = { 'Credit Cards': 78.75, 'Medical Records': 79.0, 'Reading History': 80.75 }

interface Piece {
  row: number
  a: number
  b: number
  tIn: number
  tOut: number
}

const PIECES: Piece[] = (() => {
  const R = rng(7781)
  const out: Piece[] = []
  for (let r = 0; r < 25; r++) {
    // 先按标签空隙切段
    const cuts: [number, number][] = []
    let cur = 0
    for (const [a, b] of GAPS[r] ?? []) {
      cuts.push([cur, a - 0.012])
      cur = b + 0.012
    }
    const end = r === 0 ? 0.98 : r === 22 ? 0.99 : 1
    cuts.push([cur, end])
    // 每段再随机切成 1–3 块，各自弹出/消失
    for (const [a, b] of cuts) {
      const n = R.int(1, 3)
      for (let k = 0; k < n; k++) {
        const pa = a + ((b - a) * k) / n
        const pb = a + ((b - a) * (k + 1)) / n
        out.push({ row: r, a: pa, b: pb, tIn: r === 0 ? 77.02 : 77.72 + R.next() * 0.7 + (r / 25) * 0.25, tOut: 81.5 + R.next() * 1.1 })
      }
    }
  }
  return out
})()

/** 文档 → 屏幕：81.35 之前整体略大（放大 1.077，左上移） */
function docCam(t: number) {
  const k = span(t, 80.95, 81.35, ease.inOutCubic)
  const s = 1.077 + (1 - 1.077) * k
  return { s, ox: 416 + (434 - 416) * k, oy: 133 + (158 - 133) * k }
}

export function drawDocument(ctx: CanvasRenderingContext2D, t: number, keepTopRule: boolean) {
  const c = docCam(t)
  ctx.save()
  ctx.translate(c.ox, c.oy)
  ctx.scale(c.s, c.s)
  ctx.translate(-DOC.x, -DOC.y)

  // 顶线：77.0–77.55 从左往右拉出（它就是第 0 行）
  const topW = track(t, [
    [77.0, 48],
    [77.15, 280],
    [77.35, 368],
    [77.55, 410],
  ])
  for (const p of PIECES) {
    if (t < p.tIn) continue
    if (!(keepTopRule && p.row === 0) && t >= p.tOut) continue
    const y = DOC.y + p.row * DOC.pitch
    const a = DOC.x + p.a * DOC.w
    let b = DOC.x + p.b * DOC.w
    if (p.row === 0) b = Math.min(b, DOC.x + topW)
    if (b <= a) continue
    ctx.fillStyle = '#fff'
    ctx.fillRect(a, y, b - a, DOC.bar)
  }
  // 标签小字与青色块
  ctx.font = `400 10.5px ${FONT.sans}`
  ctx.letterSpacing = '-0.2px'
  for (const [rs, gaps] of Object.entries(GAPS)) {
    const r = Number(rs)
    const y = DOC.y + r * DOC.pitch
    for (const [a, b, text, cyan] of gaps) {
      const x0 = DOC.x + a * DOC.w
      const x1 = DOC.x + b * DOC.w
      const tIn = 78.1 + ((r * 37) % 11) * 0.04
      const tOut = 81.55 + ((r * 13) % 7) * 0.08
      if (t < tIn || t > tOut + 0.3) continue
      if (cyan && t > CYAN_T[text]) {
        const w = (x1 - x0) * span(t, CYAN_T[text], CYAN_T[text] + 0.25, ease.outCubic) * (1 - span(t, tOut, tOut + 0.3))
        ctx.fillStyle = WD1.cyan
        ctx.fillRect(x0, y - 2, w, DOC.bar + 4)
      }
      if (t > tOut) continue
      const shown = text.slice(0, typed(text, t, tIn, 60).n)
      ctx.fillStyle = cyan && t > CYAN_T[text] + 0.1 ? '#0a4a44' : '#fff'
      const tw = ctx.measureText(text).width
      // 青色行文字靠右，普通行居中
      const tx = cyan ? x1 - tw - 8 : (x0 + x1) / 2 - tw / 2
      ctx.fillText(shown, tx, y + DOC.bar + 1)
    }
  }
  ctx.letterSpacing = '0px'
  ctx.restore()
}

export const s77Represent: Scene = {
  id: 'wd1-077-what-does-that-represent',
  start: 77.0,
  end: 82.4,
  note: 'what does that REPRESENT? + 涂黑文档，三行青色高亮',
  render({ ctx, t }) {
    ref(ctx)
    drawDocument(ctx, t, false)
    // 标题：常规体 "what does that " + 粗体 "REPRESENT?"
    const c = docCam(t)
    const tx = (218 - DOC.x) * c.s + c.ox
    const ty = (143 - DOC.y) * c.s + c.oy
    const size = 29 * c.s
    const a = 'what does that '
    const b = 'REPRESENT?'
    const full = a + b
    const n = Math.min(typed(a, t, 77.08, 38).n + typed(b, t, 77.5, 26).n, full.length)
    // 81.4 起从头部擦除，并逐渐变灰
    // 先擦掉 "what does that "，只剩 "REPRESENT?" 变灰淡出
    const cut = Math.round(span(t, 81.4, 81.75) * a.length)
    ctx.save()
    ctx.globalAlpha = 1 - span(t, 81.7, 82.3) * 0.85
    ctx.font = `500 ${size}px ${FONT.sans}`
    ctx.letterSpacing = `${-size * 0.03}px`
    ctx.fillStyle = '#fff'
    let x = tx
    for (let i = 0; i < n; i++) {
      const ch = full[i]
      ctx.font = `${i < a.length ? 500 : 700} ${size}px ${FONT.sans}`
      const w = ctx.measureText(ch).width
      if (i >= cut) ctx.fillText(ch, x, ty)
      x += w
    }
    ctx.restore()
  },
}
