/**
 * 31.45–43s：「64 billion」卫星图闪切 → 旧金山湾区（GREATER SAN FRANCISCO BAY AREA + 航班）
 * → 旧金山半岛网络图 + 红色锯齿边界（more secure / more invasive system.）→ 3D 竖条 → 声波 → 暗网格。
 */
import type { Scene } from '../../../engine/types'
import { ease, lerp, seg } from '../../../engine/math'
import { pixelate } from '../../../fx/image'
import { layer } from '../../../fx/canvas'
import { FONT, font, tracking } from '../../../fx/text'
import { WD2 } from '../../../theme'
import { cached, dashLine, fbm, fr, h2, makeCanvas, numLabel, plane, wordReveal } from './lib'
import { cityMapTexture } from './ctos-city'
import { bayTerrain, geo, hasBayTerrain, hasGeo } from '../../../assets/geo'
import { drawLayer, drawRaster, drawWater, ROAD_FILTERS, toScreen, viewAt, type MapView } from '../../../assets/geo-draw'
import { tune } from './tune'

// ───────────────────────── V2 真实湾区底图 ─────────────────────────

/**
 * V2：湾区真实底图（离屏大图，bay 区域米制坐标，30 m/px）：
 *   USGS 晕渲（山地灰）→ OSM 陆地面外涂黑（水面）→ 旧金山半岛全等级道路 + 湾区主干道（白色细线叠出城区亮网格，近似夜间卫星图的城市灯光）。
 * 每帧只用 drawRaster 按 MapView 贴一次，推拉不重建。
 */
const REAL_MPP = 30
function realBayMap(): { canvas: HTMLCanvasElement; rect: [number, number, number, number] } {
  return cached(`wd2p1:bayReal:${tune('bayHill', 0.3)}:${tune('bayDot', 0.7)}:${tune('bayLight', 0.9)}`, () => {
    const rect = geo('bay').rect
    const [x0, y0, x1, y1] = rect
    const W = Math.ceil((x1 - x0) / REAL_MPP)
    const H = Math.ceil((y1 - y0) / REAL_MPP)
    const { canvas, ctx } = makeCanvas(W, H)
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, W, H)
    const v: MapView = { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, scale: 1 / REAL_MPP, rot: 0, ox: W / 2, oy: H / 2 }
    const T = bayTerrain()
    ctx.filter = `brightness(${tune('bayHill', 0.3)}) contrast(1.4)`
    drawRaster(ctx, T.hillshade, T.rect, v, 1)
    ctx.filter = 'none'
    drawWater(ctx, 'bay', v, '#000')
    // 城区灯光：道路先画到单独一层，再用随机点阵 destination-in 打散成「灯点」，比实线更像夜间卫星图
    const lights = makeCanvas(W, H)
    const lg = lights.ctx
    // sf 全等级道路（sf 与 bay 原点不同，转成 bay 坐标系下的视图）
    if (hasGeo('sf')) {
      const sf = geo('sf')
      const [lon0, lat0] = sf.toLonLat(0, 0)
      const [bx, by] = geo('bay').toLocal(lon0, lat0)
      const vs: MapView = { ...v, cx: v.cx - bx, cy: v.cy - by }
      drawLayer(lg, 'sf', 'roads', vs, { stroke: '#fff', width: 1.6 })
    }
    drawLayer(lg, 'bay', 'roads', v, { stroke: '#fff', width: 2.2 })
    const dots = makeCanvas(256, 256)
    const dd = dots.ctx.createImageData(256, 256)
    for (let i = 0; i < 256 * 256; i++) {
      const on = h2(i & 255, i >> 8, 77) < tune('bayDot', 0.7)
      dd.data[i * 4] = dd.data[i * 4 + 1] = dd.data[i * 4 + 2] = 255
      dd.data[i * 4 + 3] = on ? 150 + h2(i, 3, 78) * 105 : 0
    }
    dots.ctx.putImageData(dd, 0, 0)
    lg.globalCompositeOperation = 'destination-in'
    lg.fillStyle = lg.createPattern(dots.canvas, 'repeat')!
    lg.fillRect(0, 0, W, H)
    ctx.globalAlpha = tune('bayLight', 0.9)
    ctx.drawImage(lights.canvas, 0, 0)
    ctx.globalAlpha = 1
    return { canvas, rect }
  })
}
const hasRealBay = () => hasGeo('bay') && hasBayTerrain()

/** 湾区镜头的真实视图：远景 33.4–34.2、推近 34.2–36.9（参数由参考帧金门/雷耶斯角/海洋滩/内河码头量出后再用评分微调） */
function bayView(t: number): MapView {
  const g = geo('bay')
  if (t < 34.2) {
    const k = seg(t, 33.4, 34.2)
    return viewAt(g, tune('fLon', -122.44), tune('fLat', 37.695), tune('fS', 0.0129) * (1 + 0.03 * k), tune('fRot', -0.06))
  }
  const k = seg(t, 34.2, 36.9)
  return viewAt(g, tune('nLon', -122.46) + 0.01 * k, tune('nLat', 37.7475) - 0.005 * k, tune('nS', 0.027) * (1 + 0.1 * k), tune('nRot', 0))
}

