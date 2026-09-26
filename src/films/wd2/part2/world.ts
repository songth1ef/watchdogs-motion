/**
 * 82.75–94s：
 *  - 82.75–86.4 像素人脸：大脑被灰色方块盖住 → 方块重组成粗马赛克人脸 → 逐级变细 → INSURANCE / MEDICAL RECORDS 面板 → 人脸卡片急速远去
 *  - 84.0–94.0 数据宇宙 → 世界地图：成千上万个小数据块在纵深里漂浮（人脸卡片退入其中），
 *    87.5 起纵深逐渐压平，90.4 汇成世界地图的数据点，之后缓慢拉远、变暗。
 *
 * ASSET：世界地图轮廓 = CONTINENTS（手写的简化经纬度多边形），替换成真实 GeoJSON 投影即可。
 */
import type { FrameCtx, Scene } from '../../../engine/types'
import { clamp, ease, hash, lerp, rng, seg } from '../../../engine/math'
import { FONT, font } from '../../../fx/text'
import { WD2 } from '../../../theme'
import { brainCanvas } from './brain'
import { cachedCanvas, dataCard, faceTex, heart, mono } from './common'

// ---------------- 世界地图 ----------------
/** 简化大陆轮廓（经度, 纬度） */
const CONTINENTS: number[][] = [
  // 北美
  [-168, 65, -160, 70, -140, 70, -125, 72, -95, 72, -80, 73, -65, 62, -55, 52, -66, 45, -70, 41, -76, 35, -81, 31, -80, 25, -83, 29, -90, 30, -97, 27, -97, 22, -92, 18, -87, 21, -88, 15, -83, 9, -79, 8, -86, 12, -92, 15, -105, 20, -110, 24, -115, 30, -118, 34, -124, 40, -124, 48, -133, 56, -150, 60, -165, 60],
  // 格陵兰
  [-50, 60, -42, 60, -20, 70, -20, 80, -50, 82, -70, 78, -55, 70],
  // 南美
  [-80, 8, -72, 12, -60, 10, -50, 0, -35, -5, -38, -13, -48, -25, -58, -35, -65, -42, -68, -52, -74, -52, -72, -40, -71, -30, -70, -18, -76, -14, -81, -5, -80, 0],
  // 欧洲
  [-10, 36, -9, 43, -2, 44, -5, 48, 2, 51, 8, 54, 10, 58, 5, 62, 15, 69, 25, 71, 40, 68, 45, 60, 40, 45, 30, 45, 28, 41, 22, 37, 15, 38, 12, 44, 5, 43, 0, 38],
  // 英伦
  [-5, 50, 1, 51, 0, 53, -3, 58, -6, 56],
  // 亚洲
  [40, 68, 60, 70, 80, 73, 100, 77, 120, 73, 140, 72, 160, 70, 180, 68, 178, 62, 160, 60, 155, 52, 140, 48, 135, 35, 122, 30, 120, 22, 108, 20, 106, 10, 100, 13, 98, 8, 92, 20, 88, 22, 80, 15, 76, 8, 72, 20, 66, 25, 57, 25, 55, 27, 48, 30, 35, 35, 27, 40, 40, 45, 45, 60],
  // 阿拉伯
  [35, 30, 43, 13, 52, 15, 60, 22, 55, 26, 50, 30, 35, 33],
  // 非洲
  [-17, 15, -17, 21, -9, 32, 0, 36, 10, 37, 20, 32, 32, 31, 35, 28, 43, 12, 51, 11, 42, -2, 40, -15, 35, -25, 25, -34, 18, -34, 12, -18, 13, -5, 9, 4, -5, 5, -15, 10],
  // 马达加斯加
  [44, -25, 50, -15, 48, -13, 43, -20],
  // 澳洲
  [114, -22, 122, -18, 130, -12, 137, -12, 142, -11, 146, -19, 153, -28, 150, -37, 140, -38, 132, -32, 115, -34],
  // 东南亚岛屿
  [95, 5, 105, -6, 115, -8, 120, -10, 125, -8, 140, -3, 150, -6, 140, -9, 120, -5, 110, 2, 100, 2],
  // 日本
  [130, 31, 135, 34, 141, 38, 142, 44, 140, 42, 135, 36],
]
/** 投影：对照原片 92.5s（欧洲 50°N 在 y≈360，南美南端在 y≈900） */
const projX = (lon: number) => 1005 + (lon - 5) * 4.37
const projY = (lat: number) => 360 + (50 - lat) * 5.14

