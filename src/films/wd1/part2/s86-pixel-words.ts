/**
 * 86.3–91.25  Data Silos 小卡片阵列飞散成一群「像素块」，从下方升起、在一条带上翻转，
 * 87.6–88.9 逐个落位拼成像素大字 "HOW  YOU / THINK" → 89.4–89.9 逐像素替换成 "WHAT  YOU / BELIEVE"
 * → 90.55 起像素块四散放大、大部分飞出画面，91.25 只剩少量大白块（接 s91 的白格面板，91.37 铺满白）。
 * 像素字体是手写 5 行点阵（PIX），每个像素 = 一个带 3×3 细格的白色小卡片。
 */
import type { Scene } from '../../../engine/types'
import { hash } from '../../../engine/math'
import { ease, ref, span } from './common'

const PIX: Record<string, string[]> = {
  H: ['1001', '1001', '1111', '1001', '1001'],
  O: ['11111', '10001', '10001', '10001', '11111'],
  W: ['10001', '10001', '10101', '10101', '11111'],
  Y: ['10001', '10001', '11111', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '11111'],
  T: ['11111', '00100', '00100', '00100', '00100'],
  I: ['111', '010', '010', '010', '111'],
  N: ['10001', '11001', '10101', '10011', '10001'],
  K: ['10001', '10010', '11100', '10010', '10001'],
  A: ['11111', '10001', '11111', '10001', '10001'],
  B: ['11110', '10001', '11110', '10001', '11110'],
  E: ['11111', '10000', '11110', '10000', '11111'],
  L: ['10000', '10000', '10000', '10000', '11111'],
  V: ['10001', '10001', '10001', '01010', '00100'],
}
const P = 22

/** 把若干单词排成像素点列表（点 = 左上角坐标 + 所属字母序号） */
function layout(words: [string, number, number][]) {
  const out: { x: number; y: number; letter: number }[] = []
  let li = 0
  for (const [w, x0, y0] of words) {
    let x = x0
    for (const ch of w) {
      const g = PIX[ch]
      g.forEach((row, r) => [...row].forEach((b, c) => b === '1' && out.push({ x: x + c * P, y: y0 + r * P, letter: li })))
      x += (g[0].length + 1) * P
      li++
    }
  }
  return out
}

const A = layout([
  ['HOW', 114, 180],
  ['YOU', 756, 180],
  ['THINK', 114, 424],
])
/** 每个字母左上角（飞行阶段用来保持字母内部排布） */
const ORIGIN: [number, number][] = []
for (const p of A) {
  const o = ORIGIN[p.letter]
  if (!o) ORIGIN[p.letter] = [p.x, p.y]
  else ORIGIN[p.letter] = [Math.min(o[0], p.x), Math.min(o[1], p.y)]
}
const B = layout([
  ['WHAT', 150, 190],
  ['YOU', 750, 190],
  ['BELIEVE', 150, 410],
])

/** 像素卡片：sx = 绕竖轴翻转后的横向缩放，skew = 透视错切 */
function tile(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, sx: number, skew: number, solid = false) {
  ctx.save()
  ctx.translate(x + (P * s) / 2, y + (P * s) / 2)
  ctx.transform(sx, skew, 0, 1, 0, 0)
  const w = (P - 2) * s
  ctx.fillStyle = '#fff'
  ctx.fillRect(-w / 2, -w / 2, w, w)
  if (s < 2.5 && !solid) {
    ctx.fillStyle = '#000'
    const k = w / 4
    for (let i = 1; i < 4; i++) {
      ctx.fillRect(-w / 2 + i * k - 0.35, -w / 2, 0.7, w)
      ctx.fillRect(-w / 2, -w / 2 + i * k - 0.35, w, 0.7)
    }
  }
  ctx.restore()
}