// ───────────────────────── 64 billion ─────────────────────────

/** 闪切用的卫星城市切片：[起始秒, 纹理 seed, 街网角度, 染色] */
const FLASH: [number, number, number, string | null][] = [
  [31.45, 1, 0.3, 'teal'],
  [31.6, 2, 0.1, 'magenta'],
  [31.7, 3, -0.4, null],
  [31.95, 4, 0.2, null],
  [32.1, 5, 0.0, null],
  [32.2, 6, 0.6, 'magenta'],
  [32.3, 7, -0.2, 'lime'],
  [32.4, 8, 0.35, null],
  [32.5, 9, 0.05, null],
  [32.6, 10, -0.5, null],
  [32.75, 11, 0.2, null],
  [32.9, 12, 0.45, null],
  [33.05, 13, -0.1, null],
  [33.2, 14, 0.25, null],
]

/**
 * ASSET 城市卫星切片：复用俯拍芝加哥街道地图（cityMapTexture），按 seed 取不同位置/角度/亮度。
 * 替换：按 seed 返回真实卫星图块。
 */
/**
 * V2：真实城市切片 = 旧金山市中心 OSM 建筑（屋顶按 id 哈希给不同灰度，街道留黑，像俯拍航拍）+ 淡色道路，
 * 离屏 2400×2400（约 1.2 m/px 视野 2.9 km）；每个 seed 取不同中心/角度/亮度。sf 数据缺失时回退到 V1 芝加哥街道图。
 */
function realCityTile() {
  return cached(`wd2p1:cityTileReal:${tune('ctLon', -122.41)}:${tune('ctLat', 37.788)}:${tune('ctS', 0.3)}:${tune('ctG', 30)}`, () => {
    const { canvas, ctx } = makeCanvas(2400, 2400)
    ctx.fillStyle = '#0c0c0c'
    ctx.fillRect(0, 0, 2400, 2400)
    const v = viewAt(geo('sf'), tune('ctLon', -122.41), tune('ctLat', 37.788), tune('ctS', 0.3), 0, 1200, 1200)
    // 分 6 档灰度画建筑，模拟屋顶明暗
    for (let k = 0; k < 6; k++) {
      const g = tune('ctG', 30) + k * 22
      drawLayer(ctx, 'sf', 'buildings', v, { fill: `rgb(${g},${g},${g})`, filter: (_c, i) => i % 6 === k, filterKey: `tile${k}` })
    }
    drawLayer(ctx, 'sf', 'buildings', v, { stroke: 'rgba(0,0,0,0.6)', width: 0.8 })
    // 航拍颗粒：屋顶细节/阴影噪点
    const img = ctx.getImageData(0, 0, 2400, 2400)
    const d = img.data
    for (let i = 0; i < d.length; i += 4) {
      const n = (h2(i >> 2, 5, 79) - 0.5) * 60 * (d[i] > 20 ? 1 : 0.3)
      d[i] = d[i + 1] = d[i + 2] = Math.max(0, Math.min(255, d[i] + n))
    }
    ctx.putImageData(img, 0, 0)
    drawLayer(ctx, 'sf', 'roads', v, { stroke: 'rgba(200,200,200,0.12)', width: 1.5, filter: ROAD_FILTERS.major, filterKey: 'major' })
    return canvas
  })
}

function drawCityTile(ctx: CanvasRenderingContext2D, seed: number, angle: number, z: number) {
  const real = hasGeo('sf')
  const tex = real ? realCityTile() : cityMapTexture()
  ctx.save()
  ctx.filter = real ? `brightness(${0.9 + h2(seed, 1, 7) * 0.5}) contrast(1.2)` : `brightness(${1.6 + h2(seed, 1, 7) * 1.2}) contrast(1.3)`
  ctx.translate(960, 540)
  ctx.rotate(angle)
  ctx.scale(z * (1.1 + h2(seed, 2, 7) * 0.8), z * (1.1 + h2(seed, 2, 7) * 0.8))
  if (real) ctx.translate(-(1200 + (h2(seed, 3, 7) - 0.5) * 500), -(1200 + (h2(seed, 4, 7) - 0.5) * 500))
  else ctx.translate(-(700 + h2(seed, 3, 7) * 700), -(900 + h2(seed, 4, 7) * 700))
  ctx.drawImage(tex, 0, 0)
  ctx.restore()
}

function tint(ctx: CanvasRenderingContext2D, kind: string | null) {
  if (!kind) return
  ctx.save()
  ctx.globalCompositeOperation = 'multiply'
  ctx.fillStyle = kind === 'teal' ? '#2aa6d8' : kind === 'magenta' ? '#e0206e' : '#a8d23a'
  ctx.fillRect(0, 0, 1920, 1080)
  ctx.restore()
}

