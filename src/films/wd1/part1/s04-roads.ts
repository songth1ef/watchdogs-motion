import type { Scene } from '../../../engine/types'
import { clamp, ease, hash, rng, seg } from '../../../engine/math'
import { FONT } from '../../../fx/text'
import { memo } from '../../../engine/three-host'
import { GREAT_LAKES, LIGHTS, NORTH_AMERICA, type LonLat } from './geo'
import { roughen, spline, typeBox, typed } from './util'
import { hasWorld, world, GREAT_LAKES as LAKE_NAMES } from '../../../assets/geo'
import { tune } from './tune'

/**
 * 15.0–18.4  美国东北灰色道路网地图，白色半透明圆点此起彼伏，「11 PEOPLE DIED IN THE DARK」等宽白底标签。
 * 地图整体缓慢左移。
 * ASSET：道路网是程序化的（城市点 k 近邻连线 + 随机分叉），换真实素材时替换 roadNetwork()（比如 OSM 导出的 SVG 路径）。
 */

// V1 线性投影：只用于保留 V1 按参考帧手放的白色圆点屏幕位置（DOTS）
const proj = (p: LonLat): [number, number] => [900 + (p[0] + 74) * 60, 560 - (p[1] - 40.7) * 80]

/**
 * V2：原片是美国标准 Albers 等积圆锥（中央经线 -96°，标准纬线 29.5/45.5）——东北部因此整体顺时针倾斜约 15°，
 * 长岛接近水平、缅因海岸向右平伸。再加相似变换（缩放 k、旋转 rot、纽约 (-74, 40.7) 落在 (tx, ty)）。
 * 参数用评分网格对 15.5–18s 参考帧的海岸/州界/五大湖拟合。
 */
const ALB = (() => {
  const D = Math.PI / 180
  const p1 = 29.5 * D
  const p2 = 45.5 * D
  const n = (Math.sin(p1) + Math.sin(p2)) / 2
  const C = Math.cos(p1) ** 2 + 2 * n * Math.sin(p1)
  const r0 = Math.sqrt(C - 2 * n * Math.sin(23 * D)) / n
  return (lon: number, lat: number): [number, number] => {
    const r = Math.sqrt(C - 2 * n * Math.sin(lat * D)) / n
    const th = n * (lon + 96) * D
    return [r * Math.sin(th), r0 - r * Math.cos(th)]
  }
})()
/**
 * 原片地图本身有美术变形（缅因放大、新泽西海岸被压平），单一投影拟合残差约 64px。
 * 做法：先用 13 个控制点（科德角/开普梅/诺福克海岸点 + 原片 17s 帧上的州名缩写位置，已加回 ox 偏移）最小二乘拟合
 * Albers→画面的仿射，再用高斯 RBF 把各控制点的残差平滑插值进去（橡皮膜变形），让真实海岸/州界贴到原片位置。
 */
const CTRL: [number, number, number, number][] = [
  [-69.95, 41.68, 1313, 690], [-74.9, 38.93, 803, 760], [-76.3, 36.9, 713, 920], [-72.7, 41.6, 1073, 690],
  [-71.5, 41.7, 1133, 660], [-74.5, 40.1, 963, 720], [-76.8, 39.0, 783, 830], [-75.5, 39.0, 853, 885],
  [-78.8, 37.5, 583, 850], [-79.4, 35.5, 633, 1030], [-72.7, 44.0, 1083, 395], [-71.6, 43.7, 1123, 440], [-69.2, 45.3, 1323, 290],
  // 西侧州名（MI/OH/IN/KY/WV）
  [-84.6, 43.8, 283, 230], [-82.8, 40.3, 323, 570], [-86.3, 39.9, 198, 640], [-85.3, 37.5, 223, 710], [-80.6, 38.6, 463, 735],
]
const AFF = () => [tune('a0', 4842.471), tune('a1', 1648.719), tune('a2', -978.366), tune('a3', 2712.577), tune('a4', -4740.972), tune('a5', 1531.556)]
const affine = (lon: number, lat: number): [number, number] => {
  const [x, y] = ALB(lon, lat)
  const A = AFF()
  return [A[0] * x + A[1] * y + A[2] + tune('rdx', 0), A[3] * x + A[4] * y + A[5] + tune('rdy', 0)]
}
const RES = CTRL.map(([lon, lat, X, Y]) => {
  const [x, y] = affine(lon, lat)
  return [x, y, X - x, Y - y] as const
})
const aParams = () => [tune('rsig', 170), tune('rw', 1), tune('rdx', 0), tune('rdy', 0), ...AFF()] as const
const projA = (lon: number, lat: number): [number, number] => {
  const [x, y] = affine(lon, lat)
  const [sig, wgt] = aParams()
  let sx = 0
  let sy = 0
  let sw = 0.15
  for (const [cx, cy, rx, ry] of RES) {
    const w = Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * sig * sig))
    sx += w * rx
    sy += w * ry
    sw += w
  }
  return [x + (wgt * sx) / sw, y + (wgt * sy) / sw]
}
const inView = (lon: number, lat: number) => lon > -92 && lon < -58 && lat > 33 && lat < 50

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

