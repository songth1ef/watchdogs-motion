/**
 * 47.92–54.9s：人脸档案卡漫天翻飞 → 主卡 + ctOS 档案面板推近 →
 * 「you / bought / sold / stolen」彩色底块闪字与卡片交替 → 白底骷髅图标 → 暗红残影 → 黑。
 */
import type { FrameCtx, Scene } from '../../../engine/types'
import { ease, hash, lerp, rng, seg } from '../../../engine/math'
import { FONT, font, tracking } from '../../../fx/text'
import { sliceGlitch } from '../../../fx/glitch'
import { WD2 } from '../../../theme'
import { ctosPanel, faceCard, fr } from './common'

// ---------- 镜头 A：卡片翻飞 47.99–49.25（影片时间） ----------
/**
 * part2.ts 统一把镜头平移了 DT=0.07s；本文件逐帧核对（seek 取帧，与 score/snap 同语义）后发现
 * 卡片镜头的切点并不需要这个平移，所以镜头内部一律换算回影片时间 T = f.t + DT 来写时间码。
 */
const DT = 0.07
/**
 * 卡片布局：按原片 48.5s 帧逐张量的位置（1280 宽坐标 → ×1.5），[cx, cy, 边长, 旋转°, 景深模糊 px, 慢漂 vx, vy]。
 * 旋转 +90 的卡片是原片里遮挡条竖着的那几张。只取位置/尺寸，头像仍是程序化 ASSET。
 */
const LAYOUT: [number, number, number, number, number, number, number][] = [
  [320, 28, 110, -10, 2.5, 4, -6],
  [680, 55, 160, -25, 1.5, 6, -8],
  [870, 45, 195, 65, 0.5, 5, -6],
  [1195, 62, 165, -30, 1, 8, -5],
  [1043, 162, 122, -27, 0.5, 6, -4],
  [910, 232, 152, 66, 0, 5, -3],
  [290, 393, 154, -30, 1.2, -4, 2],
  [621, 366, 214, -28, 0, 3, 4],
  [896, 418, 90, -10, 0.5, 4, 2],
  [1077, 403, 123, -30, 0.5, 6, 0],
  [1240, 450, 118, 0, 1.5, 7, 2],
  [792, 533, 74, -27, 1.5, 3, 5],
  [675, 607, 74, -27, 1.5, 2, 6],
  [1225, 545, 80, -20, 2, 5, 6],
  [170, 662, 190, 24, 2.5, -6, 8],
  [465, 668, 145, -9, 1.5, 0, 9],
  [905, 682, 250, 10, 2, 3, 12],
  [1168, 655, 190, -20, 2.5, 6, 10],
  [1032, 708, 50, -15, 2, 2, 8],
]

/** 画整组卡片（intro 为推入进度 0..1，1 = 落位） */
function drawCardLayout(ctx: CanvasRenderingContext2D, T: number, intro: number, skip = -1) {
  const lt = T - 48.05
  const z = (0.55 + 0.45 * intro) * (1 + 0.012 * Math.max(0, lt))
  ctx.save()
  ctx.translate(930, 560)
  ctx.scale(z, z)
  ctx.translate(-930, -560)
  LAYOUT.forEach(([x, y, s, rot, blur, vx, vy], i) => {
    if (i === skip) return
    ctx.save()
    ctx.translate(x * 1.5 + vx * 1.5 * lt, y * 1.5 + vy * 1.5 * lt)
    ctx.rotate(((rot + 2 * lt * (i % 3 === 0 ? 1 : -0.5)) * Math.PI) / 180)
    const b = 0.8 + blur + (1 - intro) * 6
    if (b > 0.3) ctx.filter = `blur(${b.toFixed(1)}px)`
    // 卡片在 3D 里微微翻转：水平方向轻微压缩
    ctx.scale(0.94 + 0.06 * Math.cos(i * 1.7 + lt * 0.8), 1)
    faceCard(ctx, 40 + i * 7, s * 1.5, i % 4 === 0 ? 10 : 12)
    ctx.restore()
  })
  ctx.restore()
}

