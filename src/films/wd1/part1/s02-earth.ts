import type { Scene } from '../../../engine/types'
import { clamp, ease, hash, seg } from '../../../engine/math'
import { FONT } from '../../../fx/text'
import { EARTH_R0, renderEarth, projectLonLat } from './earth'
import { blink, spline, typeBox, typed } from './util'

/**
 * 2.7–11.8  暗色地球 + 星座连线 + 「14 AUGUST 2003」白底打字标签 → 灯光被黑色弧面吞掉 → 推近标签。
 * 地球：three.js 球 + 程序化夜景贴图（ASSET，见 earth.ts earthTexture()）。
 */

// 相机：地球半径与中心（1920 坐标），从参考帧 3.5/5/6.9/8.5/10.5/11.2/11.6s 量出
const R_KEYS: [number, number][] = [[2.7, 170], [3.5, 221], [5, 329], [6.9, 413], [8.5, 450], [10.5, 516], [11.2, 560], [11.4, 577], [11.8, 640]]
const CY_KEYS: [number, number][] = [[2.7, 470], [3.5, 449], [5, 408], [6.9, 384], [8.5, 345], [10.5, 276], [11.2, 245], [11.4, 250], [11.8, 240]]
const CX_KEYS: [number, number][] = [[2.7, 965], [8.5, 975], [10.5, 984], [11.2, 980], [11.8, 1000]]

// 视线中心经纬度与画面旋转（北极在画面右上方）
const VIEW_LON = -101
const VIEW_LAT = 66
const ROLL = 8

/** 星座/十字/方框等 HUD 元素：t=8.5 时的屏幕坐标（1920），整体随相机缩放 */
const NODES = {
  a: [218, 153],
  b: [300, 282],
  n10: [1725, 63],
  n9: [1530, 1060],
  sq1: [1515, 405],
  sq2: [1503, 510],
} as const
const CROSSES: [number, number, number][] = [
  [200, 466, 22], [81, 742, 22], [315, 880, 22], [807, 550, 22], [1485, 217, 30], [1605, 232, 18], [1475, 258, 22],
  [1395, 457, 22], [1605, 849, 26], [1299, 984, 22], [1830, 700, 18], [590, 1030, 16],
]

function hud(ctx: CanvasRenderingContext2D, t: number, k: number, alpha: number) {
  const P = (x: number, y: number): [number, number] => [960 + (x - 960) * k, 540 + (y - 540) * k]
  ctx.globalAlpha = alpha
  ctx.strokeStyle = 'rgba(255,255,255,0.75)'
  ctx.lineWidth = 1.5
  const line = (a: readonly number[], b: readonly number[], w = 1.5, c = 'rgba(255,255,255,0.75)') => {
    const [x1, y1] = P(a[0], a[1])
    const [x2, y2] = P(b[0], b[1])
    ctx.strokeStyle = c
    ctx.lineWidth = w
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
  }
  const dot = (p: readonly number[], r: number, label?: string) => {
    const [x, y] = P(p[0], p[1])
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
    if (label) {
      ctx.font = `500 ${Math.round(18 * Math.sqrt(k))}px ${FONT.sans}`
      ctx.fillText(label, x + 12, y + 7)
    }
  }
  line(NODES.a, NODES.b, 2)
  line(NODES.a, [360, -10], 1.2, 'rgba(255,255,255,0.4)')
  line(NODES.a, [640, 520], 1.2, 'rgba(255,255,255,0.3)')
  line(NODES.n10, NODES.n9, 2)
  line([560, 1120], [790, 830], 1.2, 'rgba(255,255,255,0.35)')
  line(NODES.sq1, NODES.sq2, 1.5)
  dot(NODES.a, 2.5, '1')
  dot(NODES.b, 5, '5')
  dot(NODES.n10, 5, '10')
  dot(NODES.n9, 4, '9')
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'
  ctx.lineWidth = 1.5
  const sq = (p: readonly number[], s: number) => {
    const [x, y] = P(p[0], p[1])
    const ss = s * k
    ctx.strokeRect(x - ss / 2, y - ss / 2, ss, ss)
  }
  sq(NODES.sq1, 21)
  sq(NODES.sq2, 33)
  ctx.strokeStyle = 'rgba(255,255,255,0.6)'
  ctx.lineWidth = 1.3
  for (const [x0, y0, s] of CROSSES) {
    const [x, y] = P(x0, y0)
    const h = (s * Math.sqrt(k)) / 2
    ctx.beginPath()
    ctx.moveTo(x - h, y)
    ctx.lineTo(x + h, y)
    ctx.moveTo(x, y - h)
    ctx.lineTo(x, y + h)
    ctx.stroke()
  }
  // 细小星点
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  for (let i = 0; i < 60; i++) {
    const [x, y] = P(hash(i * 7 + 1) * 2200 - 140, hash(i * 7 + 2) * 1300 - 110)
    ctx.fillRect(x, y, 2, 2)
  }
  ctx.globalAlpha = 1
  void t
}