/**
 * V2 道路网（仍是程序化 ASSET，Natural Earth 不含道路）：节点 = Natural Earth 真实城市点（按人口加密撒点）+ 陆地上的均匀点，
 * 在经纬度空间做 k 近邻连线（城市之间的连线更粗更亮，近似州际公路），绘制时再走 Albers 投影。
 */
interface GeoRoad {
  a: LonLat
  m: LonLat
  b: LonLat
  w: number
  alpha: number
}
function realRoadNetwork(): GeoRoad[] {
  return memo(`wd1p1:roadsReal:${tune('rnodes', 2400)}`, () => {
    const R = rng(1409)
    const nodes: { p: LonLat; big: boolean }[] = []
    const gauss = () => (R.next() + R.next() + R.next() - 1.5) / 0.5
    for (const [, iso, lon, lat, pop] of world('50m').cities) {
      if ((iso !== 'USA' && iso !== 'CAN') || !inView(lon, lat)) continue
      nodes.push({ p: [lon, lat], big: pop > 3e5 })
      const n = Math.min(30, Math.round(Math.sqrt(pop / 1e4)))
      for (let i = 0; i < n; i++) nodes.push({ p: [lon + gauss() * 0.35, lat + gauss() * 0.25], big: false })
    }
    for (let i = 0; i < tune('rnodes', 2400); i++) nodes.push({ p: [R.range(-92, -58), R.range(33, 50)], big: false })
    // 陆地判定：Natural Earth 陆地面减五大湖（离屏等距栅格）
    const W = 1024
    const H = 512
    const cv = document.createElement('canvas')
    cv.width = W
    cv.height = H
    const g = cv.getContext('2d', { willReadFrequently: true })!
    const toPx = (lon: number, lat: number): [number, number] => [((lon + 92) / 34) * W, ((50 - lat) / 17) * H]
    const trace = (r: Float32Array) => {
      for (let i = 0; i < r.length; i += 2) {
        const [x, y] = toPx(r[i], r[i + 1])
        if (i) g.lineTo(x, y)
        else g.moveTo(x, y)
      }
      g.closePath()
    }
    g.beginPath()
    for (const st of world('50m').states) if (st.country === 'USA') st.polys.forEach((pp) => pp.forEach(trace))
    g.fillStyle = '#fff'
    g.fill('evenodd')
    g.beginPath()
    for (const l of world('50m').lakes) if ((LAKE_NAMES as readonly string[]).includes(l.name)) l.polys.forEach((pp) => pp.forEach(trace))
    g.fillStyle = '#000'
    g.fill()
    const px = g.getImageData(0, 0, W, H).data
    const onLand = ([lon, lat]: LonLat) => {
      const [x, y] = toPx(lon, lat)
      if (x < 0 || y < 0 || x >= W || y >= H) return false
      return px[(Math.floor(y) * W + Math.floor(x)) * 4] > 127
    }
    const pts = nodes.filter((n) => onLand(n.p))
    const roads: GeoRoad[] = []
    const kx = Math.cos(42 * (Math.PI / 180))
    for (let i = 0; i < pts.length; i++) {
      const d = pts
        .map((q, j) => [j, ((q.p[0] - pts[i].p[0]) * kx) ** 2 + (q.p[1] - pts[i].p[1]) ** 2] as [number, number])
        .sort((a, b) => a[1] - b[1])
      const K = pts[i].big ? 6 : 3
      for (let k = 1; k <= K && k < d.length; k++) {
        const j = d[k][0]
        if (j < i && k <= 3) continue // 去掉大部分重复边
        const a = pts[i].p
        const b = pts[j].p
        const m: LonLat = [(a[0] + b[0]) / 2 + R.range(-0.08, 0.08), (a[1] + b[1]) / 2 + R.range(-0.06, 0.06)]
        const hw = pts[i].big && pts[j].big
        roads.push({ a, m, b, w: hw ? 1.6 : 1, alpha: hw ? 0.55 : R.range(0.14, 0.42) })
      }
    }
    return roads
  })
}

