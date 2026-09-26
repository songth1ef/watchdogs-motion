import type { Scene } from '../../../engine/types'
import { seg } from '../../../engine/math'
import { FONT, font } from '../../../fx/text'
import { fitText } from './util'

/**
 * 0.0–2.7  PEGI 18 分级卡（PROVISIONAL）。
 * 原片：0→0.2s 淡入，2.3→2.6s 淡出，之后 0.1s 纯黑。
 * ASSET：PEGI 标用文字+矩形拼出，换官方矢量标时替换 drawPegi()。
 */
function drawPegi(ctx: CanvasRenderingContext2D) {
  // 外白框 636–1277 × 91–874，红块 650–1265 × 108–720（从 1s 参考帧量出）
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(636, 91, 641, 783)
  ctx.fillStyle = '#e41f26'
  ctx.fillRect(650, 106, 615, 614)
  ctx.fillStyle = '#ffffff'
  font(ctx, 660, 800, FONT.sans)
  ctx.textBaseline = 'alphabetic'
  fitText(ctx, '18', 688, 643, 530)
  font(ctx, 40, 500, FONT.sans)
  ctx.fillText('TM', 1183, 150)
  ctx.fillStyle = '#000000'
  font(ctx, 82, 400, FONT.sans)
  fitText(ctx, 'www.pegi.info', 957, 818, 590, 'center')
  ctx.fillStyle = '#ffffff'
  font(ctx, 118, 700, FONT.sans)
  fitText(ctx, 'PROVISIONAL', 956, 984, 625, 'center')
}

export const pegi: Scene = {
  id: 'wd1-000-pegi',
  start: 0,
  end: 2.7,
  note: 'PEGI 18 PROVISIONAL 分级卡，淡入淡出',
  render({ ctx, t }) {
    const a = Math.min(seg(t, 0, 0.2), 1 - seg(t, 2.3, 2.6))
    if (a <= 0) return
    ctx.globalAlpha = a
    drawPegi(ctx)
  },
}
