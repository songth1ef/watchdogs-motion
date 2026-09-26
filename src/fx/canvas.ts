/** 离屏画布池：按 key 复用，避免每帧 new canvas。 */
const pool = new Map<string, HTMLCanvasElement>()

export function offscreen(key: string, w: number, h: number) {
  let c = pool.get(key)
  if (!c) {
    c = document.createElement('canvas')
    pool.set(key, c)
  }
  if (c.width !== w || c.height !== h) {
    c.width = w
    c.height = h
  }
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  return { canvas: c, ctx }
}

/** 把当前主画布拷一份到临时画布（做后期位移、故障时需要「读旧帧」） */
export function snapshot(ctx: CanvasRenderingContext2D, key = 'snapshot') {
  const { width, height } = ctx.canvas
  const s = offscreen(key, width, height)
  s.ctx.clearRect(0, 0, width, height)
  s.ctx.drawImage(ctx.canvas, 0, 0)
  return s.canvas
}

/** 在一个离屏图层上画东西，再整体合成回来（用于图层透明度、遮罩、混合模式） */
export function layer(
  ctx: CanvasRenderingContext2D,
  key: string,
  draw: (l: CanvasRenderingContext2D) => void,
  composite: { alpha?: number; op?: GlobalCompositeOperation; filter?: string } = {},
) {
  const { width, height } = ctx.canvas
  const l = offscreen(`layer:${key}`, width, height)
  l.ctx.save()
  l.ctx.setTransform(1, 0, 0, 1, 0, 0)
  l.ctx.clearRect(0, 0, width, height)
  l.ctx.restore()
  l.ctx.save()
  draw(l.ctx)
  l.ctx.restore()
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalAlpha = composite.alpha ?? 1
  ctx.globalCompositeOperation = composite.op ?? 'source-over'
  if (composite.filter) ctx.filter = composite.filter
  ctx.drawImage(l.canvas, 0, 0)
  ctx.restore()
  return l.canvas
}
