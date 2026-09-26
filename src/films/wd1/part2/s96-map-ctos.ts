/**
 * 95.95–98.2  白底世界地图（青色网络连线 + 细框）"INFLUENCE YOUR WORLD VIEWS" 从下方升起并缓推；
 * 97.55 起镜头从 ctOS 字标 "O" 的内孔里向后拉出：地图留在 O 的孔中 → 孔变白 → 字标缩小悬在暗色展台上方；
 * 97.9 暗色展台（白色发光边线的主平板 + 后方一辆车）出现。
 * 98.2 交接给 part3/objects.ts（wd1-098-ctos-objects）：它用同一套针孔相机参数（D/H/yaw、f=900、地平线 380）、
 * 同样的字标画法与天幕渐变接着画 3D 展台、其余设备与后续绕转，98.2 这一帧两边构图一致。
 * V2：世界地图换成真实数据——Natural Earth 50m 陆地面做遮罩，GEBCO 高程梯度 + Blue Marble 灰度做浮雕，
 *     整张图按 97.0s 参考帧 10 个海岸地标拟合的单应矩阵（原片地图平面略带透视，上窄下宽）贴到画面，带投影阴影。
 *     资产缺失时回退到 V1 的 CONTINENTS 手写轮廓。
 * ASSET：drawCar（汽车剪影）仍是手写近似。
 */
import type { Scene } from '../../../engine/types'
import { rng } from '../../../engine/math'
import { FONT, ref, setFont, span, track } from './common'
import { hasWorld, world } from '../../../assets/geo'
import { earthImage, hasEarth } from '../../../assets/earth'

const CONTINENTS: [number, number][][] = [
  [[-168, 65], [-140, 70], [-95, 72], [-80, 63], [-60, 55], [-66, 45], [-75, 35], [-81, 25], [-97, 26], [-105, 20], [-90, 15], [-83, 9], [-78, 8], [-105, 22], [-115, 30], [-124, 40], [-125, 49], [-135, 58], [-150, 60], [-165, 55]],
  [[-55, 60], [-45, 60], [-20, 70], [-25, 82], [-60, 80], [-70, 77]],
  [[-80, 8], [-60, 10], [-50, 0], [-35, -7], [-40, -22], [-58, -38], [-68, -55], [-75, -50], [-72, -20], [-81, -5]],
  [[-10, 36], [-9, 44], [-5, 48], [5, 52], [10, 58], [5, 62], [15, 70], [30, 71], [60, 70], [80, 73], [110, 77], [140, 72], [180, 68], [175, 62], [160, 58], [142, 52], [140, 40], [122, 30], [120, 22], [108, 16], [105, 9], [100, 14], [98, 8], [92, 22], [80, 10], [72, 20], [58, 25], [50, 30], [35, 33], [30, 40], [25, 36], [15, 38], [10, 44], [3, 43]],
  [[-17, 21], [-10, 35], [10, 37], [32, 31], [43, 12], [51, 11], [40, -5], [40, -15], [33, -26], [20, -35], [15, -28], [12, -5], [8, 4], [-8, 4], [-17, 14]],
  [[113, -22], [130, -12], [137, -12], [142, -11], [146, -19], [153, -26], [150, -37], [140, -38], [131, -31], [115, -34]],
  [[-8, 50], [-2, 51], [0, 58], [-5, 58]],
  [[130, 31], [140, 36], [142, 42], [136, 38]],
  [[166, -46], [174, -41], [178, -38], [170, -46]],
]
// V1 地图坐标：经度 -170..180 → x 150..1080，纬度 83..-56 → y 240..600（97.2s 画面），仅回退路径用
const mx = (lon: number) => 150 + ((lon + 170) / 350) * 930
const my = (lat: number) => 240 + ((83 - lat) / 139) * 360

/** 地图层的上移曲线（render 与单应矩阵的反算共用） */
const DY_KEYS: [number, number][] = [
  [95.95, 520],
  [96.2, 400],
  [96.6, 60],
  [96.9, 20],
  [97.2, 0],
]
/**
 * V2：等距圆柱 (lon, lat) → 1280 画面的单应矩阵，97.0s 参考帧拟合（开普角/好望角/纽约/北京/墨尔本/因弗卡吉尔/达喀尔/
 * 威尔士王子角/瓜达富伊角/直布罗陀，残差 10px），再减去 97.0s 时的层位移，得到地图层自身坐标。
 */
