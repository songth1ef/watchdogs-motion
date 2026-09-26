/**
 * 65.35–77.5s：车辆 VIN 面板 + 定位针 → 拉远成街区线稿 → 车变红（70.05）→ DedSec 故障三帧 →
 * N. Oak St. 特写（红车 + 红叉 + 个人资料列表）→ 72.3 跳切到更大的街区（12th Ave、湖、等距小房子、数据卡片）→ 拉远、地图淡出只剩卡片。
 *
 * 全部为 2D 线稿 + 相机变换（平移/缩放/旋转）。原片是 3D 俯视透视，这里用正交近似。
 * ASSET：顶视车 = carTop()，房子 = isoHouse()，湖/道路 = 贝塞尔路径，均可替换成矢量素材。
 */
import type { FrameCtx, Scene } from '../../../engine/types'
import { clamp, ease, hash, lerp, rng, seg } from '../../../engine/math'
import { FONT, font, tracking } from '../../../fx/text'
import { dotMatrix } from '../../../fx/dot-matrix'
import { WD2 } from '../../../theme'
import { sliceGlitch } from '../../../fx/glitch'
import { offscreen } from '../../../fx/canvas'
import { dataCard, drawFace, fr, mono } from './common'
import { screamerSprite } from '../part3/art'

const LINE = 'rgba(235,235,235,0.92)'
const ROAD = '#18191b'

// ---------------- 通用线稿元素 ----------------
/** ASSET 顶视车（车头朝下），以左上角为原点，w×h */
function carTop(ctx: CanvasRenderingContext2D, w: number, h: number, red = false) {
  const body = ctx.createLinearGradient(0, 0, w, 0)
  if (red) {
    body.addColorStop(0, '#8e0f12')
    body.addColorStop(0.5, '#e0242b')
    body.addColorStop(1, '#8e0f12')
  } else {
    body.addColorStop(0, '#3a3a3a')
    body.addColorStop(0.5, '#8a8a8a')
    body.addColorStop(1, '#3a3a3a')
  }
  ctx.fillStyle = body
  ctx.beginPath()
  ctx.roundRect(w * 0.08, 0, w * 0.84, h, w * 0.3)
  ctx.fill()
  if (red) return
  // 车窗
  ctx.fillStyle = 'rgba(20,20,20,0.85)'
  ctx.beginPath()
  ctx.roundRect(w * 0.18, h * 0.18, w * 0.64, h * 0.22, w * 0.08)
  ctx.roundRect(w * 0.2, h * 0.68, w * 0.6, h * 0.14, w * 0.08)
  ctx.fill()
  // 车轮与车轴（白）
  ctx.fillStyle = '#f2f2f2'
  for (const [x, y] of [[0, 0.12], [0.86, 0.12], [0, 0.72], [0.86, 0.72]]) ctx.fillRect(x * w, y * h, w * 0.14, h * 0.13)
  ctx.fillRect(w * 0.1, h * 0.18, w * 0.8, h * 0.02)
  ctx.fillRect(w * 0.48, h * 0.05, w * 0.04, h * 0.9)
  // 红色线路
  ctx.strokeStyle = WD2.red
  ctx.lineWidth = Math.max(1, w * 0.012)
  ctx.beginPath()
  ctx.moveTo(w * 0.62, 0)
  ctx.lineTo(w * 0.62, h * 0.9)
  ctx.lineTo(w * 0.2, h * 0.9)
  ctx.moveTo(w * 0.66, h * 0.1)
  ctx.lineTo(w * 0.66, h * 0.85)
  ctx.lineTo(w * 0.85, h * 0.9)
  ctx.stroke()
}

/** 定位针（白色水滴 + 黑圈里的车图标 + 地面圆环），(x,y) 为针尖，r 为针头半径 */
function pin(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, ring = true) {
  if (ring) {
    ctx.strokeStyle = '#f2f2f2'
    ctx.lineWidth = r * 0.07
    ctx.beginPath()
    ctx.ellipse(x, y + r * 0.05, r * 1.25, r * 0.3, 0, 0.15 * Math.PI, 0.85 * Math.PI)
    ctx.ellipse(x, y + r * 0.05, r * 1.25, r * 0.3, 0, 1.1 * Math.PI, 1.9 * Math.PI)
    ctx.stroke()
  }
  ctx.fillStyle = '#f4f4f4'
  ctx.beginPath()
  ctx.arc(x, y - r * 1.9, r, Math.PI * 0.8, Math.PI * 2.2)
  ctx.lineTo(x, y)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#111'
  ctx.beginPath()
  ctx.arc(x, y - r * 1.9, r * 0.66, 0, Math.PI * 2)
  ctx.fill()
  // 车图标（正面）
  ctx.fillStyle = '#f4f4f4'
  const cy = y - r * 1.9
  ctx.beginPath()
  ctx.roundRect(x - r * 0.42, cy - r * 0.05, r * 0.84, r * 0.3, r * 0.06)
  ctx.moveTo(x - r * 0.3, cy - r * 0.05)
  ctx.lineTo(x - r * 0.22, cy - r * 0.3)
  ctx.lineTo(x + r * 0.22, cy - r * 0.3)
  ctx.lineTo(x + r * 0.3, cy - r * 0.05)
  ctx.fill()
  ctx.fillRect(x - r * 0.38, cy + r * 0.2, r * 0.14, r * 0.14)
  ctx.fillRect(x + r * 0.24, cy + r * 0.2, r * 0.14, r * 0.14)
  ctx.fillStyle = '#111'
  ctx.fillRect(x - r * 0.26, cy + r * 0.04, r * 0.1, r * 0.08)
  ctx.fillRect(x + r * 0.16, cy + r * 0.04, r * 0.1, r * 0.08)
}