/** V2 真实轮廓：Natural Earth 50m 海岸线 + 美加州/省界 + 五大湖，Path2D 按投影参数缓存 */
function realOutlines(ctx: CanvasRenderingContext2D) {
  const key = aParams().join(',') + ':' + tune('rnodes', 2400)
  const paths = memo(`wd1p1:outlinesReal:${key}`, () => {
    const w = world('50m')
    const coast = new Path2D()
    const border = new Path2D()
    const add = (p: Path2D, r: Float32Array, closed: boolean) => {
      let pen = false
      for (let i = 0; i < r.length; i += 2) {
        const lon = r[i]
        const lat = r[i + 1]
        if (lon < -100 || lon > -50 || lat < 28 || lat > 55) {
          pen = false
          continue
        }
        const [x, y] = projA(lon, lat)
        if (pen) p.lineTo(x, y)
        else p.moveTo(x, y)
        pen = true
      }
      if (closed && pen) p.closePath()
    }
    // 原片只画美国：州轮廓（含海岸）+ 五大湖，不画加拿大海岸
    for (const l of w.lakes) if ((LAKE_NAMES as readonly string[]).includes(l.name)) l.polys.forEach((pp) => pp.forEach((r) => add(coast, r, true)))
    for (const st of w.states) if (st.country === 'USA') st.polys.forEach((pp) => pp.forEach((r) => add(border, r, false)))
    const roads = new Path2D()
    const hw = new Path2D()
    for (const r of realRoadNetwork()) {
      const [x1, y1] = projA(r.a[0], r.a[1])
      const [xm, ym] = projA(r.m[0], r.m[1])
      const [x2, y2] = projA(r.b[0], r.b[1])
      const p = r.w > 1 ? hw : roads
      p.moveTo(x1, y1)
      p.quadraticCurveTo(xm, ym, x2, y2)
    }
    return { coast, border, roads, hw }
  })
  ctx.lineWidth = 1.2
  ctx.strokeStyle = `rgba(150,185,185,${tune('roadA', 0.45)})`
  ctx.stroke(paths.roads)
  ctx.lineWidth = 1.6
  ctx.strokeStyle = 'rgba(200,215,215,0.5)'
  ctx.stroke(paths.hw)
  ctx.strokeStyle = `rgba(200,210,210,${tune('borderA', 0.55)})`
  ctx.lineWidth = 2
  ctx.stroke(paths.border)
  ctx.strokeStyle = 'rgba(200,210,210,0.75)'
  ctx.lineWidth = 2
  ctx.stroke(paths.coast)
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
    if (mapA > 0 && hasWorld('50m')) {
      ctx.globalAlpha = mapA
      realOutlines(ctx)
      ctx.fillStyle = 'rgba(79,245,227,0.6)'
      for (let i = 0; i < 40; i++) ctx.fillRect(hash(i * 5 + 1) * 1600 + 100, hash(i * 5 + 2) * 900 + 100, 3, 3)
      ctx.globalAlpha = 1
    } else if (mapA > 0) {
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
