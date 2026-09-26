import type { Film, FrameCtx } from './types'
import type { ThreeHost } from './three-host'
import { clamp } from './math'

export const W = 1920
export const H = 1080

/**
 * 渲染影片在时刻 t 的一帧。
 * 同一时刻可有多个镜头重叠（转场），按 scenes 数组顺序依次绘制，后者盖在前者上面。
 */
export function renderFrame(film: Film, t: number, ctx: CanvasRenderingContext2D, three: ThreeHost) {
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  ctx.filter = 'none'
  ctx.fillStyle = film.background
  ctx.fillRect(0, 0, W, H)
  ctx.restore()

  const base: Omit<FrameCtx, 'lt' | 'p' | 'dur'> = { ctx, W, H, t, three, film }
  for (const scene of film.scenes) {
    if (t < scene.start || t >= scene.end) continue
    const dur = scene.end - scene.start
    ctx.save()
    try {
      scene.render({ ...base, lt: t - scene.start, p: clamp((t - scene.start) / dur), dur })
    } catch (err) {
      console.error(`[scene ${scene.id}]`, err)
    }
    ctx.restore()
  }
  if (film.post) {
    ctx.save()
    film.post({ ...base, lt: t, p: t / film.duration, dur: film.duration })
    ctx.restore()
  }
}

export function activeScenes(film: Film, t: number) {
  return film.scenes.filter((s) => t >= s.start && t < s.end)
}