interface Pt {
  x: number
  y: number
  z: number
  sx: number
  sy: number
  w: number
  b: number
  kind: number
}
let pts: Pt[] | null = null
function worldPoints() {
  if (pts) return pts
  const mask = cachedCanvas('p2-worldmask', 1920, 1080, (c) => {
    c.fillStyle = '#fff'
    for (const poly of CONTINENTS) {
      c.beginPath()
      for (let i = 0; i < poly.length; i += 2) c.lineTo(projX(poly[i]), projY(poly[i + 1]))
      c.closePath()
      c.fill()
    }
  })
  const d = mask.getContext('2d')!.getImageData(0, 0, 1920, 1080).data
  const R = rng(90)
  const out: Pt[] = []
  let guard = 0
  while (out.length < 6500 && guard++ < 200000) {
    const x = R.range(150, 1850)
    const y = R.range(100, 1000)
    if (d[(Math.floor(y) * 1920 + Math.floor(x)) * 4 + 3] < 128) continue
    // 人口密集区（欧洲、印度、东亚、美东）更亮更密：用简单权重
    out.push({
      x,
      y,
      z: (R.next() + R.next() + R.next() - 1.5) * 2,
      sx: R.range(-1, 1),
      sy: R.range(-1, 1),
      w: R.range(2, 9),
      b: R.range(0.35, 1),
      kind: R.chance(0.04) ? 2 : R.chance(0.3) ? 1 : 0,
    })
  }
  pts = out
  return out
}

const zoomAt = (t: number) => {
  const k: [number, number][] = [[84, 4.2], [86, 2.3], [88.5, 1.5], [92.2, 1.03], [94, 0.96]]
  for (let i = 0; i < k.length - 1; i++)
    if (t <= k[i + 1][0]) return lerp(k[i][1], k[i + 1][1], ease.inOutCubic(clamp((t - k[i][0]) / (k[i + 1][0] - k[i][0]))))
  return 0.94
}

function renderWorld(f: FrameCtx) {
  const { ctx, t } = f
  const P = worldPoints()
  const zoom = zoomAt(t)
  const scatter = 1 - ease.inOutCubic(seg(t, 89.0, 92.2))
  const worldPhase = seg(t, 91.2, 92.6)
  const fadeIn = seg(t, 84, 84.8)
  const cx = 960
  const cy = lerp(600, 540, seg(t, 84, 90))
  const drift = (t - 84) * 0.05
  let cards = 0
  for (let i = 0; i < P.length; i++) {
    const p = P[i]
    const zz = p.z * scatter * 0.9
    const pf = 1 / Math.max(0.15, 1 - zz * 0.4)
    const ox = (p.x - 960 + p.sx * 700 * scatter) * zoom * pf
    const oy = (p.y - 560 + p.sy * 420 * scatter) * zoom * pf
    const x = cx + ox * Math.cos(drift * scatter) - oy * Math.sin(drift * scatter) * 0.2
    const y = cy + oy
    if (x < -50 || x > 1970 || y < -50 || y > 1130) continue
    const sc = Math.pow(zoom, 0.6) * pf
    const a = fadeIn * p.b * lerp(0.95, 0.38, worldPhase)
    if (p.kind === 2 && sc > 1.6 && cards < 60) {
      cards++
      dataCard(ctx, i, x, y, 26 * sc, a)
      continue
    }
    const w = p.w * sc * lerp(1, 0.55, worldPhase)
    const h = Math.max(1.2, (p.kind === 1 ? 0.8 : 0.35) * w)
    ctx.fillStyle = worldPhase > 0 ? `rgba(${Math.round(lerp(235, 185, worldPhase))},${Math.round(lerp(235, 215, worldPhase))},${Math.round(lerp(235, 240, worldPhase))},${a})` : `rgba(235,235,235,${a})`
    ctx.fillRect(x, y, w, h)
  }
  // 世界地图段：陆地上一层极淡的青色网格感
  if (worldPhase > 0) {
    ctx.fillStyle = 'rgba(0,0,0,0.9)'
    ctx.globalCompositeOperation = 'destination-over'
    ctx.fillRect(0, 0, 1920, 1080)
    ctx.globalCompositeOperation = 'source-over'
  }
  // 86.8–88.3 红色细框
  const ra = seg(t, 84.8, 85.2) * (1 - seg(t, 87.9, 88.4))
  if (ra > 0) {
    ctx.strokeStyle = `rgba(224,36,43,${0.55 * ra})`
    ctx.lineWidth = 1.5
    const s = lerp(1.0, 0.8, seg(t, 85, 88))
    ctx.strokeRect(960 - 620 * s, 540 - 480 * s, 1240 * s, 960 * s)
    ctx.strokeRect(960 - 380 * s, 540 - 180 * s, 760 * s, 360 * s)
    ctx.beginPath()
    ctx.moveTo(960 - 900 * s, 540 - 180 * s)
    ctx.lineTo(960 + 900 * s, 540 - 180 * s)
    ctx.stroke()
  }
  // 88.3 附近的大号 IP 数字
  const ipA = seg(t, 88.9, 89.1) * (1 - seg(t, 89.4, 89.6))
  if (ipA > 0) mono(ctx, '202.56.818', 1150, 250, 30, `rgba(200,200,200,${0.7 * ipA})`, 4)
}