/** 49.117–49.25 四色故障帧：每色 2 帧（天蓝 → 黄绿 → 紫 → 品红），整屏单色化 + 横向切片错位 */
const GLITCH_COLS = [WD2.sky, WD2.lime, WD2.purple, WD2.magenta]

function renderCardsA(f: FrameCtx) {
  const { ctx } = f
  const T = f.t + DT
  const intro = ease.outCubic(seg(T, 47.99, 48.07))
  drawCardLayout(ctx, T, intro)
  if (T >= 49.117) {
    const k = Math.min(3, Math.floor((T - 49.117) / 0.0334))
    ctx.save()
    ctx.globalCompositeOperation = 'multiply'
    ctx.fillStyle = GLITCH_COLS[k]
    ctx.fillRect(0, 0, f.W, f.H)
    ctx.restore()
    sliceGlitch(ctx, { amount: 1, seed: 4911 + k * 17, maxShift: 140, slices: 12 })
  }
}

/** 背景里几条贯穿的细白线（带刻度点） */
function bgLines(ctx: CanvasRenderingContext2D, lt: number, alpha: number) {
  const R = rng(99)
  ctx.strokeStyle = `rgba(255,255,255,${alpha})`
  ctx.fillStyle = `rgba(255,255,255,${alpha * 1.6})`
  ctx.lineWidth = 1
  for (let i = 0; i < 7; i++) {
    const x1 = R.range(-200, 2100)
    const y1 = R.range(-100, 1180)
    const a = R.range(0, Math.PI) + lt * 0.02
    const dx = Math.cos(a) * 2400
    const dy = Math.sin(a) * 2400
    ctx.beginPath()
    ctx.moveTo(x1 - dx, y1 - dy)
    ctx.lineTo(x1 + dx, y1 + dy)
    ctx.stroke()
    for (let k = -8; k <= 8; k++) ctx.fillRect(x1 + (dx * k) / 16 - 1.5, y1 + (dy * k) / 16 - 1.5, 3, 3)
  }
}

// ---------- 镜头 B：主卡 + ctOS 面板 49.25–53.71（中间穿插闪字） ----------
const MAIN_SEED = 23
/** 主卡在 LAYOUT 里的下标 */
const MAIN_IDX = 7

function mainCard(ctx: CanvasRenderingContext2D, t: number, zoomBoost = 1, coarse = 0) {
  const p = seg(t, 49.25, 53.7)
  const q = seg(t, 49.25, 52.05)
  const size = (lerp(560, 830, q) + 70 * seg(t, 52.05, 53.7)) * zoomBoost
  const rot = lerp(-0.3, -0.1, q) + 0.04 * seg(t, 52.05, 53.7)
  const cx = lerp(905, 880, p)
  const cy = lerp(560, 530, p)
  // 周围的卡：沿用镜头 A 的同一组卡片布局（原片是同一场景继续推近主卡），主卡 = LAYOUT[MAIN_IDX]
  const [mx, my, ms, mr] = LAYOUT[MAIN_IDX]
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(rot - (mr * Math.PI) / 180)
  ctx.scale(size / (ms * 1.5), size / (ms * 1.5))
  ctx.translate(-mx * 1.5, -my * 1.5)
  ctx.globalAlpha = 0.85
  drawCardLayout(ctx, 48.05, 1, MAIN_IDX)
  ctx.restore()
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(rot)
  ctx.shadowColor = 'rgba(0,0,0,0.7)'
  ctx.shadowBlur = 30
  // 推近到脸部时马赛克变粗
  const res = coarse || (zoomBoost > 1.2 ? 10 : 14)
  faceCard(ctx, MAIN_SEED, size, res)
  ctx.shadowBlur = 0
  // 档案面板：卡片右侧，略高
  const stage =
    t < 50.9 ? 0 : t < 51.8 ? 0.4 : t < 52.1 ? 0.6 : t < 52.95 ? 0.8 : 1
  ctx.translate(size * 0.53, -size * 0.56)
  ctx.rotate(0.02)
  ctosPanel(ctx, size * 0.36, size * 1.02, stage, fr(t))
  ctx.restore()
}

