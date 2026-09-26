import type { Scene } from '../engine/types'
import { font } from '../fx/text'

/** 占位镜头：未实现的时间段显示「待实现」，保证整片可播放、时间轴连续 */
export function placeholder(id: string, start: number, end: number, note: string): Scene {
  return {
    id,
    start,
    end,
    note,
    render({ ctx, W, H, lt }) {
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'
      ctx.setLineDash([8, 8])
      ctx.strokeRect(40, 40, W - 80, H - 80)
      ctx.setLineDash([])
      font(ctx, 28, 400)
      ctx.fillStyle = 'rgba(255,255,255,0.6)'
      ctx.fillText(`TODO  ${id}  ${start.toFixed(1)}s–${end.toFixed(1)}s  (+${lt.toFixed(2)})`, 80, H / 2)
      font(ctx, 20, 400)
      ctx.fillText(note, 80, H / 2 + 40)
    },
  }
}