/** ASSET 等距线稿小房子（原片街区里那种白线房子），(x,y) 为前檐左下角，s 为尺寸 */
function isoHouse(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, seed: number) {
  const R = rng(seed)
  const w = s * R.range(0.8, 1.3)
  const d = s * R.range(0.5, 0.8)
  const h = s * R.range(0.35, 0.5)
  const dx = d * 0.7
  const dy = -d * 0.45
  ctx.fillStyle = '#060606'
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x + w, y)
  ctx.lineTo(x + w + dx, y + dy)
  ctx.lineTo(x + w + dx, y + dy - h)
  ctx.lineTo(x + w / 2 + dx, y + dy - h - s * 0.35)
  ctx.lineTo(x + w / 2, y - h - s * 0.35)
  ctx.lineTo(x, y - h)
  ctx.closePath()
  ctx.fill()
  ctx.beginPath()
  // 墙体
  ctx.rect(x, y - h, w, h)
  ctx.moveTo(x + w, y)
  ctx.lineTo(x + w + dx, y + dy)
  ctx.lineTo(x + w + dx, y + dy - h)
  ctx.lineTo(x + w, y - h)
  // 屋顶（沿进深方向的人字）
  const ry = s * 0.35
  ctx.moveTo(x, y - h)
  ctx.lineTo(x + w / 2, y - h - ry)
  ctx.lineTo(x + w, y - h)
  ctx.moveTo(x + w / 2, y - h - ry)
  ctx.lineTo(x + w / 2 + dx, y + dy - h - ry)
  ctx.lineTo(x + w + dx, y + dy - h)
  ctx.stroke()
  // 窗（小格）
  const n = R.int(1, 3)
  for (let i = 0; i < n; i++) {
    const wx = x + w * (0.15 + i * 0.28)
    ctx.strokeRect(wx, y - h * 0.7, w * 0.18, h * 0.35)
  }
}

/** 相机：以 (ax,ay) 为世界锚点，放到屏幕 (sx,sy)，缩放 z，旋转 r */
function camera(ctx: CanvasRenderingContext2D, ax: number, ay: number, sx: number, sy: number, z: number, r: number) {
  ctx.translate(sx, sy)
  ctx.rotate(r)
  ctx.scale(z, z)
  ctx.translate(-ax, -ay)
}

type K = [number, number]
/** 分段插值（inOutCubic） */
function keyed(keys: K[], t: number, e = ease.inOutCubic) {
  if (t <= keys[0][0]) return keys[0][1]
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, v0] = keys[i]
    const [t1, v1] = keys[i + 1]
    if (t <= t1) return lerp(v0, v1, e(clamp((t - t0) / (t1 - t0))))
  }
  return keys[keys.length - 1][1]
}

// ---------------- 镜头 1：VIN 面板 → 街区（65.35–70.25） ----------------
/** 车道带：上沿 y = top(x) */
const bandTop = (x: number) => 150 - 0.2 * x + 0.00002 * x * x
const BAND_W = 700

function vinPanel(ctx: CanvasRenderingContext2D, red: boolean) {
  // 相对定位针的世界坐标（缩放 1 时与原片 66.6s 画面一致）
  ctx.fillStyle = '#050505'
  ctx.fillRect(-880, -900, 863, 627)
  ctx.strokeStyle = LINE
  ctx.lineWidth = 2.5
  ctx.strokeRect(-880, -693, 863, 420)
  ctx.strokeRect(-880, -900, 863, 207)
  const code = ['#AddressFamily any', '#ListenAddress 0.0.0.0', '#ListenAddress ::', 'MaxAuthTries 3', 'MaxStartups 1']
  code.forEach((s, i) => mono(ctx, s, -855, -835 + i * 16, 14, 'rgba(255,255,255,0.85)', 0.5))
  mono(ctx, '1GNCST8Z44M0112674', -817, -507, 60, '#f4f4f4', 1)
  mono(ctx, '1CS8', -817, -313, 60, '#f4f4f4', 1)
  const lab = (s: string, x: number, y: number) => mono(ctx, s, x, y, 19, 'rgba(255,255,255,0.8)', 2)
  lab('TEST CIRCUIT', -508, -642)
  lab('BRAKING', -282, -642)
  lab('CODE', -640, -433)
  lab('YEAR', -517, -433)
  lab('SERIES', -367, -433)
  lab('SERIAL', -197, -433)
  lab('CHECK DIGIT', -425, -347)
  ctx.strokeStyle = 'rgba(255,255,255,0.45)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  for (const [x1, x2] of [[-805, -560], [-555, -520], [-512, -470], [-465, -300], [-298, -120]]) {
    ctx.moveTo(x1, -490)
    ctx.lineTo(x2, -490)
    ctx.moveTo((x1 + x2) / 2, -490)
    ctx.lineTo((x1 + x2) / 2, -455)
  }
  ctx.moveTo(-760, -490)
  ctx.lineTo(-760, -400)
  ctx.lineTo(-680, -400)
  ctx.moveTo(-490, -490)
  ctx.lineTo(-490, -370)
  ctx.moveTo(-500, -640)
  ctx.lineTo(-500, -600)
  ctx.lineTo(-300, -600)
  ctx.lineTo(-300, -640)
  ctx.stroke()
  if (red) {
    ctx.strokeStyle = WD2.red
    ctx.lineWidth = 60
    ctx.beginPath()
    ctx.moveTo(-760, -640)
    ctx.lineTo(-140, -320)
    ctx.moveTo(-140, -640)
    ctx.lineTo(-760, -320)
    ctx.stroke()
  }
  ctx.save()
  ctx.translate(-1285, -890)
  carTop(ctx, 330, 615, red)
  ctx.restore()
}

let carWorld: { houses: [number, number, number, number][]; parcels: number[][] } | null = null
function makeCarWorld() {
  if (carWorld) return carWorld
  const R = rng(66)
  const houses: [number, number, number, number][] = []
  // 路北侧一排小房子（原片 68.8–70.3 路上方那排等距线稿房子）
  for (let x = -4200; x < 4800; x += R.range(650, 900)) houses.push([x, bandTop(x) - 90 - R.range(0, 60), R.range(480, 620), R.int(1, 999)])
  // 路南侧地块里零散的房子
  for (let x = -4000; x < 4800; x += R.range(900, 1400)) houses.push([x, bandTop(x) + BAND_W + R.range(500, 800), R.range(260, 340), R.int(1, 999)])
  const parcels: number[][] = []
  for (let x = -5400; x < 5400; x += R.range(380, 700)) {
    const y0 = bandTop(x) - 60
    parcels.push([x, y0, x + R.range(-200, 200), y0 - R.range(500, 900)])
    const y1 = bandTop(x) + BAND_W + 60
    parcels.push([x, y1, x + R.range(-400, 400), y1 + R.range(600, 1400)])
  }
  carWorld = { houses, parcels }
  return carWorld
}