export const s86PixelWords: Scene = {
  id: 'wd1-086-how-you-think',
  start: 86.3,
  end: 91.3,
  note: 'Data Silos 飞散 → 像素字 HOW YOU THINK → WHAT YOU BELIEVE → 白块铺屏',
  render({ ctx, t }) {
    ref(ctx)
    // 镜头：88.6 前略推近并偏左，89.2 回到 1:1
    const cs = 1 + 0.35 * (1 - span(t, 88.3, 89.1, ease.inOutCubic))
    const cx = -10 * (1 - span(t, 88.3, 89.1, ease.inOutCubic))
    ctx.translate(cx, 0)
    ctx.translate(640, 360)
    ctx.scale(cs, cs)
    ctx.translate(-640, -360)

    const scatter = span(t, 90.65, 91.3)
    const drawSet = (pts: typeof A, set: number) => {
      pts.forEach((p, i) => {
        const h1 = hash(i * 31 + set * 7919)
        const h2 = hash(i * 57 + 11 + set * 104729)
        const h3 = hash(i * 91 + 5 + set * 3301)
        let x = p.x
        let y = p.y
        let s = 1
        let sx = 1
        let skew = 0
        if (set === 0) {
          // 飞入（V2 按 30fps 逐帧重对）：字母组 86.75–88.0 从左下升到中部带（y≈300–450，88.2 前缓慢上移到 ≈250–350），
          // 部分像素拖在带下方（87.6–88.4 原片带下面有一片零散小卡片），88.1–89.0 逐个落位
          const land = 88.05 + (p.letter / 12) * 0.25 + h1 * 0.2
          const q = span(t, land, land + 0.25, ease.outCubic)
          // 同一字母的像素保持相对排布（看起来是一块块小格阵列）
          const o = ORIGIN[p.letter]
          const hl = hash(p.letter * 5)
          const lx = hash(p.letter * 13 + 1) * 1400 - 60
          const band = 345 + hash(p.letter * 17 + 3) * 60 - 40 * span(t, 87.4, 88.3)
          const rise = span(t, 86.6 + hl * 0.3, 87.25 + hl * 0.2, ease.outCubic)
          const lag = h2 > 0.8 ? (1 - span(t, 87.6 + h3 * 0.4, 88.4 + h3 * 0.3, ease.inOutCubic)) * span(t, 87.2, 87.7) * (80 + h3 * 260) : 0
          const fx = lx + (p.x - o[0]) * 0.8 + (1 - rise) * (hl - 0.5) * 500 - (1 - rise) * 300
          const fy = band + (p.y - o[1]) * 0.8 + (1 - rise) * (420 + hl * 200) + lag
          x = fx + (p.x - fx) * q
          y = fy + (p.y - fy) * q
          sx = Math.cos((1 - q) * (0.5 + hl * 0.7))
          skew = (1 - q) * (0.35 + (hl - 0.5) * 0.9)
          s = 0.85 + 0.15 * q
          // 换字：89.5–89.72 随机消失（原片 89.5 仍以旧字为主）
          if (t > 89.5 + h1 * 0.22) return
        } else {
          const tin = 89.45 + h1 * 0.25
          if (t < tin) return
          const g = 1 - span(t, tin, tin + 0.12)
          x += (h2 - 0.5) * 30 * g
          sx = 1 - g * 0.8
          if (scatter > 0) {
            // 散开（V2 对原片 30fps 逐帧）：90.55 起字形先抖散，随后像素块沿径向飞出并放大——
            // 上行飞出画面顶端、下行落到画面下半；91.0 后只剩十来块大白块（边长 50–100），不铺满白屏
            const k = clamp01((scatter - h3 * 0.15) / 0.85) ** 1.2
            const kj = span(t, 90.55, 90.75)
            x += (h2 - 0.5) * 40 * kj + (x - 640) * 1.3 * k + (h2 - 0.5) * 500 * k
            y += (h1 - 0.5) * 30 * kj + (y - 300) * (y < 300 ? 4.5 : 2.4) * k + (h1 - 0.5) * 160 * k
            s = 1 + 0.15 * kj + k * (0.6 + h3 * 3.2)
            skew = (h1 - 0.5) * 0.3 * kj * (1 - k)
            // 越往后越稀：只留一小部分块
            if (hash(i * 13 + 777) < k * 0.88) return
          }
        }
        tile(ctx, x, y, s, Math.max(0.05, Math.abs(sx)), skew, set === 1 && scatter > 0 && hash(i * 7 + 3) > 0.15)
      })
    }
    drawSet(A, 0)
    drawSet(B, 1)
  },
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
