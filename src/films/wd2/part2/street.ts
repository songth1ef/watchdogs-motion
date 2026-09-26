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
import { dataCard, drawFace, fr, mono } from './common'

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
  for (let x = -5200; x < 5200; x += R.range(900, 1300)) {
    if (x > -1700 && x < 1100) continue
    houses.push([x, bandTop(x) - R.range(250, 450), R.range(900, 1250), R.int(1, 999)])
    houses.push([x + 300, bandTop(x) + BAND_W + R.range(700, 1000), R.range(500, 800), R.int(1, 999)])
  }
  const parcels: number[][] = []
  for (let x = -5400; x < 5400; x += R.range(700, 1200)) {
    const y0 = bandTop(x) - 60
    parcels.push([x, y0, x + R.range(-200, 200), y0 - R.range(900, 1600)])
    const y1 = bandTop(x) + BAND_W + 60
    parcels.push([x, y1, x + R.range(-300, 300), y1 + R.range(900, 1600)])
  }
  carWorld = { houses, parcels }
  return carWorld
}

function drawBand(ctx: CanvasRenderingContext2D, top: (x: number) => number, w: number, x0: number, x1: number, lw: number) {
  ctx.beginPath()
  ctx.moveTo(x0, top(x0))
  for (let x = x0; x <= x1; x += 100) ctx.lineTo(x, top(x))
  for (let x = x1; x >= x0; x -= 100) ctx.lineTo(x, top(x) + w)
  ctx.closePath()
  const g = ctx.createLinearGradient(0, top(0), 0, top(0) + w)
  g.addColorStop(0, '#34373b')
  g.addColorStop(1, '#1d1f21')
  ctx.fillStyle = g
  ctx.fill()
  ctx.strokeStyle = LINE
  ctx.lineWidth = lw
  ctx.beginPath()
  for (const off of [-40, 0, w]) {
    ctx.moveTo(x0, top(x0) + off)
    for (let x = x0; x <= x1; x += 100) ctx.lineTo(x, top(x) + off)
  }
  ctx.stroke()
}

function renderCar(f: FrameCtx) {
  const { ctx, t } = f
  const z = keyed([[65.35, 1.18], [66.6, 1.0], [67.1, 0.9], [68.0, 0.64], [69.0, 0.44], [70.3, 0.32]], t)
  const sx = keyed([[66.6, 1360], [68.0, 1320], [69.0, 1290], [70.3, 1600]], t)
  const sy = keyed([[65.35, 1300], [65.9, 820], [66.6, 790], [68.0, 700], [69.0, 900], [70.3, 1050]], t)
  const rot = keyed([[66.6, 0], [68.0, -0.05], [70.3, -0.1]], t)
  const px = 1 / z
  ctx.save()
  camera(ctx, 0, 0, sx, sy, z, rot)
  const W = makeCarWorld()
  drawBand(ctx, bandTop, BAND_W, -6000, 6000, 2.2 * px)
  ctx.strokeStyle = LINE
  ctx.lineWidth = 2 * px
  ctx.beginPath()
  for (const p of W.parcels) {
    ctx.moveTo(p[0], p[1])
    ctx.lineTo(p[2], p[3])
  }
  ctx.stroke()
  ctx.lineWidth = 3 * px
  for (const [x, y, s, seed] of W.houses) isoHouse(ctx, x, y, s, seed)
  // 近景：门、人字屋外轮廓、人行道线
  ctx.lineWidth = Math.max(4, 2.5 * px)
  ctx.strokeStyle = LINE
  ctx.strokeRect(-1128, -228, 248, 278)
  ctx.strokeRect(-1110, -210, 105, 110)
  ctx.strokeRect(-995, -210, 105, 110)
  for (const x of [-1108, -1060, -996, -946]) ctx.strokeRect(x, -80, 40, 110)
  ctx.beginPath()
  ctx.moveTo(-1160, 55)
  ctx.lineTo(-840, 55)
  ctx.moveTo(-1700, 110)
  ctx.lineTo(-300, 110)
  ctx.lineTo(-250, 70)
  ctx.lineTo(900, 70)
  // 右侧房子轮廓
  ctx.moveTo(40, -720)
  ctx.lineTo(140, -720)
  ctx.lineTo(140, -650)
  ctx.lineTo(560, -300)
  ctx.lineTo(520, -300)
  ctx.lineTo(520, -160)
  ctx.lineTo(760, -160)
  ctx.lineTo(760, 60)
  ctx.moveTo(-1700, -200)
  ctx.lineTo(-1500, -200)
  ctx.lineTo(-1500, 110)
  ctx.stroke()
  vinPanel(ctx, t >= 70.05)
  pin(ctx, 0, 230, 150)
  // 70.0 起路面上出现 "N. Oak St." 字样
  if (t > 69.6) {
    ctx.save()
    ctx.translate(1500, bandTop(1500) + 330)
    ctx.rotate(-0.2)
    roadLabel(ctx, 'N. Oak St.', 300, seg(t, 69.6, 70))
    ctx.restore()
  }
  ctx.restore()
}