function drawBand(ctx: CanvasRenderingContext2D, top: (x: number) => number, w: number, x0: number, x1: number, lw: number, fillA = 1) {
  ctx.beginPath()
  ctx.moveTo(x0, top(x0))
  for (let x = x0; x <= x1; x += 100) ctx.lineTo(x, top(x))
  for (let x = x1; x >= x0; x -= 100) ctx.lineTo(x, top(x) + w)
  ctx.closePath()
  const g = ctx.createLinearGradient(0, top(0), 0, top(0) + w)
  g.addColorStop(0, '#2c2f35')
  g.addColorStop(1, '#15171a')
  ctx.fillStyle = g
  ctx.globalAlpha = fillA
  ctx.fill()
  ctx.globalAlpha = 1
  ctx.strokeStyle = LINE
  ctx.lineWidth = lw
  ctx.beginPath()
  for (const off of [-40, 0, w]) {
    ctx.moveTo(x0, top(x0) + off)
    for (let x = x0; x <= x1; x += 100) ctx.lineTo(x, top(x) + off)
  }
  ctx.stroke()
}

/**
 * 影片时间 = 内部时间 + DT。part2.ts 统一平移了 0.07s；本镜头的关键帧是按 seek 取帧（与 snap/score 同语义）
 * 逐张量的影片时间，所以内部统一换回影片时间 T 再查表。
 */
const DT = 0.07
const lin = (x: number) => x

/**
 * 原片是 3D 透视下摇 + 拉远，车卡 / 门窗 / 路面三者的视差差别很大，一个正交相机对不上。
 * 这里拆成三层各自一套相机（关键帧从原片逐帧量：车卡按面板宽度与定位针位置，门按门框宽度，路面按路沿线位置与路宽）。
 */
// 车卡层（VIN 面板 + 顶视车 + 定位针 + 近景房子轮廓）：世界 (0,0) 落在屏幕 (sx,sy)，缩放 z
const CARD_SX: K[] = [[65.45, 3340], [66.0, 2285], [66.6, 1360], [67.2, 1146], [67.5, 1065], [67.8, 1140], [68.0, 1209], [68.3, 1290], [68.8, 1350], [69.3, 1344], [69.8, 1365], [70.1, 1400], [70.35, 1420]]
const CARD_SY: K[] = [[65.45, 536], [66.0, 788], [66.6, 790], [67.2, 829], [67.5, 787], [67.8, 751], [68.0, 680], [68.3, 650], [68.8, 774], [69.3, 916], [69.8, 1004], [70.1, 1050], [70.35, 1062]]
const CARD_Z: K[] = [[65.45, 1.35], [66.0, 1.23], [66.6, 1.0], [67.2, 1.16], [67.5, 1.22], [67.8, 0.85], [68.0, 0.63], [68.3, 0.48], [68.8, 0.33], [69.3, 0.28], [69.8, 0.26], [70.1, 0.27], [70.35, 0.27]]
// 门窗层（从客厅下摇出来时的落地窗 + 双开门）：同上，按门框量
const FAC_SX: K[] = [[65.45, 2919], [66.0, 2672], [66.6, 1266], [67.2, 1146]]
const FAC_SY: K[] = [[65.45, 822], [66.0, 953], [66.6, 762], [67.2, 829]]
const FAC_Z: K[] = [[65.45, 1.63], [66.0, 1.81], [66.6, 0.91], [67.2, 1.16]]
// 路面层：世界点 (0, bandTop(0)) 落在屏幕 (960, gy)，缩放 gz，旋转 gr
const GRD_Y: K[] = [[65.45, 1250], [66.0, 1150], [66.6, 990], [67.2, 820], [67.8, 705], [68.3, 490], [68.8, 595], [69.3, 410], [69.8, 195], [70.1, 150], [70.35, 140]]
const GRD_Z: K[] = [[65.45, 2.4], [66.6, 2.0], [67.2, 1.9], [67.8, 1.8], [68.3, 1.5], [68.8, 1.3], [69.3, 0.87], [69.8, 0.71], [70.1, 0.62], [70.35, 0.6]]
const GRD_R: K[] = [[68.3, 0], [68.8, -0.05], [69.3, -0.02], [70.35, 0]]

/** 门窗层：三扇落地窗 + 双开门（门框世界坐标与旧版一致：x −1128..−880） */
function facade(ctx: CanvasRenderingContext2D, T: number, px: number) {
  ctx.strokeStyle = LINE
  ctx.lineWidth = Math.max(3, 2.5 * px)
  // 双开门
  ctx.strokeRect(-1128, -228, 248, 278)
  ctx.strokeRect(-1110, -210, 105, 110)
  ctx.strokeRect(-995, -210, 105, 110)
  for (const x of [-1108, -1060, -996, -946]) ctx.strokeRect(x, -80, 40, 110)
  ctx.beginPath()
  ctx.moveTo(-1160, 55)
  ctx.lineTo(-840, 55)
  ctx.moveTo(-1175, 80)
  ctx.lineTo(-825, 80)
  ctx.stroke()
  // 落地窗：离门的间距随视差收窄（原片 65.45 ≈ 240，66.0 ≈ 130 世界单位），66.5 前移出画面
  const a = 1 - seg(T, 66.3, 66.6)
  if (a <= 0) return
  const gap = keyed([[65.45, 240], [66.0, 130]], T, lin)
  ctx.globalAlpha = a
  for (let i = 0; i < 3; i++) {
    const x1 = -1128 - gap - i * 145
    ctx.strokeRect(x1 - 130, -300, 130, 292)
    ctx.beginPath()
    ctx.moveTo(x1 - 65, -300)
    ctx.lineTo(x1 - 65, -8)
    for (let k = 1; k < 4; k++) {
      ctx.moveTo(x1 - 130, -300 + k * 73)
      ctx.lineTo(x1, -300 + k * 73)
    }
    ctx.stroke()
  }
  ctx.globalAlpha = 1
}