// ---------------- 像素人脸 ----------------
const lumCache = new Map<HTMLCanvasElement, Uint8ClampedArray>()
function lum(tex: HTMLCanvasElement, i: number, j: number) {
  let d = lumCache.get(tex)
  if (!d) {
    d = tex.getContext('2d')!.getImageData(0, 0, tex.width, tex.height).data
    lumCache.set(tex, d)
  }
  return d[(j * tex.width + i) * 4] / 255
}
const FACE_SEED = 1905
function cardW(t: number) {
  if (t < 83.45) return 1300
  if (t < 83.9) return lerp(1300, 900, ease.outCubic(seg(t, 83.45, 83.9)))
  const u = seg(t, 83.85, 86.3)
  return 936 * Math.exp(Math.log(28 / 936) * Math.pow(u, 1.7))
}

function renderFace(f: FrameCtx) {
  const { ctx, t } = f
  // 大脑残影
  const bA = 1 - seg(t, 82.95, 83.25)
  // 82.95 之前大脑由 brain.ts 自己画，这里只接着画淡出的残影
  if (bA > 0 && t >= 82.95) {
    const s = 0.54
    ctx.globalAlpha = bA
    ctx.drawImage(brainCanvas(), 960 - 650 * s, 430 - 650 * s, 1300 * s, 1300 * s)
    ctx.globalAlpha = 1
  }
  const w = cardW(t)
  const cx = lerp(980, 962, seg(t, 83.8, 86))
  const cy = lerp(640, 545, seg(t, 83.4, 86))
  const x0 = cx - w / 2
  const y0 = cy - w / 2
  // 人脸本体：分辨率随时间变细
  const res = t < 82.95 ? 5 : t < 83.22 ? 8 : t < 83.5 ? 12 : t < 83.68 ? 20 : 40
  const tex = faceTex(FACE_SEED, res, true)
  const cell = w / res
  ctx.imageSmoothingEnabled = false
  if (t < 83.22) {
    // 灰块逐个飞入：先盖在大脑上，再落位
    const R = rng(83)
    for (let j = 0; j < res; j++)
      for (let i = 0; i < res; i++) {
        const tt = 82.78 + R.next() * 0.38
        if (t < tt || lum(tex, i, j) < 0.12) continue
        const land = seg(t, tt + 0.05, tt + 0.14)
        const dy = (1 - land) * R.range(-1, 2.5) * cell * 0.6
        const dx = (1 - land) * R.range(-1, 1) * cell * 0.4
        ctx.drawImage(tex, i, j, 1, 1, x0 + i * cell + dx, y0 + j * cell + dy, cell - 1, cell - 1)
      }
  } else if (res <= 20) {
    // 粗马赛克阶段：只画亮的格子，黑底格子留空（原片此时没有底色）
    for (let j = 0; j < res; j++)
      for (let i = 0; i < res; i++) {
        if (lum(tex, i, j) < 0.12) continue
        ctx.drawImage(tex, i, j, 1, 1, x0 + i * cell, y0 + j * cell, cell, cell)
      }
  } else {
    ctx.drawImage(tex, x0, y0, w, w)
    // 马赛克格缝（原片格子之间有细暗线）
    if (res <= 16) {
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let i = 1; i < res; i++) {
        ctx.moveTo(x0 + i * cell, y0)
        ctx.lineTo(x0 + i * cell, y0 + w)
        ctx.moveTo(x0, y0 + i * cell)
        ctx.lineTo(x0 + w, y0 + i * cell)
      }
      ctx.stroke()
    }
  }
  ctx.imageSmoothingEnabled = true
  // 卡片边框（83.3 起）
  const frA = seg(t, 83.22, 83.32)
  if (frA > 0) {
    ctx.strokeStyle = `rgba(230,230,230,${0.8 * frA})`
    ctx.lineWidth = Math.max(1, w / 500)
    ctx.strokeRect(x0, y0, w, w)
  }
  // INSURANCE 面板
  if (t > 83.75) {
    const pw = w * 0.4
    const px = x0 + w + w * 0.02
    const py = y0
    const u = pw / 100
    ctx.fillStyle = 'rgba(6,6,6,0.9)'
    ctx.fillRect(px, py, pw, w * 0.52)
    ctx.strokeStyle = 'rgba(220,220,220,0.7)'
    ctx.lineWidth = Math.max(1, u * 0.4)
    ctx.strokeRect(px, py, pw, w * 0.52)
    ctx.fillStyle = '#f0f0f0'
    ctx.fillRect(px, py, pw, 6 * u)
    if (u > 1.2) mono(ctx, 'INSURANCE', px + 2 * u, py + 4.8 * u, 4.4 * u, '#111', 0.3 * u)
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = 'rgba(200,200,200,0.5)'
      ctx.fillRect(px + 6 * u, py + 18 * u + i * 8 * u, 25 * u, 1.2 * u)
      ctx.fillRect(px + 45 * u, py + 18 * u + i * 8 * u, (15 + hash(i) * 35) * u, 1.2 * u)
    }
    ctx.fillStyle = 'rgba(200,200,200,0.8)'
    ctx.fillRect(px + 40 * u, py + 88 * u, 40 * u, 3 * u)
    if (t > 84.0) {
      ctx.fillStyle = WD2.red
      ctx.fillRect(px, py + w * 0.52 - 12 * u, pw, 5 * u)
      if (u > 1.2) mono(ctx, 'MEDICAL RECORDS', px + 2 * u, py + w * 0.52 - 8 * u, 4 * u, '#fff', 0.3 * u)
    }
    if (t > 84.35) {
      ctx.fillStyle = WD2.red
      heart(ctx, px + 8 * u, py + w * 0.52 + 12 * u, 4 * u)
      ctx.strokeStyle = 'rgba(200,200,200,0.6)'
      ctx.strokeRect(px + 16 * u, py + w * 0.52 + 6 * u, 45 * u, 12 * u)
      font(ctx, 9 * u, 400, FONT.mono)
      ctx.fillStyle = 'rgba(160,160,160,0.8)'
      ctx.fillText('30', px + 20 * u, py + w * 0.52 + 16 * u)
    }
  }
  // 84.3 起从卡片角上拉出的青色网线
  const la = seg(t, 84.3, 84.6)
  if (la > 0) {
    ctx.strokeStyle = `rgba(63,182,196,${0.5 * la})`
    ctx.lineWidth = 1.2
    ctx.beginPath()
    const R = rng(84)
    for (let i = 0; i < 5; i++) {
      const hx = x0 + w * R.range(0.6, 1.5)
      const hy = y0 + w * R.range(0.3, 1.1)
      ctx.moveTo(x0 + w, y0 + w)
      ctx.lineTo(hx + R.range(200, 900), hy + R.range(-200, 200))
      ctx.moveTo(x0, y0 + w)
      ctx.lineTo(hx - R.range(900, 1600), hy + R.range(-100, 300))
    }
    ctx.stroke()
  }
}

export const worldScenes: Scene[] = [
  {
    id: 'wd2-084-universe-world',
    start: 84,
    // 平移 0.07s 后结束于 94.2（原片 94.2 硬切）
    end: 94.13,
    note: '数据宇宙：数千个小数据块在纵深里漂浮，87.4–90.4 压平汇成世界地图数据点，之后缓慢拉远变暗',
    render: renderWorld,
  },
  {
    id: 'wd2-082-pixel-face',
    start: 82.75,
    end: 86.4,
    note: '灰色方块盖住大脑并重组成马赛克人脸，逐级变细；INSURANCE / MEDICAL RECORDS 面板；人脸卡片急速退入数据宇宙',
    render: renderFace,
  },
]
