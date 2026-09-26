import type { Scene } from '../../../engine/types'
import { hash, rng, seg } from '../../../engine/math'
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
  const out: { a: Pt; b: Pt; r: number; s: number; g: number }[] = []
  let x = 0
  let k = 0
  let dot: Pt = [0, 0]
  let gi = 0
  for (const ch of 'BLAME?') {
    const g = glyph(ch, c)
    for (const l of g.lines)
      for (let i = 1; i < l.length; i++) {
        const a: Pt = [OX + (x + l[i - 1][0]) * U, OY + l[i - 1][1] * U]
        const b: Pt = [OX + (x + l[i][0]) * U, OY + l[i][1] * U]
        out.push({ a, b, r: hash(k * 13 + 1) * 2 - 1, s: hash(k * 13 + 2), g: gi })
        k++
      }
    if (g.dot) dot = [OX + (x + g.dot[0]) * U, OY + g.dot[1] * U]
    x += g.w + GAP
    gi++
  }
  return { segs: out, dot }
}

/**
 * 18.2–19.1 的网格拼块（V2，对原片 10fps 逐帧）：整屏被几条横竖分割线切成矩形格，每格一种细纹理
 * （横线 / 方格 / 竖线 / 点阵 / 斜菱格 / 空），每 0.1s 换一次切法；线条比 V1 亮（原片线亮度约 40–70）。
 * 18.2–18.4 上方仍留出一条给 s04 的「IN THE DARK」标签与光斑。
 */
