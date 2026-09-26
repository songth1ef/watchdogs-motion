/**
 * 97.8–102.45s：黑底白色大字动态排版。
 *  - "this is the / new reality."：每个词先以色块（荧光绿→品红→红 / 白）遮罩弹出，再变红、变白
 *  - "going dark / is no longer / no longer an option / an option"：各行在自己的条带裁切区里上滚替换
 * 大字带黄 / 蓝色边（RGB 分离）。
 */
import type { FrameCtx } from '../../../engine/types'
import { clamp, ease } from '../../../engine/math'
import { WD2 } from '../../../theme'
import { big, clipRect, fringeText, resetTrack } from './common'

const S = 196
const LINE1 = { x: 249, y: 536 }
const LINE2 = { x: 399, y: 662 }

interface PopWord {
  text: string
  line: 1 | 2
  t: number
  /** 色块序列（每帧一种），之后文字颜色序列 */
  boxes: string[]
  /** 弹出后先显示的文字色，持续 tint 秒 */
  tint?: string
  tintDur?: number
  /** 只有末尾若干字符带色块（"reality." 的 "lity."） */
  boxFrom?: number
}

const POP: PopWord[] = [
  { text: 'this', line: 1, t: 97.77, boxes: [WD2.lime, WD2.lime, WD2.lime, WD2.lime, WD2.magenta, WD2.magenta, WD2.magenta, WD2.magenta, WD2.red, WD2.red, WD2.red, WD2.red], tint: WD2.red, tintDur: 0.22 },
  { text: 'is', line: 1, t: 98.17, boxes: Array(10).fill('#f2f2f2') },
  { text: 'the', line: 1, t: 98.37, boxes: Array(10).fill('#f2f2f2') },
  { text: 'new', line: 2, t: 98.57, boxes: Array(10).fill('#f2f2f2') },
  { text: 'reality.', line: 2, t: 98.77, boxes: Array(12).fill(WD2.red), boxFrom: 3, tint: WD2.red, tintDur: 0 },
]

function wordX(ctx: CanvasRenderingContext2D, words: string[], idx: number, x0: number) {
  let x = x0
  for (let i = 0; i < idx; i++) x += ctx.measureText(words[i] + ' ').width
  return x
}

function popPhase(ctx: CanvasRenderingContext2D, t: number, yOff1 = 0, yOff2 = 0) {
  big(ctx, S, 700)
  const l1 = ['this', 'is', 'the']
  const l2 = ['new', 'reality.']
  for (const w of POP) {
    if (t < w.t) continue
    const words = w.line === 1 ? l1 : l2
    const base = w.line === 1 ? LINE1 : LINE2
    const x = wordX(ctx, words, words.indexOf(w.text), base.x)
    const y = base.y + (w.line === 1 ? yOff1 : yOff2)
    const k = Math.floor((t - w.t) * 60)
    if (k < w.boxes.length) {
      // 色块阶段：色块盖住字的上 3/4，框内黑字，下缘被裁掉
      const from = w.boxFrom ?? 0
      const pre = w.text.slice(0, from)
      const preW = ctx.measureText(pre).width
      if (from > 0) {
        ctx.fillStyle = w.tint ?? '#f2f2f2'
        ctx.fillText(pre, x, y)
      }
      const bw = ctx.measureText(w.text.slice(from)).width
      const top = y - S * 0.8
      const h = S * 0.62
      ctx.fillStyle = w.boxes[k]
      ctx.fillRect(x + preW - 4, top, bw + 8, h)
      clipRect(ctx, x + preW - 4, top, bw + 8, h, () => {
        ctx.fillStyle = '#000'
        ctx.fillText(w.text.slice(from), x + preW, y + S * 0.08)
      })
    } else if (w.tint && t < w.t + w.boxes.length / 60 + (w.tintDur ?? 0)) {
      ctx.fillStyle = w.tint
      ctx.fillText(w.text, x, y)
    } else fringeText(ctx, w.text, x, y, { shift: 2.5, alpha: 0.55 })
  }
  resetTrack(ctx)
}

/** 条带内滚动：进入时从下往上滚入（下缘裁切），退出时向上（或向下）滚出 */
interface Roll {
  text: string
  x: number
  /** 右对齐时给 right */
  right?: number
  y: number
  tin: number
  din: number
  tout?: number
  dout?: number
  outDir?: 1 | -1
}

const ROLLS: Roll[] = [
  { text: 'going', x: 144, y: 600, tin: 100.18, din: 0.3, tout: 101.55, dout: 0.35 },
  { text: 'dark', x: 0, y: 600, tin: 100.33, din: 0.3, tout: 101.55, dout: 0.35 },
  { text: 'is', x: 300, y: 780, tin: 100.95, din: 0.25, tout: 101.75, dout: 0.3 },
  { text: 'no', x: 0, y: 780, tin: 101.1, din: 0.25, tout: 101.75, dout: 0.3 },
  { text: 'longer', x: 0, y: 780, tin: 101.28, din: 0.25, tout: 101.75, dout: 0.3 },
  { text: 'no longer an option', x: 66, y: 588, tin: 101.62, din: 0.32, tout: 102.08, dout: 0.3 },
  { text: 'an option', x: 0, right: 1845, y: 652, tin: 101.98, din: 0.35 },
]

function drawRoll(ctx: CanvasRenderingContext2D, r: Roll, x: number, t: number) {
  if (t < r.tin) return
  let off = 0
  if (t < r.tin + r.din) off = S * 0.95 * (1 - ease.outCubic(clamp((t - r.tin) / r.din)))
  if (r.tout !== undefined && t >= r.tout) {
    const p = ease.inOutCubic(clamp((t - r.tout) / (r.dout ?? 0.3)))
    if (p >= 1) return
    off = -S * 0.95 * p * (r.outDir ?? 1)
  }
  const top = r.y - S * 0.82
  clipRect(ctx, x - 20, top, ctx.measureText(r.text).width + 40, S * 1.08, () => {
    fringeText(ctx, r.text, x, r.y + off, { shift: 2.5, alpha: 0.55 })
  })
}

function rollPhase(ctx: CanvasRenderingContext2D, t: number) {
  big(ctx, S, 700)
  // 同一行的后续单词接在前一个词后面
  let prevEnd = 0
  let prevY = -1
  for (const r of ROLLS) {
    let x = r.x
    if (r.right !== undefined) x = r.right - ctx.measureText(r.text).width
    else if (x === 0 && prevY === r.y) x = prevEnd
    drawRoll(ctx, r, x, t)
    prevEnd = x + ctx.measureText(r.text + ' ').width
    prevY = r.y
  }
  resetTrack(ctx)
}

/** "this is the" 上滚出、"new reality." 下滚出 */
function oldLines(ctx: CanvasRenderingContext2D, t: number) {
  const p1 = ease.inOutCubic(clamp((t - 100.1) / 0.4))
  const p2 = ease.inOutCubic(clamp((t - 100.75) / 0.4))
  big(ctx, S, 700)
  if (p1 < 1)
    clipRect(ctx, 0, LINE1.y - S * 0.82, 1920, S * 1.02, () => popPhase(ctx, t, -S * 0.95 * p1, 99999))
  if (p2 < 1)
    clipRect(ctx, 0, LINE2.y - S * 0.82, 1920, S * 1.08, () => popPhase(ctx, t, 99999, S * 0.95 * p2))
}

export function drawS2(f: FrameCtx) {
  const { ctx, W, H, t } = f
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, W, H)
  if (t < 100.05) popPhase(ctx, t)
  else {
    oldLines(ctx, t)
    rollPhase(ctx, t)
  }
}
