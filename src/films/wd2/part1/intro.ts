/**
 * 0–4.2s：「2013」大字 → 镜头冲进字里并倾斜 → 白色横条撕裂 → 芝加哥夜景卫星图 + 红色航班。
 */
import type { Scene } from '../../../engine/types'
import { clamp, ease, lerp, seg } from '../../../engine/math'
import { FONT, font, tracking } from '../../../fx/text'
import { WD2 } from '../../../theme'
import { layer } from '../../../fx/canvas'
import { pixelate } from '../../../fx/image'
import { cached, dashLine, fr, h2, makeCanvas, plane, satelliteTexture, sliceDraw } from './lib'
import { geo, hasGeo } from '../../../assets/geo'
import { drawLayer, ROAD_FILTERS, viewAt } from '../../../assets/geo-draw'
import { tune } from './tune'

const TEXT_CX = 965
const TEXT_BASE = 766 // 2013 基线
const TEXT_W = 1370 // 原片 0.5s 时「2013」外框宽

/** 2013 的字号：量一次，把宽度拟合到 TEXT_W */
function yearFont(ctx: CanvasRenderingContext2D) {
  font(ctx, 700, 700, FONT.sans)
  tracking(ctx, -40)
  const w = ctx.measureText('2013').width
  return { size: 700, sx: TEXT_W / w }
}

function drawYear(ctx: CanvasRenderingContext2D, color: string, dx = 0) {
  const { size, sx } = yearFont(ctx)
  ctx.save()
  ctx.scale(sx, 1)
  font(ctx, size, 700, FONT.sans)
  tracking(ctx, -40)
  ctx.fillStyle = color
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText('2013', dx / sx, 0)
  ctx.restore()
  tracking(ctx, 0)
}

/** 背景：暗灰细线网格 + 美国地图式折线 + 小方点 + 青色虚线（原片 2013 背后若隐若现的 HUD） */
function hudBackdrop(ctx: CanvasRenderingContext2D, alpha: number) {
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.strokeStyle = 'rgba(120,130,140,0.35)'
  ctx.lineWidth = 1
  ctx.beginPath()
  for (const x of [205, 640, 1005, 1360, 1655]) {
    ctx.moveTo(x, 0)
    ctx.lineTo(x, 830)
  }
  ctx.moveTo(0, 828)
  ctx.lineTo(1920, 828)
  ctx.moveTo(0, 876)
  ctx.lineTo(1920, 876)
  // 粗略的国界折线
  const pts = [
    [190, 170], [330, 150], [520, 170], [760, 150], [1000, 175], [1160, 140], [1330, 170], [1500, 150], [1640, 230], [1700, 330], [1650, 450],
    [1580, 560], [1460, 640], [1320, 700], [1180, 760], [980, 800], [760, 780], [520, 760], [330, 700], [230, 560], [190, 380], [190, 170],
  ]
  ctx.moveTo(pts[0][0], pts[0][1])
  for (const [x, y] of pts) ctx.lineTo(x, y)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(63,182,196,0.35)'
  ctx.setLineDash([4, 6])
  ctx.beginPath()
  ctx.moveTo(1300, 530)
  ctx.lineTo(1920, 480)
  ctx.moveTo(0, 620)
  ctx.lineTo(560, 600)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.fillStyle = 'rgba(200,200,200,0.5)'
  for (let i = 0; i < 26; i++) {
    const x = 220 + h2(i, 1, 7) * 1480
    const y = 170 + h2(i, 2, 7) * 600
    ctx.fillRect(x, y, 5, 5)
    ctx.fillRect(x + 12, y + 1, 30 + h2(i, 3, 7) * 40, 2)
  }
  font(ctx, 14, 400, FONT.mono)
  tracking(ctx, 5)
  ctx.fillStyle = 'rgba(160,170,180,0.6)'
  ctx.fillText('THURSDAY, MAY 9', 275, 855)
  tracking(ctx, 0)
  ctx.restore()
}

/** 2013 的相机：缓慢推近 → 0.95s 起指数冲进 "0" 的右笔画（整屏变白）并逆时针倾斜到约 -30° */
function yearCam(t: number) {
  const slow = lerp(1, 1.05, seg(t, 0.25, 0.95))
  const k = Math.max(0, t - 0.95)
  const s = slow * Math.min(22, Math.exp(4.1 * k))
  const rot = lerp(0, -0.1, seg(t, 0.95, 1.2)) + lerp(0, -0.42, ease.inOutCubic(seg(t, 1.15, 1.75)))
  // 冲进时焦点从字中心移到 "0" 的右笔画
  const q = ease.outCubic(seg(t, 0.95, 1.3))
  const fx = lerp(TEXT_CX, 968, q)
  const fy = lerp(TEXT_BASE - 250, 545, q)
  return { s, rot, fx, fy }
}