export const sixtyFourBillion: Scene = {
  id: 'wd2-031.45-64-billion',
  start: 31.45,
  end: 33.45,
  note: 'ASSET 城市卫星切片每 0.1–0.25s 硬切（偶尔青/品红/黄绿染色、局部方块替换）+ 数值小标签；"64" 32.0 起切条故障出现，"billion" 32.2 起逐块拼出',
  render({ ctx, t }) {
    const f = fr(t)
    let k = 0
    for (let i = 0; i < FLASH.length; i++) if (t >= FLASH[i][0]) k = i
    const [, seed, ang, tn] = FLASH[k]
    const lt = t - FLASH[k][0]
    drawCityTile(ctx, seed, ang, 1.0 + lt * 0.25)
    // 方块替换：几块区域换成上一张切片（原片的「马赛克拼贴」感）
    const [, ps, pa] = FLASH[Math.max(0, k - 1)]
    for (let i = 0; i < 6; i++) {
      if (h2(i, k, 21) < 0.4) continue
      const bx = Math.floor(h2(i, k, 22) * 8) * 240
      const by = Math.floor(h2(i, k, 23) * 5) * 216
      ctx.save()
      ctx.beginPath()
      ctx.rect(bx, by, 240, 216)
      ctx.clip()
      drawCityTile(ctx, ps, pa, 1.1)
      ctx.restore()
    }
    tint(ctx, tn)
    ctx.fillStyle = 'rgba(0,0,0,0.25)'
    ctx.fillRect(0, 0, 1920, 1080)
    for (let i = 0; i < 12; i++)
      numLabel(ctx, h2(i, k, 31) * 1800, 60 + h2(i, k, 32) * 960, (100 + h2(i, k, 33) * 899).toFixed(2), 16)
    // 大字
    const draw64 = t > 31.7
    const billionP = seg(t, 32.2, 32.65)
    ctx.save()
    font(ctx, 350, 700, FONT.sans)
    tracking(ctx, -22)
    ctx.fillStyle = WD2.fg
    ctx.textAlign = 'right'
    const glitchy = t < 32.5
    const dx = glitchy && h2(f, 1, 41) < 0.5 ? (h2(f, 2, 41) - 0.5) * 60 : 0
    if (draw64) {
      if (t < 32.0) {
        // 只露出若干横条
        for (let i = 0; i < 6; i++) {
          if (h2(i, f, 42) < 0.5) continue
          const y = 250 + h2(i, 3, 42) * 270
          ctx.save()
          ctx.beginPath()
          ctx.rect(0, y, 1920, 20 + h2(i, 4, 42) * 60)
          ctx.clip()
          ctx.fillText('64', 1712 + dx, 520)
          ctx.restore()
        }
      } else ctx.fillText('64', 1712 + dx, 520)
    }
    if (billionP > 0) {
      const w = ctx.measureText('billion').width
      const x0 = 1700 - w
      ctx.textAlign = 'left'
      // 逐块拼出：按列分块，已出现的块显示字形
      ctx.save()
      ctx.beginPath()
      const cols = 10
      for (let c = 0; c < cols; c++)
        for (let r = 0; r < 3; r++) if (h2(c, r, 43) < billionP * 1.25 - (c / cols) * 0.3) ctx.rect(x0 + (c * w) / cols - 2, 480 + r * 100, w / cols + 4, 104)
      ctx.clip()
      ctx.fillText('billion', x0 - dx * 0.5, 752)
      ctx.restore()
    }
    ctx.restore()
    tracking(ctx, 0)
  },
}

// ───────────────────────── 湾区地形图 ─────────────────────────

const BAY_W = 2400
const BAY_H = 1600

/** 湾区水域：左侧太平洋 + 中间斜向的旧金山湾 */
function bayWater(x: number, y: number) {
  const coast = 520 + y * 0.28 + Math.sin(y / 140) * 40 + (fbm(x / 60, y / 60, 5, 2) - 0.5) * 50
  if (x < coast) return true
  // 湾：沿 (900,300)→(1700,1400) 的狭长带
  const u = ((x - 900) * 0.59 + (y - 300) * 0.81) / 1
  const v = (x - 900) * 0.81 - (y - 300) * 0.59
  const width = 60 + Math.sin(u / 200) * 30 + (fbm(x / 50, y / 50, 6, 2) - 0.5) * 60
  return u > -200 && u < 1400 && Math.abs(v - 60) < width
}

/**
 * ASSET 湾区夜间卫星地形：暗灰山地（分形噪声）+ 沿海岸线的高亮城区颗粒 + 黑色水域。
 * 替换：返回一张 2400×1600 的真实湾区卫星图。
 */
export function bayTexture() {
  return cached('wd2p1:bay', () => {
    const { canvas, ctx } = makeCanvas(BAY_W, BAY_H)
    const img = ctx.createImageData(BAY_W, BAY_H)
    const d = img.data
    for (let y = 0; y < BAY_H; y++)
      for (let x = 0; x < BAY_W; x++) {
        const i = (y * BAY_W + x) * 4
        let v: number
        if (bayWater(x, y)) v = 3
        else {
          const hill = fbm(x / 180, y / 180, 9, 5)
          // 山脊：两个尺度的 |噪声-0.5| 取反再高次幂 → 细锐的山脊亮线
          const r1 = 1 - Math.abs(fbm(x / 90, y / 90, 10, 4) - 0.5) * 2
          const r2 = 1 - Math.abs(fbm(x / 30, y / 30, 15, 3) - 0.5) * 2
          v = 2 + hill * 10 + Math.pow(r1, 8) * 50 + Math.pow(r2, 6) * 20
          // 靠近水的平地是城区：亮颗粒
          const near = (bayWater(x + 36, y) || bayWater(x - 36, y) || bayWater(x, y + 36) || bayWater(x, y - 36)) && fbm(x / 40, y / 40, 14, 2) > 0.4
          const urban = near || fbm(x / 90, y / 90, 11, 3) > 0.7
          if (urban && h2(x >> 1, y >> 1, 12) < 0.35) v = 60 + h2(x, y, 13) * 195
        }
        d[i] = d[i + 1] = d[i + 2] = v
        d[i + 3] = 255
      }
    ctx.putImageData(img, 0, 0)
    return canvas
  })
}

