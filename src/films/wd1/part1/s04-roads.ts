import type { Scene } from '../../../engine/types'
import { clamp, ease, hash, rng, seg } from '../../../engine/math'
import { FONT } from '../../../fx/text'
import { memo } from '../../../engine/three-host'
import { GREAT_LAKES, LIGHTS, NORTH_AMERICA, type LonLat } from './geo'
import { roughen, spline, typeBox, typed } from './util'

/**
 * 15.0–18.4  美国东北灰色道路网地图，白色半透明圆点此起彼伏，「11 PEOPLE DIED IN THE DARK」等宽白底标签。
 * 地图整体缓慢左移。
 * ASSET：道路网是程序化的（城市点 k 近邻连线 + 随机分叉），换真实素材时替换 roadNetwork()（比如 OSM 导出的 SVG 路径）。
 */

const proj = (p: LonLat): [number, number] => [900 + (p[0] + 74) * 60, 560 - (p[1] - 40.7) * 80]

interface Road {
  pts: [number, number][]
  a: number
}

function roadNetwork(): Road[] {
  return memo('wd1p1:roads', () => {
    const R = rng(1408)
    // 节点：灯光团附近撒点 + 均匀撒点
    const nodes: [number, number][] = []
    const gauss = () => (R.next() + R.next() + R.next() - 1.5) / 0.5
    for (const [lon, lat, w, sp] of LIGHTS) {
      if (lon < -92 || lon > -64 || lat < 34 || lat > 48) continue
      for (let i = 0; i < w * 60; i++) nodes.push(proj([lon + gauss() * sp, lat + gauss() * sp * 0.7]))
    }
    for (let i = 0; i < 700; i++) nodes.push([R.range(-300, 2300), R.range(-200, 1300)])
    // 只保留陆地上的节点
    const land = (x: number, y: number) => {
      let inside = false
      const poly = NORTH_AMERICA.map(proj)
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, yi] = poly[i]
        const [xj, yj] = poly[j]
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
      }
      return inside
    }
    const pts = nodes.filter(([x, y]) => land(x, y))
    const roads: Road[] = []
    for (let i = 0; i < pts.length; i++) {
      const d = pts
        .map((p, j) => [j, (p[0] - pts[i][0]) ** 2 + (p[1] - pts[i][1]) ** 2] as [number, number])
        .sort((a, b) => a[1] - b[1])
      for (let k = 1; k <= 3 && k < d.length; k++) {
        const [x1, y1] = pts[i]
        const [x2, y2] = pts[d[k][0]]
        // 轻微弯折的折线
        const mx = (x1 + x2) / 2 + R.range(-8, 8)
        const my = (y1 + y2) / 2 + R.range(-8, 8)
        roads.push({ pts: [[x1, y1], [mx, my], [x2, y2]], a: R.range(0.14, 0.45) })
      }
    }
    return roads
  })
}

/** 海岸线 + 大湖 + 几条州界 */
function outlines(ctx: CanvasRenderingContext2D) {
  const path = (poly: LonLat[], close = true, seed = 1) => {
    const pts = memo(`wd1p1:rough:${seed}`, () => roughen(poly.map(proj), seed, close ? 0.11 : 0.05, 4, close))
    ctx.beginPath()
    pts.forEach(([x, y], i) => {
      if (i) ctx.lineTo(x, y)
      else ctx.moveTo(x, y)
    })
    if (close) ctx.closePath()
    ctx.stroke()
  }
  ctx.strokeStyle = 'rgba(200,210,210,0.75)'
  ctx.lineWidth = 2
  path(NORTH_AMERICA, true, 11)
  GREAT_LAKES.forEach((l, i) => path(l, true, 20 + i))
  ctx.strokeStyle = 'rgba(200,210,210,0.45)'
  ctx.lineWidth = 1.6
  // 粗略州界（纽约/宾夕法尼亚/新英格兰）
  const borders: LonLat[][] = [
    [[-80.5, 42], [-75.4, 42], [-73.5, 41]],
    [[-80.5, 42], [-80.5, 39.7], [-75.8, 39.7], [-75, 40]],
    [[-73.5, 42.7], [-71.8, 42.7], [-71.8, 41.3]],
    [[-73.3, 45], [-71.5, 45], [-71, 43], [-70.8, 42.9]],
    [[-73.3, 45], [-73.3, 42.7]],
    [[-71.5, 45], [-70, 43.5]],
    [[-84.8, 41.7], [-84.8, 39.1], [-82.6, 38.4]],
    [[-80.5, 39.7], [-82.6, 38.4], [-80, 37.5], [-77, 38.8]],
    [[-79.8, 45], [-74.7, 45], [-73.3, 45]],
  ]
  borders.forEach((b, i) => path(b, false, 40 + i))
}