export const year2013: Scene = {
  id: 'wd2-000-2013',
  start: 0,
  end: 2.75,
  note: '巨大 "2013" 白字：0.1s 品红故障闪现 → 缓推 → 1.0s 起冲进字里并倾斜 → 横条撕裂露出卫星图',
  render({ ctx, t }) {
    if (t < 0.1) return
    const f = fr(t)
    if (t < 1.5) hudBackdrop(ctx, clamp(1 - seg(t, 0.9, 1.3)))
    const cam = yearCam(t)
    const place = () => {
      ctx.translate(960, 540)
      ctx.rotate(cam.rot)
      ctx.scale(cam.s, cam.s)
      ctx.translate(-cam.fx, -cam.fy)
      ctx.translate(TEXT_CX, TEXT_BASE)
    }
    // 0.1–0.25：品红 → 白色的故障闪现
    if (t < 0.25) {
      const color = t < 0.17 ? '#d8288c' : WD2.fg
      sliceDraw(ctx, { x: 0, y: 150, w: 1920, h: 700 }, 14, f, 60, () => {
        ctx.save()
        place()
        drawYear(ctx, color)
        ctx.restore()
      })
      return
    }
    // 1.4s 起：沿字的局部水平方向切成横条，各条错位、逐渐消失
    const tear = seg(t, 1.35, 2.7)
    if (tear <= 0) {
      ctx.save()
      place()
      drawYear(ctx, WD2.fg)
      ctx.restore()
      return
    }
    ctx.save()
    ctx.translate(960, 540)
    ctx.rotate(cam.rot)
    // 局部坐标下切条：1.5s 前按字形切（字形已铺满屏），之后换成纯白长条，两端逐渐收短、错位、消失
    const span = 1500
    let y = -span
    let i = 0
    const coarse = seg(t, 1.6, 2.1)
    const shrink = ease.inOutCubic(seg(t, 1.55, 2.6))
    while (y < span) {
      const bh = lerp(5 + h2(i, 1, 3) * 16, 36 + h2(i, 1, 4) * 110, coarse)
      const alive = h2(i, 5, 11) > ease.inQuad(seg(t, 1.9, 2.75)) * 1.05
      const dir = h2(i, 2, 3) < 0.5 ? -1 : 1
      const dx = dir * h2(i, 3, 3) * 260 * ease.inQuad(tear)
      if (alive && t < 1.5) {
        ctx.save()
        ctx.beginPath()
        ctx.rect(-span * 1.5, y, span * 3, bh)
        ctx.clip()
        ctx.translate(dx, 0)
        ctx.scale(cam.s, cam.s)
        ctx.translate(-cam.fx, -cam.fy)
        ctx.translate(TEXT_CX, TEXT_BASE)
        drawYear(ctx, WD2.fg)
        ctx.restore()
      } else if (alive) {
        const a = -1300 + h2(i, 10, 3) * 1700
        const b = a + 250 + h2(i, 11, 3) * 1300
        const L = lerp(-span * 1.4, a, shrink) + dx
        const R = lerp(span * 1.4, b, shrink) + dx
        ctx.fillStyle = WD2.fg
        if (h2(i, 12, 3) < 0.45) {
          // 条中间裂开一道口子（阶梯状边缘的来源）
          const c = lerp(L, R, 0.3 + h2(i, 13, 3) * 0.4)
          const hole = (R - L) * 0.35 * seg(t, 1.6, 2.3)
          ctx.fillRect(L, y, c - L, bh)
          ctx.fillRect(c + hole, y, Math.max(0, R - c - hole), bh)
        } else ctx.fillRect(L, y, R - L, bh)
      }
      y += bh + (t > 1.5 ? h2(i, 6, 3) * 10 * coarse + 3 * (1 - coarse) * (h2(i, 8, 3) < 0.5 ? 1 : 0) : 0)
      i++
    }
    ctx.restore()
  },
}

/** 芝加哥卫星图：东侧是湖（近黑），湖岸线自北向南微弯 */
function chicagoWater(x: number, y: number) {
  const coast = 1180 + Math.sin(y / 260) * 60 + (y - 1024) * 0.18 + (h2(x >> 4, y >> 4, 5) - 0.5) * 8
  return x > coast
}

/**
 * V2：芝加哥夜景卫星图的真实近似（OSM，Loop ±4 km）：
 *   黑底 → 建筑面暗灰（分 4 档）→ 全部道路细灰线 + 主干道稍亮 → 铁路/CTA 暗线 → 河道/湖面涂黑 → 随机灯点只落在建筑/道路上。
 * 纹理坐标沿用 V1（2048²，北朝上，湖岸在 x≈1180），相机与航班位置不用改。
 */