export const earth: Scene = {
  id: 'wd1-003-earth',
  start: 2.7,
  end: 11.8,
  note: '暗色地球缓慢推近上移，星座连线 HUD，6.8s 起「14 AUGUST 2003」打字标签，10.55s 黑色弧面扫过吞掉灯光，11.2s 起推向标签',
  render({ ctx, t, three }) {
    const r = spline(t, R_KEYS)
    const cx = spline(t, CX_KEYS)
    const cy = spline(t, CY_KEYS)
    const k = r / 450
    const fadeIn = ease.inOutCubic(seg(t, 2.8, 4.3))
    const lon = VIEW_LON + (t - 8.5) * 0.9
    const lat = VIEW_LAT

    // HUD（在地球后面）
    hud(ctx, t, Math.pow(k, 0.9), fadeIn)

    // 地球
    const gl = renderEarth(three, lon, lat, ROLL)
    ctx.save()
    ctx.globalAlpha = fadeIn
    const s = r / EARTH_R0
    ctx.drawImage(gl, 960 - EARTH_R0 - 2, 540 - EARTH_R0 - 2, EARTH_R0 * 2 + 4, EARTH_R0 * 2 + 4, cx - r - 2 * s, cy - r - 2 * s, (EARTH_R0 * 2 + 4) * s, (EARTH_R0 * 2 + 4) * s)
    ctx.filter = 'none'
    // 明暗：右侧（大西洋一侧）更暗 + 边缘压暗
    ctx.beginPath()
    ctx.arc(cx, cy, r + 1, 0, Math.PI * 2)
    ctx.clip()
    const lg = ctx.createLinearGradient(cx - r, cy - r * 0.3, cx + r, cy + r * 0.3)
    lg.addColorStop(0, 'rgba(0,0,0,0)')
    lg.addColorStop(0.55, 'rgba(0,0,0,0.05)')
    lg.addColorStop(1, 'rgba(0,0,0,0.55)')
    ctx.fillStyle = lg
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2)
    const rg = ctx.createRadialGradient(cx, cy, r * 0.55, cx, cy, r)
    rg.addColorStop(0, 'rgba(0,0,0,0)')
    rg.addColorStop(1, 'rgba(0,0,0,0.45)')
    ctx.fillStyle = rg
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2)

    // 10.55s 起：黑色弧面（旋转的椭圆切面）从左下扫入吞掉灯光，黑区里只剩背面稀疏的球面点。
    // 参数按 10.8/11.2/11.6s 参考帧手调：中心(单位圆坐标)、半轴、角度。
    const sw = seg(t, 10.55, 11.75)
    if (sw > 0) {
      const K = (keys: [number, number][]) => spline(t, keys)
      const ex = K([[10.55, -1.3], [10.8, -0.3], [11.2, 0], [11.6, 0.35], [11.8, 0.5]])
      const ey = K([[10.55, 0.9], [10.8, 0.25], [11.2, 0.78], [11.6, 0.6], [11.8, 0.5]])
      const ea = K([[10.55, 1.2], [10.8, 1.25], [11.2, 1.35], [11.6, 1.5], [11.8, 1.6]])
      const eb = K([[10.55, 0.2], [10.8, 0.32], [11.2, 0.98], [11.6, 1.2], [11.8, 1.3]])
      const rot = (K([[10.55, -62], [10.8, -60], [11.2, -8], [11.6, -28], [11.8, -30]]) * Math.PI) / 180
      ctx.beginPath()
      ctx.ellipse(cx + ex * r, cy + ey * r, ea * r, eb * r, rot, 0, Math.PI * 2)
      ctx.fillStyle = '#000'
      ctx.fill()
      ctx.save()
      ctx.clip()
      ctx.fillStyle = 'rgba(255,255,255,0.8)'
      for (let i = 0; i < 900; i++) {
        // 球背面的均匀点（正交投影）
        const u = hash(i * 3 + 11) * 2 - 1
        const ph = hash(i * 3 + 12) * Math.PI * 2 + t * 0.05
        const rr = Math.sqrt(1 - u * u)
        ctx.fillRect(cx + Math.cos(ph) * rr * r, cy + u * r, 2, 2)
      }
      ctx.restore()
    }
    ctx.restore()

    // 目标方框（美国东北）+ 引线 + 标签
    const tgt = projectLonLat(-79, 41.5, lon, lat, ROLL, cx, cy, r)
    const anchor = projectLonLat(-97, 36, lon, lat, ROLL, cx, cy, r)
    const lk = k * (1 + 0.55 * ease.inQuad(seg(t, 11, 11.8)))
    const lx = cx - 0.575 * r * (lk / k) // 标签左边
    const ly = cy + r * (0.985 + 0.07 * seg(t, 8.5, 10.5)) // 标签中线
    const size = 48 * lk
    const boxOn = t >= 7.55
    if (tgt && boxOn && sw < 0.5) {
      const bs = 0.15 * r
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'
      ctx.lineWidth = 1.5
      ctx.strokeRect(tgt.x - bs / 2, tgt.y - bs / 2, bs, bs)
    }
    if (t >= 6.75) {
      const text = '14 AUGUST 2003'
      const n = typed(t, 6.82, 40, text.length)
      const res = typeBox(ctx, {
        text,
        n,
        x: lx,
        y: ly + size * 0.32,
        size,
        family: FONT.mono,
        weight: 400,
        track: size * 0.07,
        padX: size * 1.75,
        padTop: size * 0.5,
        padBottom: size * 0.55,
        boxMode: n < text.length ? 'text' : 'full',
        cursor: n < text.length && (n > 0 || blink(t)),
      })
      // 引线：标签左上角 → 美国中部
      if (anchor) {
        const g = clamp((t - 7.2) / 0.4)
        const x0 = lx
        const y0 = res.top
        ctx.strokeStyle = 'rgba(255,255,255,0.7)'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(x0, y0)
        ctx.lineTo(x0 + (anchor.x - x0) * g, y0 + (anchor.y - y0) * g)
        ctx.stroke()
      }
    }
  },
}