function renderCar(f: FrameCtx) {
  const { ctx } = f
  const T = f.t + DT
  const W = makeCarWorld()
  const red = T >= 70.26

  // ---- 路面层 ----
  const gz = keyed(GRD_Z, T, lin)
  let px = 1 / gz
  ctx.save()
  ctx.translate(960, keyed(GRD_Y, T, lin))
  ctx.rotate(keyed(GRD_R, T))
  ctx.scale(gz, gz)
  ctx.translate(0, -bandTop(0))
  // 近景段原片路面是黑底白线，67.7 起拉远才显出灰色路面
  drawBand(ctx, bandTop, BAND_W, -6000, 6000, 2.2 * px, seg(T, 67.7, 68.2))
  ctx.strokeStyle = LINE
  ctx.lineWidth = 2 * px
  ctx.globalAlpha = seg(T, 67.9, 68.3)
  ctx.beginPath()
  for (const p of W.parcels) {
    ctx.moveTo(p[0], p[1])
    ctx.lineTo(p[2], p[3])
  }
  ctx.stroke()
  // 零星暗青地块线
  ctx.strokeStyle = 'rgba(70,150,190,0.55)'
  ctx.beginPath()
  for (let i = 0; i < W.parcels.length; i += 5) {
    const p = W.parcels[i]
    ctx.moveTo(p[0] + 60, p[1])
    ctx.lineTo(p[2] + 160, p[3])
  }
  ctx.stroke()
  ctx.globalAlpha = 1
  // 路两侧的房子：近景段（门窗、车卡特写）原片看不到，67.9 起随拉远浮现
  const ha = seg(T, 67.9, 68.3)
  if (ha > 0) {
    ctx.globalAlpha = ha
    ctx.strokeStyle = LINE
    ctx.lineWidth = 3 * px
    for (const [x, y, s, seed] of W.houses) isoHouse(ctx, x, y, s, seed)
    ctx.globalAlpha = 1
  }
  // 69.6 起路面上出现 "N. Oak St." 字样
  if (T > 69.6) {
    ctx.save()
    ctx.translate(1150, bandTop(1150) + 500)
    ctx.rotate(-0.2)
    roadLabel(ctx, 'N. Oak St.', 210, seg(T, 69.6, 69.8))
    ctx.restore()
  }
  ctx.restore()

  // ---- 门窗层 ----
  if (T < 67.2) {
    const fz = keyed(FAC_Z, T, lin)
    ctx.save()
    ctx.translate(keyed(FAC_SX, T, lin), keyed(FAC_SY, T, lin))
    ctx.scale(fz, fz)
    facade(ctx, T, 1 / fz)
    ctx.restore()
  }

  // ---- 车卡层 ----
  const z = keyed(CARD_Z, T, lin)
  px = 1 / z
  ctx.save()
  ctx.translate(keyed(CARD_SX, T, lin), keyed(CARD_SY, T, lin))
  ctx.scale(z, z)
  // 近景：右侧房子轮廓与人行道线（拉远后淡出，交给路面层）
  const near = 1 - seg(T, 67.8, 68.2)
  if (near > 0) {
    ctx.globalAlpha = near
    ctx.lineWidth = Math.max(4, 2.5 * px)
    ctx.strokeStyle = LINE
    ctx.beginPath()
    ctx.moveTo(40, -720)
    ctx.lineTo(140, -720)
    ctx.lineTo(140, -650)
    ctx.lineTo(560, -300)
    ctx.lineTo(520, -300)
    ctx.lineTo(520, -160)
    ctx.lineTo(760, -160)
    ctx.lineTo(760, 60)
    ctx.stroke()
    ctx.globalAlpha = 1
  }
  // 车 + 面板的黑色衬底（原片拉远后是一张完整的黑卡）
  const back = seg(T, 67.6, 68.2)
  if (back > 0) {
    ctx.fillStyle = `rgba(6,6,6,${0.95 * back})`
    ctx.fillRect(-1320, -915, 1318, 660)
  }
  vinPanel(ctx, red)
  pin(ctx, 0, 230, 150)
  ctx.restore()

  // 70.30–70.333 切片错位（进 DedSec 劫持帧前）
  if (T >= 70.3) sliceGlitch(ctx, { amount: 1, seed: 7030 + fr(T), maxShift: 220, slices: 9 })
}

function roadLabel(ctx: CanvasRenderingContext2D, text: string, size: number, a = 1) {
  font(ctx, size, 700, FONT.sans)
  tracking(ctx, -size * 0.02)
  ctx.globalAlpha = a
  ctx.lineWidth = size * 0.035
  ctx.strokeStyle = 'rgba(240,240,240,0.95)'
  ctx.fillStyle = '#44474b'
  ctx.fillText(text, 0, 0)
  ctx.strokeText(text, 0, 0)
  ctx.globalAlpha = 1
  tracking(ctx, 0)
}

// ---------------- DedSec 劫持快切（影片 70.333–70.567，每帧 2 个原片帧） ----------------
/** ASSET 漫画帧：尖叫眼镜男（借用 part3 的 screamerSprite 剪影）+ "OMG!!! IT'S DEDSEC!"，整帧按 tint 单色化 */
function comicFrame(ctx: CanvasRenderingContext2D, W: number, H: number, tint: string, omg: boolean) {
  ctx.fillStyle = '#f2f2ee'
  ctx.fillRect(0, 0, W, H)
  // 背景网点
  ctx.fillStyle = 'rgba(0,0,0,0.35)'
  for (let y = 0; y < H; y += 14) for (let x = (y / 14) % 2 ? 7 : 0; x < W; x += 14) ctx.fillRect(x, y, 5, 5)
  const img = screamerSprite(620)
  ctx.drawImage(img, omg ? 1080 : 420, omg ? 60 : 40, 620, 775)
  ctx.save()
  font(ctx, omg ? 130 : 150, 700, FONT.pixel)
  ctx.fillStyle = '#111'
  ctx.translate(omg ? 330 : 1150, omg ? 330 : 260)
  ctx.rotate(-0.1)
  if (omg) ctx.fillText('OMG!!!', 0, 0)
  ctx.fillText("IT'S DEDSEC", omg ? -40 : 0, omg ? 150 : 0)
  ctx.restore()
  ctx.save()
  ctx.globalCompositeOperation = 'multiply'
  ctx.fillStyle = tint
  ctx.fillRect(0, 0, W, H)
  ctx.restore()
}