// ---------- 闪字 ----------
interface Flash {
  word: string
  t0: number
  t1: number
  x: number
  y: number
  box: string
  mid?: string
}
const FLASHES: Flash[] = [
  { word: 'you', t0: 51.63, t1: 51.865, x: 955, y: 535, box: WD2.magenta },
  { word: 'bought', t0: 52.3, t1: 52.535, x: 648, y: 520, box: WD2.sky, mid: WD2.purple },
  { word: 'sold', t0: 52.833, t1: 53.066, x: 985, y: 520, box: WD2.lime },
  { word: 'stolen', t0: 53.433, t1: 53.667, x: 1295, y: 525, box: WD2.lime, mid: WD2.magenta },
]

/** 原片色块/彩字颜色每隔几帧在几种品牌色之间跳变 */
const FLASH_COLORS = [WD2.magenta, WD2.sky, WD2.lime, WD2.purple]
function flashColor(base: string, t: number, salt: string) {
  const k = Math.floor(t * 20)
  const h = hash(k * 31 + salt.length * 7 + salt.charCodeAt(0))
  return h < 0.4 ? base : FLASH_COLORS[Math.floor(h * 10) % FLASH_COLORS.length]
}

function drawFlash(ctx: CanvasRenderingContext2D, fl: Flash, t: number) {
  font(ctx, 96, 700, FONT.sans)
  tracking(ctx, -3)
  const w = ctx.measureText(fl.word).width
  const x = fl.x - w / 2
  const base = fl.y + 34
  const dt = t - fl.t0
  if (dt < 0.084) {
    // 第一帧：色块从左擦出，字是黑色、只露出上半截
    const p = ease.outCubic(seg(dt, 0, 0.05))
    ctx.fillStyle = flashColor(fl.box, t, fl.word)
    ctx.fillRect(x - 6, base - 72, (w + 12) * Math.max(0.35, p), 58)
    ctx.save()
    ctx.beginPath()
    ctx.rect(x - 6, base - 72, w + 12, 58)
    ctx.clip()
    ctx.fillStyle = '#111'
    ctx.fillText(fl.word, x, base)
    ctx.restore()
  } else if (fl.mid && dt < 0.168) {
    ctx.fillStyle = flashColor(fl.mid, t, fl.word + 'm')
    ctx.fillText(fl.word, x, base)
  } else {
    ctx.fillStyle = WD2.fg
    ctx.fillText(fl.word, x, base)
  }
  tracking(ctx, 0)
}

// ---------- 白底图标 ----------
/**
 * ASSET 骷髅扒着一张文件的线稿小图标（原片 53.7–54.6s 白底正中）。
 * 替换：把 skullIcon 换成 drawImage(图标图片)。以图标中心为原点，约 150px 见方。
 */
function skullIcon(ctx: CanvasRenderingContext2D, color: string) {
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = 5
  ctx.lineCap = 'square'
  // 文件：只有四角的方括号边
  const L = -52
  const T = -24
  const Rr = 30
  const B = 72
  ctx.beginPath()
  ctx.moveTo(L + 12, T)
  ctx.lineTo(L, T)
  ctx.lineTo(L, B)
  ctx.lineTo(L + 10, B)
  ctx.moveTo(Rr - 22, B)
  ctx.lineTo(Rr, B)
  ctx.lineTo(Rr, B - 26)
  ctx.moveTo(L + 12, T)
  ctx.lineTo(Rr - 30, T)
  ctx.stroke()
  // 像素斑块
  const px = (x: number, y: number, n: number) => {
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) if ((i + j) % 3 !== 2) ctx.fillRect(x + i * 6, y + j * 6, 6, 6)
  }
  px(-34, 2, 3)
  px(-10, 30, 3)
  px(-38, 44, 3)
  // 骷髅头
  ctx.lineWidth = 3
  ctx.fillStyle = '#fafafa'
  ctx.beginPath()
  ctx.ellipse(10, -44, 30, 26, 0.35, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(-2, -44, 6, 0, Math.PI * 2)
  ctx.arc(18, -38, 7, 0, Math.PI * 2)
  ctx.fill()
  // 肋骨与手臂
  ctx.beginPath()
  for (let i = 0; i < 5; i++) {
    ctx.moveTo(22, -18 + i * 9)
    ctx.quadraticCurveTo(42, -22 + i * 9, 52, -8 + i * 9)
  }
  ctx.moveTo(-8, -60)
  ctx.lineTo(-40, -30)
  ctx.lineTo(-36, -22)
  ctx.moveTo(40, 16)
  ctx.lineTo(18, 24)
  ctx.lineTo(14, 32)
  ctx.stroke()
}

