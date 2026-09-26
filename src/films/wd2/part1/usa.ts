/**
 * 22.85–31.45s：城市部署柱状图（56% → 100%，ctOS 2.0）→ 图表左下角化作 SAN JOSE，镜头从湾区一路拉远
 * （SACRAMENTO / CARSON CITY / NEVADA / 西部州界）→ 全美网络图 + "the internet of things."
 */
import type { Scene } from '../../../engine/types'
import { clamp, ease, lerp, seg } from '../../../engine/math'
import { FONT, font, tracking } from '../../../fx/text'
import { WD2 } from '../../../theme'
import { boxDot, cached, ctosLogo, fr, h2, spacedLabel, wordReveal } from './lib'

// ───────────────────────── 柱状图 ─────────────────────────

/** 原片横轴是美国城市名（从左往右越来越大，最右是 Chicago） */
const CITIES = [
  'Oakland', 'Miami', 'Omaha', 'Raleigh', 'Colorado Springs', 'Atlanta', 'Virginia Beach', 'Mesa', 'Tulsa', 'Minneapolis', 'Wichita',
  'Cleveland', 'Aurora', 'Tampa', 'Arlington', 'Bakersfield', 'New Orleans', 'Honolulu', 'Anaheim', 'Santa Ana', 'Albuquerque',
  'Tucson', 'Fresno', 'Sacramento', 'Long Beach', 'Kansas City', 'Las Vegas', 'Milwaukee', 'Portland', 'Oklahoma City', 'Louisville',
  'Baltimore', 'Nashville', 'Washington D.C.', 'Denver', 'Seattle', 'Boston', 'El Paso', 'Memphis', 'Detroit', 'Charlotte',
  'Fort Worth', 'San Jose', 'Columbus', 'San Francisco', 'Indianapolis', 'Jacksonville', 'Austin', 'Dallas', 'San Diego',
  'San Antonio', 'Phoenix', 'Philadelphia', 'Houston', 'Los Angeles', 'New York City', 'Chicago',
]
const N = CITIES.length

/** 分段关键帧插值 */
function keys(t: number, k: [number, number][], e = ease.inOutCubic) {
  if (t <= k[0][0]) return k[0][1]
  for (let i = 1; i < k.length; i++)
    if (t <= k[i][0]) return lerp(k[i - 1][1], k[i][1], e(seg(t, k[i - 1][0], k[i][0])))
  return k[k.length - 1][1]
}

/** 百分比：24.4 起 56% → 25.8 100%，26.35 起乱跳成 "00%" */
function percent(t: number) {
  return Math.round(keys(t, [[24.35, 56], [24.8, 73], [25.2, 88], [25.8, 100]], ease.linear))
}