/** 红车 + 红叉（劫持帧与 N. Oak St. 共用），(x,y) 为车左上角 */
function redCarX(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(s, s)
  carTop(ctx, 60, 110, true)
  ctx.strokeStyle = WD2.red
  ctx.lineWidth = 16
  ctx.beginPath()
  ctx.moveTo(90, 10)
  ctx.lineTo(190, 100)
  ctx.moveTo(190, 10)
  ctx.lineTo(90, 100)
  ctx.stroke()
  ctx.restore()
}

function spiralFrame(ctx: CanvasRenderingContext2D, W: number, H: number, frame: number) {
  ctx.fillStyle = '#020608'
  ctx.fillRect(0, 0, W, H)
  font(ctx, 18, 400, FONT.pixel)
  for (let i = 0; i < 2600; i++) {
    const a = i * 0.021
    const r = 30 + a * 58
    const x = 960 + Math.cos(a) * r * 1.1
    const y = 380 + Math.sin(a) * r * 0.8
    const th = 28 + (i % 7) * 4
    for (let k = 0; k < 3; k++) {
      ctx.fillStyle = `rgba(80,200,215,${0.4 + hash(i * 3 + k + frame) * 0.6})`
      ctx.fillText(hash(i * 7 + k) > 0.5 ? '1' : '0', x + k * 10 * Math.sin(a), y - (k * th) / 3)
    }
  }
  mono(ctx, '1GNCST8Z44M0112674', 1240, 520, 16, 'rgba(80,200,215,0.9)')
  mono(ctx, '1GNCST8Z44M0112674', 1270, 600, 16, 'rgba(80,200,215,0.9)')
}

function loadingFrame(ctx: CanvasRenderingContext2D, W: number, H: number) {
  ctx.fillStyle = '#1a0306'
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = 'rgba(160,20,40,0.6)'
  ctx.fillRect(0, 0, W, 300)
  dotMatrix(ctx, { text: 'LOADING', x: 420, y: 90, cell: 10, rows: 12, color: '#e0242b', shape: 'square' })
  ctx.strokeStyle = 'rgba(224,36,43,0.8)'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(0, 520)
  ctx.quadraticCurveTo(900, 300, 1920, 380)
  ctx.stroke()
  redCarX(ctx, 1230, 300, 1)
  redCarX(ctx, 1640, 560, 0.9)
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = 'rgba(120,20,30,0.7)'
    ctx.beginPath()
    ctx.arc(250 + i * 220, 950, 70, Math.PI, 0)
    ctx.fill()
  }
}

/** 暗色街道 + 红车红叉（紫色切片帧的下半） */
function darkStreet(ctx: CanvasRenderingContext2D, W: number, H: number, tint: string) {
  ctx.fillStyle = '#050307'
  ctx.fillRect(0, 0, W, H)
  ctx.strokeStyle = tint
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(0, 700)
  ctx.quadraticCurveTo(900, 520, 1920, 600)
  ctx.moveTo(0, 820)
  ctx.quadraticCurveTo(900, 640, 1920, 720)
  ctx.stroke()
  redCarX(ctx, 1000, 560, 1)
}

/**
 * 原片逐帧（影片时间）：70.333 青色 0/1 螺旋 → 70.367 黄绿漫画 → 70.4 紫色漫画切片 + 暗街红车
 * → 70.433 红色 LOADING → 70.467 暗红切片 → 70.5 品红切片 → 70.533 品红 "OMG!!! IT'S DEDSEC!" 漫画。
 */
function renderHijack(f: FrameCtx) {
  const { ctx, W, H } = f
  const T = f.t + DT
  const frame = fr(T)
  const k = Math.floor((T - 70.333) / 0.0334 + 1e-6)
  if (k <= 0) return spiralFrame(ctx, W, H, frame)
  if (k === 1) return comicFrame(ctx, W, H, '#93b02c', false)
  if (k === 2) {
    darkStreet(ctx, W, H, 'rgba(150,60,200,0.7)')
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, 0, W, 460)
    ctx.clip()
    comicFrame(ctx, W, H, '#8e35c8', false)
    ctx.restore()
    return sliceGlitch(ctx, { amount: 1, seed: 7040, maxShift: 260, slices: 10 })
  }
  if (k === 3) return loadingFrame(ctx, W, H)
  if (k === 4) {
    loadingFrame(ctx, W, H)
    ctx.save()
    ctx.globalAlpha = 0.6
    comicFrame(ctx, W, H, '#6a0c22', false)
    ctx.restore()
    return sliceGlitch(ctx, { amount: 1, seed: 7047, maxShift: 300, slices: 12 })
  }
  if (k === 5) {
    // 原片这一帧整体很暗（均亮约 17）：暗品红漫画碎片
    comicFrame(ctx, W, H, '#c21a6a', true)
    ctx.save()
    ctx.globalCompositeOperation = 'multiply'
    ctx.fillStyle = '#3a0a1e'
    ctx.fillRect(0, 0, W, H)
    ctx.restore()
    return sliceGlitch(ctx, { amount: 1, seed: 7050, maxShift: 320, slices: 12 })
  }
  comicFrame(ctx, W, H, '#cc1f72', true)
}