function renderProfile(f: FrameCtx) {
  const { ctx, t, W, H } = f
  // 白底图标段
  if (t >= 53.667 && t < 54.43) {
    const g = ctx.createRadialGradient(W / 2, H / 2, 100, W / 2, H / 2, W * 0.62)
    g.addColorStop(0, '#f5f4f0')
    g.addColorStop(0.6, '#efeeea')
    g.addColorStop(1, '#c9c9c5')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)
    ctx.save()
    ctx.translate(955, 545)
    ctx.shadowColor = 'rgba(0,0,0,0.25)'
    ctx.shadowBlur = 8
    ctx.shadowOffsetX = 4
    ctx.shadowOffsetY = 3
    skullIcon(ctx, '#1a1a1a')
    ctx.restore()
    return
  }
  if (t >= 54.43) {
    const a = 1 - seg(t, 54.43, 54.63)
    if (a > 0) {
      ctx.save()
      ctx.globalAlpha = a * 0.5
      ctx.translate(955, 545)
      skullIcon(ctx, '#5a0a0a')
      ctx.restore()
    }
    return
  }
  // 闪字（起止按原片逐帧亮度跳变量得，内部时间 = 影片时间 − DT）
  const fl = FLASHES.find((x) => t >= x.t0 && t < x.t1)
  if (fl) {
    drawFlash(ctx, fl, t)
    return
  }
  // 卡片（含 52.58–52.83 推到脸部的特写、53.12–53.46 故障）
  bgLines(ctx, t - 49.25, 0.1)
  // 52.535–52.833 原片不是推近特写，而是主卡马赛克突然变粗（约 6 格）
  mainCard(ctx, t, 1, t >= 52.535 && t < 52.833 ? 6 : 0)
  // 49.283–49.35（影片时间）切入后的白色切片错位
  if (t >= 49.213 && t < 49.28) sliceGlitch(ctx, { amount: 1, seed: 4928 + (fr(t) >> 1), maxShift: 180, slices: 10 })
  if (t >= 53.066 && t < 53.433) {
    const k = fr(t) >> 2
    sliceGlitch(ctx, { amount: 0.8 + hash(k) * 0.2, seed: k * 13 + 1, maxShift: 160, slices: 14 })
    const R = rng(k * 7 + 3)
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = R.chance(0.6) ? WD2.red : '#f2f2f2'
      ctx.fillRect(R.range(0, 1700), R.range(200, 900), R.range(60, 400), R.range(4, 12))
    }
  }
}

export const faces: Scene[] = [
  {
    id: 'wd2-047-face-cards',
    start: 47.99 - DT,
    end: 49.25 - DT,
    note: '马赛克人脸档案卡（白边 + 眼部白条）漫天翻飞，镜头缓推',
    render: renderCardsA,
  },
  {
    id: 'wd2-049-profile',
    start: 49.25 - DT,
    end: 54.9,
    note: '主卡 + ctOS 档案面板逐层展开；you/bought/sold/stolen 彩色底块闪字；白底骷髅图标；暗红残影',
    render: renderProfile,
  },
]