export const barChart: Scene = {
  id: 'wd2-022.85-bar-chart',
  start: 22.85,
  end: 27.05,
  note: '城市部署柱状图：从右端几根矮柱长出，镜头拉远露出 57 根柱与边框，百分比 56%→100%，25.2 起 ctOS 2.0 标志；26.4 起柱子塌落、边框擦除，左下角变成 SAN JOSE',
  render({ ctx, t }) {
    const f = fr(t)
    const sp = keys(t, [[23.0, 58], [23.6, 51], [24.2, 39], [24.8, 26], [25.4, 25.5], [26.0, 24.5], [26.4, 24.2]])
    const xr = keys(t, [[23.0, 1262], [23.6, 1232], [24.2, 1224], [24.8, 1516], [25.4, 1668], [26.0, 1656], [26.4, 1640]])
    const yb = keys(t, [[23.0, 536], [23.6, 572], [24.2, 640], [24.8, 736], [25.4, 732], [26.0, 732], [26.4, 728]])
    const hmax = keys(t, [[23.0, 110], [23.6, 500], [24.2, 590], [24.8, 414], [25.4, 356], [26.0, 356]])
    const fill = seg(t, 24.3, 25.8)
    const collapse = ease.inOutCubic(seg(t, 26.45, 26.7))
    const gone = seg(t, 26.75, 27.0)
    const bw = sp * 0.58
    // 柱子
    for (let k = 0; k < N; k++) {
      const idx = N - 1 - k
      const x = xr - k * sp
      if (x < -sp) break
      // 基础值：左低右高 + 随机
      const trend = idx / N
      const base = clamp(0.05 + trend * 0.75 + (h2(idx, 1, 91) - 0.5) * 0.6, 0.02, 1)
      const top = clamp(base + h2(idx, 2, 91) * 0.35, 0, 1)
      // 26.4 起重排成一排矮柱（原片 "00%" 时刻）
      const low = 0.12 + h2(idx, f >> 2, 92) * 0.4 * trend
      const v = lerp(lerp(base, 1, fill * 0.55), low, collapse)
      const u = lerp(lerp(top, 1, fill), low, collapse)
      const grow = ease.outCubic(seg(t, 22.9 + (1 - trend) * 0.35, 23.5 + (1 - trend) * 0.4))
      const hv = hmax * v * grow
      const hu = hmax * u * grow
      if (gone > 0 && h2(idx, 5, 93) < gone) continue
      ctx.fillStyle = 'rgba(150,150,150,0.95)'
      ctx.fillRect(x - bw / 2, yb - hu, bw, hu)
      ctx.fillStyle = '#e4e4e0'
      ctx.fillRect(x - bw / 2, yb - hv, bw, hv)
      // 旋转的城市名
      if (collapse < 1) {
        ctx.save()
        ctx.globalAlpha = (1 - collapse) * grow
        ctx.translate(x - bw / 2, yb + sp * 0.55 + 14)
        ctx.rotate(0.9)
        font(ctx, Math.max(9, sp * 0.42), 400, FONT.sans)
        ctx.fillStyle = 'rgba(235,235,235,0.9)'
        ctx.fillText(CITIES[idx], 0, 0)
        ctx.restore()
      }
    }
    // 边框：右边先画出，再补上下边
    const boxL = xr - (N - 0.2) * sp - 12
    const boxR = xr + sp * 0.6 + 10
    const boxT = yb - hmax - 24
    const boxB = yb + 34
    const bp = seg(t, 23.6, 24.4) * (1 - collapse)
    if (bp > 0) {
      ctx.strokeStyle = 'rgba(210,210,210,0.8)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(boxR, boxT)
      ctx.lineTo(boxR, lerp(boxT, boxB, ease.outCubic(bp)))
      if (bp > 0.4) {
        const q = ease.outCubic(seg(bp, 0.4, 1))
        ctx.moveTo(boxR, boxT)
        ctx.lineTo(lerp(boxR, boxL, q), boxT)
        ctx.moveTo(boxR, boxB)
        ctx.lineTo(lerp(boxR, boxL, q), boxB)
      }
      if (bp >= 1) {
        ctx.moveTo(boxL, boxT)
        ctx.lineTo(boxL, boxB)
      }
      ctx.stroke()
    }
    // 百分比
    if (t > 24.35 && t < 26.6) {
      let txt = `${percent(t)}%`
      if (t > 26.45) txt = h2(f, 1, 94) < 0.5 ? '00%' : `${Math.floor(h2(f, 2, 94) * 99)}%`
      font(ctx, 62, 700, FONT.sans)
      tracking(ctx, -1.5)
      ctx.textAlign = 'right'
      ctx.fillStyle = WD2.fg
      ctx.fillText(txt, boxR, boxT - 20)
      ctx.textAlign = 'left'
      tracking(ctx, 0)
    }
    // ctOS 2.0 标志（25.2 起逐块打出，27.0 前闪烁消失）
    if (t > 25.15 && !(t > 26.8 && f % 2 === 0)) ctosLogo(ctx, boxL, boxT - 100, 76, seg(t, 25.15, 25.9), f, { sub: '2.0' })
  },
}

