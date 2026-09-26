import type { Scene } from '../../../engine/types'
import { clamp, ease, hash, rng, seg } from '../../../engine/math'
import { FONT, font, measure, tracking } from '../../../fx/text'
import { blink, fr, spline } from './util'

/**
 * 18.2–22.3  网格拼块转场 → 线描八角字「BLAME?」→ 推近到「ME?」+「a small vulnerability inside_」→ 字母线段崩散。
 * 世界坐标以 19.4s 画面为基准（s=1），相机以「?」下方的点为锚点推近。
 */

type Pt = [number, number]
/** 线描字形（单位：字高 10），c = 倒角大小（0 = 方角，转场阶段用） */
function glyph(ch: string, c: number): { w: number; lines: Pt[][]; dot?: Pt } {
  switch (ch) {
    case 'B':
      return {
        w: 6.5,
        lines: [
          [[0, 0], [0, 10], [6.5 - c, 10], [6.5, 10 - c], [6.5, 6.5], [6.5 - c * 1.5, 5], [0, 5]],
          [[0, 0], [6 - c, 0], [6, c], [6, 3.5], [6 - c, 5]],
        ],
      }
    case 'L':
      return { w: 6, lines: [[[0, 0], [0, 10], [6, 10]]] }
    case 'A':
      return { w: 7, lines: [[[0, 10], [0, c], [c, 0], [7 - c, 0], [7, c], [7, 10]], [[0, 5.5], [7, 5.5]]] }
    case 'M':
      return {
        w: 8.5,
        lines: [
          [[0, 10], [0, 0], [4.25 - c, 0], [4.25, c], [4.25, 10]],
          [[4.25, c], [4.25 + c, 0], [8.5 - c, 0], [8.5, c], [8.5, 10]],
        ],
      }
    case 'E':
      return { w: 6, lines: [[[6, 0], [c, 0], [0, c], [0, 5 - c], [c * 0.9, 5], [0, 5 + c], [0, 10 - c], [c, 10], [6, 10]]] }
    case '?':
      return { w: 6.5, lines: [[[0, c], [c, 0], [6.5 - c, 0], [6.5, c], [6.5, 4], [3.2, 7.3], [3.2, 9]]], dot: [3.2, 10] }
  }
  return { w: 5, lines: [] }
}

const U = 23.5 // 世界单位 → px
const OX = 336
const OY = 384
const GAP = 1.6

/** 所有线段（世界坐标），附带崩散用的随机参数 */
function segments(c: number) {
  const out: { a: Pt; b: Pt; r: number; s: number }[] = []
  let x = 0
  let k = 0
  let dot: Pt = [0, 0]
  for (const ch of 'BLAME?') {
    const g = glyph(ch, c)
    for (const l of g.lines)
      for (let i = 1; i < l.length; i++) {
        const a: Pt = [OX + (x + l[i - 1][0]) * U, OY + l[i - 1][1] * U]
        const b: Pt = [OX + (x + l[i][0]) * U, OY + l[i][1] * U]
        out.push({ a, b, r: hash(k * 13 + 1) * 2 - 1, s: hash(k * 13 + 2) })
        k++
      }
    if (g.dot) dot = [OX + (x + g.dot[0]) * U, OY + g.dot[1] * U]
    x += g.w + GAP
  }
  return { segs: out, dot }
}

/** 18.2–19.1 的网格拼块：若干矩形区域里出现细方格/竖线/斜纹 */
function patchwork(ctx: CanvasRenderingContext2D, t: number) {
  const R = rng(1818)
  for (let i = 0; i < 16; i++) {
    const x = R.range(-200, 1800)
    const y = R.range(-100, 900)
    const w = R.range(300, 1100)
    const h = R.range(150, 600)
    const kind = R.int(0, 2)
    const t0 = 18.2 + R.next() * 0.55
    const on = seg(t, t0, t0 + 0.05) * (1 - seg(t, 19.2, 19.4))
    if (on <= 0) continue
    ctx.save()
    ctx.beginPath()
    ctx.rect(x, y, w, h)
    ctx.clip()
    ctx.fillStyle = 'rgba(0,0,0,0.5)'
    ctx.fillRect(x, y, w, h)
    ctx.strokeStyle = `rgba(255,255,255,${0.1 * on})`
    ctx.lineWidth = 1
    ctx.beginPath()
    const g = kind === 2 ? 9 : 14
    for (let xx = x; xx < x + w; xx += g) {
      ctx.moveTo(xx + 0.5, y)
      ctx.lineTo(xx + 0.5, y + h)
    }
    if (kind === 0)
      for (let yy = y; yy < y + h; yy += g) {
        ctx.moveTo(x, yy + 0.5)
        ctx.lineTo(x + w, yy + 0.5)
      }
    if (kind === 1)
      for (let d = -h; d < w; d += 11) {
        ctx.moveTo(x + d, y + h)
        ctx.lineTo(x + d + h, y)
      }
    ctx.stroke()
    ctx.restore()
  }
}

/** 菱形格底纹 + 交点小十字（世界坐标） */
function lattice(ctx: CanvasRenderingContext2D, a: number) {
  const sp = 81
  ctx.strokeStyle = `rgba(255,255,255,${0.09 * a})`
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let d = -3000; d < 4000; d += sp) {
    ctx.moveTo(d, -1500)
    ctx.lineTo(d + 3000, 1500)
    ctx.moveTo(d, 1500)
    ctx.lineTo(d + 3000, -1500)
  }
  ctx.stroke()
  ctx.strokeStyle = `rgba(255,255,255,${0.05 * a})`
  ctx.beginPath()
  for (let x = -1000; x < 3000; x += sp / 2) {
    ctx.moveTo(x, -1500)
    ctx.lineTo(x, 1500)
  }
  ctx.stroke()
  ctx.strokeStyle = `rgba(255,255,255,${0.3 * a})`
  ctx.beginPath()
  for (let y = -1500; y < 1500; y += sp) for (let x = -1000; x < 3000; x += sp) {
    ctx.moveTo(x - 4, y)
    ctx.lineTo(x + 4, y)
    ctx.moveTo(x, y - 4)
    ctx.lineTo(x, y + 4)
  }
  ctx.stroke()
}

