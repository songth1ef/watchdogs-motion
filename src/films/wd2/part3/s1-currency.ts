/**
 * 94.0–97.8s：
 *  - 94.2–97.33 货币符号铺屏 + 动态排版 "you are now less valuable than the data you produce."
 *    （逐帧快切：巨型单词 now / less / va / able / than / data / you 闪现，底色在 白 / 紫 / 天蓝 / 荧光绿 间跳）
 *  - 97.33–97.47 彩色横条故障
 *  - 97.47–97.8 黑场（只剩字幕）
 */
import type { FrameCtx } from '../../../engine/types'
import { clamp, lerp, rng } from '../../../engine/math'
import { layer } from '../../../fx/canvas'
import { FONT } from '../../../fx/text'
import { WD2 } from '../../../theme'
import { big, diagHatch, fh, flatBg, fr, inR, paperBg, resetTrack } from './common'


// ---------------------------------------------------------------- 货币网格

const SYMS = [
  '₿', '₩', '₽', '€', '£', '¥', '₹', '₫', '₭', '₮', '₱', '₲', '₴', '₵', '₸', '₺', '₼', '₾', '$', '¢', '₡', '₢', '₣',
  '₤', '₦', '₧', '₨', '₪', '₯', '₰', '₳', '₶', '₷', '₠', '₥', '৳', 'ج.د', '₻', 'Pf', 'Rs',
]

const ROWS = 15
const COLS = 28
const rowY = (i: number) => 33 + 71.5 * i
/** 每行一个固定的横向错位（原片各行列不完全对齐） */
const ROW_OFF = Array.from({ length: ROWS }, (_, i) => rng(300 + i).range(-26, 26))
const colX = (i: number, j: number) => 18 + 71 * j + ROW_OFF[i]
const CELLS: string[][] = (() => {
  const R = rng(9402)
  return Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => (R.chance(0.1) ? '' : R.pick(SYMS))))
})()

/** 短语所在行（与最终排版的两行重合） */
const LINE1 = 'you are now less valuable'
const LINE2 = 'than the data you produce.'
const PH_ROW = [6, 7]
const PH_X0 = [225, 300]
const PH_PITCH = 60
/** 短语逐字出现：[开始时刻, 每秒字数] */
const PH_TYPE: [number, number][] = [
  [94.26, 21],
  [95.22, 21],
]
/** 每个单词「收拢」成正常排版的时刻（之前按网格逐格排列） */
const COLLAPSE: number[][] = [
  [95.2, 95.27, 95.33, 95.47, 95.73],
  [95.95, 96.05, 96.2, 96.3, 96.42],
]
const FINAL_SIZE = 56

interface Giant {
  t0: number
  t1: number
  text: string
  color: string
  /** 字号（决定宽度） */
  size: number
  /** 纵向拉伸倍数（原片巨型字被竖向拉高） */
  sy: number
  x: number
  /** 基线 */
  y: number
  /** 每秒横移（px） */
  vx?: number
}

/** 巨型单词闪现表（时刻为 60fps 帧边界的近似） */
const GIANTS: Giant[] = [
  { t0: 94.45, t1: 94.58, text: 'now', color: WD2.sky, size: 790, sy: 2.4, x: 60, y: 1020, vx: -700 },
  { t0: 94.72, t1: 94.85, text: 'less', color: WD2.purple, size: 1500, sy: 1.17, x: -360, y: 1030 },
  { t0: 95.12, t1: 95.25, text: 'va', color: WD2.purple, size: 1640, sy: 1, x: 30, y: 990 },
  { t0: 95.25, t1: 95.45, text: 'able', color: WD2.sky, size: 690, sy: 2.25, x: -80, y: 1065, vx: -900 },
  { t0: 95.72, t1: 95.85, text: 'than', color: '#f4f3f0', size: 910, sy: 2.1, x: -560, y: 1150 },
  { t0: 95.93, t1: 96.02, text: 'data', color: WD2.lime, size: 1000, sy: 1.75, x: -610, y: 1020, vx: 600 },
  { t0: 96.28, t1: 96.47, text: 'you', color: '#e0197d', size: 1100, sy: 1.55, x: -380, y: 1060 },
]