/** 地图坐标 → 屏幕的相机（旋转 + 缩放 + 中心） */
function bayCam(t: number) {
  const zoomed = t >= 34.2
  const k = zoomed ? seg(t, 34.2, 36.9) : seg(t, 33.4, 34.2)
  return zoomed
    ? { cx: lerp(1000, 990, k), cy: lerp(720, 740, k), s: lerp(1.05, 1.15, k), rot: -0.08 }
    : { cx: lerp(1150, 1160, k), cy: lerp(800, 790, k), s: lerp(0.85, 0.88, k), rot: -0.1 }
}

function applyCam(ctx: CanvasRenderingContext2D, c: { cx: number; cy: number; s: number; rot: number }) {
  ctx.translate(960, 540)
  ctx.rotate(c.rot)
  ctx.scale(c.s, c.s)
  ctx.translate(-c.cx, -c.cy)
}

/** 斜排大字 GREATER / SAN FRANCISCO / BAY AREA（空心描边等宽字） */
function bayTitle(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, alpha: number) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(-0.36)
  ctx.globalAlpha = alpha
  font(ctx, size, 400, FONT.mono)
  tracking(ctx, size * 0.08)
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'
  ctx.lineWidth = Math.max(1, size / 30)
  ctx.strokeText('GREATER', size * 1.4, 0)
  ctx.strokeText('SAN FRANCISCO', 0, size * 1.02)
  ctx.strokeText('BAY  AREA', size * 1.25, size * 2.04)
  tracking(ctx, 0)
  ctx.restore()
}

function zoneLabel(ctx: CanvasRenderingContext2D, x: number, y: number, name: string, p: number) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(-0.36)
  ctx.globalAlpha = p
  font(ctx, 26, 400, FONT.mono)
  tracking(ctx, 3)
  ctx.strokeStyle = 'rgba(255,255,255,0.7)'
  ctx.lineWidth = 1
  ctx.strokeText(name, 0, 0)
  font(ctx, 13, 400, FONT.mono)
  ctx.fillStyle = 'rgba(255,255,255,0.6)'
  ctx.fillText('ZONE W-03', 80, 22)
  ctx.fillStyle = 'rgba(224,36,43,0.8)'
  ctx.fillText('AF 8868 18', 88, 38)
  tracking(ctx, 0)
  ctx.restore()
  // 青色饼图小图标
  ctx.save()
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  ctx.beginPath()
  ctx.arc(x + 300, y - 110, 11, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = WD2.sky
  ctx.beginPath()
  ctx.moveTo(x + 300, y - 110)
  ctx.arc(x + 300, y - 110, 11, -Math.PI / 2, -Math.PI / 2 + 4.2 * p)
  ctx.fill()
  ctx.restore()
}

