import { clamp, hash } from '../engine/math'
import { offscreen } from './canvas'
import { FONT } from './text'

type Cell = 'dot' | 'square' | 'dash' | 'hatch'

export interface DotMatrixOpts {
  text: string
  x: number
  y: number
  /** 每个点阵格的像素大小 */
  cell: number
  /** 文字在点阵里的行高（格数），越小越粗糙 */
  rows?: number
  shape?: Cell
  color?: string
  /** 点占格子比例 */
  fill?: number
  /** 0..1 逐点随机出现 */
  p?: number
  family?: string
  weight?: number | string
  seed?: number
}

const rasterCache = new Map<string, { w: number; h: number; bits: Uint8Array }>()

/** 把文字光栅化成低分辨率位图（缓存），再逐格画形状 */
function raster(text: string, rows: number, family: string, weight: number | string) {
  const key = `${text}|${rows}|${family}|${weight}`
  const hit = rasterCache.get(key)
  if (hit) return hit
  const size = rows
  const probe = offscreen('dm-probe', 8, 8).ctx
  probe.font = `${weight} ${size}px ${family}`
  const w = Math.ceil(probe.measureText(text).width) + 2
  const h = Math.ceil(size * 1.25)
  const { ctx } = offscreen('dm-raster', w, h)
  ctx.clearRect(0, 0, w, h)
  ctx.font = `${weight} ${size}px ${family}`
  ctx.textBaseline = 'top'
  ctx.fillStyle = '#fff'
  ctx.fillText(text, 1, size * 0.1)
  const data = ctx.getImageData(0, 0, w, h).data
  const bits = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) bits[i] = data[i * 4 + 3] > 110 ? 1 : 0
  const r = { w, h, bits }
  rasterCache.set(key, r)
  return r
}

/**
 * 点阵字：WD1 的 "VIRUS"、"HOW YOU THINK"、"OVERLOADED"，WD2 的 "execute?" 都是这一类。
 * 返回绘制后的宽高（px）。
 */
export function dotMatrix(ctx: CanvasRenderingContext2D, o: DotMatrixOpts) {
  const rows = o.rows ?? 9
  const r = raster(o.text, rows, o.family ?? FONT.pixel, o.weight ?? 400)
  const fill = o.fill ?? 0.72
  const p = clamp(o.p ?? 1)
  const s = o.cell * fill
  const off = (o.cell - s) / 2
  ctx.fillStyle = o.color ?? '#ffffff'
  ctx.strokeStyle = o.color ?? '#ffffff'
  ctx.lineWidth = Math.max(1, o.cell * 0.18)
  for (let j = 0; j < r.h; j++) {
    for (let i = 0; i < r.w; i++) {
      if (!r.bits[j * r.w + i]) continue
      if (p < 1 && hash(i * 73856093 + j * 19349663 + (o.seed ?? 0)) > p) continue
      const px = o.x + i * o.cell
      const py = o.y + j * o.cell
      switch (o.shape ?? 'square') {
        case 'dot':
          ctx.beginPath()
          ctx.arc(px + o.cell / 2, py + o.cell / 2, s / 2, 0, Math.PI * 2)
          ctx.fill()
          break
        case 'dash':
          ctx.fillRect(px + off, py + o.cell * 0.4, s, o.cell * 0.2)
          break
        case 'hatch':
          ctx.beginPath()
          ctx.moveTo(px + off, py + o.cell - off)
          ctx.lineTo(px + o.cell - off, py + off)
          ctx.stroke()
          break
        default:
          ctx.fillRect(px + off, py + off, s, s)
      }
    }
  }
  return { w: r.w * o.cell, h: r.h * o.cell }
}