/** 底色时间表：[开始, 结束, 颜色]；不在表内即白纸底 */
const BG: [number, number, string][] = [
  [94.85, 95.0, WD2.purple],
  [95.45, 95.85, WD2.purple],
  [96.58, 96.85, WD2.sky],
  [96.85, 97.25, WD2.lime],
  [97.25, 97.33, WD2.purple],
]

function glyph(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, ink: string, fringe: boolean) {
  if (fringe) {
    ctx.fillStyle = 'rgba(240,200,20,0.85)'
    ctx.fillText(s, x - 2.5, y)
    ctx.fillStyle = 'rgba(40,90,255,0.6)'
    ctx.fillText(s, x + 2.5, y)
  }
  ctx.fillStyle = ink
  ctx.fillText(s, x, y)
}

/** 网格：ink 为符号颜色；skip(i,j) 返回 true 的格子不画（被短语占用） */
function grid(ctx: CanvasRenderingContext2D, t: number, ink: string, fringe: boolean, skip: (i: number, j: number) => boolean) {
  ctx.font = `700 46px ${FONT.sans}`
  ctx.letterSpacing = '0px'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (let i = 0; i < ROWS; i++)
    for (let j = 0; j < COLS; j++) {
      if (skip(i, j)) continue
      let s = CELLS[i][j]
      // 每帧有少量格子跳成别的符号（原片网格在「呼吸」）
      const h = fh(t, i * 97 + j)
      if (h < 0.07) s = SYMS[Math.floor(fh(t, i * 31 + j * 7 + 5) * SYMS.length)]
      if (!s) continue
      const multi = s.length > 1
      if (multi) ctx.font = `700 30px ${FONT.sans}`
      glyph(ctx, s, colX(i, j), rowY(i), ink, fringe)
      if (multi) ctx.font = `700 46px ${FONT.sans}`
    }
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
}

/** 短语：返回被占用的网格列范围，用于清空符号 */
function phrase(ctx: CanvasRenderingContext2D, t: number, ink: string) {
  const occupied: [number, number][] = [
    [-1, -1],
    [-1, -1],
  ]
  const lines = [LINE1, LINE2]
  ctx.textBaseline = 'middle'
  for (let li = 0; li < 2; li++) {
    const text = lines[li]
    const [ts, rate] = PH_TYPE[li]
    const n = clamp(Math.floor((t - ts) * rate) + 1, 0, text.replace(/ /g, '').length)
    if (n <= 0) continue
    const y = rowY(PH_ROW[li])
    // 最终排版位置
    ctx.font = `500 ${FINAL_SIZE}px ${FONT.sans}`
    ctx.letterSpacing = '0px'
    const fullW = ctx.measureText(text).width
    let fx = 960 - fullW / 2
    const words = text.split(' ')
    let k = 0 // 已消耗的非空格字符
    let firstCell = -1
    let lastCell = -1
    words.forEach((w, wi) => {
      const ww = ctx.measureText(w).width
      const sp = ctx.measureText(' ').width
      const collapsed = t >= COLLAPSE[li][wi]
      const visible = clamp(n - k, 0, w.length)
      if (visible > 0) {
        ctx.fillStyle = ink
        if (collapsed) {
          ctx.font = `500 ${FINAL_SIZE}px ${FONT.sans}`
          ctx.fillText(w.slice(0, visible), fx, y)
        } else {
          ctx.font = `500 ${FINAL_SIZE * 0.86}px ${FONT.sans}`
          ctx.textAlign = 'center'
          for (let c = 0; c < visible; c++) {
            const cx = PH_X0[li] + (k + c) * PH_PITCH
            ctx.fillText(w[c], cx, y)
          }
          ctx.textAlign = 'left'
          ctx.font = `500 ${FINAL_SIZE}px ${FONT.sans}`
        }
        const c0 = Math.min(fx, PH_X0[li] + k * PH_PITCH - 30)
        const c1 = Math.max(fx + ww, PH_X0[li] + (k + visible) * PH_PITCH)
        if (firstCell < 0 || c0 < firstCell) firstCell = c0
        if (c1 > lastCell) lastCell = c1
      }
      k += w.length
      fx += ww + sp
    })
    occupied[li] = [firstCell, lastCell]
  }
  ctx.textBaseline = 'alphabetic'
  return occupied
}

