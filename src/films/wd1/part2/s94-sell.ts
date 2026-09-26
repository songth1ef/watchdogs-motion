/**
 * 94.15–96.4  "SELL PRODUCTS" 青底大字从档案卡 Status 一栏里打出，镜头随之拉近；
 * 背后是 ASCII 字符拼成的美元符号 "$"（'#' 为主，边缘用 v/h/3/( 等字符）；95.8 起整体透视倾斜、上移出画（接世界地图）。
 * ASCII 图是把 "$" 字形光栅化成 22×38 的格子后逐格选字符生成的，换别的图形只需改 asciiGrid() 的输入字形。
 */
import type { Scene } from '../../../engine/types'
import { hash } from '../../../engine/math'
import { offscreen } from '../../../fx/canvas'
import { WD1 } from '../../../theme'
import { FONT, ease, ref, setFont, span, track, typed } from './common'

const COLS = 21
const ROWS = 27
let GRID: string[] | null = null

/** 把字形光栅化为 ASCII 行 */
function asciiGrid() {
  if (GRID) return GRID
  const { ctx: g } = offscreen('wd1p2-ascii-dollar', COLS, ROWS)
  g.clearRect(0, 0, COLS, ROWS)
  g.fillStyle = '#fff'
  g.font = `700 ${ROWS * 0.95}px ${FONT.sans}`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText('$', COLS / 2, ROWS / 2 + 1)
  const d = g.getImageData(0, 0, COLS, ROWS).data
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < COLS && y < ROWS && d[(y * COLS + x) * 4 + 3] > 100
  const rows: string[] = []
  for (let y = 0; y < ROWS; y++) {
    let s = ''
    for (let x = 0; x < COLS; x++) {
      if (!on(x, y)) s += ' '
      else if (!on(x + 1, y)) s += hash(x * 7 + y * 13) < 0.5 ? 'v' : '('
      else if (!on(x - 1, y)) s += hash(x * 3 + y * 5) < 0.5 ? 'h' : '3'
      else s += '#'
    }
    rows.push(s)
  }
  GRID = rows
  return rows
}

export const s94Sell: Scene = {
  id: 'wd1-094-sell-products',
  start: 94.15,
  end: 96.4,
  note: 'SELL PRODUCTS + ASCII 美元符号',
  render({ ctx, t }) {
    ref(ctx)
    if (t >= 94.7) {
      ctx.fillStyle = '#fcfcfc'
      ctx.fillRect(0, 0, 1280, 720)
    }
    const s = track(t, [
      [94.15, 0.3],
      [94.3, 0.357],
      [94.5, 0.69],
      [94.7, 0.85],
      [95.0, 1.0],
      [95.6, 1.19],
      [96.0, 1.25],
      [96.3, 1.55],
    ])
    const cx = track(t, [
      [94.3, 579],
      [94.5, 625],
      [94.7, 630],
      [95.0, 640],
      [96.2, 640],
    ])
    const cy = track(t, [
      [94.3, 332],
      [94.5, 322],
      [94.7, 337],
      [95.0, 337],
      [95.6, 337],
      [96.0, 330],
      [96.3, 120],
    ])
    const tilt = span(t, 96.02, 96.3, ease.inOutCubic)
    const fade = 1 - span(t, 96.15, 96.4)
    ctx.save()
    ctx.globalAlpha = fade
    ctx.translate(cx, cy)
    ctx.transform(1, -0.03 * tilt, -0.12 * tilt, 1 - 0.1 * tilt, 0, 0)
    ctx.scale(s, s)
    ctx.translate(-640, -337)

    // ASCII $（中心 (640,318)，高约 530）
    const grid = asciiGrid()
    const cw = 300 / COLS
    const ch = 530 / ROWS
    ctx.font = `700 ${ch * 1.15}px ${FONT.mono}`
    ctx.fillStyle = '#3a3a3a'
    ctx.textBaseline = 'top'
    grid.forEach((row, y) => {
      for (let x = 0; x < COLS; x++) {
        const c = row[x]
        if (c === ' ') continue
        if (t < 94.3 + hash(x * 131 + y * 17) * 0.5) continue
        ctx.save()
        ctx.translate(640 - 150 + x * cw, 318 - 265 + y * ch)
        ctx.transform(1, 0, -0.2, 1, 0, 0)
        ctx.fillText(c, 0, 0, cw * 1.08)
        ctx.restore()
      }
    })
    ctx.textBaseline = 'alphabetic'

    // SELL PRODUCTS 青底
    setFont(ctx, 72, 500, FONT.sans, -0.035)
    const txt = 'SELL PRODUCTS'
    const n = typed(txt, t, 94.1, 40).n
    const full = ctx.measureText(txt).width
    const bw = Math.max(ctx.measureText(txt.slice(0, n)).width + 16, (full + 24) * span(t, 94.1, 94.45))
    ctx.fillStyle = WD1.cyan
    ctx.fillRect(640 - (full + 24) / 2, 300, bw, 72)
    ctx.fillStyle = '#000'
    ctx.fillText(txt.slice(0, n), 640 - full / 2, 361)
    ctx.restore()
  },
}