function roadLabel(ctx: CanvasRenderingContext2D, text: string, size: number, a = 1) {
  font(ctx, size, 700, FONT.sans)
  tracking(ctx, -size * 0.02)
  ctx.globalAlpha = a
  ctx.lineWidth = size * 0.05
  ctx.strokeStyle = 'rgba(240,240,240,0.95)'
  ctx.fillStyle = '#44474b'
  ctx.fillText(text, 0, 0)
  ctx.strokeText(text, 0, 0)
  ctx.globalAlpha = 1
  tracking(ctx, 0)
}

// ---------------- DedSec 故障三帧（70.25–70.55） ----------------
/** ASSET 三张 DedSec 劫持画面，用程序化图形近似 */
function renderHijack(f: FrameCtx) {
  const { ctx, t, W, H } = f
  const frame = fr(t)
  if (t < 70.38) {
    // 青色像素螺旋
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
  } else if (t < 70.46) {
    // 红色 LOADING + 红车红叉
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
    for (const [x, y, s] of [[1230, 300, 1], [1640, 560, 0.9]]) {
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
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = 'rgba(120,20,30,0.7)'
      ctx.beginPath()
      ctx.arc(250 + i * 220, 950, 70, Math.PI, 0)
      ctx.fill()
    }
  } else {
    // 洋红漫画帧
    ctx.fillStyle = '#b8155f'
    ctx.fillRect(0, 0, W, H)
    const R = rng(frame)
    ctx.fillStyle = 'rgba(40,0,15,0.55)'
    for (let i = 0; i < 90; i++) ctx.fillRect(R.range(0, W), R.range(500, H), R.range(20, 120), R.range(10, 50))
    ctx.strokeStyle = '#20000a'
    ctx.lineWidth = 6
    ctx.beginPath()
    ctx.arc(1050, 330, 220, 0.2, 2.8)
    ctx.moveTo(900, 150)
    ctx.quadraticCurveTo(1200, 60, 1350, 260)
    ctx.stroke()
    ctx.save()
    ctx.translate(250, 250)
    ctx.rotate(-0.08)
    font(ctx, 120, 700, FONT.pixel)
    ctx.fillStyle = '#1a0008'
    ctx.fillText('OMG!!!', 0, 0)
    ctx.fillText("IT'S DEDSEC!", -40, 140)
    ctx.restore()
    ctx.fillStyle = '#1a0008'
    for (let i = 0; i < 14; i++) {
      ctx.beginPath()
      ctx.moveTo(i * 140, 760)
      ctx.lineTo(i * 140 + 70, 640 + (i % 2) * 40)
      ctx.lineTo(i * 140 + 140, 760)
      ctx.fill()
    }
  }
}