// ───────────────────────── 美国地图（经纬度 → 屏幕） ─────────────────────────

type LL = [number, number]

/** 美国本土简化轮廓（经度, 纬度） */
const US: LL[] = [
  [-124.7, 48.4], [-122.8, 49.0], [-95.2, 49.0], [-94.8, 49.3], [-89.6, 48.0], [-84.8, 46.8], [-83.5, 46.0], [-82.5, 45.3], [-82.4, 43.0],
  [-83.1, 42.0], [-79.0, 42.8], [-79.8, 43.3], [-76.8, 43.6], [-75.0, 45.0], [-71.5, 45.0], [-70.0, 46.7], [-68.2, 47.3], [-67.0, 45.1],
  [-70.2, 43.7], [-70.6, 42.6], [-70.0, 41.8], [-71.9, 41.3], [-74.0, 40.6], [-74.0, 39.6], [-75.5, 38.4], [-76.0, 37.0], [-75.5, 35.2],
  [-77.5, 34.4], [-79.0, 33.4], [-80.9, 32.0], [-81.4, 30.4], [-80.0, 26.8], [-80.4, 25.2], [-81.8, 26.0], [-82.8, 27.8], [-82.6, 29.0],
  [-84.0, 30.1], [-86.0, 30.4], [-88.0, 30.4], [-89.6, 30.2], [-89.4, 29.0], [-91.0, 29.2], [-93.8, 29.7], [-95.0, 29.2], [-97.2, 27.6],
  [-97.4, 25.9], [-99.1, 26.5], [-100.3, 28.2], [-101.4, 29.8], [-103.0, 29.0], [-104.5, 29.7], [-106.5, 31.8], [-108.2, 31.8],
  [-111.1, 31.3], [-114.8, 32.5], [-117.1, 32.5], [-118.5, 34.0], [-120.6, 34.6], [-121.9, 36.6], [-122.5, 37.8], [-123.8, 39.7],
  [-124.2, 41.9], [-124.1, 43.4], [-124.0, 46.3], [-124.7, 48.4],
]

/** 西部州界（折线） */
const BORDERS: LL[][] = [
  [[-120, 42], [-120, 39], [-114.6, 35.0], [-114.7, 32.7]],
  [[-124.2, 42], [-111.05, 42]],
  [[-114.05, 42], [-114.05, 36.2], [-114.6, 35.0]],
  [[-114.05, 37], [-102.05, 37]],
  [[-109.05, 41], [-109.05, 31.3]],
  [[-111.05, 45], [-111.05, 41], [-102.05, 41], [-102.05, 37]],
  [[-111.05, 45], [-104.05, 45], [-104.05, 41]],
  [[-103, 37], [-103, 32], [-106.6, 32]],
  [[-117, 49], [-117, 44.3], [-111.05, 44.5]],
  [[-104.05, 49], [-104.05, 45], [-104.05, 43], [-95.5, 43]],
  [[-102.05, 40], [-95.3, 40]],
  [[-100, 37], [-100, 34.5], [-94.5, 33.6]],
]

const STATES: [string, number, number][] = [
  ['NEVADA', -117.4, 39.6],
  ['UTAH', -111.9, 39.3],
  ['ARIZONA', -111.9, 34.2],
  ['COLORADO', -105.6, 38.9],
  ['WYOMING', -107.6, 43.1],
  ['NEW MEXICO', -106.2, 34.2],
  ['NEBRASKA', -99.6, 41.6],
  ['IDAHO', -114.6, 44.2],
]