function giantWord(ctx: CanvasRenderingContext2D, g: Giant, t: number) {
  const x = g.x + (g.vx ?? 0) * (t - g.t0)
  layer(ctx, 'wd2p3-giant', (l) => {
    l.save()
    l.translate(x, g.y)
    l.scale(1, g.sy)
    big(l, g.size, 700)
    l.fillStyle = g.color
    l.fillText(g.text, 0, 0)
    resetTrack(l)
    l.restore()
    l.globalCompositeOperation = 'source-atop'
    diagHatch(l, 1920, 1080, 34, g.color === '#f4f3f0' ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.3)')
  })
}

function currency(f: FrameCtx) {
  const { ctx, W, H, t } = f
  const bg = BG.find(([a, b]) => inR(t, a, b))
  if (bg) {
    flatBg(ctx, W, H, bg[2], 'rgba(60,0,60,0.18)')
    if (bg[2] === WD2.purple) diagHatch(ctx, W, H, 34, 'rgba(255,255,255,0.22)')
  } else paperBg(ctx, W, H, '#f4f4f1', 'rgba(110,110,105,0.28)')

  const g = GIANTS.find((x) => inR(t, x.t0, x.t1))
  if (g) giantWord(ctx, g, t)

  // 网格：96.2 起转灰淡出；天蓝底开头两帧还残留一层淡青色网格
  let ink = '#0a0a0a'
  let fringe = true
  let showGrid = t < 96.72
  if (t >= 96.3 && t < 96.58) {
    const k = clamp((t - 96.3) / 0.28)
    ink = `rgba(40,40,40,${lerp(0.85, 0.25, k)})`
    fringe = false
  } else if (t >= 96.58) {
    ink = `rgba(0,70,110,${lerp(0.22, 0.05, clamp((t - 96.58) / 0.14))})`
    fringe = false
  }

  // 先算短语占格，再画网格（避让），最后画短语
  const tmp = layer(ctx, 'wd2p3-phrase', (l) => {
    occ = phrase(l, t, '#111')
  })
  if (showGrid)
    grid(ctx, t, ink, fringe, (i, j) => {
      const li = PH_ROW.indexOf(i)
      if (li < 0) return false
      const [a, b] = occ[li]
      if (a < 0) return false
      const x = colX(i, j)
      return x > a - 30 && x < b + 30
    })
  ctx.drawImage(tmp, 0, 0)
}
let occ: [number, number][] = [
  [-1, -1],
  [-1, -1],
]

/** 97.25–97.47：白底 + 横向彩条故障，文字被切片错位复制 */
function stripeGlitch(f: FrameCtx) {
  const { ctx, W, H, t } = f
  paperBg(ctx, W, H, '#f4f4f2', 'rgba(110,110,105,0.3)')
  const F = fr(t)
  const R = rng(97000 + F)
  ctx.font = `500 ${FINAL_SIZE}px ${FONT.sans}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const colors = ['#2fe07a', '#f2e21a', '#f07a12', '#7a19e6', '#2ec3ef', '#1f4fd8', '#e0197d', '#111']
  const bars = 7 + R.int(0, 4)
  for (let i = 0; i < bars; i++) {
    const y = R.range(0, H)
    const h = R.range(12, 70)
    const x = R.chance(0.5) ? 0 : R.range(0, W * 0.6)
    ctx.fillStyle = R.pick(colors)
    ctx.fillRect(x, y, R.range(W * 0.3, W), h)
  }
  // 文字的几份错位副本
  const copies = F % 2 === 0 ? [0] : [-150, 0, 180]
  for (const dy of copies) {
    const dx = dy === 0 ? 0 : R.range(-160, 160)
    ctx.fillStyle = '#111'
    ctx.fillText(LINE1, 960 + dx, 462 + dy)
    ctx.fillText(LINE2, 960 + dx, 533 + dy)
  }
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
}

export function drawS1(f: FrameCtx) {
  const t = f.t
  if (t < 97.33) return currency(f)
  if (t < 97.47) return stripeGlitch(f)
  // 97.47–97.8 黑场
  f.ctx.fillStyle = '#000'
  f.ctx.fillRect(0, 0, f.W, f.H)
}