// ---------------- 镜头 2：N. Oak St. 特写（70.55–72.3） ----------------
const nTop = (x: number) => 330 - 0.16 * x + 0.00004 * (x - 900) * (x - 900) * 0.4
function renderOak1(f: FrameCtx) {
  const { ctx, t } = f
  const z = keyed([[70.55, 1.18], [72.3, 0.92]], t, ease.outCubic)
  const rot = keyed([[70.55, 0.04], [72.3, -0.02]], t)
  const px = 1 / z
  ctx.save()
  camera(ctx, 1020, 740, 1020, 740, z, rot)
  drawBand(ctx, nTop, 290, -1500, 3500, 2.5 * px)
  ctx.save()
  ctx.translate(1350, nTop(1350) + 230)
  ctx.rotate(-0.17)
  roadLabel(ctx, 'N. Oak St.', 150)
  ctx.restore()
  // 地块线：白、青、黄
  const R = rng(71)
  for (let i = 0; i < 16; i++) {
    const x = R.range(-600, 2600)
    const y = nTop(x) + 300
    const col = i % 5 === 0 ? 'rgba(80,190,210,0.8)' : i % 7 === 0 ? 'rgba(210,190,60,0.8)' : LINE
    ctx.strokeStyle = col
    ctx.lineWidth = 2.5 * px
    ctx.beginPath()
    ctx.moveTo(x, y)
    let cx = x
    let cy = y
    for (let k = 0; k < 3; k++) {
      cx += R.range(-250, 250)
      cy += R.range(150, 450)
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
  // 红车 + 红叉卡
  ctx.save()
  ctx.translate(885, 650)
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
  pin(ctx, 1165, 950, 38)
  pin(ctx, 1060, nTop(1060) - 90, 30)
  ctx.restore()
  // 右侧个人资料列表（71.6 起逐行打出）
  const la = seg(t, 71.55, 71.9)
  if (la > 0) {
    const labels = ['LAST NAME', 'FIRST NAME', 'MIDDLE NAME', 'SUFFIX', 'BROWSER SEARCH', 'STATUS', 'DOB', 'AGE', 'SEX', 'RACE', 'HEIGHT', 'WEIGHT', 'EYES', 'HAIR', 'STREET ADDRESS', 'CITY', 'STATE', 'ZIP', 'SSN', 'PHONE', 'EMAIL', 'EMPLOYER', 'INCOME', 'CREDIT SCORE', 'ARREST REC', 'VEHICLE']
    const vals = ['CARTER', 'JILL', 'ANN', '-', '42,088', 'MARRIED', '03/11/81', '35', 'F', 'W', "5'6", '128', 'BRN', 'BRN', '1423 N OAK ST', 'MENLO PARK', 'CA', '94025', '***-**-5521', '650-***-0192', 'jcarter@', 'NUDLE', '$84,000', '712', 'NONE', 'CHEVROLET']
    const n = Math.floor(labels.length * seg(t, 71.55, 72.2))
    for (let i = 0; i < n; i++) {
      mono(ctx, labels[i], 1595, 455 + i * 24, 17, `rgba(235,235,235,${0.85 * la})`, 1)
      mono(ctx, vals[i], 1830, 455 + i * 24, 17, `rgba(235,235,235,${0.85 * la})`, 1)
    }
  }
}

// ---------------- 镜头 3：更大的街区 + 数据卡片（72.3–77.6） ----------------
interface Hood {
  roads: { pts: number[]; w: number; label?: string; lx?: number; ly?: number; lr?: number }[]
  houses: [number, number, number, number][]
  cards: { x: number; y: number; w: number; seed: number; delay: number }[]
  reds: [number, number, number][]
}
let hood: Hood | null = null
function makeHood(): Hood {
  if (hood) return hood
  const R = rng(73)
  const roads: Hood['roads'] = [
    { pts: [-2600, 1500, -600, 1100, 900, 980, 2400, 900, 4200, 1050], w: 240, label: 'N. Oak St.', lx: 1120, ly: 1030, lr: -0.03 },
    { pts: [1600, -1400, 1700, -300, 1760, 200, 1880, 700, 1900, 950], w: 160, label: '12th Ave', lx: 1790, ly: 260, lr: 1.35 },
    { pts: [1700, -300, 1200, -600, 700, -500, 400, -900, -200, -1200], w: 130 },
    { pts: [1760, 200, 2400, 150, 2800, -300, 3300, -600, 3800, -500], w: 130 },
    { pts: [700, -500, 900, -150, 600, 50, 350, -200, 700, -500], w: 100 },
    { pts: [-600, 1100, -900, 400, -1400, 0, -2000, -300], w: 120 },
    { pts: [2400, 900, 2700, 1600, 3100, 2100, 3600, 2400], w: 120 },
  ]
  const houses: Hood['houses'] = [
    [940, 880, 230, 5],
    [1330, 600, 220, 9],
    [1260, 330, 200, 12],
    [660, 830, 150, 21],
  ]
  for (let i = 0; i < 50; i++) houses.push([R.range(-2400, 4000), R.range(-1500, 2300), R.range(180, 300), R.int(1, 999)])
  const cards: Hood['cards'] = []
  for (let i = 0; i < 70; i++) cards.push({ x: R.range(-2400, 4000), y: R.range(-1500, 2300), w: R.range(110, 240), seed: R.int(1, 9999), delay: R.range(72.5, 75.5) })
  const reds: Hood['reds'] = [[640, 790, 1]]
  for (let i = 0; i < 9; i++) reds.push([R.range(-2000, 3600), R.range(-1200, 2000), R.range(0.8, 1.3)])
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

function renderHood(f: FrameCtx) {
  const { ctx, t } = f
  const z = keyed([[72.3, 1.0], [73.3, 0.62], [74.5, 0.46], [77.6, 0.3]], t, ease.outCubic)
  const rot = keyed([[72.3, 0], [77.6, -0.08]], t)
  const ax = keyed([[72.3, 960], [73.3, 1050], [77.6, 900]], t)
  const ay = keyed([[72.3, 560], [73.3, 350], [77.6, 400]], t)
  const px = 1 / z
  const mapA = 1 - seg(t, 75.1, 76.4)
  const H = makeHood()
  ctx.save()
  camera(ctx, ax, ay, 960, 540, z, rot)
  if (mapA > 0) {
    ctx.globalAlpha = mapA
    // 湖
    ctx.strokeStyle = LINE
    ctx.lineWidth = 2.5 * px
    ctx.fillStyle = '#141517'
    ctx.beginPath()
    ctx.moveTo(-100, -350)
    ctx.bezierCurveTo(300, -520, 1050, -380, 1000, -80)
    ctx.bezierCurveTo(960, 130, 250, 180, 120, 60)
    ctx.bezierCurveTo(-40, -80, -300, -250, -100, -350)
    ctx.fill()
    ctx.stroke()
    // 等高线（暗青）
    ctx.strokeStyle = 'rgba(60,120,140,0.35)'
    ctx.lineWidth = 1.5 * px
    for (let i = 0; i < 12; i++) {
      ctx.beginPath()
      ctx.moveTo(-2600, -1400 + i * 330)
      ctx.bezierCurveTo(-800, -1000 + i * 300, 1500, -1700 + i * 380, 4200, -900 + i * 300)
      ctx.stroke()
    }
    // 道路
    for (const r of H.roads) {
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      roadPath(ctx, r.pts)
      ctx.strokeStyle = LINE
      ctx.lineWidth = r.w + 4 * px
      ctx.stroke()
      roadPath(ctx, r.pts)
      ctx.strokeStyle = ROAD
      ctx.lineWidth = r.w
      ctx.stroke()
    }
    for (const r of H.roads) {
      if (!r.label) continue
      ctx.save()
      ctx.translate(r.lx!, r.ly!)
      ctx.rotate(r.lr!)
      roadLabel(ctx, r.label, r.w * 0.5)
      ctx.restore()
    }
    ctx.lineCap = 'butt'
    ctx.strokeStyle = LINE
    ctx.lineWidth = 2.5 * px
    for (const [x, y, s, seed] of H.houses) isoHouse(ctx, x, y, s, seed)
    ctx.globalAlpha = 1
  }
  // 数据卡片（地图淡出后仍在，并逐渐变多、变亮）
  // 主卡：BROWSER SEARCH HISTORY / SOCIAL MEDIA HISTORY / 马赛克头像 / 文本块
  const hero = seg(t, 72.3, 72.5)
  ctx.globalAlpha = hero
  heroCard(ctx, 660, 480, 250, 290, 'BROWSER SEARCH HISTORY')
  heroCard(ctx, 980, 350, 230, 300, 'SOCIAL MEDIA HISTORY')
  drawFace(ctx, 88, 7, 470, 810, 130, 90)
  ctx.fillStyle = 'rgba(12,12,12,0.9)'
  ctx.fillRect(160, 800, 180, 240)
  for (let i = 0; i < 14; i++) {
    ctx.fillStyle = 'rgba(200,200,200,0.5)'
    ctx.fillRect(170, 812 + i * 16, 40 + hash(i) * 40, 3)
    ctx.fillRect(240, 812 + i * 16, 30 + hash(i + 50) * 60, 3)
  }
  ctx.globalAlpha = 1
  for (const c of H.cards) {
    const a = seg(t, c.delay, c.delay + 0.15)
    if (a <= 0) continue
    dataCard(ctx, c.seed, c.x, c.y, c.w, a)
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
    end: 70.3,
    note: '下摇到顶视车 + VIN 面板 + 定位针，随后一路拉远成街区线稿；70.05 车变红打叉',
    render: renderCar,
  },
  {
    id: 'wd2-070-hijack',
    start: 70.3,
    end: 70.55,
    note: 'DedSec 劫持三帧：青色像素螺旋 / 红色 LOADING / 洋红漫画 "OMG!!! IT\'S DEDSEC!"',
    render: renderHijack,
  },
  {
    id: 'wd2-070-oak',
    start: 70.55,
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