const HOM = [2.36206, 1.02463, 577.336, -0.131637, -1.69894, 444.616, -0.000249098, 0.0013843]
const HOM_DY = track(97.0, DY_KEYS)
function hp(lon: number, lat: number): [number, number] {
  const w = HOM[6] * lon + HOM[7] * lat + 1
  return [(HOM[0] * lon + HOM[1] * lat + HOM[2]) / w, (HOM[3] * lon + HOM[4] * lat + HOM[5]) / w - HOM_DY]
}

/** 真实浮雕世界地图：先合成等距圆柱浮雕灰度（陆地内），再用三角网按单应矩阵贴到 1280×720 离屏画布，结果缓存 */
let reliefCache: HTMLCanvasElement | null = null
function reliefMap(): HTMLCanvasElement {
  if (reliefCache) return reliefCache
  const EW = 2048
  const EH = 1024
  const e = document.createElement('canvas')
  e.width = EW
  e.height = EH
  const g = e.getContext('2d', { willReadFrequently: true })!
  // 陆地遮罩（Natural Earth 50m）
  g.beginPath()
  for (const poly of world('50m').land)
    for (const r of poly) {
      for (let i = 0; i < r.length; i += 2) {
        const x = ((r[i] + 180) / 360) * EW
        const y = ((90 - r[i + 1]) / 180) * EH
        if (i) g.lineTo(x, y)
        else g.moveTo(x, y)
      }
      g.closePath()
    }
  g.fillStyle = '#fff'
  g.fill('evenodd')
  const mask = g.getImageData(0, 0, EW, EH).data
  const layer = (m: 'blue' | 'topo') => {
    g.clearRect(0, 0, EW, EH)
    g.drawImage(earthImage(m), 0, 0, EW, EH)
    return g.getImageData(0, 0, EW, EH).data
  }
  const blue = layer('blue')
  const topo = layer('topo')
  const out = g.createImageData(EW, EH)
  const d = out.data
  for (let y = 0; y < EH; y++)
    for (let x = 0; x < EW; x++) {
      const i = (y * EW + x) * 4
      if (mask[i] < 128 || y > EH * 0.83) continue // 不要南极洲
      const lum = 0.3 * blue[i] + 0.59 * blue[i + 1] + 0.11 * blue[i + 2]
      const xl = x > 0 ? i - 4 : i
      const yu = y > 0 ? i - EW * 4 : i
      const relief = (topo[i] - topo[xl]) * 1.6 + (topo[i] - topo[yu]) * 1.6 // 左上光
      const v = Math.max(90, Math.min(245, 150 + Math.min(lum, 200) * 0.35 + relief * 3))
      d[i] = d[i + 1] = d[i + 2] = v
      d[i + 3] = 255
    }
  g.putImageData(out, 0, 0)
  // 三角网贴图：每 10°×10° 一格
  const c = document.createElement('canvas')
  c.width = 1280
  c.height = 720
  const o = c.getContext('2d')!
  const tri = (s0: number[], s1: number[], s2: number[], d0: number[], d1: number[], d2: number[]) => {
    // 源三角 → 目标三角 的仿射
    const den = (s1[0] - s0[0]) * (s2[1] - s0[1]) - (s2[0] - s0[0]) * (s1[1] - s0[1])
    const a = ((d1[0] - d0[0]) * (s2[1] - s0[1]) - (d2[0] - d0[0]) * (s1[1] - s0[1])) / den
    const b = ((d1[1] - d0[1]) * (s2[1] - s0[1]) - (d2[1] - d0[1]) * (s1[1] - s0[1])) / den
    const cc = ((d2[0] - d0[0]) * (s1[0] - s0[0]) - (d1[0] - d0[0]) * (s2[0] - s0[0])) / den
    const dd = ((d2[1] - d0[1]) * (s1[0] - s0[0]) - (d1[1] - d0[1]) * (s2[0] - s0[0])) / den
    const ex = d0[0] - a * s0[0] - cc * s0[1]
    const fy = d0[1] - b * s0[0] - dd * s0[1]
    o.save()
    const cx = (d0[0] + d1[0] + d2[0]) / 3
    const cy = (d0[1] + d1[1] + d2[1]) / 3
    const grow = (p: number[]) => [p[0] + Math.sign(p[0] - cx) * 0.6, p[1] + Math.sign(p[1] - cy) * 0.6]
    const [p0, p1, p2] = [grow(d0), grow(d1), grow(d2)]
    o.beginPath()
    o.moveTo(p0[0], p0[1])
    o.lineTo(p1[0], p1[1])
    o.lineTo(p2[0], p2[1])
    o.closePath()
    o.clip()
    o.setTransform(a, b, cc, dd, ex, fy)
    o.drawImage(e, 0, 0)
    o.restore()
  }
  const S = 10
  for (let lon = -180; lon < 180; lon += S)
    for (let lat = 90; lat > -60; lat -= S) {
      const sp = (lo: number, la: number) => [((lo + 180) / 360) * EW, ((90 - la) / 180) * EH]
      const a0 = sp(lon, lat)
      const a1 = sp(lon + S, lat)
      const a2 = sp(lon + S, lat - S)
      const a3 = sp(lon, lat - S)
      const b0 = hp(lon, lat)
      const b1 = hp(lon + S, lat)
      const b2 = hp(lon + S, lat - S)
      const b3 = hp(lon, lat - S)
      tri(a0, a1, a2, b0, b1, b2)
      tri(a0, a2, a3, b0, b2, b3)
    }
  reliefCache = c
  return c
}

