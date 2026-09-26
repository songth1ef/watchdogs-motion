import { clamp, ease, hash } from '../engine/math'

/**
 * 字体。原片 WD1/WD2 的标题都是紧字距的 Helvetica Neue（粗/中粗），
 * 小标签是等宽字（WD1 偏 OCR 感，用 Share Tech Mono），WD2 命令行是像素字（VT323）。
 * macOS 自带 Helvetica Neue；其他系统回落到 Inter Tight（已随包打入）。
 */
export const FONT = {
  sans: '"Helvetica Neue", Helvetica, "Inter Tight", Arial, sans-serif',
  mono: '"Share Tech Mono", "IBM Plex Mono", Menlo, monospace',
  plex: '"IBM Plex Mono", Menlo, monospace',
  pixel: '"VT323", "Share Tech Mono", monospace',
}

export function font(ctx: CanvasRenderingContext2D, size: number, weight: number | string = 700, family = FONT.sans) {
  ctx.font = `${weight} ${size}px ${family}`
}

/** 字距（px）。Helvetica 大标题在原片里是负字距，约 -0.03em。 */
export function tracking(ctx: CanvasRenderingContext2D, px: number) {
  ctx.letterSpacing = `${px}px`
}

export function measure(ctx: CanvasRenderingContext2D, text: string) {
  return ctx.measureText(text).width
}

/** 逐字打出：按进度截取前 n 个字符 */
export function typeOn(text: string, p: number) {
  return text.slice(0, Math.round(clamp(p) * text.length))
}

/** 乱码解码：未「解出」的字符每帧随机跳变，p=1 时完全显示原文 */
export function scramble(text: string, p: number, frame: number, charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_#$%&') {
  const n = text.length
  let out = ''
  for (let i = 0; i < n; i++) {
    const ch = text[i]
    const reveal = (i + 1) / n
    if (ch === ' ' || p >= reveal) out += ch
    else if (p > reveal - 0.35) out += charset[Math.floor(hash(frame * 131 + i * 7) * charset.length)]
    else out += ' '
  }
  return out
}

export interface HighlightOpts {
  text: string
  x: number
  y: number
  size: number
  /** 0..1：先底框从左向右擦出，随后文字逐字打出 */
  p: number
  box?: string
  color?: string
  weight?: number | string
  family?: string
  padX?: number
  padY?: number
  track?: number
  /** 末尾块状光标（WD1 标签风格） */
  cursor?: boolean
  frame?: number
}

/**
 * WD1 最典型的元素：文字背后一块纯色底（白底黑字 / 青底黑字），
 * 底块先擦出，文字随后逐字打出，末尾有闪烁的块光标。y 为文字基线。
 */
export function highlight(ctx: CanvasRenderingContext2D, o: HighlightOpts) {
  const padX = o.padX ?? o.size * 0.18
  const padY = o.padY ?? o.size * 0.12
  font(ctx, o.size, o.weight ?? 500, o.family ?? FONT.sans)
  tracking(ctx, o.track ?? -o.size * 0.03)
  const full = measure(ctx, o.text)
  const boxP = ease.outExpo(clamp(o.p / 0.45))
  const textP = clamp((o.p - 0.2) / 0.8)
  const top = o.y - o.size * 0.82 - padY
  const h = o.size * 1.04 + padY * 2
  const w = (full + padX * 2) * boxP
  if (w > 0.5) {
    ctx.fillStyle = o.box ?? '#ffffff'
    ctx.fillRect(o.x, top, w, h)
  }
  const shown = typeOn(o.text, textP)
  ctx.fillStyle = o.color ?? '#000000'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(shown, o.x + padX, o.y)
  if (o.cursor && textP < 1 && textP > 0) {
    const cx = o.x + padX + measure(ctx, shown)
    if (Math.floor((o.frame ?? 0) / 4) % 2 === 0) ctx.fillRect(cx + 2, top + padY, o.size * 0.5, h - padY * 2)
  }
  tracking(ctx, 0)
  return { w: full + padX * 2, h, top }
}

export interface TagOpts {
  text: string
  x: number
  y: number
  size?: number
  p?: number
  /** 小三角指针朝下（WD1 城市标签 "CAMERAS"、"TRAFFIC LIGHT" 那种） */
  pointer?: boolean
  fg?: string
  bg?: string
}

/** 等宽大写小标签：白底黑字 + 左下小指针。 */
export function tag(ctx: CanvasRenderingContext2D, o: TagOpts) {
  const size = o.size ?? 16
  const p = o.p ?? 1
  font(ctx, size, 400, FONT.mono)
  tracking(ctx, size * 0.18)
  const text = o.text.toUpperCase()
  const w = measure(ctx, text) + size * 0.9
  const h = size * 1.35
  const ww = w * ease.outCubic(clamp(p / 0.5))
  ctx.fillStyle = o.bg ?? '#ffffff'
  ctx.fillRect(o.x, o.y - h, ww, h)
  if (o.pointer) {
    ctx.beginPath()
    ctx.moveTo(o.x, o.y)
    ctx.lineTo(o.x + size * 0.6, o.y)
    ctx.lineTo(o.x, o.y + size * 0.6)
    ctx.fill()
  }
  ctx.fillStyle = o.fg ?? '#000000'
  ctx.textBaseline = 'middle'
  ctx.fillText(typeOn(text, clamp((p - 0.3) / 0.7)), o.x + size * 0.45, o.y - h / 2 + 1)
  ctx.textBaseline = 'alphabetic'
  tracking(ctx, 0)
  return { w, h }
}