function realChicagoTexture() {
  const S = tune('chS', 0.18)
  return cached(`wd2p1:chicagoReal:${S}:${tune('chLon', -87.625)}:${tune('chLat', 41.872)}:${tune('chB', 0.4)}`, () => {
    const { canvas, ctx } = makeCanvas(2048, 2048)
    ctx.fillStyle = '#050608'
    ctx.fillRect(0, 0, 2048, 2048)
    const v = viewAt(geo('chicago'), tune('chLon', -87.625), tune('chLat', 41.872), S, 0, 1180, 1024)
    const b = tune('chB', 0.4)
    for (let k = 0; k < 4; k++) {
      const g = Math.round((22 + k * 12) * b)
      drawLayer(ctx, 'chicago', 'buildings', v, { fill: `rgb(${g},${g},${g + 4})`, filter: (_c, i) => i % 4 === k, filterKey: `chsat${k}` })
    }
    drawLayer(ctx, 'chicago', 'roads', v, { stroke: `rgba(170,180,195,${0.22 * b})`, width: 1, filter: ROAD_FILTERS.minor, filterKey: 'minor' })
    drawLayer(ctx, 'chicago', 'roads', v, { stroke: `rgba(200,210,225,${0.45 * b})`, width: 1.4, filter: ROAD_FILTERS.major, filterKey: 'major' })
    drawLayer(ctx, 'chicago', 'rail', v, { stroke: `rgba(150,160,170,${0.25 * b})`, width: 1.2 })
    // 注：chicago 的 lake 面在这个视图下会盖住陆地（drawWater 不可用），湖面本来就没有建筑/道路，只把河道/水面涂黑
    drawLayer(ctx, 'chicago', 'water', v, { fill: '#000' })
    drawLayer(ctx, 'chicago', 'rivers', v, { stroke: '#000', width: 5 })
    // 灯点：只落在已有亮度的像素上（建筑/道路）
    const img = ctx.getImageData(0, 0, 2048, 2048)
    const d = img.data
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] < 14) continue
      const r = h2(i >> 2, 9, 31)
      if (r < 0.035) {
        const L = 120 + h2(i >> 2, 10, 31) * 135
        d[i] = L
        d[i + 1] = L
        d[i + 2] = Math.min(255, L + 10)
      }
    }
    ctx.putImageData(img, 0, 0)
    return canvas
  })
}

export function chicagoTexture() {
  if (hasGeo('chicago')) return realChicagoTexture()
  return satelliteTexture('chicago', {
    seed: 21,
    w: 2048,
    h: 2048,
    bright: 0.075,
    street: 12,
    streetAngle: 0,
    water: chicagoWater,
    specks: 2600,
  })
}

/** 地图上的航班：局部坐标 + 朝向 + 速度（px/s） */
const FLIGHTS = [
  { x: 700, y: 980, a: -0.05, v: 18, size: 78, trail: 900 },
  { x: 1330, y: 1180, a: -1.4, v: 10, size: 36, trail: 700 },
  { x: 1150, y: 640, a: -1.45, v: 10, size: 22, trail: 500 },
  { x: 1240, y: 700, a: -1.5, v: 10, size: 18, trail: 400 },
]

export const chicagoSat: Scene = {
  id: 'wd2-001.5-chicago-sat',
  start: 1.5,
  end: 4.3,
  note: 'ASSET 芝加哥夜景卫星图（程序化）+ 红色飞机与虚线航迹，缓慢旋转推近；3.5s 起淡出进入透视网格',
  render({ ctx, t }) {
    const tex = hasGeo('chicago') ? chicagoTexture() : cached('wd2p1:chicago-tex', chicagoTexture)
    const rot = lerp(tune('chR0', -0.75), tune('chR1', -0.85), seg(t, 1.5, 4.3))
    const s = lerp(tune('chS0', 1.45), tune('chS1', 1.1), ease.outCubic(seg(t, 1.5, 4.3)))
    // 2.0–2.6 从大马赛克块逐渐解析成清晰地图；3.55 起淡出
    const fade = seg(t, 1.9, 2.4) * (1 - seg(t, 3.55, 4.1))
    const block = Math.round(lerp(70, 1, ease.outCubic(seg(t, 1.95, 2.65))))
    const draw = (l: CanvasRenderingContext2D) => {
      l.translate(960, 540)
      l.rotate(rot)
      l.scale(s, s)
      l.translate(-900, -1000)
      l.drawImage(tex, 0, 0)
      const lt = t - 1.5
      for (const [k, fl] of FLIGHTS.entries()) {
        const px = fl.x + Math.cos(fl.a) * fl.v * lt
        const py = fl.y + Math.sin(fl.a) * fl.v * lt
        dashLine(l, px, py, px + Math.cos(fl.a) * fl.trail, py + Math.sin(fl.a) * fl.trail, {
          color: 'rgba(224,36,43,0.8)',
          width: 2 / s,
          dash: [16, 12],
          p: seg(t, 2.2 + k * 0.1, 2.9 + k * 0.1),
        })
        plane(l, px, py, fl.size, fl.a)
        if (k === 0) {
          l.fillStyle = '#fff'
          l.fillRect(px + 42, py - 6, 12, 12)
          l.fillStyle = '#000'
          l.fillRect(px + 45, py - 3, 6, 6)
          l.fillStyle = 'rgba(224,36,43,0.9)'
          font(l, 13, 400, FONT.mono)
          l.fillText('AF-338', px + 62, py + 5)
        }
      }
    }
    const lay = layer(ctx, 'wd2p1-chicago', draw, { alpha: block > 1 ? 0 : fade })
    if (block > 1) {
      ctx.save()
      ctx.globalAlpha = fade * 0.8
      pixelate(ctx, lay, 0, 0, 1920, 1080, block)
      ctx.restore()
    }
  },
}
