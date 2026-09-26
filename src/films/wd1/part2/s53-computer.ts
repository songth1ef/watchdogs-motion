/**
 * 52.8–57.9  黑底 "COMPUTER / CONTROLS A MAJOR CITY" → " A MAJOR CITY" 向右滑出 → "?" 从左滑入 → 青色高亮笔刷过两行
 */
import type { Scene } from '../../../engine/types'
import { WD1 } from '../../../theme'
import { drawTyped, marker, ref, setFont, span, ease } from './common'

const X = 214
const Y1 = 170 // COMPUTER 基线
const Y2 = 238 // CONTROLS 基线
const S1 = 119
const S2 = 62
const WT = 700

export const s53Computer: Scene = {
  id: 'wd1-053-computer-controls',
  start: 52.8,
  end: 57.9,
  note: '"COMPUTER / CONTROLS A MAJOR CITY" 打字，尾句右滑出，"?" 左滑入，青色高亮笔',
  render({ ctx, t }) {
    ref(ctx)
    const white = WD1.fg

    // 第一行 COMPUTER：52.8 起打字
    const drawL1 = (color?: string) => {
      setFont(ctx, S1, WT)
      if (color) {
        ctx.fillStyle = color
        ctx.fillText('COMPUTER', X, Y1)
      } else drawTyped(ctx, 'COMPUTER', X, Y1, t, 52.78, 24, white)
    }
    // 第二行 CONTROLS + " A MAJOR CITY"（后半在 55.1 起加速右滑出屏）
    const tail = ' A MAJOR CITY'
    const drawL2 = (color?: string) => {
      setFont(ctx, S2, WT)
      if (color) {
        ctx.fillStyle = color
        ctx.fillText('CONTROLS', X, Y2)
        return
      }
      const full = 'CONTROLS' + tail
      const t0 = 53.42
      const cps = 23
      const w = drawTypedSplit(full, t0, cps)
      void w
    }
    const drawTypedSplit = (full: string, t0: number, cps: number) => {
      // 前 8 个字符不动，后面 tail 在 55.1 后右移
      const slide = span(t, 55.08, 55.62, ease.inCubic) * 1100
      ctx.save()
      ctx.beginPath()
      ctx.rect(0, 0, 1280, 720)
      ctx.clip()
      drawTyped(ctx, full.slice(0, 8), X, Y2, t, t0, cps, white)
      const w8 = ctx.measureText('CONTROLS').width
      if (t >= t0 + 8 / cps) drawTyped(ctx, tail, X + w8 + slide, Y2, t, t0 + 8 / cps, cps, white)
      ctx.restore()
      return 0
    }

    drawL1()
    drawL2()

    // 青色高亮：CONTROLS 55.62–56.0，COMPUTER 56.28–56.62（字变黑）
    setFont(ctx, S2, WT)
    const w2 = ctx.measureText('CONTROLS').width
    marker(ctx, { x: X - 4, y: 181, w: w2 + 16, h: 63 }, span(t, 55.62, 56.02, ease.outCubic), WD1.cyan, '#000', () => drawL2('#000'))
    setFont(ctx, S1, WT)
    const w1 = ctx.measureText('COMPUTER').width
    marker(ctx, { x: X - 4, y: 76, w: w1 + 30, h: 105 }, span(t, 56.26, 56.62, ease.outCubic), WD1.cyan, '#000', () => drawL1('#000'))

    // "?"：55.55 从屏幕左外滑入，减速停在 x≈214
    if (t >= 55.55) {
      const q = span(t, 55.55, 56.3, ease.outCubic)
      const qx = -60 + (X + 4 + 60) * q
      setFont(ctx, 370, 500, undefined, 0)
      ctx.fillStyle = white
      // 57.6 以后原片 "?" 有轻微逐帧抖动
      ctx.fillText('?', qx - 20, 560)
    }
  },
}