export const bayArea: Scene = {
  id: 'wd2-033.4-bay-area',
  start: 33.4,
  end: 37.0,
  note: 'ASSET 湾区卫星地形；33.4 远景 + 斜排空心字 GREATER SAN FRANCISCO BAY AREA；34.2 硬切推近（像素块过渡），红色航班+虚线、灰色网络细线、SAN FRANCISCO/SAN MATEO 区域标签；36.75 起大像素化溶解',
  render({ ctx, t }) {
    const c = bayCam(t)
    const real = hasRealBay()
    const draw = (l: CanvasRenderingContext2D) => {
      if (real) {
        const m = realBayMap()
        drawRaster(l, m.canvas, m.rect, bayView(t), 1)
        return
      }
      l.save()
      applyCam(l, c)
      l.drawImage(bayTexture(), 0, 0)
      l.restore()
    }
    const cut = t >= 34.2
    const blockIn = cut ? Math.round(lerp(60, 1, ease.outCubic(seg(t, 34.2, 34.55)))) : 1
    const blockOut = Math.round(lerp(1, 70, ease.inCubic(seg(t, 36.7, 37.0))))
    const block = Math.max(blockIn, blockOut)
    if (block > 1) {
      const img = layer(ctx, 'wd2p1-bay', draw, { alpha: 0 })
      pixelate(ctx, img, 0, 0, 1920, 1080, block)
    } else draw(ctx)
    ctx.fillStyle = 'rgba(0,0,0,0.12)'
    ctx.fillRect(0, 0, 1920, 1080)
    const fadeOut = 1 - seg(t, 36.7, 36.95)
    if (!cut) {
      bayTitle(ctx, 1010, 590, 30, seg(t, 33.5, 33.7))
      numLabel(ctx, 1560, 870, '343.74', 18)
      numLabel(ctx, 1720, 930, '826.22', 16)
      numLabel(ctx, 1780, 985, '124.08', 18)
      numLabel(ctx, 1840, 870, '491.20', 16)
      return
    }
    ctx.save()
    ctx.globalAlpha = fadeOut
    bayTitle(ctx, 1290, 470, 72, 1)
    // 灰色网络细线（从半岛上的点放射）
    ctx.strokeStyle = 'rgba(200,210,215,0.35)'
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let i = 0; i < 18; i++) {
      const ax = 700 + h2(i, 1, 51) * 400
      const ay = 420 + h2(i, 2, 51) * 450
      ctx.moveTo(ax, ay)
      ctx.lineTo(900 + h2(i, 3, 51) * 1000, 350 + h2(i, 4, 51) * 800)
    }
    ctx.stroke()
    // 红色经线 + 航线
    dashLine(ctx, 440, 0, 480, 1080, { color: 'rgba(224,36,43,0.7)', width: 2, dash: [18, 12] })
    dashLine(ctx, 0, 250, 1920, 180, { color: 'rgba(224,36,43,0.6)', width: 2, dash: [10, 8] })
    dashLine(ctx, 900, 480, 1920, 740, { color: 'rgba(224,36,43,0.5)', width: 1.5, dash: [10, 8] })
    const lt = t - 34.2
    plane(ctx, 460 + lt * 6, 620 - lt * 22, 90, -1.2)
    plane(ctx, 900 + lt * 18, 245 - lt * 2, 44, -0.05)
    plane(ctx, 1220 + lt * 14, 560 + lt * 3, 36, 0.3)
    font(ctx, 13, 400, FONT.mono)
    ctx.fillStyle = 'rgba(224,36,43,0.9)'
    ctx.fillText('AF 3868 18', 540, 670)
    ctx.fillStyle = '#fff'
    ctx.fillRect(520, 660, 12, 12)
    zoneLabel(ctx, 660, 820, 'SAN FRANCISCO', seg(t, 35.0, 35.3))
    zoneLabel(ctx, 1260, 720, 'SAN MATEO', seg(t, 36.0, 36.3))
    const labels: [number, number, string][] = [[1000, 115, '494.21'], [1210, 335, '166.20'], [1340, 335, '906.47'], [880, 440, '464.11'], [1010, 875, '828.23'], [1450, 990, '945.59'], [1730, 110, '740.96']]
    for (const [x, y, s] of labels) numLabel(ctx, x, y, s, 17)
    ctx.restore()
  },
}

// ───────────────────────── 旧金山半岛网络 + 红色锯齿边界 ─────────────────────────

/** 半岛轮廓（屏幕坐标，37.0 时刻的构图） */
const PEN_V1: [number, number][] = [
  [140, 170], [330, 130], [520, 120], [720, 160], [900, 220], [1050, 300], [1180, 430], [1300, 520], [1340, 600], [1290, 700],
  [1200, 760], [1160, 900], [1100, 1080], [100, 1080], [60, 860], [40, 620], [70, 400],
]

/**
 * V2：半岛镜头 37.0 构图下的真实视图——旧金山市区，顺时针转约 15°（北指右上），约 98 px/km。
 * 由 38.0s 参考帧的 Fort Point（金门桥南端）/ 渡轮大厦 / Lands End 三点量出。
 */
const penView = (): MapView => viewAt(geo('sf'), tune('pLon', -122.434), tune('pLat', 37.786), tune('pS', 0.1), tune('pRot', 0.45))
const hasRealPen = () => hasGeo('sf')

/** 真实海岸轮廓（屏幕坐标）：sf 陆地面里屏幕上最大的环，只保留画面附近那一段，抽稀到 ~220 点 */
function realPen(): [number, number][] {
  return cached(`wd2p1:penReal:${tune('pLon', -122.434)}:${tune('pLat', 37.786)}:${tune('pS', 0.1)}:${tune('pRot', 0.45)}`, () => {
    const L = geo('sf').layers.land!
    const v = penView()
    let best: [number, number][] = []
    for (let r = 0; r + 1 < L.ringStart.length; r++) {
      const a = L.ringStart[r]
      const b = L.ringStart[r + 1]
      // 找连续落在画面附近的最长一段
      let run: [number, number][] = []
      for (let k = a; k < b; k++) {
        const [x, y] = toScreen(v, L.xy[2 * k], L.xy[2 * k + 1])
        if (x > -300 && x < 2220 && y > -300 && y < 1380) run.push([x, y])
        else {
          if (run.length > best.length) best = run
          run = []
        }
      }
      if (run.length > best.length) best = run
    }
    const step = Math.max(1, Math.floor(best.length / 220))
    const out = best.filter((_, i) => i % step === 0)
    return out
  })
}
const PEN_REAL_CACHE: { pts: [number, number][] | null } = { pts: null }
function PENS(): [number, number][] {
  if (!hasRealPen()) return PEN_V1
  return (PEN_REAL_CACHE.pts = realPen())
}

