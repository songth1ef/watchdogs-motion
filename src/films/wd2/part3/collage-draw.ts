/**
 * DedSec 拼贴段的绘制原语（喷漆、斜条纹、滴流、ASCII 图案、灰对话框、马赛克、哥特字、眼球堆）。
 * 供 s4-collage.ts 组装。插画剪影在 art.ts。
 */
import { rng } from '../../../engine/math'
import { FONT } from '../../../fx/text'
import { eyeballSprite } from './art'
import { CODE } from './s3-terminal'

export function spray(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, color: string, a = 0.95) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(1, ry / rx)
  const g = ctx.createRadialGradient(0, 0, rx * 0.15, 0, 0, rx)
  g.addColorStop(0, color)
  g.addColorStop(0.55, color)
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.globalAlpha = a
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(0, 0, rx, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

/** 竖向滴流线（天蓝 / 品红），圆头 */
export function drip(ctx: CanvasRenderingContext2D, x: number, y0: number, y1: number, w: number, color: string) {
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = w
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(x, y0)
  ctx.lineTo(x, y1)
  ctx.stroke()
  ctx.restore()
}

/** 斜条纹填充矩形（品红 / 白） */
export function stripes(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, c1: string, c2: string, gap = 60, dir = 1) {
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.clip()
  ctx.fillStyle = c2
  ctx.fillRect(x, y, w, h)
  ctx.strokeStyle = c1
  ctx.lineWidth = gap * 0.45
  ctx.beginPath()
  for (let i = -h; i < w + h; i += gap) {
    ctx.moveTo(x + i, y + (dir > 0 ? h : 0))
    ctx.lineTo(x + i + h, y + (dir > 0 ? 0 : h))
  }
  ctx.stroke()
  ctx.restore()
}

/** ASCII 菱形：由字符堆出的形状（原片背景里的点阵菱形 / 心形） */
export function asciiDiamond(ctx: CanvasRenderingContext2D, x: number, y: number, rows: number, cell = 11, ch = '#') {
  ctx.save()
  ctx.font = `700 ${cell * 1.1}px ${FONT.plex}`
  ctx.fillStyle = '#1a1a1a'
  ctx.textAlign = 'center'
  for (let r = 0; r < rows; r++) {
    const half = r < rows / 2 ? r + 1 : rows - r
    for (let c = -half; c <= half; c++) ctx.fillText(ch, x + c * cell * 0.75, y + r * cell)
  }
  ctx.textAlign = 'left'
  ctx.restore()
}

/** ASCII 装饰行块（原片背景里的 "\xoooo/" 图案） */
export function asciiBlock(ctx: CanvasRenderingContext2D, x: number, y: number, lines: number, color = '#111', size = 18) {
  const pats = ['\\xoooooooo/', ' \\xoooooo/ ', 'Ioooooooooo!', '/xoooooooo\\', 'xoooo\\ /ooo']
  ctx.save()
  ctx.font = `700 ${size}px ${FONT.plex}`
  ctx.fillStyle = color
  for (let i = 0; i < lines; i++) ctx.fillText(pats[i % pats.length], x + (i % 2) * 10, y + i * size * 1.15)
  ctx.restore()
}

export function codeText(ctx: CanvasRenderingContext2D, x: number, y: number, from: number, n: number, size = 16, color = '#1a1a1a') {
  ctx.save()
  ctx.font = `500 ${size}px ${FONT.plex}`
  ctx.fillStyle = color
  for (let i = 0; i < n; i++) ctx.fillText(CODE[(from + i) % CODE.length], x, y + i * size * 0.95)
  ctx.restore()
}

/**
 * 打字机文档：一段机密备忘录的「质感」。
 * 用等宽字随机长度的行块表现，不逐字抄写内容（原片是模糊到几乎不可读的公文）。
 */
export function typewriter(ctx: CanvasRenderingContext2D, x: number, y: number, cols = 62, rows = 20, seed = 1) {
  const R = rng(seed)
  ctx.save()
  ctx.font = `400 20px "Courier New", ${FONT.plex}`
  ctx.fillStyle = 'rgba(30,30,30,0.78)'
  const glyphs = 'the of and to in a is for with by on at as an be are agent script date hours '
  for (let r = 0; r < rows; r++) {
    const indent = R.chance(0.2) ? 6 : 0
    let line = ' '.repeat(indent)
    while (line.length < cols - R.int(0, 14)) line += R.pick(glyphs.split(' ')) + ' '
    ctx.fillText(line, x, y + r * 25)
  }
  ctx.restore()
}

export function winFrame(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = 'rgba(247,247,244,0.9)'
  ctx.fillRect(x, y, w, h)
  ctx.strokeStyle = '#111'
  ctx.lineWidth = 2
  ctx.strokeRect(x, y, w, h)
  ctx.fillStyle = '#050505'
  ctx.fillRect(x, y, w - 60, 26)
  ctx.fillRect(x + w, y + 14, 12, h - 14)
  ctx.font = `400 24px ${FONT.pixel}`
  ctx.fillStyle = '#eee'
  ctx.fillText('usr/thishere/thathere/test_773.cgi', x + 40, y + 20)
}

/** 灰色系统弹窗（原片一层层阶梯排开的 takeover 窗口） */
export function greyDialog(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = '#c9c9c6'
  ctx.fillRect(x, y, w, h)
  ctx.fillStyle = '#9d9d9a'
  ctx.fillRect(x, y, w, 20)
  ctx.fillStyle = '#e6e6e3'
  ctx.fillRect(x + 6, y + 26, w - 12, h - 32)
  ctx.strokeStyle = '#666'
  ctx.lineWidth = 1.5
  ctx.strokeRect(x, y, w, h)
  ctx.fillStyle = '#555'
  ctx.font = `700 12px ${FONT.sans}`
  ctx.fillText('DEDSEC TAKEOVER', x + 10, y + 15)
}

export function mosaic(ctx: CanvasRenderingContext2D, x: number, y: number, cols: number, rows: number, cell: number, seed: number) {
  const R = rng(seed)
  for (let i = 0; i < cols; i++)
    for (let j = 0; j < rows; j++) {
      if (R.chance(0.25)) continue
      const v = Math.floor(R.range(120, 240))
      ctx.fillStyle = `rgb(${v},${v},${v})`
      ctx.fillRect(x + i * cell, y + j * cell, cell, cell)
    }
}

/** 哥特体 "DedSec"：ASSET（原片为像素化哥特字标；此处用系统黑体衬线字近似） */
export function blackletter(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
  ctx.save()
  ctx.font = `900 ${size}px "UnifrakturMaguntia", "Old English Text MT", "Luminari", Georgia, serif`
  ctx.fillStyle = color
  ctx.fillText('DedSec', x, y)
  ctx.restore()
}

export function eyePile(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, seed: number, size = 150) {
  const R = rng(seed)
  const n = Math.round((w * h) / (size * size * 0.8))
  for (let i = 0; i < n; i++) {
    const s = size * R.range(0.6, 1.2)
    const e = eyeballSprite(160, R.pick([-1, 0, 1]))
    ctx.drawImage(e, x + R.range(0, w) - s * 0.8, y + R.range(0, h) - s * 0.5, s * 1.6, s)
  }
}