// ---------------- 镜头 2：N. Oak St. 特写（70.55–72.3） ----------------
const nTop = (x: number) => 330 - 0.16 * x + 0.00004 * (x - 900) * (x - 900) * 0.4
function renderOak1(f: FrameCtx) {
  const { ctx, t } = f
  const T = t + DT
  const z = keyed([[70.55, 1.18], [71.45, 1.08], [71.95, 0.75], [72.3, 0.66]], t, lin)
  const rot = keyed([[70.55, 0.04], [72.3, -0.02]], t)
  const px = 1 / z
  // 71.35 起镜头上摇：世界整体下移（按原片路沿线位置量，影片时间）
  const dy = 80 + keyed([[71.5, 0], [71.6, 180], [71.8, 330], [72.0, 330], [72.37, 380]], T, lin)
  ctx.save()
  ctx.translate(0, dy)
  camera(ctx, 1020, 740, 1020, 740, z, rot)
  drawBand(ctx, nTop, 210, -2500, 4500, 2.5 * px)
  ctx.save()
  ctx.translate(1450, nTop(1450) + 185)
  ctx.rotate(-0.17)
  roadLabel(ctx, 'N. Oak St.', 118)
  ctx.restore()
  // 地块线：白、青、黄
  const R = rng(71)
  for (let i = 0; i < 16; i++) {
    const x = R.range(-600, 2600)
    const y = nTop(x) + 300
    const col = i % 6 === 0 ? 'rgba(80,160,210,0.6)' : LINE
    ctx.strokeStyle = col
    ctx.lineWidth = 2.5 * px
    ctx.beginPath()
    ctx.moveTo(x, y)
    let cx = x
    let cy = y
    for (let k = 0; k < 3; k++) {
      cx += R.range(-520, 520)
      cy += R.range(120, 380)
      ctx.lineTo(cx, cy)
    }
    ctx.stroke()
  }
  // 路上方的房子地块
  ctx.strokeStyle = LINE
  ctx.beginPath()
  for (let x = -1400; x < 3400; x += 380) {
    ctx.moveTo(x, nTop(x) - 50)
    ctx.lineTo(x + 30, nTop(x) - 400)
  }
  ctx.stroke()
  // 路北侧的房子 + 另一辆白车的小卡片（71.5 起随上摇进入画面）
  ctx.strokeStyle = LINE
  ctx.lineWidth = 3 * px
  for (const [x, s2, seed] of [[-250, 200, 5], [120, 170, 17], [560, 260, 29], [1150, 230, 41], [1700, 200, 53]] as const)
    isoHouse(ctx, x, nTop(x) - 200, s2, seed)
  ctx.save()
  ctx.translate(430, nTop(430) - 520)
  carTop(ctx, 34, 80)
  ctx.fillStyle = '#0b0b0b'
  ctx.fillRect(40, 0, 90, 80)
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'
  ctx.lineWidth = 1
  ctx.strokeRect(40, 0, 90, 80)
  mono(ctx, '1GNCST8Z44M0112674', 46, 56, 7, '#ddd')
  ctx.restore()
  pin(ctx, 600, nTop(600) - 360, 22)
  // 红车 + 红叉卡
  ctx.save()
  ctx.translate(1075, 650)
  carTop(ctx, 72, 180, true)
  ctx.fillStyle = '#0b0b0b'
  ctx.fillRect(88, 0, 190, 180)
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'
  ctx.lineWidth = 1.5
  ctx.strokeRect(88, 0, 190, 180)
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = 'rgba(255,255,255,0.45)'
    ctx.fillRect(100, 14 + i * 9, 80 + hash(i) * 80, 2)
  }
  mono(ctx, '1GNCST8Z44M0112674', 100, 128, 13, '#eee')
  mono(ctx, '1CS8', 100, 168, 13, '#eee')
  ctx.strokeStyle = WD2.red
  ctx.lineWidth = 14
  ctx.beginPath()
  ctx.moveTo(115, 20)
  ctx.lineTo(265, 165)
  ctx.moveTo(265, 20)
  ctx.lineTo(115, 165)
  ctx.stroke()
  ctx.restore()
  pin(ctx, 1355, 950, 38)
  pin(ctx, 1060, nTop(1060) - 90, 30)
  // 个人资料列表（原片 70.9 起在车卡右侧逐行打出，随镜头一起移动）
  const la = seg(T, 70.9, 71.0)
  if (la > 0) {
    const labels = ['LAST NAME', 'FIRST NAME', 'MIDDLE NAME', 'SUFFIX', 'BROWSER SEARCH', 'STATUS', 'DOB', 'AGE', 'SEX', 'RACE', 'HEIGHT', 'WEIGHT', 'EYES', 'HAIR', 'STREET ADDRESS', 'CITY', 'STATE', 'ZIP', 'SSN', 'PHONE', 'EMAIL', 'EMPLOYER', 'INCOME', 'CREDIT SCORE', 'ARREST REC', 'VEHICLE']
    const vals = ['CARTER', 'JILL', 'ANN', '-', '42,088', 'MARRIED', '03/11/81', '35', 'F', 'W', "5'6", '128', 'BRN', 'BRN', '1423 N OAK ST', 'MENLO PARK', 'CA', '94025', '***-**-5521', '650-***-0192', 'jcarter@', 'NUDLE', '$84,000', '712', 'NONE', 'CHEVROLET']
    const n = Math.floor(labels.length * seg(T, 70.9, 71.35))
    for (let i = 0; i < n; i++) {
      mono(ctx, labels[i], 1740, 440 + i * 22, 15, `rgba(235,235,235,${0.8 * la})`, 1)
      mono(ctx, vals[i], 1905, 440 + i * 22, 15, `rgba(235,235,235,${0.8 * la})`, 1)
    }
  }
  ctx.restore()
  // 70.567–70.6 切入时的切片错位
  if (T < 70.6) sliceGlitch(ctx, { amount: 1, seed: 7057, maxShift: 240, slices: 10 })
}

// ---------------- 镜头 3：更大的街区 + 数据卡片（72.3–77.6） ----------------
interface Hood {
  roads: { pts: number[]; w: number; label?: string; lx?: number; ly?: number; lr?: number }[]
  houses: [number, number, number, number][]
  cards: { x: number; y: number; w: number; seed: number; delay: number }[]
  reds: [number, number, number][]
}
let hood: Hood | null = null
/**
 * 街区世界坐标 = 原片 73.0s 画面的屏幕坐标（1920×1080，z=1 时一一对应），道路 / 湖 / 房子位置按该帧逐项量。
 */
