/**
 * 67.6–71.9  星状放射网络 "_INDIVIDUAL" "_DATA CLUSTER" → 美国地图（城市名小字点阵）"_Global Network" → 急推到五大湖城市名。
 * 67.6–69.4 这段画在头骨下面：由 s62-skull 先调用 drawNetworkWorld()，本镜头从 69.4 起单独接管。
 * 世界坐标 = 原片 70.2s 时的屏幕坐标（缩放 1）。
 * V2：投影换成美国标准 Albers（原片就是它：旧金山/丹佛/芝加哥/纽约/华盛顿/休斯敦/洛杉矶七个枢纽拟合残差 5.8px），
 * 美国轮廓用 Natural Earth 50m 州面，城市小字优先用 Natural Earth 真实城市（美国 + 加拿大南部），枢纽放在真实城市上，
 * 射线改为「枢纽 → 城市」连线（原片是航线网）。world 数据缺失时回退到 V1 手写轮廓。
 */
import type { Scene } from '../../../engine/types'
import { rng } from '../../../engine/math'
import { FONT, ease, ref, span, track, typed } from './common'
import { hasWorld, world } from '../../../assets/geo'
import { tune } from '../part1/tune'

/** Albers 等积圆锥（美国标准：中央经线 -96°，标准纬线 29.5/45.5，原点纬度 23°），单位 = 地球半径 */
const albers = (() => {
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
// 70.5s 参考帧上的「Albers → 1280 屏幕」仿射（最小二乘，7 个枢纽城市），再用 cam(70.5) 反算到世界坐标
const AFF = [1232.719, 66.929, 479.57, 100.881, -1185.821, 759.764]
function toWorld(lon: number, lat: number): [number, number] {
  const [x, y] = albers(lon, lat)
  const sx = AFF[0] * x + AFF[1] * y + AFF[2]
  const sy = AFF[3] * x + AFF[4] * y + AFF[5]
  const c = cam(70.5)
  return [406 + (sx - c.ox) / c.s, 260 + (sy - c.oy) / c.s]
}

/** ASSET：美国本土轮廓（经度, 纬度） */
const US_OUTLINE: [number, number][] = [
  [-124.7, 48.4], [-123, 49], [-95, 49], [-89.5, 48], [-84.5, 46.5], [-82.5, 45.3], [-82.4, 43], [-79, 43.3], [-76.5, 44.2],
  [-74.9, 45], [-71.5, 45], [-69.2, 47.4], [-67, 44.8], [-70.7, 43], [-70, 41.7], [-74, 40.6], [-75.5, 38.8], [-76.3, 37],
  [-75.6, 35.2], [-78.5, 33.8], [-81, 32], [-81.4, 30.3], [-80, 26.8], [-80.4, 25.2], [-81.8, 26.5], [-82.8, 28.5], [-84.3, 30],
  [-86, 30.4], [-89.5, 30.2], [-90, 29.2], [-94, 29.6], [-97.2, 27.7], [-97.2, 26], [-99.5, 27.5], [-101.4, 29.8], [-103.3, 29],
  [-104.7, 29.9], [-106.5, 31.8], [-111, 31.3], [-114.8, 32.5], [-117.1, 32.5], [-118.5, 34], [-120.6, 34.6], [-122.5, 37.5],
  [-124.2, 40.3], [-124.1, 43], [-124.7, 48.4],
]
const outlineV1 = () => US_OUTLINE.map(([lo, la]) => toWorld(lo, la))
let OUTLINE: (readonly [number, number])[] = []

/** 真实美国本土州面（多环）的点内判定：离屏栅格 */
let usMask: { data: Uint8ClampedArray; x0: number; y0: number; w: number; h: number } | null = null
function buildUsMask() {
  const x0 = -300
  const y0 = -200
  const w = 1900
  const h = 1100
  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  const g = cv.getContext('2d', { willReadFrequently: true })!
  g.beginPath()
  for (const st of world('50m').states) {
    if (st.country !== 'USA' || st.postal === 'AK' || st.postal === 'HI') continue
    for (const poly of st.polys)
      for (const r of poly) {
        for (let i = 0; i < r.length; i += 2) {
          const [x, y] = toWorld(r[i], r[i + 1])
          if (i) g.lineTo(x - x0, y - y0)
          else g.moveTo(x - x0, y - y0)
        }
        g.closePath()
      }
  }
  g.fillStyle = '#fff'
  g.fill()
  usMask = { data: g.getImageData(0, 0, w, h).data, x0, y0, w, h }
}

function inside(x: number, y: number) {
  if (usMask) {
    const X = Math.floor(x - usMask.x0)
    const Y = Math.floor(y - usMask.y0)
    if (X < 0 || Y < 0 || X >= usMask.w || Y >= usMask.h) return false
    return usMask.data[(Y * usMask.w + X) * 4] > 127
  }
  let c = false
  for (let i = 0, j = OUTLINE.length - 1; i < OUTLINE.length; j = i++) {
    const [xi, yi] = OUTLINE[i]
    const [xj, yj] = OUTLINE[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c
  }
  return c
}

/** ASSET：城市名（经度, 纬度）。五大湖一带按原片 71.95s 画面补全 */
const CITIES: [string, number, number][] = [
  ['MINNEAPOLIS', -93.3, 45], ['WAUSAU', -89.6, 44.96], ['EAU CLAIRE', -91.5, 44.8], ['GREEN BAY', -88, 44.5], ['TRAVERSE CITY', -85.6, 44.8],
  ['APPLETON/', -88.4, 44.26], ['FOX CITIES', -88.4, 44.1], ['MUSKEGON', -86.25, 43.2], ['GRAND', -85.7, 43.1], ['RAPIDS', -85.7, 42.95],
  ['MIDLAND/', -84.2, 43.6], ['SAGINAW', -84.2, 43.45], ['SARNIA', -82.4, 43], ['MILWAUKEE', -87.9, 43.04], ['FLINT', -83.7, 43],
  ['MADISON', -89.4, 43.07], ['LANSING', -84.55, 42.7], ['LONDON', -81.25, 42.98], ['DETROIT', -83.05, 42.33], ['WINDSOR', -83, 42.3],
  ['CEDAR', -91.66, 41.98], ['RAPIDS/', -91.66, 41.83], ['IOWA CITY', -91.53, 41.66], ['SOUTH', -86.25, 41.68], ['BEND/ELKHART/', -86.25, 41.53],
  ['MISHAWAKA', -86.25, 41.38], ['CLEVELAND', -81.7, 41.5], ['PEORIA', -89.6, 40.7], ['AKRON/CANTON', -81.5, 41.08], ['MOLINE', -90.5, 41.5],
  ['FT.', -85.14, 41.08], ['WAYNE', -85.14, 40.93], ['BURLINGTON', -91.1, 40.8], ['COLUMBUS', -83, 39.96], ['PITTSBURGH', -80, 40.44],
  ['DAYTON', -84.2, 39.76], ['MORGANTOWN', -79.96, 39.63], ['TOLEDO', -83.55, 41.65], ['CHICAGO', -87.63, 41.88], ['ROCKFORD', -89.1, 42.27],
  ['SEATTLE', -122.3, 47.6], ['PORTLAND', -122.7, 45.5], ['BOISE', -116.2, 43.6], ['SALT LAKE CITY', -111.9, 40.76], ['DENVER', -105, 39.74],
  ['SAN FRANCISCO', -122.4, 37.77], ['FRESNO', -119.8, 36.74], ['LOS ANGELES', -118.2, 34.05], ['SAN DIEGO', -117.2, 32.7], ['LAS VEGAS', -115.1, 36.2],
  ['PHOENIX', -112.1, 33.45], ['TUCSON', -110.9, 32.2], ['ALBUQUERQUE', -106.6, 35.1], ['EL PASO', -106.4, 31.76], ['BILLINGS', -108.5, 45.8],
  ['CASPER', -106.3, 42.85], ['RAPID CITY', -103.2, 44.08], ['BISMARCK', -100.8, 46.8], ['FARGO', -96.8, 46.88], ['SIOUX FALLS', -96.7, 43.54],
  ['OMAHA', -95.9, 41.25], ['LINCOLN', -96.7, 40.8], ['KANSAS CITY', -94.6, 39.1], ['WICHITA', -97.3, 37.7], ['TULSA', -95.99, 36.15],
  ['OKLAHOMA CITY', -97.5, 35.47], ['DALLAS', -96.8, 32.78], ['AUSTIN', -97.74, 30.27], ['HOUSTON', -95.37, 29.76], ['SAN ANTONIO', -98.5, 29.42],
  ['NEW ORLEANS', -90.07, 29.95], ['MEMPHIS', -90.05, 35.15], ['ST. LOUIS', -90.2, 38.63], ['NASHVILLE', -86.78, 36.16], ['LOUISVILLE', -85.76, 38.25],
  ['INDIANAPOLIS', -86.16, 39.77], ['CINCINNATI', -84.5, 39.1], ['ATLANTA', -84.39, 33.75], ['BIRMINGHAM', -86.8, 33.52], ['JACKSONVILLE', -81.66, 30.33],
  ['ORLANDO', -81.38, 28.54], ['TAMPA', -82.46, 27.95], ['MIAMI', -80.19, 25.77], ['CHARLOTTE', -80.84, 35.23], ['RALEIGH', -78.64, 35.78],
  ['RICHMOND', -77.44, 37.54], ['WASHINGTON, DC', -77.04, 38.9], ['BALTIMORE', -76.61, 39.29], ['PHILADELPHIA', -75.17, 39.95], ['NEW YORK', -74, 40.71],
  ['HARTFORD', -72.68, 41.76], ['BOSTON', -71.06, 42.36], ['PORTLAND ME', -70.26, 43.66], ['ALBANY', -73.76, 42.65], ['BUFFALO', -78.88, 42.89],
  ['SYRACUSE', -76.15, 43.05], ['ROCHESTER', -77.61, 43.16], ['SPOKANE', -117.4, 47.66], ['RENO', -119.8, 39.53], ['SACRAMENTO', -121.5, 38.58],
]

type NetWorld = {
  labels: { text: string; x: number; y: number; bar: boolean }[]
  nReal: number
  hubs: [number, number][]
  rays: [number, number, number, number, number][]
  bits: [number, number, number, number][]
}
let cached: { real: boolean; w: NetWorld } | null = null
let cachedKey = ''
/** 懒构建（资产在 preloadAssets 之后才可用，不能在模块加载时算） */
function getWorld(): NetWorld {
  const real = hasWorld('50m')
  if (!cached || cached.real !== real || cachedKey !== `${tune('nray', 20)}:${tune('nrand', 0)}`) {
    if (real) buildUsMask()
    else OUTLINE = outlineV1()
    cached = { real, w: buildWorld(real) }
    cachedKey = `${tune('nray', 20)}:${tune('nrand', 0)}`
  }
  return cached.w
}

function buildWorld(real: boolean): NetWorld {
  const R = rng(6900)
  // 城市小字：真实城市 + 大量填充（原片里远看是一根根短横线）
  const labels: { text: string; x: number; y: number; bar: boolean }[] = CITIES.map(([n, lo, la]) => {
    const [x, y] = toWorld(lo, la)
    return { text: n, x, y, bar: false }
  })
  if (real) {
    const have = new Set(CITIES.map((c) => c[0]))
    for (const [name, iso, lo, la] of world('50m').cities) {
      if (!((iso === 'USA' && la < 50 && lo > -126) || (iso === 'CAN' && la < 56))) continue
      const text = name.toUpperCase()
      if (have.has(text)) continue
      const [x, y] = toWorld(lo, la)
      labels.push({ text, x, y, bar: false })
    }
  }
  const nReal = labels.length
  const syll = ['NOR', 'MAR', 'LIN', 'TON', 'VILLE', 'SPR', 'ING', 'FIELD', 'PORT', 'DALE', 'WOOD', 'BUR', 'GH', 'RED', 'OAK', 'SAN', 'LAKE', 'MONT']
  let guard = 0
  while (labels.length < 520 && guard++ < 20000) {
    const x = R.range(0, 1280)
    const y = R.range(40, 720)
    if (!inside(x, y)) continue
    const bar = R.chance(0.18)
    const n = R.int(2, 4)
    let text = ''
    for (let k = 0; k < n; k++) text += R.pick(syll)
    labels.push({ text, x, y, bar })
  }
  // 中心节点：V2 放在真实枢纽城市（下标 1 = 芝加哥，画大点）；射线 = 枢纽 → 城市标签
  const hubs: [number, number][] = real
    ? ([[-104.99, 39.74], [-87.63, 41.88], [-74, 40.71], [-95.37, 29.76], [-122.4, 37.77], [-77.04, 38.9], [-118.24, 34.05]] as [number, number][]).map(
        ([lo, la]) => toWorld(lo, la),
      )
    : [
        [290, 410],
        [634, 376],
        [890, 380],
        [470, 666],
        [60, 470],
      ]
  const rays: [number, number, number, number, number][] = []
  hubs.forEach(([hx, hy], h) => {
    if (real) {
      for (let i = 0; i < tune('nray', 20); i++) {
        const L = labels[R.int(0, labels.length - 1)]
        rays.push([hx, hy, L.x, L.y, R.next()])
      }
    }
    for (let i = 0; i < (real ? tune('nrand', 0) : 70); i++) {
      const a = R.range(0, Math.PI * 2)
      const len = R.range(120, 520)
      rays.push([hx, hy, hx + Math.cos(a) * len, hy + Math.sin(a) * len * 0.8, R.next()])
    }
    hubs.forEach(([bx, by], k) => {
      if (k > h) rays.push([hx, hy, bx, by, R.next() * 0.3])
    })
  })
  // 远处的碎折线（原片网络边缘的锯齿状线头）
  const bits: [number, number, number, number][] = []
  for (let i = 0; i < 90; i++) {
    const x = R.range(-200, 1480)
    const y = R.range(-100, 820)
    bits.push([x, y, x + R.range(-40, 40), y + R.range(-50, 10)])
  }
  return { labels, nReal, hubs, rays, bits }
}

/** 世界 → 屏幕的相机：以 C=(406,260)（_INDIVIDUAL 标签）为锚点缩放 + 旋转 */
function cam(t: number) {
  const s = track(t, [
    [67.6, 2.4],
    [67.8, 2.2],
    [68.4, 1.8],
    [68.9, 1.55],
    [69.4, 1.4],
    [70.2, 1.0],
    [71.0, tune('s71', 0.8)],
    [71.5, tune('s715', 0.95)],
    [71.7, 1.23],
    [71.75, 1.59],
    [71.77, 1.62],
    [71.8, 5],
    [71.95, 5.3],
  ])
  const ox = track(t, [
    [67.8, 370],
    [68.4, 330],
    [68.9, 300],
    [69.4, 300],
    [70.2, 406],
    [71.0, tune('x71', 439)],
    [71.5, tune('x715', 407)],
    [71.7, 360],
    [71.75, 288],
    [71.77, 280],
    [71.8, -1434],
    [71.95, -1500],
  ])
  const oy = track(t, [
    [67.8, 580],
    [68.4, 320],
    [68.9, 230],
    [69.4, 220],
    [70.2, 260],
    [71.0, tune('y71', 286)],
    [71.5, tune('y715', 270)],
    [71.7, 236],
    [71.75, 200],
    [71.77, 196],
    [71.8, 745],
    [71.95, 780],
  ])
  const rot = track(t, [
    [67.6, -1.35],
    [67.8, -1.25],
    [68.4, -0.3],
    [68.9, -0.05],
    [69.4, 0],
  ])
  return { s, ox, oy, rot }
}

/** 画网络（1280 坐标系下调用） */
export function drawNetworkWorld(ctx: CanvasRenderingContext2D, t: number) {
  const WORLD = getWorld()
  const { s, ox, oy, rot } = cam(t)
  ctx.save()
  ctx.translate(ox, oy)
  ctx.rotate(rot)
  ctx.scale(s, s)
  ctx.translate(-406, -260)
  const lw = 1 / s

  // 射线：67.6 起生长，70.6–71.3 淡出
  const grow = span(t, 67.6, 69.0, ease.outCubic)
  const fade = 1 - span(t, 70.2, 71.1)
  if (fade > 0 && grow > 0) {
    ctx.strokeStyle = `rgba(255,255,255,${0.22 * fade})`
    ctx.lineWidth = lw
    ctx.beginPath()
    for (const [x1, y1, x2, y2, d] of WORLD.rays) {
      const q = Math.min(1, Math.max(0, (grow - d * 0.5) / 0.5))
      if (q <= 0) continue
      ctx.moveTo(x1, y1)
      ctx.lineTo(x1 + (x2 - x1) * q, y1 + (y2 - y1) * q)
    }
    for (const [x1, y1, x2, y2] of WORLD.bits) {
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
    }
    ctx.stroke()
    ctx.fillStyle = `rgba(255,255,255,${fade})`
    WORLD.hubs.forEach(([x, y], i) => {
      ctx.beginPath()
      ctx.arc(x, y, (i === 1 ? 4 : 2.2) * lw, 0, Math.PI * 2)
      ctx.fill()
    })
  }

  // 城市小字：69.6 起逐个出现
  const mp = span(t, 69.5, 70.5)
  if (mp > 0) {
    ctx.font = `400 5.2px ${FONT.mono}`
    ctx.letterSpacing = '0.6px'
    WORLD.labels.forEach((L, i) => {
      if (((i * 0.6180339) % 1) > mp) return
      if (L.bar) {
        ctx.fillStyle = 'rgba(200,200,200,0.7)'
        ctx.fillRect(L.x, L.y - 3, 14, 3)
        return
      }
      ctx.fillStyle = i < WORLD.nReal ? 'rgba(235,235,235,0.9)' : 'rgba(190,190,190,0.75)'
      ctx.fillText(L.text, L.x, L.y)
    })
    ctx.letterSpacing = '0px'
  }

  // 标签
  ctx.font = `400 22px ${FONT.mono}`
  ctx.letterSpacing = '4.6px'
  ctx.fillStyle = '#fff'
  const ind = '_INDIVIDUAL'
  ctx.fillText(ind.slice(0, typed(ind, t, 67.65, 22).n), 406, 260)
  const dc = '_DATA CLUSTER'
  ctx.fillText(dc.slice(0, typed(dc, t, 68.65, 24).n), 770, 360)
  ctx.letterSpacing = '0px'

  ctx.restore()
}

export const s69Network: Scene = {
  id: 'wd1-069-global-network',
  start: 69.4,
  end: 71.92,
  note: '网络 → 美国城市地图 → _Global Network → 急推五大湖',
  render({ ctx, t }) {
    ref(ctx)
    drawNetworkWorld(ctx, t)
    // _Global Network：屏幕空间大字，70.3 起打字，71.4 后随推镜放大并移出
    const g = '_Global Network'
    const n = typed(g, t, 70.05, 22).n
    if (n > 0 && t < 71.8) {
      const size = track(t, [
        [71.0, 70],
        [71.4, 78],
        [71.7, 140],
        [71.78, 190],
      ])
      const x = track(t, [
        [71.0, 200],
        [71.4, 170],
        [71.7, -20],
        [71.78, -230],
      ])
      const y = track(t, [
        [71.0, 612],
        [71.4, 618],
        [71.7, 650],
        [71.78, 720],
      ])
      ctx.font = `500 ${size}px ${FONT.sans}`
      ctx.letterSpacing = `${-size * 0.025}px`
      ctx.fillStyle = '#fff'
      ctx.fillText(g.slice(0, n), x, y)
      ctx.letterSpacing = '0px'
    }
  },
}