const SJ: LL = [-121.89, 37.34]
const SAC: LL = [-121.49, 38.58]
const CARSON: LL = [-119.77, 39.16]
const DOTS: LL[] = [
  [-119.8, 39.53], [-115.14, 36.17], [-111.89, 40.76], [-116.2, 43.6], [-104.99, 39.74], [-112.07, 33.45], [-106.65, 35.08],
  [-118.24, 34.05], [-122.68, 45.52], [-122.33, 47.61], [-117.16, 32.72], [-119.79, 36.74], [-110.97, 32.22], [-105.94, 35.69],
  [-108.55, 39.06], [-113.58, 37.1], [-106.3, 42.87], [-104.82, 41.14], [-100.78, 46.81], [-96.7, 40.81],
]
/** 从湾区放射出去的红色虚线航线 */
const RED: LL[][] = [
  [SJ, SAC, [-118.0, 42.4]],
  [SJ, [-104.99, 39.74], [-95.0, 39.1]],
  [SJ, [-112.07, 33.45], [-97.0, 32.8]],
  [[-123.5, 38.2], [-105.5, 41.0], [-94.0, 42.0]],
  [SJ, [-116.0, 36.8], [-109.0, 35.8]],
]

/** 相机：以某个经纬度为屏幕中心，缩放（px/度）+ 旋转 */
function usCam(t: number) {
  const logS = keys(t, [[26.5, 6.55], [27.5, 6.55], [28.5, 6.3], [29.4, 5.15], [30.05, 4.1], [30.8, 3.5], [31.4, 3.42]], ease.inOutCubic)
  const rot = lerp(0.62, 0, ease.inOutCubic(seg(t, 27.4, 29.3)))
  // 屏幕中心对应的经纬度（关键帧由原片几个地标位置反推）
  const cx = keys(t, [[26.5, -121.2], [27.5, -121.05], [28.5, -118.2], [29.4, -109.6], [30.05, -103], [30.8, -97.6]], ease.inOutCubic)
  const cy = keys(t, [[26.5, 38.0], [27.5, 38.15], [28.5, 38.9], [29.4, 40.2], [30.05, 40], [30.8, 38.6]], ease.inOutCubic)
  return { s: Math.exp(logS), rot, cx, cy }
}

function projector(t: number) {
  const c = usCam(t)
  const k = Math.cos((38 * Math.PI) / 180)
  const cos = Math.cos(c.rot)
  const sin = Math.sin(c.rot)
  return (p: LL) => {
    const x = (p[0] - c.cx) * k * c.s
    const y = -(p[1] - c.cy) * c.s
    return [960 + x * cos - y * sin, 540 + x * sin + y * cos] as [number, number]
  }
}

function pathLL(ctx: CanvasRenderingContext2D, P: (p: LL) => [number, number], pts: LL[]) {
  ctx.beginPath()
  pts.forEach((p, i) => {
    const [x, y] = P(p)
    if (i) ctx.lineTo(x, y)
    else ctx.moveTo(x, y)
  })
}

