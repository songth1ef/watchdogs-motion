/**
 * 86.3–91.25  Data Silos 小卡片阵列飞散成一群「像素块」，从下方升起、在一条带上翻转，
 * 87.6–88.9 逐个落位拼成像素大字 "HOW  YOU / THINK" → 89.4–89.9 逐像素替换成 "WHAT  YOU / BELIEVE"
 * → 90.4 起像素块四散放大成满屏白色方块 → 91.2 铺满白（接 Citizen Profiles 白底）。
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
function tile(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, sx: number, skew: number) {
  ctx.save()
  ctx.translate(x + (P * s) / 2, y + (P * s) / 2)
  ctx.transform(sx, skew, 0, 1, 0, 0)
  const w = (P - 2) * s
  ctx.fillStyle = '#fff'
  ctx.fillRect(-w / 2, -w / 2, w, w)
  if (s < 2.5) {
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
  end: 91.25,
  note: 'Data Silos 飞散 → 像素字 HOW YOU THINK → WHAT YOU BELIEVE → 白块铺屏',
  render({ ctx, t }) {
    ref(ctx)
    // 91.1 起整屏白
    if (t >= 91.12) {
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, 1280, 720)
      return
    }
    // 镜头：88.6 前略推近并偏左，89.2 回到 1:1
    const cs = 1 + 0.35 * (1 - span(t, 88.3, 89.1, ease.inOutCubic))
    const cx = -10 * (1 - span(t, 88.3, 89.1, ease.inOutCubic))
    ctx.translate(cx, 0)
    ctx.translate(640, 360)
    ctx.scale(cs, cs)
    ctx.translate(-640, -360)

    const scatter = span(t, 90.55, 91.15)
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
          // 飞入：按字母成组，从下方散布点升到中部带状，再逐个落位
          const land = 87.55 + (p.letter / 12) * 0.9 + h1 * 0.45
          const q = span(t, land, land + 0.45, ease.outCubic)
          // 同一字母的像素保持相对排布（看起来是一块块小格阵列）
          const o = ORIGIN[p.letter]
          const hl = hash(p.letter * 5)
          const lx = hash(p.letter * 13 + 1) * 1400 - 60
          const band = 170 + hash(p.letter * 17 + 3) * 70
          const rise = span(t, 86.55 + hl * 0.45, 87.45 + hl * 0.2, ease.outCubic)
          const fx = lx + (p.x - o[0]) * 0.8 + (1 - rise) * (hl - 0.5) * 500
          const fy = band + (p.y - o[1]) * 0.8 + (1 - rise) * (520 + hl * 200)
          x = fx + (p.x - fx) * q
          y = fy + (p.y - fy) * q
          sx = Math.cos((1 - q) * (1.2 + h1 * 1.2))
          skew = (1 - q) * (h3 - 0.5) * 1.2
          s = 0.85 + 0.15 * q
          // 换字：89.4–89.75 随机消失
          if (t > 89.35 + h1 * 0.25) return
        } else {
          const tin = 89.4 + h1 * 0.28
          if (t < tin) return
          const g = 1 - span(t, tin, tin + 0.12)
          x += (h2 - 0.5) * 30 * g
          sx = 1 - g * 0.8
          if (scatter > 0) {
            // 散开放大成白块
            const k = ease.inCubic(clamp01((scatter - h3 * 0.3) / 0.7))
            x += (h2 - 0.5) * 700 * k
            y += (h1 - 0.5) * 500 * k
            s = 1 + k * (1 + h3 * 9)
          }
        }
        tile(ctx, x, y, s, Math.max(0.05, Math.abs(sx)), skew)
      })
    }
    drawSet(A, 0)
    drawSet(B, 1)
  },
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