export const blame: Scene = {
  id: 'wd1-018-blame',
  start: 18.2,
  end: 22.3,
  note: '网格拼块转场，线描「BLAME?」成形后推近到「ME?」，「a small vulnerability inside_」打字（vulnerability 灰底），21s 起字母线段崩散、文字从左擦除',
  render({ ctx, t }) {
    const s = spline(t, [[18.2, 0.76], [19.1, 0.93], [19.4, 1], [20.3, 1.48], [21.2, 1.9], [22.3, 2.2]])
    const ax = spline(t, [[18.2, 1400], [19.4, 1400], [20.3, 972], [21.2, 960], [22.3, 955]])
    const ay = spline(t, [[18.2, 622], [19.4, 622], [20.3, 480], [21.2, 456], [22.3, 452]])
    const { dot } = segments(1.5)
    const bgA = seg(t, 19.1, 19.45) * (1 - seg(t, 22.0, 22.3))

    ctx.save()
    ctx.translate(ax, ay)
    ctx.scale(s, s)
    ctx.translate(-dot[0], -dot[1])
    if (bgA > 0) lattice(ctx, bgA)
    ctx.restore()
    if (t < 19.4) patchwork(ctx, t)

    ctx.save()
    ctx.translate(ax, ay)
    ctx.scale(s, s)
    ctx.translate(-dot[0], -dot[1])
    // 字母：18.45 以方角出现，18.9 起换成倒角；亮度 18.45→19.2 上升
    if (t >= 18.45) {
      const c = t < 19.2 ? 0 : 1.5
      const { segs } = segments(c)
      const br = 0.15 + 0.8 * seg(t, 18.8, 19.45)
      const brk = seg(t, 21.05, 22.3) // 崩散
      ctx.lineCap = 'round'
      ctx.shadowColor = 'rgba(255,255,255,0.6)'
      ctx.shadowBlur = 6
      for (const sg of segs) {
        const q = ease.inQuad(clamp(brk * 1.4 - sg.s * 0.4))
        const mx = (sg.a[0] + sg.b[0]) / 2
        const my = (sg.a[1] + sg.b[1]) / 2
        const ang = sg.r * q * 0.7
        const len = 1 - q * 0.3 * sg.s
        const cs = Math.cos(ang) * len
        const sn = Math.sin(ang) * len
        const dx = (sg.a[0] - mx) * cs - (sg.a[1] - my) * sn
        const dy = (sg.a[0] - mx) * sn + (sg.a[1] - my) * cs
        const ox = sg.r * q * 25
        const oy = (sg.s - 0.5) * q * 35
        ctx.strokeStyle = `rgba(255,255,255,${br * (1 - seg(t, 21.9, 22.3))})`
        ctx.lineWidth = 2.2 / Math.sqrt(s)
        ctx.beginPath()
        ctx.moveTo(mx + ox + dx, my + oy + dy)
        ctx.lineTo(mx + ox - dx, my + oy - dy)
        ctx.stroke()
      }
      ctx.shadowBlur = 0
    }
    ctx.restore()

    // 发光短横（屏幕空间，跟随锚点）：19.3 出现
    const dashOn = seg(t, 19.3, 19.45) * (1 - seg(t, 21.65, 21.75))
    if (dashOn > 0) {
      const x1 = ax - 40 * s * seg(t, 19.35, 19.6)
      const y = ay + 44 * s
      ctx.save()
      ctx.shadowColor = '#fff'
      ctx.shadowBlur = 14
      ctx.strokeStyle = `rgba(255,255,255,${dashOn})`
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.moveTo(x1, y)
      ctx.lineTo(ax + 2, y)
      ctx.stroke()
      ctx.fillStyle = '#fff'
      ctx.beginPath()
      ctx.arc(ax + 2, y, 4, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }

    // 「a small vulnerability inside_」：19.6 起打字，21.0 起从左擦除
    if (t >= 19.6 && t < 21.9) {
      const full = 'a small vulnerability inside'
      const n = Math.min(full.length, Math.floor((t - 19.6) * 36))
      const del = Math.max(0, Math.floor((t - 21.0) * 26))
      const size = 36 * s
      const x0 = ax + 6 * s
      const base = ay + 73 * s
      font(ctx, size, 300, FONT.sans)
      tracking(ctx, -size * 0.03)
      let x = x0
      for (let i = 0; i < n; i++) {
        const ch = full[i]
        const w = measure(ctx, ch)
        const inHi = i >= 8 && i < 21
        if (i >= del) {
          if (inHi) {
            ctx.fillStyle = 'rgba(200,200,200,0.85)'
            ctx.fillRect(x - (i === 8 ? 3 : 0), base - size * 0.8, w + (i === 20 || i === n - 1 ? 3 : 0) + 0.8, size * 1.02)
            ctx.fillStyle = '#f4f4f4'
          } else ctx.fillStyle = 'rgba(190,190,190,0.9)'
          ctx.fillText(ch, x, base)
        }
        x += w
      }
      if (n >= full.length && blink(t)) {
        ctx.fillStyle = 'rgba(190,190,190,0.9)'
        ctx.fillText('_', x, base)
      }
      tracking(ctx, 0)
    }
    void fr
  },
}
