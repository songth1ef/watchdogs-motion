import type { Scene } from '../../../engine/types'
import { clamp, ease, hash, rng, seg } from '../../../engine/math'
import { WD1 } from '../../../theme'
import { FONT, font, measure, tracking } from '../../../fx/text'
import { hatchRect } from '../../../fx/image'
import { memo } from '../../../engine/three-host'
import { GREAT_LAKES, LIGHTS, NORTH_AMERICA, type LonLat } from './geo'
import { spline, typeBox, typed } from './util'

/**
 * 11.8–15.1  「2003 Blackout」标题 + 美国东北斜纹地图 + 青色半透明气泡 + 「Panic / New York State」标签，整层持续推近。
 * 世界坐标以 12.9s 的画面为基准（s=1），相机只做平面缩放+平移（原片是 2D 层推近）。
 * ASSET：气泡位置由 geo.ts 的灯光团程序化生成；换真实数据时替换 bubbles()。
 */

// 经纬度 → 世界坐标（在 12.9s 参考帧上对齐五大湖与纽约）
const proj = (p: LonLat): [number, number] => [216 + (p[0] + 95) * 33, 276 + (49 - p[1]) * 34]

interface Bubble {
  x: number
  y: number
  r: number
  delay: number
}

function bubbles(): Bubble[] {
  return memo('wd1p1:bubbles', () => {
    const R = rng(814)
    const out: Bubble[] = []
    const gauss = () => (R.next() + R.next() + R.next() - 1.5) / 0.5
    for (const [lon, lat, w, spread] of LIGHTS) {
      if (lon < -98 || lon > -60 || lat < 28 || lat > 50) continue
      const n = Math.round(w * 12)
      for (let i = 0; i < n; i++) {
        const [x, y] = proj([lon + gauss() * spread * 0.9, lat + gauss() * spread * 0.6])
        if (x < 225 || y > 930 || x > 1150) continue
        const big = R.chance(0.22)
        out.push({ x, y, r: big ? R.range(18, 34) : R.range(4, 14), delay: R.next() })
      }
    }
    // 东侧海上一串小点（新斯科舍方向）
    for (let i = 0; i < 9; i++) out.push({ x: 1180 + i * 22 + R.range(-8, 8), y: 440 + R.range(-20, 20) - i * 3, r: R.range(3, 8), delay: R.next() })
    return out
  })
}

function hatchLand(ctx: CanvasRenderingContext2D) {
  ctx.save()
  ctx.beginPath()
  NORTH_AMERICA.forEach((p, i) => {
    const [x, y] = proj(p)
    if (i) ctx.lineTo(x, y)
    else ctx.moveTo(x, y)
  })
  ctx.closePath()
  for (const lake of GREAT_LAKES) {
    lake.forEach((p, i) => {
      const [x, y] = proj(p)
      if (i) ctx.lineTo(x, y)
      else ctx.moveTo(x, y)
    })
    ctx.closePath()
  }
  ctx.clip('evenodd')
  ctx.beginPath()
  ctx.rect(173, 262, 1330, 760)
  ctx.clip()
  hatchRect(ctx, 173, 262, 1330, 760, 9, 'rgba(255,255,255,0.2)', 1.1)
  ctx.restore()
}

export const blackout: Scene = {
  id: 'wd1-012-blackout',
  start: 11.8,
  end: 15.1,
  note: '「2003 Blackout」+ 下划线，美国东北斜纹地图上青色气泡弹出，Panic/New York State 打字后擦除，整层加速推近',
  render({ ctx, t }) {
    const s = spline(t, [[11.8, 0.74], [12.1, 0.8], [12.9, 1], [13.8, 1.25], [14.5, 1.75], [15.1, 2.6]])
    const X = spline(t, [[11.8, 340], [12.1, 305], [12.9, 173], [13.8, -24], [14.5, -375], [15.1, -1000]])
    const Y = spline(t, [[11.8, 250], [12.1, 252], [12.9, 259], [13.8, 175], [14.5, 55], [15.1, -170]])
    const fade = 1 - seg(t, 14.85, 15.1)
    ctx.globalAlpha = fade
    ctx.translate(X, Y)
    ctx.scale(s, s)
    ctx.translate(-173, -259)

    // 点阵底
    ctx.fillStyle = 'rgba(255,255,255,0.22)'
    for (let y = 280; y < 1040; y += 34) for (let x = 190; x < 1500; x += 34) ctx.fillRect(x - 1.5, y - 1.5, 3, 3)

    hatchLand(ctx)

    // 斜线
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'
    ctx.lineWidth = 2 / s
    ctx.beginPath()
    ctx.moveTo(1656, 523)
    ctx.lineTo(1140, 1032)
    ctx.stroke()

    // 气泡：11.8–12.7 依次弹出，之后轻微呼吸
    ctx.save()
    ctx.globalCompositeOperation = 'screen'
    ctx.fillStyle = WD1.cyan
    for (const [i, b] of bubbles().entries()) {
      const q = seg(t, 11.75 + b.delay * 0.8, 11.95 + b.delay * 0.8)
      if (q <= 0) continue
      const breathe = 1 + 0.06 * Math.sin(t * 3 + i)
      const r = b.r * ease.outBack(q) * breathe
      ctx.globalAlpha = fade * (0.75 + 0.15 * hash(i))
      ctx.beginPath()
      ctx.arc(b.x, b.y, Math.max(0, r), 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
    ctx.globalAlpha = fade

    // 标题 + 下划线
    const title = '2003 Blackout'
    font(ctx, 127, 500, FONT.sans)
    tracking(ctx, -5)
    ctx.fillStyle = '#fff'
    const n = typed(t, 10.7, 10, title.length)
    ctx.fillText(title.slice(0, n), 168, 240)
    tracking(ctx, 0)
    ctx.fillRect(173, 258, 1327 * ease.outCubic(seg(t, 11.8, 12.3)), 2 / s)

    // Panic / New York State
    const er = seg(t, 13.95, 14.65) // 从左往右擦除
    if (t >= 12.15 && er < 1) {
      const nP = typed(t, 12.15, 18, 5)
      const nS = typed(t, 12.35, 26, 14)
      const pr = typeBox(ctx, { text: 'Panic', n: nP, x: 893, y: 516, size: 64, weight: 500, padX: 3, padTop: 4, padBottom: 6, boxMode: 'text', cursor: nP < 5, eraseL: er * 1.6 })
      typeBox(ctx, { text: 'New York State', n: nS, x: 893, y: 552, size: 36, weight: 400, track: -1, padX: 3, padTop: 3, padBottom: 6, boxMode: 'text', cursor: nS < 14, eraseL: clamp(er * 1.3 - 0.1) })
      // 擦除时的竖线光标
      if (er > 0.55) {
        ctx.fillStyle = '#fff'
        ctx.fillRect(893 + pr.w * 0.9, 470, 6, 70)
      }
    }
    void measure
  },
}