const NET = (() => {
  const R = rng(9600)
  const hubs: [number, number][] = [
    [-74, 40], [-87, 42], [-118, 34], [0, 51], [2, 48], [37, 55], [116, 40], [121, 31], [139, 35], [103, 1], [151, -34], [-46, -23], [28, -26], [55, 25], [77, 28],
  ]
  const lines: [number, number, number, number, number][] = []
  for (let i = 0; i < 45; i++) {
    const a = R.pick(hubs)
    const b = R.pick(hubs)
    const p = hp(a[0] + R.range(-8, 8), a[1] + R.range(-6, 6))
    const q = hp(b[0] + R.range(-8, 8), b[1] + R.range(-6, 6))
    lines.push([p[0], p[1], q[0], q[1], R.next()])
  }
  const marks: [number, number, number][] = []
  for (let i = 0; i < 60; i++) marks.push([R.range(-100, 1380), R.range(-50, 780), R.next()])
  return { lines, marks }
})()

/** ASSET：世界地图（浮雕灰 + 青色网络 + 细框） */
function drawWorld(ctx: CanvasRenderingContext2D, t: number) {
  // 细框
  ctx.strokeStyle = 'rgba(120,120,120,0.45)'
  ctx.lineWidth = 0.8
  ctx.strokeRect(210, 245, 250, 90)
  ctx.strokeRect(320, 430, 150, 160)
  ctx.strokeRect(870, 510, 215, 80)
  ctx.strokeRect(160, 405, 60, 30)
  if (hasWorld('50m') && hasEarth('blue') && hasEarth('topo')) {
    // 真实浮雕地图 + 向下的柔和投影（原片陆地像压起的厚纸）
    const m = reliefMap()
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.35)'
    ctx.shadowBlur = 8
    ctx.shadowOffsetY = 4
    ctx.drawImage(m, 0, 0)
    ctx.restore()
  } else for (const poly of CONTINENTS) {
    ctx.beginPath()
    poly.forEach(([lo, la], i) => (i ? ctx.lineTo(mx(lo), my(la)) : ctx.moveTo(mx(lo), my(la))))
    ctx.closePath()
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.35)'
    ctx.shadowBlur = 6
    ctx.shadowOffsetY = 3
    ctx.fillStyle = '#c9c9c9'
    ctx.fill()
    ctx.restore()
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'
    ctx.lineWidth = 1
    ctx.stroke()
  }
  // 青色网络（96.3 起逐条长出）
  const g = span(t, 96.3, 97.1)
  ctx.lineWidth = 0.9
  for (const [x1, y1, x2, y2, d] of NET.lines) {
    const q = Math.min(1, Math.max(0, (g - d * 0.6) / 0.4))
    if (q <= 0) continue
    ctx.strokeStyle = d < 0.2 ? 'rgba(90,90,90,0.35)' : 'rgba(40,200,190,0.42)'
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.quadraticCurveTo((x1 + x2) / 2, Math.min(y1, y2) - 20, x1 + (x2 - x1) * q, y1 + (y2 - y1) * q)
    ctx.stroke()
  }
  // 散点 + 号
  ctx.strokeStyle = 'rgba(120,120,120,0.5)'
  for (const [x, y, k] of NET.marks) {
    ctx.beginPath()
    if (k < 0.5) {
      ctx.moveTo(x - 3, y)
      ctx.lineTo(x + 3, y)
      ctx.moveTo(x, y - 3)
      ctx.lineTo(x, y + 3)
    } else ctx.rect(x, y, 5, 5)
    ctx.stroke()
  }
  // 标题
  ctx.font = `italic 300 21px ${FONT.sans}`
  ctx.letterSpacing = '0.4px'
  ctx.fillStyle = '#222'
  const a = 'INFLUENCE YOUR '
  const b = 'WORLD VIEWS'
  const n = Math.floor(span(t, 96.35, 97.1) * (a.length + b.length))
  ctx.fillText(a.slice(0, n), 394, 244)
  const wa = ctx.measureText(a).width
  ctx.font = `700 21px ${FONT.sans}`
  if (n > a.length) ctx.fillText(b.slice(0, n - a.length), 394 + wa, 244)
  ctx.letterSpacing = '0px'
}

