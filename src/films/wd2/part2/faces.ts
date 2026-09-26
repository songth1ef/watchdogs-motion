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

// ---------- 镜头 A：卡片翻飞 47.92–49.25 ----------
interface Card {
  x: number
  y: number
  size: number
  rot: number
  vr: number
  tumble: number
  seed: number
  res: number
}
let cardsA: Card[] | null = null
function makeCardsA() {
  if (cardsA) return cardsA
  const R = rng(777)
  const out: Card[] = []
  for (let i = 0; i < 34; i++) {
    const size = R.range(110, 330) * (R.chance(0.2) ? 1.3 : 1)
    out.push({
      x: R.range(-100, 2000),
      y: R.range(-120, 1180),
      size,
      rot: R.range(-0.7, 0.7),
      vr: R.range(-0.15, 0.15),
      tumble: R.range(0.55, 1),
      seed: R.int(1, 500),
      res: R.pick([10, 12, 12, 14, 24]),
    })
  }
  // 大卡往中下方靠
  out.sort((a, b) => a.size - b.size)
  cardsA = out
  return out
}

function renderCardsA(f: FrameCtx) {
  const { ctx, lt } = f
  const z = 1 + 0.12 * lt
  ctx.save()
  ctx.translate(960, 540)
  ctx.scale(z, z)
  ctx.translate(-960 - 40 * lt, -540 + 60 * lt)
  for (const c of makeCardsA()) {
    ctx.save()
    ctx.translate(c.x, c.y - 30 * lt * (c.size / 200))
    ctx.rotate(c.rot + c.vr * lt)
    ctx.scale(c.tumble, 1)
    ctx.shadowColor = 'rgba(0,0,0,0.6)'
    ctx.shadowBlur = 20
    faceCard(ctx, c.seed, c.size, c.res)
    ctx.restore()
  }
  ctx.restore()
  bgLines(ctx, lt, 0.08)
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

function mainCard(ctx: CanvasRenderingContext2D, t: number, zoomBoost = 1) {
  const p = seg(t, 49.25, 53.7)
  const q = seg(t, 49.25, 52.05)
  const size = (lerp(560, 830, q) + 70 * seg(t, 52.05, 53.7)) * zoomBoost
  const rot = lerp(-0.3, -0.1, q) + 0.04 * seg(t, 52.05, 53.7)
  const cx = lerp(905, 880, p)
  const cy = lerp(560, 530, p)
  // 周围的小卡
  const R = rng(31)
  for (let i = 0; i < 7; i++) {
    const ang = R.range(0, Math.PI * 2)
    const dist = R.range(0.8, 1.25) * size
    const s = R.range(0.22, 0.42) * size
    ctx.save()
    ctx.translate(cx + Math.cos(ang) * dist * 1.25, cy + Math.sin(ang) * dist * 0.85 - (t - 49.25) * 10)
    ctx.rotate(rot + R.range(-0.3, 0.3))
    faceCard(ctx, R.int(1, 300), s, R.pick([10, 14, 24]))
    ctx.restore()
  }
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(rot)
  ctx.shadowColor = 'rgba(0,0,0,0.7)'
  ctx.shadowBlur = 30
  // 推近到脸部时马赛克变粗
  const res = zoomBoost > 1.2 ? 10 : 14
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
  { word: 'you', t0: 51.63, t1: 51.92, x: 955, y: 535, box: WD2.magenta },
  { word: 'bought', t0: 52.29, t1: 52.56, x: 648, y: 520, box: WD2.sky, mid: WD2.purple },
  { word: 'sold', t0: 52.875, t1: 53.12, x: 985, y: 520, box: WD2.lime },
  { word: 'stolen', t0: 53.42, t1: 53.71, x: 1295, y: 525, box: WD2.lime, mid: WD2.magenta },
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
  if (t >= 53.71 && t < 54.46) {
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
  if (t >= 54.46) {
    const a = 1 - seg(t, 54.46, 54.66)
    if (a > 0) {
      ctx.save()
      ctx.globalAlpha = a * 0.5
      ctx.translate(955, 545)
      skullIcon(ctx, '#5a0a0a')
      ctx.restore()
    }
    return
  }
  // 闪字
  const fl = FLASHES.find((x) => t >= x.t0 && t < x.t1)
  if (fl) {
    drawFlash(ctx, fl, t)
    return
  }
  // 卡片（含 52.58–52.83 推到脸部的特写、53.12–53.46 故障）
  bgLines(ctx, t - 49.25, 0.1)
  const boost = t >= 52.56 && t < 52.875 ? 1.55 : 1
  mainCard(ctx, t, boost)
  if (t >= 53.12 && t < 53.46) {
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
    start: 47.92,
    end: 49.25,
    note: '马赛克人脸档案卡（白边 + 眼部白条）漫天翻飞，镜头缓推',
    render: renderCardsA,
  },
  {
    id: 'wd2-049-profile',
    start: 49.25,
    end: 54.9,
    note: '主卡 + ctOS 档案面板逐层展开；you/bought/sold/stolen 彩色底块闪字；白底骷髅图标；暗红残影',
    render: renderProfile,
  },
]