function makeHood(): Hood {
  if (hood) return hood
  const R = rng(73)
  const roads: Hood['roads'] = [
    // N. Oak St.：沿画面底边，左端向下弯出画面
    { pts: [-1400, 2200, -300, 1500, 500, 1150, 1100, 1060, 1900, 1000, 3200, 980], w: 150, label: 'N. Oak St.', lx: 1110, ly: 1062, lr: -0.03 },
    // 12th Ave：从底部中间向右上弧形上行
    { pts: [1080, 1300, 1150, 1080, 1400, 880, 1620, 700, 1720, 450, 1650, 200, 1480, 0, 1300, -400], w: 110, label: '12th Ave', lx: 1668, ly: 400, lr: 1.35 },
    // 与 12th Ave 平行的内侧细路
    { pts: [780, 1150, 900, 1000, 1200, 820, 1480, 580, 1580, 320, 1520, 60, 1400, -300], w: 44 },
    // 右侧外圈大弯路
    { pts: [1500, 1200, 1800, 900, 2000, 500, 1950, 100, 1800, -200, 1500, -500], w: 70 },
    { pts: [1950, 100, 2300, -100, 2700, 0, 3000, 300], w: 60 },
    { pts: [2000, 500, 2400, 700, 2800, 650, 3200, 900], w: 60 },
    { pts: [300, -700, 700, -350, 1100, -250, 1480, 0], w: 60 },
    { pts: [-1400, 300, -800, 450, -300, 800, 100, 1250], w: 60 },
    { pts: [-1300, -600, -900, -300, -500, -250, 0, -500, 300, -700], w: 60 },
  ]
  const houses: Hood['houses'] = [
    [960, 800, 240, 5],
    [1100, 790, 200, 9],
    [690, 930, 130, 21],
    [1300, 420, 160, 12],
    [1380, 250, 150, 33],
    [1420, 130, 170, 44],
    [1620, 100, 150, 47],
    [220, 1020, 160, 51],
  ]
  // 沿道路两侧撒房子（原片 74–76s 拉远后路边密密一排）
  for (const r of roads) {
    for (let i = 0; i + 3 < r.pts.length; i += 2) {
      const [x0, y0, x1, y1] = [r.pts[i], r.pts[i + 1], r.pts[i + 2], r.pts[i + 3]]
      const n = Math.floor(Math.hypot(x1 - x0, y1 - y0) / 380)
      for (let k = 0; k < n; k++) {
        const u = (k + 0.5) / n
        const side = R.chance(0.5) ? 1 : -1
        const dx = x1 - x0
        const dy = y1 - y0
        const l = Math.hypot(dx, dy) || 1
        const off = side * (r.w / 2 + R.range(90, 200))
        const x = lerp(x0, x1, u) - (dy / l) * off
        const y = lerp(y0, y1, u) + (dx / l) * off
        if (x > 200 && x < 1250 && y > 350 && y < 1000) continue // 中央卡片区留空
        if (x > 200 && x < 1050 && y > -20 && y < 320) continue // 湖
        houses.push([x, y, R.range(90, 140), R.int(1, 999)])
      }
    }
  }
  const cards: Hood['cards'] = []
  for (let i = 0; i < 70; i++) cards.push({ x: R.range(-1400, 3300), y: R.range(-900, 2000), w: R.range(110, 240), seed: R.int(1, 9999), delay: R.range(73.8, 76.3) })
  const reds: Hood['reds'] = [[640, 890, 1]]
  for (let i = 0; i < 3; i++) reds.push([R.range(-1200, 3000), R.range(-800, 1800), R.range(0.8, 1.3)])
  hood = { roads, houses, cards, reds }
  return hood
}

function roadPath(ctx: CanvasRenderingContext2D, pts: number[]) {
  ctx.beginPath()
  ctx.moveTo(pts[0], pts[1])
  for (let i = 2; i < pts.length - 2; i += 2) {
    const mx = (pts[i] + pts[i + 2]) / 2
    const my = (pts[i + 1] + pts[i + 3]) / 2
    ctx.quadraticCurveTo(pts[i], pts[i + 1], mx, my)
  }
  ctx.lineTo(pts[pts.length - 2], pts[pts.length - 1])
}

function redMark(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(s, s)
  carTop(ctx, 20, 46, true)
  ctx.strokeStyle = WD2.red
  ctx.lineWidth = 6
  ctx.beginPath()
  ctx.moveTo(28, 6)
  ctx.lineTo(62, 40)
  ctx.moveTo(62, 6)
  ctx.lineTo(28, 40)
  ctx.stroke()
  ctx.restore()
}

/** 画街区地图（湖 / 等高线 / 道路 / 房子）；在离屏层上画，整体淡出时不会叠出灰色路面 */
function hoodMap(ctx: CanvasRenderingContext2D, H: Hood, px: number) {
  // 等高线（暗青）
  ctx.strokeStyle = 'rgba(60,110,150,0.3)'
  ctx.lineWidth = 1.5 * px
  for (let i = 0; i < 14; i++) {
    ctx.beginPath()
    ctx.moveTo(-1500, -900 + i * 260)
    ctx.bezierCurveTo(-300, -700 + i * 240, 900, -1300 + i * 300, 3300, -500 + i * 240)
    ctx.stroke()
  }
  // 湖（左上）
  ctx.strokeStyle = LINE
  ctx.lineWidth = 2.5 * px
  ctx.fillStyle = '#0d0e10'
  ctx.beginPath()
  ctx.moveTo(280, 40)
  ctx.bezierCurveTo(500, 0, 900, 20, 1000, 120)
  ctx.bezierCurveTo(1050, 220, 900, 270, 660, 280)
  ctx.bezierCurveTo(480, 290, 300, 300, 250, 200)
  ctx.bezierCurveTo(220, 120, 230, 60, 280, 40)
  ctx.fill()
  ctx.stroke()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const r of H.roads) {
    roadPath(ctx, r.pts)
    ctx.strokeStyle = LINE
    ctx.lineWidth = r.w + 5 * px
    ctx.stroke()
  }
  for (const r of H.roads) {
    roadPath(ctx, r.pts)
    ctx.strokeStyle = ROAD
    ctx.lineWidth = r.w
    ctx.stroke()
  }
  ctx.lineCap = 'butt'
  for (const r of H.roads) {
    if (!r.label) continue
    ctx.save()
    ctx.translate(r.lx!, r.ly!)
    ctx.rotate(r.lr!)
    roadLabel(ctx, r.label, r.w * 0.5)
    ctx.restore()
  }
  ctx.strokeStyle = LINE
  ctx.lineWidth = 2.5 * px
  for (const [x, y, s, seed] of H.houses) isoHouse(ctx, x, y, s, seed)
}