/* ---------- 展台上的汽车（ASSET 剪影，局部坐标：底部中心为原点）；其余设备 98.2 起由 part3 objects 画 ---------- */
function drawCar(g: CanvasRenderingContext2D) {
  g.fillStyle = '#d8d8d8'
  g.beginPath()
  g.ellipse(0, -0.12, 0.5, 0.14, 0, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#9a9a9a'
  g.fillRect(-0.45, -0.1, 0.9, 0.08)
}
const PROPS: [(g: CanvasRenderingContext2D) => void, number, number, number][] = [[drawCar, 0.1, -1.2, 0.5]]

export const s96MapCtos: Scene = {
  id: 'wd1-096-world-views-ctos-stage',
  start: 95.95,
  end: 98.2,
  note: 'INFLUENCE YOUR WORLD VIEWS 世界地图 → 从 ctOS 的 O 中拉出 → 暗色展台出现（98.2 交接 part3 objects）',
  render({ ctx, t }) {
    ref(ctx)
    // 地图层（白底）：96.0 从下方升起，缓推
    const mapLayer = () => {
      ctx.fillStyle = '#fcfcfc'
      ctx.fillRect(0, 0, 1280, 720)
      const s = track(t, [
        [96.0, 0.95],
        [96.9, 1.0],
        [97.2, 1.0],
        [97.5, 1.02],
        [97.8, 1.05],
      ])
      const dy = track(t, DY_KEYS)
      ctx.save()
      ctx.translate(615, 420 + dy)
      ctx.scale(s, s)
      ctx.translate(-615, -420)
      drawWorld(ctx, t)
      ctx.restore()
    }
    if (t < 97.55) {
      // 前 0.45s 地图从下方露出，上方仍是 SELL PRODUCTS 镜头（在它下面画）
      if (t < 96.4) {
        const top = track(t, [
          [95.95, 720],
          [96.2, 560],
          [96.4, 0],
        ])
        ctx.save()
        ctx.beginPath()
        ctx.rect(0, top, 1280, 720 - top)
        ctx.clip()
        mapLayer()
        ctx.restore()
      } else mapLayer()
      return
    }

    // ---- 97.55 起：暗色展台背景 + ctOS 字标拉出 ----
    const hy = 380 // 地平线
    const bg = ctx.createLinearGradient(0, 0, 0, hy)
    bg.addColorStop(0, '#0e0e0e')
    bg.addColorStop(1, '#8a8a8a')
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, 1280, hy)
    ctx.fillStyle = '#000'
    ctx.fillRect(0, hy, 1280, 720 - hy)

    // 展台（地面透视）。98.2 之后的关键帧保留：它们决定 98.2 之前曲线的切线，且与 part3 objects 的 KEYS_A 同值
    if (t > 97.9) {
      const D = track(t, [
        [97.9, 4.6],
        [98.2, 5.25],
        [98.8, 6.4],
        [99.4, 7.1],
        [100, 7.7],
      ])
      const H = track(t, [
        [98.2, 1.2],
        [98.8, 1.25],
        [99.4, 1.3],
        [100, 1.3],
      ])
      const yaw = track(t, [
        [98.2, 0],
        [98.8, 0.12],
        [99.4, 0.35],
        [100, 0.5],
      ])
      const f = 900
      const P = (x: number, z: number): [number, number, number] => {
        const X = x * Math.cos(yaw) - z * Math.sin(yaw)
        const Z = x * Math.sin(yaw) + z * Math.cos(yaw)
        const d = D - Z
        return [640 + (f * X) / d, hy + (f * H) / d, d]
      }
      const quad = (pts: [number, number][], w: number, a: number) => {
        ctx.strokeStyle = `rgba(255,255,255,${a})`
        ctx.lineWidth = w
        ctx.beginPath()
        pts.forEach(([x, z], i) => {
          const [sx, sy, d] = P(x, z)
          if (d <= 0.2) return
          if (i) ctx.lineTo(sx, sy)
          else ctx.moveTo(sx, sy)
        })
        ctx.closePath()
        ctx.stroke()
      }
      quad([[-1.5, -1.5], [1.5, -1.5], [1.5, 2.5], [-1.5, 2.5]], 1.6, 0.9)
      quad([[-5, 2.2], [5, 2.2], [5, 2.35], [-5, 2.35]], 3, 0.85)
      quad([[-4.5, -0.6], [4.5, -0.6]], 1, 0.5)
      // 设备
      const props = [...PROPS]
        .map((p) => ({ p, s: P(p[1], p[2]) }))
        .sort((a, b) => b.s[2] - a.s[2])
      for (const { p, s } of props) {
        const [draw, , , size] = p
        if (s[2] <= 0.3) continue
        const k = (f * size) / s[2] / 1.0
        ctx.save()
        ctx.translate(s[0], s[1])
        ctx.scale(k, k)
        draw(ctx)
        ctx.restore()
      }
    }

    // ctOS 字标：从极大缩到顶部小字（O 的内孔先显示地图，再变白，再透明）
    const lw = track(t, [
      [97.55, 9000],
      [97.8, 3480],
      [98.2, 580],
      [98.8, 256],
      [99.4, 210],
      [100, 190],
    ])
    const lx = track(t, [
      [97.55, 117],
      [97.8, 450],
      [98.2, 610],
      [98.8, 628],
      [99.4, 631],
      [100, 632],
    ])
    const ly = track(t, [
      [97.55, 1923],
      [97.8, 1002],
      [98.2, 440],
      [98.8, 370],
      [99.4, 350],
      [100, 345],
    ])
    const k = lw / 580
    ctx.save()
    ctx.translate(lx, ly)
    ctx.scale(k, k)
    // 字标局部坐标：总宽 580，基线 y=0，O 中心 (45,-100)
    setFont(ctx, 168, 500, FONT.sans, -0.02)
    ctx.fillStyle = '#fff'
    ctx.fillText('CT', -292, 0)
    ctx.font = `500 270px ${FONT.sans}`
    ctx.fillText('S', 132, 0)
    // O：外环白，内孔先是地图 → 白 → 透明
    ctx.beginPath()
    ctx.ellipse(35, -100, 95, 100, 0, 0, Math.PI * 2)
    ctx.fill()
    const holeMap = 1 - span(t, 97.85, 98.1)
    const holeWhite = 1 - span(t, 98.3, 98.6)
    ctx.beginPath()
    ctx.ellipse(35, -100, 60, 76, 0, 0, Math.PI * 2)
    if (holeWhite < 1) {
      ctx.fillStyle = '#000'
      ctx.globalAlpha = 1 - holeWhite
      ctx.fill()
      ctx.globalAlpha = 1
    }
    if (holeMap > 0) {
      ctx.save()
      ctx.clip()
      // 地图在孔内（孔内坐标映射回屏幕：孔中心对应画面中心）
      const ms = track(t, [
        [97.55, 1.05],
        [97.8, 1.07],
        [98.05, 0.85],
      ])
      ctx.translate(35, -100)
      ctx.scale(ms / k, ms / k)
      ctx.translate(-615, -420)
      ctx.globalAlpha = holeMap
      ctx.fillStyle = '#e8e8e8'
      ctx.fillRect(0, 0, 1280, 720)
      drawWorld(ctx, 97.5)
      ctx.restore()
    }
    ctx.restore()
  },
}