function penPath(ctx: CanvasRenderingContext2D, grow = 0) {
  ctx.beginPath()
  PENS().forEach(([x, y], i) => {
    const cx = 700
    const cy = 620
    const px = cx + (x - cx) * (1 + grow)
    const py = cy + (y - cy) * (1 + grow)
    if (i) ctx.lineTo(px, py)
    else ctx.moveTo(px, py)
  })
  ctx.closePath()
}

/**
 * V2 真实旧金山街区（37.0 构图的屏幕坐标，2 倍分辨率）：暗色陆地 + OSM 建筑（灰白块，市中心最密）
 * + 小街暗青、主干道亮青 + 高速白线。
 */
function realPenTexture() {
  return cached(`wd2p1:penTexReal:${tune('pMinor', 0.3)}:${tune('pMajor', 0.5)}:${tune('pBld', 0.25)}:${tune('pLon', -122.434)}:${tune('pLat', 37.786)}:${tune('pS', 0.1)}:${tune('pRot', 0.45)}`, () => {
    const { canvas, ctx } = makeCanvas(3840, 2160)
    const v0 = penView()
    const v: MapView = { ...v0, scale: v0.scale * 2, ox: 1920, oy: 1080 }
    drawLayer(ctx, 'sf', 'land', v, { fill: '#0b0f14' })
    drawLayer(ctx, 'sf', 'buildings', v, { fill: `rgba(170,185,195,${tune('pBld', 0.25)})` })
    drawLayer(ctx, 'sf', 'roads', v, { stroke: `rgba(70,150,185,${tune('pMinor', 0.3)})`, width: 1.4, filter: ROAD_FILTERS.minor, filterKey: 'minor' })
    drawLayer(ctx, 'sf', 'roads', v, { stroke: `rgba(90,200,230,${tune('pMajor', 0.5)})`, width: 2.2, filter: ROAD_FILTERS.major, filterKey: 'major' })
    drawLayer(ctx, 'sf', 'roads', v, { stroke: 'rgba(230,240,245,0.55)', width: 2.6, filter: ROAD_FILTERS.highway, filterKey: 'highway' })
    return canvas
  })
}

/** ASSET 半岛街区纹理（暗蓝灰颗粒 + 青色街道）；V2 起仅作 sf 数据缺失时的回退 */
function penTexture() {
  if (hasRealPen()) return realPenTexture()
  return cached('wd2p1:pen', () => {
    const { canvas, ctx } = makeCanvas(1920, 1080)
    const img = ctx.createImageData(1920, 1080)
    for (let y = 0; y < 1080; y++)
      for (let x = 0; x < 1920; x++) {
        const i = (y * 1920 + x) * 4
        const v = h2(x >> 1, y >> 1, 61) < 0.4 * fbm(x / 200, y / 200, 62, 3) + 0.1 ? 40 + h2(x, y, 63) * 90 : 8
        img.data[i] = v * 0.8
        img.data[i + 1] = v * 0.9
        img.data[i + 2] = v
        img.data[i + 3] = 255
      }
    ctx.putImageData(img, 0, 0)
    ctx.strokeStyle = 'rgba(80,190,220,0.45)'
    ctx.lineWidth = 1.2
    for (let i = 0; i < 180; i++) {
      const a = h2(i, 1, 64) < 0.5 ? -0.55 : 1.0
      const x = h2(i, 2, 64) * 1920
      const y = h2(i, 3, 64) * 1080
      const L = 150 + h2(i, 4, 64) * 600
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L)
      ctx.stroke()
    }
    // 斜线填充的空地
    ctx.strokeStyle = 'rgba(160,190,200,0.25)'
    for (let k = 0; k < 8; k++) {
      const x = h2(k, 5, 64) * 1700
      const y = h2(k, 6, 64) * 900
      for (let j = 0; j < 14; j++) {
        ctx.beginPath()
        ctx.moveTo(x + j * 8, y)
        ctx.lineTo(x + j * 8 + 60, y + 60)
        ctx.stroke()
      }
    }
    return canvas
  })
}

/** 网络节点（屏幕坐标） */
const NODES: [number, number][] = [
  [300, 270], [360, 330], [540, 490], [640, 530], [720, 520], [780, 580], [340, 710], [520, 780], [610, 640], [800, 720],
  [1060, 450], [1080, 800], [1250, 560], [980, 880], [200, 870], [390, 940], [470, 930], [700, 960],
]

/** 半岛镜头相机：37.0 起缓推，38.7 硬切放大一档 */
function penCam(t: number) {
  const z = t < 38.7 ? lerp(1, 1.06, seg(t, 37, 38.7)) : lerp(tune('pz', 1.75), tune('pz', 1.75) * 1.1, seg(t, 38.7, 40.5))
  const ox = t < 38.7 ? 0 : tune('pox', -20)
  const oy = t < 38.7 ? 0 : tune('poy', 250)
  return { z, ox, oy }
}