function insideUS(lon: number, lat: number) {
  let inside = false
  for (let i = 0, j = US.length - 1; i < US.length; j = i++) {
    const [xi, yi] = US[i]
    const [xj, yj] = US[j]
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** 全美网络：大城市做中心（星芒），其余点连最近中心 + 随机邻居 */
const HUBS: LL[] = [
  [-122.4, 37.8], [-118.24, 34.05], [-122.33, 47.61], [-104.99, 39.74], [-96.8, 32.78], [-87.63, 41.88], [-74.0, 40.71],
  [-84.39, 33.75], [-80.19, 25.76], [-95.37, 29.76], [-112.07, 33.45], [-93.27, 44.98], [-90.2, 38.63], [-77.04, 38.9],
  [-71.06, 42.36], [-111.89, 40.76], [-115.14, 36.17], [-86.78, 36.16], [-81.69, 41.5], [-97.74, 30.27],
]
function usNetwork() {
  return cached('wd2p1:usnet', () => {
    const nodes: LL[] = [...HUBS]
    let i = 0
    while (nodes.length < 260 && i < 5000) {
      const lon = -124 + h2(i, 1, 131) * 57
      const lat = 25 + h2(i, 2, 131) * 24
      i++
      if (insideUS(lon, lat)) nodes.push([lon, lat])
    }
    const edges: [number, number, number][] = []
    for (let n = HUBS.length; n < nodes.length; n++) {
      let best = 0
      let bd = Infinity
      for (let hIdx = 0; hIdx < HUBS.length; hIdx++) {
        const d = (nodes[n][0] - HUBS[hIdx][0]) ** 2 + (nodes[n][1] - HUBS[hIdx][1]) ** 2
        if (d < bd) {
          bd = d
          best = hIdx
        }
      }
      edges.push([best, n, h2(n, 3, 131)])
      if (h2(n, 4, 131) < 0.5) edges.push([Math.floor(h2(n, 5, 131) * HUBS.length), n, h2(n, 6, 131)])
    }
    for (let a = 0; a < HUBS.length; a++)
      for (let b = a + 1; b < HUBS.length; b++) if (h2(a, b, 132) < 0.3) edges.push([a, b, h2(a, b, 133)])
    // 美国轮廓内的点阵网格
    const grid: LL[] = []
    for (let lon = -124; lon < -67; lon += 0.55)
      for (let lat = 25; lat < 49; lat += 0.45) if (insideUS(lon, lat) && h2(Math.round(lon * 10), Math.round(lat * 10), 134) < 0.8) grid.push([lon, lat])
    return { nodes, edges, grid }
  })
}

export const usMap: Scene = {
  id: 'wd2-026.45-us-map',
  start: 26.45,
  end: 31.45,
  note: '湾区→全美连续拉远：SAN JOSE 放射细线 + 红色虚线航线、SACRAMENTO/CARSON CITY 方框地标、疏排州名与西部州界；29.5 起全美轮廓点阵 + 青色星状网络，30.0 起 "the internet of things."',
  render({ ctx, t }) {
    const P = projector(t)
    const c = usCam(t)
    const inA = seg(t, 26.45, 26.9)
    const netA = seg(t, 29.3, 29.9)
    const detailA = 1 - seg(t, 29.6, 30.1)
    ctx.save()
    ctx.lineCap = 'round'
    // 虚线大圆（26.6–27.6，圆心在 SAN JOSE 右侧）
    const circA = seg(t, 26.5, 26.7) * (1 - seg(t, 27.2, 27.6))
    if (circA > 0) {
      ctx.strokeStyle = `rgba(95,211,217,${0.45 * circA})`
      ctx.setLineDash([10, 9])
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(735, 705, lerp(380, 660, ease.outCubic(seg(t, 26.5, 27.3))), 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])
    }
    // 州界
    ctx.strokeStyle = `rgba(150,190,200,${0.45 * seg(t, 27.8, 28.6) * (0.4 + 0.6 * detailA)})`
    ctx.lineWidth = 1.3
    for (const b of BORDERS) {
      pathLL(ctx, P, b)
      ctx.stroke()
    }
    // 从 San Jose 放射的灰色细线 + 远程交叉细线
    const [sjx, sjy] = P(SJ)
    ctx.strokeStyle = `rgba(170,190,200,${0.35 * inA * detailA})`
    ctx.lineWidth = 1
    ctx.beginPath()
    for (const d of [SAC, CARSON, ...DOTS.slice(0, 8)]) {
      const [x, y] = P(d)
      ctx.moveTo(sjx, sjy)
      ctx.lineTo(lerp(sjx, x, inA), lerp(sjy, y, inA))
    }
    for (let i = 0; i < 16; i++) {
      const a = P([-126 + h2(i, 1, 141) * 30, 30 + h2(i, 2, 141) * 16])
      const b = P([-126 + h2(i, 3, 141) * 30, 30 + h2(i, 4, 141) * 16])
      ctx.moveTo(a[0], a[1])
      ctx.lineTo(lerp(a[0], b[0], inA), lerp(a[1], b[1], inA))
    }
    ctx.stroke()
    // 红色虚线航线
    ctx.strokeStyle = `rgba(224,36,43,${0.85 * inA * (0.5 + 0.5 * detailA)})`
    ctx.lineWidth = 2.2
    ctx.setLineDash([22, 16])
    ctx.lineDashOffset = -t * 40
    for (const r of RED) {
      pathLL(ctx, P, r)
      ctx.stroke()
    }
    ctx.setLineDash([])
    // 小白点
    ctx.fillStyle = `rgba(255,255,255,${0.85 * inA * detailA})`
    for (const d of DOTS) {
      const [x, y] = P(d)
      ctx.fillRect(x - 3, y - 3, 6, 6)
    }
    // 地标
    if (detailA > 0) {
      ctx.globalAlpha = detailA * inA
      ctx.fillStyle = '#fff'
      ctx.beginPath()
      ctx.arc(sjx, sjy, 5.5, 0, Math.PI * 2)
      ctx.fill()
      const lsz = clamp(c.s / 22, 11, 26)
      spacedLabel(ctx, 'SAN JOSE', sjx + 22, sjy + lsz * 0.4, lsz, lsz * 0.75, 'rgba(255,255,255,0.75)')
      const [sx, sy] = P(SAC)
      boxDot(ctx, sx, sy, lsz * 1.25)
      spacedLabel(ctx, 'SACRAMENTO', sx + 40, sy + lsz * 0.4, lsz, lsz * 0.75, 'rgba(255,255,255,0.75)')
      const [cx2, cy2] = P(CARSON)
      boxDot(ctx, cx2, cy2, lsz * 1.25)
      spacedLabel(ctx, 'CARSON', cx2 + 38, cy2 + lsz * 0.1, lsz * 0.6, lsz * 0.55, 'rgba(255,255,255,0.6)')
      spacedLabel(ctx, 'CITY', cx2 + 38, cy2 + lsz * 0.95, lsz * 0.6, lsz * 0.55, 'rgba(255,255,255,0.6)')
      // 州名
      const sa = seg(t, 27.9, 28.4)
      for (const [name, lon, lat] of STATES) {
        const [x, y] = P([lon, lat])
        const size = clamp(c.s / 14, 9, 22)
        ctx.globalAlpha = detailA * sa
        font(ctx, size, 400, FONT.mono)
        tracking(ctx, size * 0.9)
        const w = ctx.measureText(name).width
        tracking(ctx, 0)
        spacedLabel(ctx, name, x - w / 2, y, size, size * 0.9, 'rgba(210,220,225,0.7)')
      }
      ctx.globalAlpha = 1
    }
    // 全美网络
    if (netA > 0) {
      const net = usNetwork()
      ctx.globalAlpha = netA
      ctx.fillStyle = 'rgba(200,210,215,0.35)'
      for (const g of net.grid) {
        const [x, y] = P(g)
        ctx.fillRect(x - 1, y - 1, 2, 2)
      }
      const np = seg(t, 29.3, 30.3)
      ctx.lineWidth = 1
      ctx.strokeStyle = 'rgba(95,211,217,0.42)'
      ctx.beginPath()
      for (const [a, b, d] of net.edges) {
        const q = clamp((np - d * 0.5) / 0.5)
        if (q <= 0) continue
        const A = P(net.nodes[a])
        const B = P(net.nodes[b])
        ctx.moveTo(A[0], A[1])
        ctx.lineTo(lerp(A[0], B[0], q), lerp(A[1], B[1], q))
      }
      ctx.stroke()
      // 少量红线
      ctx.strokeStyle = 'rgba(224,36,43,0.5)'
      ctx.beginPath()
      for (let i = 0; i < 14; i++) {
        const A = P(net.nodes[Math.floor(h2(i, 1, 151) * net.nodes.length)])
        const B = P(net.nodes[Math.floor(h2(i, 2, 151) * net.nodes.length)])
        ctx.moveTo(A[0], A[1])
        ctx.lineTo(lerp(A[0], B[0], 0.4), lerp(A[1], B[1], 0.4))
      }
      ctx.stroke()
      ctx.fillStyle = '#fff'
      net.nodes.forEach((n, i) => {
        const [x, y] = P(n)
        if (i < HUBS.length) {
          // 星芒
          ctx.fillStyle = 'rgba(255,255,255,0.95)'
          ctx.beginPath()
          ctx.arc(x, y, 4, 0, Math.PI * 2)
          ctx.fill()
          ctx.strokeStyle = 'rgba(220,250,250,0.6)'
          ctx.beginPath()
          for (let r = 0; r < 4; r++) {
            const a = (r * Math.PI) / 4
            ctx.moveTo(x - Math.cos(a) * 14, y - Math.sin(a) * 14)
            ctx.lineTo(x + Math.cos(a) * 14, y + Math.sin(a) * 14)
          }
          ctx.stroke()
        } else {
          ctx.fillStyle = 'rgba(255,255,255,0.7)'
          ctx.fillRect(x - 1.5, y - 1.5, 3, 3)
        }
      })
      ctx.globalAlpha = 1
    }
    ctx.restore()
  },
}

// ───────────────────────── the internet of things. ─────────────────────────

export const internetWords: Scene = {
  id: 'wd2-029.95-internet-of-things',
  start: 29.95,
  end: 31.2,
  note: '"the internet / of things." 两行白字，逐词白块擦出',
  render({ ctx, t }) {
    const S = 76
    wordReveal(ctx, 'the', 550, 510, S, seg(t, 29.95, 30.2))
    wordReveal(ctx, 'internet', 690, 510, S, seg(t, 30.1, 30.4))
    wordReveal(ctx, 'of', 550, 582, S, seg(t, 30.5, 30.7))
    wordReveal(ctx, 'things.', 632, 582, S, seg(t, 30.7, 31.0))
  },
}

/** 31.2–31.5：画面水平切条错位 + 暗红色块噪点，转入 64 billion */
export const redNoise: Scene = {
  id: 'wd2-031.2-red-noise',
  start: 31.2,
  end: 31.45,
  note: '转场：切条错位（沿用上一镜头像素）→ 暗红/品红块状噪点满屏',
  render({ ctx, t }) {
    const f = fr(t)
    if (t < 31.38) {
      // 读当前帧做切条错位（前面镜头已画好）
      const src = cached('wd2p1:rn-snap', () => document.createElement('canvas'))
      src.width = 1920
      src.height = 1080
      const s = src.getContext('2d')!
      s.drawImage(ctx.canvas, 0, 0)
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, 1920, 1080)
      let y = 0
      let i = 0
      while (y < 1080) {
        const h = 30 + h2(i, f, 161) * 110
        if (h2(i, f, 162) < 0.55) ctx.drawImage(src, 0, y, 1920, h, (h2(i, f, 163) - 0.5) * 300, y, 1920, h)
        y += h
        i++
      }
      return
    }
    ctx.fillStyle = '#0a0204'
    ctx.fillRect(0, 0, 1920, 1080)
    for (let i = 0; i < 900; i++) {
      const x = h2(i, 1, 171 + (f >> 1)) * 1920
      const y = h2(i, 2, 171 + (f >> 1)) * 1080
      const w = 6 + h2(i, 3, 171) * 40
      const hh = 4 + h2(i, 4, 171) * 26
      const v = h2(i, 5, 171)
      ctx.fillStyle = v < 0.08 ? 'rgba(230,40,110,0.8)' : `rgba(${90 + v * 80},${10 + v * 10},${25 + v * 25},${0.35 + v * 0.4})`
      ctx.fillRect(x, y, w, hh)
    }
  },
}