// 白色圆点：经纬度、半径、出现/消失时刻
const DOTS: [number, number, number, number, number][] = [
  [-74, 40.7, 42, 15.1, 16.05],
  [-76.5, 43.2, 22, 15.55, 16.6],
  [-74.9, 43.6, 14, 15.6, 16.3],
  [-77.2, 42.4, 18, 16.0, 17.2],
  [-76.9, 41.8, 26, 16.1, 17.6],
  [-75.6, 42.0, 17, 16.2, 17.9],
  [-80.4, 42.0, 13, 15.9, 18.3],
  [-73.9, 39.6, 16, 16.3, 18.3],
  [-70.3, 41.3, 14, 16.4, 18.3],
  [-78.6, 40.3, 7, 16.45, 17.5],
  [-76.2, 42.9, 30, 17.0, 18.0],
  [-74.6, 42.4, 20, 17.1, 18.3],
  [-79.2, 41.2, 10, 17.3, 18.3],
  [-75.4, 43.5, 8, 17.2, 17.9],
]

export const roads: Scene = {
  id: 'wd1-015-roads',
  start: 15.0,
  end: 18.4,
  note: '灰色道路网地图 + 白色半透明圆点起落，「11 PEOPLE DIED IN THE DARK」打字，18.1s 地图熄灭、标签从左擦除',
  render({ ctx, t }) {
    const ox = spline(t, [[15.0, 190], [15.3, 175], [15.9, 125], [16.6, 0], [17.3, -40], [18.4, -90]])
    const mapA = seg(t, 15.0, 15.35) * (1 - seg(t, 18.05, 18.15))
    ctx.save()
    ctx.translate(ox, 0)
    // 淡出的 × 点阵（接上一镜头的点阵底）
    const gA = 1 - seg(t, 15.2, 15.9)
    if (gA > 0) {
      ctx.strokeStyle = `rgba(255,255,255,${0.25 * gA})`
      ctx.lineWidth = 1.5
      ctx.beginPath()
      for (let y = 40; y < 1080; y += 97)
        for (let x = -200; x < 2000; x += 97) {
          ctx.moveTo(x - 5, y - 5)
          ctx.lineTo(x + 5, y + 5)
          ctx.moveTo(x + 5, y - 5)
          ctx.lineTo(x - 5, y + 5)
        }
      ctx.stroke()
    }
    if (mapA > 0) {
      ctx.globalAlpha = mapA
      ctx.lineWidth = 1
      for (const r of roadNetwork()) {
        ctx.strokeStyle = `rgba(190,215,215,${r.a})`
        ctx.beginPath()
        ctx.moveTo(r.pts[0][0], r.pts[0][1])
        ctx.quadraticCurveTo(r.pts[1][0], r.pts[1][1], r.pts[2][0], r.pts[2][1])
        ctx.stroke()
      }
      outlines(ctx)
      // 零星青色小点
      ctx.fillStyle = 'rgba(79,245,227,0.6)'
      for (let i = 0; i < 40; i++) ctx.fillRect(hash(i * 5 + 1) * 1600 + 100, hash(i * 5 + 2) * 900 + 100, 3, 3)
      ctx.globalAlpha = 1
    }
    // 白色圆点（地图熄灭后还残留一帧）
    for (const [lon, lat, r0, a, b] of DOTS) {
      const q = ease.outBack(seg(t, a, a + 0.18))
      const out = seg(t, b - 0.15, b)
      if (q <= 0 || out >= 1) continue
      const [x, y] = proj([lon, lat])
      const r = r0 * 1.5 * q * (1 - out)
      ctx.fillStyle = 'rgba(235,235,235,0.82)'
      ctx.beginPath()
      ctx.arc(x, y, Math.max(0, r), 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'
      ctx.lineWidth = 1.2
      ctx.beginPath()
      ctx.moveTo(x - 6, y)
      ctx.lineTo(x + 6, y)
      ctx.moveTo(x, y - 6)
      ctx.lineTo(x, y + 6)
      ctx.stroke()
    }
    ctx.restore()

    // 标签（屏幕固定）
    if (t >= 15.55) {
      const text = '11 PEOPLE DIED IN THE DARK'
      const n = typed(t, 15.65, 27, text.length)
      typeBox(ctx, {
        text,
        n,
        x: 590,
        y: 548,
        size: 38,
        family: FONT.plex,
        weight: 400,
        track: 4.2,
        padX: 32,
        padTop: 22,
        padBottom: 25,
        boxMode: clamp(ease.outCubic(seg(t, 15.55, 15.85)) * 0.6 + (n / text.length) * 0.4),
        eraseL: seg(t, 18.12, 18.4) * 0.8,
      })
    }
  },
}