export const peninsula: Scene = {
  id: 'wd2-036.9-peninsula',
  start: 36.9,
  end: 40.75,
  note: 'ASSET 旧金山半岛：大像素块溶解出暗蓝街区 + 白色节点网络 + 数值标签；37.4 起红色斜纹锯齿边界沿海岸生长；38.7 硬切推近（青色街道、圆环节点）；40.35 起向后倾倒成 3D',
  render({ ctx, t }) {
    const c = penCam(t)
    const tilt = ease.inCubic(seg(t, 40.3, 40.75))
    ctx.save()
    // 3D 倾倒：纵向压扁 + 上移
    ctx.translate(960, 540)
    ctx.scale(1, 1 - tilt * 0.55)
    ctx.translate(-960, -540 - tilt * 200)
    ctx.translate(960 + c.ox, 540 + c.oy)
    ctx.scale(c.z, c.z)
    ctx.translate(-960, -540)
    // 半岛底图
    const block = Math.round(lerp(40, 1, ease.outCubic(seg(t, 36.9, 37.5))))
    const draw = (l: CanvasRenderingContext2D) => {
      l.save()
      penPath(l)
      l.clip()
      l.drawImage(penTexture(), 0, 0, 1920, 1080)
      l.restore()
    }
    if (block > 1) {
      const img = layer(ctx, 'wd2p1-pen', (l) => {
        l.setTransform(ctx.getTransform())
        draw(l)
      }, { alpha: 0 })
      ctx.save()
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.globalAlpha = 0.9
      pixelate(ctx, img, 0, 0, 1920, 1080, block)
      ctx.restore()
    } else draw(ctx)
    // 红色锯齿边界：斜纹短划沿轮廓外扩一圈，按进度生长
    const bp = seg(t, 37.35, 38.0)
    if (bp > 0) {
      ctx.save()
      ctx.strokeStyle = WD2.red
      ctx.lineWidth = t < 38.7 ? 7 : 12
      ctx.setLineDash([3, 9])
      if (bp < 1) {
        // 生长中：沿轮廓（从左上顺时针）逐段画出
        ctx.beginPath()
        const PEN = PENS()
        const n = PEN.length * bp
        for (let i = 0; i <= Math.ceil(n) && i < PEN.length; i++) {
          let [x, y] = PEN[i]
          if (i > n) {
            const [px, py] = PEN[i - 1]
            x = lerp(px, x, n - (i - 1))
            y = lerp(py, y, n - (i - 1))
          }
          const sx = 700 + (x - 700) * 1.04
          const sy = 620 + (y - 620) * 1.04
          if (i) ctx.lineTo(sx, sy)
          else ctx.moveTo(sx, sy)
        }
      } else penPath(ctx, 0.04)
      ctx.stroke()
      ctx.restore()
    }
    // 网络
    ctx.strokeStyle = 'rgba(230,235,240,0.55)'
    ctx.lineWidth = 1.2
    ctx.beginPath()
    for (let i = 0; i < NODES.length; i++) {
      const j = Math.floor(h2(i, 1, 71) * NODES.length)
      const k = Math.floor(h2(i, 2, 71) * NODES.length)
      ctx.moveTo(NODES[i][0], NODES[i][1])
      ctx.lineTo(NODES[j][0], NODES[j][1])
      ctx.moveTo(NODES[i][0], NODES[i][1])
      ctx.lineTo(NODES[k][0], NODES[k][1])
    }
    ctx.stroke()
    for (const [x, y] of NODES) {
      ctx.strokeStyle = 'rgba(240,240,240,0.8)'
      ctx.beginPath()
      ctx.arc(x, y, t < 38.7 ? 5 : 9, 0, Math.PI * 2)
      ctx.stroke()
    }
    // 远处红色长斜线
    ctx.strokeStyle = 'rgba(224,36,43,0.7)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(500, 950)
    ctx.lineTo(1920, 100)
    ctx.moveTo(1500, 900)
    ctx.lineTo(1920, 640)
    ctx.stroke()
    const labels: [number, number, string][] = [[420, 220, '855.31'], [960, 440, '527.31'], [430, 550, '557.40'], [1100, 660, '310.64'], [200, 880, '780.08'], [1190, 880, '984.71'], [200, 990, '807.16'], [1000, 548, '178.24']]
    for (const [x, y, s] of labels) numLabel(ctx, x, y, s, 20)
    ctx.restore()
    // 大字（不跟随地图）
    if (t > 37.9 && t < 38.7) {
      wordReveal(ctx, 'more', 1120, 170, 64, seg(t, 37.9, 38.1))
      wordReveal(ctx, 'secure', 1290, 170, 64, seg(t, 38.1, 38.45))
    }
    if (t > 38.9) {
      const a = 1 - seg(t, 40.5, 40.75)
      const up = ease.inCubic(seg(t, 40.3, 40.75)) * 140
      ctx.save()
      ctx.globalAlpha = a
      wordReveal(ctx, 'more', 1120, 170 - up, 64, seg(t, 38.9, 39.1))
      wordReveal(ctx, 'invasive', 1290, 170 - up, 64, seg(t, 39.15, 39.65))
      wordReveal(ctx, 'system.', 1120, 228 - up, 64, seg(t, 39.6, 39.95))
      ctx.restore()
    }
  },
}

// ───────────────────────── 3D 竖条 → 声波 → 暗网格 ─────────────────────────