function renderHood(f: FrameCtx) {
  const { ctx, t } = f
  const T = t + DT
  // 相机关键帧（影片时间）：按原片 72.5 / 73.0 / 74.8 帧里卡片、湖、路名的位置反算
  const z = keyed([[72.37, 1.5], [72.5, 1.36], [73.0, 1.0], [74.8, 0.64], [77.67, 0.4]], T, lin)
  const ax = keyed([[72.37, 965], [72.5, 965], [73.0, 960], [74.8, 959], [77.67, 960]], T, lin)
  const ay = keyed([[72.37, 800], [72.5, 779], [73.0, 540], [74.8, 320], [77.67, 380]], T, lin)
  const rot = 0
  const px = 1 / z
  const mapA = 1 - seg(t, 75.1, 76.4)
  const H = makeHood()
  if (mapA > 0) {
    const L = offscreen('wd2-hood-map', f.W, f.H)
    L.ctx.setTransform(1, 0, 0, 1, 0, 0)
    L.ctx.clearRect(0, 0, f.W, f.H)
    L.ctx.save()
    camera(L.ctx, ax, ay, 960, 540, z, rot)
    hoodMap(L.ctx, H, px)
    L.ctx.restore()
    ctx.save()
    ctx.globalAlpha = mapA
    ctx.drawImage(L.canvas, 0, 0)
    ctx.restore()
  }
  ctx.save()
  camera(ctx, ax, ay, 960, 540, z, rot)
  // 数据卡片（地图淡出后仍在，并逐渐变多、变亮）
  // 主卡：BROWSER SEARCH HISTORY / SOCIAL MEDIA HISTORY / 马赛克头像 / 文本块（位置按原片 73.0s）
  const hero = seg(t, 72.3, 72.4)
  ctx.globalAlpha = hero
  heroCard(ctx, 700, 580, 220, 220, 'BROWSER SEARCH HISTORY')
  heroCard(ctx, 980, 455, 220, 240, 'SOCIAL MEDIA HISTORY')
  drawFace(ctx, 88, 7, 540, 870, 120, 70)
  for (let i = 0; i < 3; i++) dataCard(ctx, 400 + i, 30, 160 + i * 55, 190)
  ctx.fillStyle = 'rgba(12,12,12,0.9)'
  ctx.fillRect(260, 870, 240, 150)
  for (let i = 0; i < 10; i++) {
    ctx.fillStyle = 'rgba(200,200,200,0.5)'
    ctx.fillRect(270, 882 + i * 13, 40 + hash(i) * 40, 3)
    ctx.fillRect(360, 882 + i * 13, 30 + hash(i + 50) * 60, 3)
  }
  ctx.globalAlpha = 1
  for (const c of H.cards) {
    const a = seg(t, c.delay, c.delay + 0.15)
    if (a <= 0) continue
    dataCard(ctx, c.seed, c.x, c.y, c.w, a * 0.8)
  }
  for (const [x, y, s] of H.reds) redMark(ctx, x, y, s)
  ctx.restore()
}

function heroCard(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, title: string) {
  ctx.fillStyle = 'rgba(10,10,10,0.92)'
  ctx.fillRect(x, y, w, h)
  ctx.fillStyle = '#f0f0f0'
  ctx.fillRect(x, y, w, 16)
  mono(ctx, title, x + 5, y + 12, 11, '#111', 1)
  ctx.fillStyle = 'rgba(220,220,220,0.75)'
  if (title.startsWith('SOCIAL')) {
    for (let i = 0; i < 16; i++) ctx.fillRect(x + 12 + i * 13, y + 70 - hash(i) * 40, 7, 10 + hash(i) * 40)
    ctx.beginPath()
    ctx.arc(x + 190, y + 150, 20, 0, Math.PI * 2)
    ctx.fill()
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = hash(i + 9) > 0.8 ? 'rgba(224,36,43,0.8)' : 'rgba(220,220,220,0.7)'
      ctx.fillRect(x + 30 + (i % 10) * 14, y + 220 + Math.floor(i / 10) * 12, 6, 6)
    }
  } else {
    for (let i = 0; i < 20; i++) {
      ctx.fillRect(x + 10, y + 30 + i * 12, 6, 4)
      ctx.fillRect(x + 30, y + 30 + i * 12, 30 + hash(i) * 50, 3)
      ctx.fillRect(x + 110, y + 30 + i * 12, 40 + hash(i + 30) * 80, 3)
    }
  }
}

export const streetScenes: Scene[] = [
  {
    id: 'wd2-065-vin',
    start: 65.35,
    end: 70.333 - DT,
    note: '下摇到顶视车 + VIN 面板 + 定位针，随后一路拉远成街区线稿；70.05 车变红打叉',
    render: renderCar,
  },
  {
    id: 'wd2-070-hijack',
    start: 70.333 - DT,
    end: 70.567 - DT,
    note: 'DedSec 劫持三帧：青色像素螺旋 / 红色 LOADING / 洋红漫画 "OMG!!! IT\'S DEDSEC!"',
    render: renderHijack,
  },
  {
    id: 'wd2-070-oak',
    start: 70.567 - DT,
    end: 72.3,
    note: 'N. Oak St. 特写：红车 + 红叉卡、定位针、彩色地块线；右侧个人资料列表逐行打出',
    render: renderOak1,
  },
  {
    id: 'wd2-072-hood',
    start: 72.3,
    end: 77.6,
    note: '更大的街区（湖、12th Ave、等距小房子）+ 数据卡片，拉远，75.4 起地图淡出只剩卡片',
    render: renderHood,
  },
]