function patchwork(ctx: CanvasRenderingContext2D, t: number) {
  const step = Math.floor((t - 18.2) / 0.1)
  const R = rng(1818 + step * 31)
  const fade = 1 - seg(t, 18.9, 19.1)
  const top = t < 18.45 ? 330 - 80 * seg(t, 18.2, 18.45) : 0
  const xs = [0, R.range(380, 700), R.range(1000, 1500), 1920].sort((p, q) => p - q)
  const ys = [top, R.range(360, 560), R.range(700, 880), 1080].sort((p, q) => p - q)
  // 18.45–18.6 按原片量出的四象限（左上横线 / 左下方格 / 右上点阵 / 右下竖线）
  const fixed = t >= 18.45 && t < 18.6
  if (fixed) {
    xs.splice(0, 4, 0, 540, 540, 1920)
    ys.splice(0, 4, 0, 472, 472, 1080)
  }
  const FIX = [0, -1, 1, -1, -1, -1, 3, -1, 2]
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) {
      const x = xs[i]
      const y = ys[j]
      const w = xs[i + 1] - x
      const h = ys[j + 1] - y
      const rk = R.int(0, 5)
      const kind = fixed ? FIX[i * 3 + j] : rk
      if (kind < 0) continue
      const a = (0.12 + R.next() * 0.1) * fade
      if (kind === 5 || w <= 0 || h <= 0) continue
      ctx.save()
      ctx.beginPath()
      ctx.rect(x, y, w, h)
      ctx.clip()
      ctx.strokeStyle = `rgba(255,255,255,${a})`
      ctx.fillStyle = `rgba(255,255,255,${a * 1.6})`
      ctx.lineWidth = 1.5
      ctx.beginPath()
      if (kind === 0) for (let yy = y + 4; yy < y + h; yy += 21) (ctx.moveTo(x, yy), ctx.lineTo(x + w, yy))
      if (kind === 1 || kind === 2) for (let xx = x + 4; xx < x + w; xx += kind === 1 ? 17 : 24) (ctx.moveTo(xx, y), ctx.lineTo(xx, y + h))
      if (kind === 1) for (let yy = y + 4; yy < y + h; yy += 17) (ctx.moveTo(x, yy), ctx.lineTo(x + w, yy))
      if (kind === 4)
        for (let d = -h; d < w + h; d += 40) {
          ctx.moveTo(x + d, y + h)
          ctx.lineTo(x + d + h, y)
          ctx.moveTo(x + d, y)
          ctx.lineTo(x + d + h, y + h)
        }
      ctx.stroke()
      if (kind === 3) for (let yy = y + 6; yy < y + h; yy += 21) for (let xx = x + 6; xx < x + w; xx += 21) ctx.fillRect(xx, yy, 2, 2)
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
  note: '网格拼块转场，线描「BLAME?」成形后推近到「ME?」，「a small vulnerability inside_」打字（vulnerability 灰底），21.1s 起字母线段从左往右逐根熄灭（? 保留）、文字从左擦除',
  render({ ctx, t }) {
    const s = spline(t, [[18.2, 0.76], [19.1, 0.93], [19.4, 1], [20.3, 1.48], [21.2, 1.9], [22.3, 2.2]])
    const ax = spline(t, [[18.2, 1400], [19.4, 1400], [20.3, 972], [21.2, 960], [22.3, 955]])
    // V2：按 20.0/21.0 参考帧，字母整体再低 30–84px；短横落在字母基线上，小字紧贴其下
    const ay = spline(t, [[18.2, 622], [19.4, 622], [20.3, 525], [21.2, 546], [22.3, 547]])
    const { dot } = segments(1.5)
    const bgA = seg(t, 18.85, 19.1) * (1 - seg(t, 22.0, 22.3))

    ctx.save()
    ctx.translate(ax, ay)
    ctx.scale(s, s)
    ctx.translate(-dot[0], -dot[1])
    if (bgA > 0) lattice(ctx, bgA)
    ctx.restore()
    // V2：原片 19–21s 画面中部有一团柔和的亮雾（背景光），四角更暗
    if (bgA > 0) {
      const g = ctx.createRadialGradient(ax - 250, ay - 60, 60, ax - 250, ay - 60, 900)
      g.addColorStop(0, `rgba(255,255,255,${0.03 * bgA * (1 - seg(t, 20.9, 21.3))})`)
      g.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, 1920, 1080)
    }
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
      ctx.lineCap = 'round'
      ctx.shadowColor = 'rgba(255,255,255,0.6)'
      ctx.shadowBlur = 6
      for (const sg of segs) {
        // V2：原片的崩散是线段「整根消失」而不是旋转飞散——从左往右（B→E）逐根熄灭，消失前闪一帧，
        // 「?」保持完整直到整段淡出
        if (sg.g < 5) {
          const tv = 21.1 + (sg.g / 5) * 0.75 + sg.s * 0.45
          if (t > tv) continue
          if (t > tv - 0.034 && hash(sg.s * 999) > 0.5) continue
        }
        ctx.strokeStyle = `rgba(255,255,255,${br * (1 - seg(t, 21.9, 22.3))})`
        ctx.lineWidth = 2.2 / Math.sqrt(s)
        ctx.beginPath()
        ctx.moveTo(sg.a[0], sg.a[1])
        ctx.lineTo(sg.b[0], sg.b[1])
        ctx.stroke()
      }
      ctx.shadowBlur = 0
    }
    ctx.restore()

    // 发光短横（屏幕空间，跟随锚点）：19.3 出现
    const dashOn = seg(t, 19.3, 19.45) * (1 - seg(t, 21.65, 21.75))
    if (dashOn > 0) {
      const x1 = ax - 40 * s * seg(t, 19.35, 19.6)
      const y = ay + 3 * s
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
      const n = Math.min(full.length, Math.floor((t - 19.55) * 42))
      // V2：原片 21.5 才删掉前 4 个字（"small" 先变暗成残影），之后约 50 字/秒加速删除
      const del = Math.max(0, Math.floor((t - 21.42) * 50))
      const size = 36 * s
      const x0 = ax + 6 * s
      const base = ay + 32 * s
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
          } else ctx.fillStyle = `rgba(190,190,190,${i >= 2 && i < 7 ? 0.9 - 0.55 * seg(t, 21.3, 21.6) : 0.9})`
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