/** 透视投影：地面 (u,v)∈[0,1]² → 屏幕 */
function persp(u: number, v: number, h = 0) {
  const depth = 1 + v * 3
  const x = 960 + ((u - 0.5) * 2600) / depth
  const y = 330 + 620 / depth - h / depth
  return [x, y]
}

export const bars3d: Scene = {
  id: 'wd2-040.7-bars3d',
  start: 40.7,
  end: 41.25,
  note: '倾倒后的 3D 地图：青色街道透视网格 + 地面圆环 + 大量白色竖条（数据量柱）从地面升起并抖动',
  render({ ctx, t }) {
    const f = fr(t)
    ctx.strokeStyle = 'rgba(80,190,220,0.45)'
    ctx.lineWidth = 1.2
    ctx.beginPath()
    for (let i = 0; i <= 14; i++) {
      const [x1, y1] = persp(i / 14, 0)
      const [x2, y2] = persp(i / 14, 1)
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
      const [a1, b1] = persp(0, i / 14)
      const [a2, b2] = persp(1, i / 14)
      ctx.moveTo(a1, b1)
      ctx.lineTo(a2, b2)
    }
    ctx.stroke()
    const grow = ease.outCubic(seg(t, 40.7, 41.0))
    ctx.fillStyle = 'rgba(240,240,240,0.9)'
    for (let i = 0; i < 220; i++) {
      const u = h2(i, 1, 81)
      const v = h2(i, 2, 81)
      const hh = (60 + h2(i, 3, 81) * 520) * grow * (0.7 + 0.3 * h2(i, f >> 1, 82))
      const [x, y] = persp(u, v)
      const [, y2] = persp(u, v, hh)
      const w = Math.max(1.5, 5 / (1 + v * 3))
      ctx.fillRect(x, y2, w, y - y2)
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'
    for (let i = 0; i < 6; i++) {
      const [x, y] = persp(h2(i, 4, 81), h2(i, 5, 81))
      ctx.beginPath()
      ctx.ellipse(x, y, 60, 12, 0, 0, Math.PI * 2)
      ctx.stroke()
    }
  },
}

/** 声波行：刻度点虚线上零星几簇竖线 */
function waveRow(ctx: CanvasRenderingContext2D, y: number, color: string, seed: number, amp: number, t: number) {
  ctx.fillStyle = color
  const x0 = 70
  const x1 = 1860
  for (let x = x0; x < x1; x += 9) {
    const i = Math.floor((x - x0) / 9)
    // 包络：几个高斯峰
    let e = 0
    for (let k = 0; k < 6; k++) {
      const c = x0 + h2(k, seed, 91) * (x1 - x0)
      const s = 12 + h2(k, seed, 92) * 30
      e += Math.exp(-(((x - c) / s) ** 2)) * (0.3 + h2(k, seed, 93))
    }
    const jitter = 0.5 + 0.5 * h2(i, Math.floor(t * 30), seed)
    const hgt = Math.max(2, e * amp * jitter)
    ctx.fillRect(x, y - hgt, 2.5, hgt * 2)
  }
}

export const waveforms: Scene = {
  id: 'wd2-041.25-waveforms',
  start: 41.25,
  end: 42.37,
  note: '声波图：41.25 品红单行 → 41.5 紫色两行 → 41.75 白色两行 → 42.0 红色三行（原片逐拍换色）',
  render({ ctx, t }) {
    if (t < 41.62) {
      ctx.fillStyle = '#e0206e'
      ctx.fillRect(0, 539, 1920, 3)
      waveRow(ctx, 540, '#e0206e', 1, 60, t)
      waveRow(ctx, 540, '#e0206e', 11, 30, t)
    } else if (t < 41.87) {
      waveRow(ctx, 330, '#b04ee0', 2, 130, t)
      waveRow(ctx, 740, '#8a3fd0', 3, 110, t)
    } else if (t < 42.12) {
      waveRow(ctx, 220, '#f0f0f0', 4, 90, t)
      waveRow(ctx, 580, '#f0f0f0', 5, 80, t)
    } else {
      waveRow(ctx, 220, WD2.red, 6, 70, t)
      waveRow(ctx, 580, WD2.red, 7, 90, t)
      waveRow(ctx, 940, WD2.red, 8, 60, t)
    }
  },
}

export const darkGrid: Scene = {
  id: 'wd2-042.25-dark-grid',
  start: 42.37,
  end: 43,
  note: '近黑：极暗的方格 + 三条暗红虚线（声波的残影），为 43.2 的下一段让位',
  render({ ctx, t }) {
    const a = 1 - seg(t, 42.25, 43) * 0.5
    ctx.strokeStyle = `rgba(60,60,60,${0.35 * a})`
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let x = 60; x < 1920; x += 166) {
      ctx.moveTo(x, 0)
      ctx.lineTo(x, 1080)
    }
    for (let y = 30; y < 1080; y += 166) {
      ctx.moveTo(0, y)
      ctx.lineTo(1920, y)
    }
    ctx.stroke()
    for (const y of [210, 540, 875]) dashLine(ctx, 110, y, 1815, y, { color: `rgba(150,30,30,${0.5 * a})`, width: 1.5, dash: [5, 6] })
  },
}
