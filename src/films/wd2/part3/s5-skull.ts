/**
 * 113.1–121s：
 *  - 113.1–114.3 黑色墨浪 / 白色火焰状边缘的过渡（拼贴碎块在顶部瓦解，黑场从下涨起）
 *  - 114.3–116.7 黑底：半调地板 + 一只手按地 + 白球（8 号球）+ 红色半调块；骷髅从下方钻出、张嘴含住白球
 *  - 116.7–119.0 骷髅坐在白球上（"or have they become freedom's last line of defense?"），镜头轻微推近
 *  - 119.0–121   骷髅与球淡出，黑场只剩字幕，最后字幕也消失
 * 骷髅 / 手为 ASSET 近似（art.ts）。
 */
import type { FrameCtx } from '../../../engine/types'
import { clamp, ease, lerp, rng } from '../../../engine/math'
import { halftone } from '../../../fx/image'
import { handSprite, skullSprite } from './art'
import { fr } from './common'

/** 半调地板：底部渐亮的灰面 */
function floor(ctx: CanvasRenderingContext2D, topY: number, alpha = 1) {
  const w = 1920
  const h = 1080 - topY
  const tmp = document.createElement('canvas')
  tmp.width = w / 3
  tmp.height = h / 3
  const s = tmp.getContext('2d')!
  const g = s.createLinearGradient(0, 0, 0, tmp.height)
  g.addColorStop(0, '#000')
  g.addColorStop(1, '#cfcfcf')
  s.fillStyle = g
  s.fillRect(0, 0, tmp.width, tmp.height)
  ctx.save()
  ctx.globalAlpha = alpha
  halftone(ctx, tmp, { x: 0, y: topY, w, h, cell: 7, color: '#e8e8e8', invert: true })
  ctx.restore()
}

/** 红色半调方块（原片骷髅身后的品红噪点块） */
function redBlock(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, seed: number) {
  const R = rng(seed)
  ctx.save()
  ctx.fillStyle = '#c81552'
  for (let i = 0; i < (w / 10) * (h / 10) * 0.5; i++) {
    const px = x + R.next() * w
    const py = y + R.next() * h
    ctx.fillRect(px, py, R.range(4, 9), R.range(4, 9))
  }
  ctx.restore()
}

/** 8 号球（白球，顶部黑圈 "8"） */
function ball(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, showEight = true) {
  ctx.save()
  const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.2, cx, cy, r * 1.1)
  g.addColorStop(0, '#ffffff')
  g.addColorStop(0.7, '#f0f0f0')
  g.addColorStop(1, '#b8b8b8')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fill()
  // 落地阴影
  ctx.fillStyle = 'rgba(0,0,0,0.35)'
  ctx.beginPath()
  ctx.ellipse(cx + r * 0.2, cy + r * 1.05, r * 1.1, r * 0.25, 0, 0, Math.PI * 2)
  ctx.fill()
  if (showEight) {
    ctx.fillStyle = '#fff'
    ctx.strokeStyle = '#111'
    ctx.lineWidth = r * 0.05
    ctx.beginPath()
    ctx.arc(cx - r * 0.1, cy - r * 0.35, r * 0.32, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#111'
    ctx.font = `700 ${r * 0.42}px "Helvetica Neue", Arial, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('8', cx - r * 0.1, cy - r * 0.32)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
  }
  ctx.restore()
}

// ------------------------------------------------------------------ 各阶段

/** 墨浪过渡：黑场从下涨起，上缘白色火焰状 */
function inkWave(f: FrameCtx) {
  const { ctx, t } = f
  const p = ease.inOutCubic(clamp((t - 113.1) / 1.2))
  ctx.fillStyle = '#050505'
  ctx.fillRect(0, 0, 1920, 1080)
  // 上方残留的拼贴碎块（快速瓦解）
  if (p < 0.6) {
    const R = rng(1131)
    ctx.save()
    ctx.globalAlpha = 1 - p / 0.6
    for (let i = 0; i < 30; i++) {
      const col = R.pick(['#cdee3a', '#29c6ec', '#ff2d8f', '#a83bd6', '#f4f4f0'])
      ctx.fillStyle = col
      ctx.fillRect(R.range(0, 1920), R.range(0, 400 * (1 - p)), R.range(40, 260), R.range(20, 90))
    }
    ctx.restore()
  }
  // 白色火焰边界（黑场顶缘）
  const baseY = lerp(200, 60, p)
  ctx.fillStyle = '#f2f2f2'
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(1920, 0)
  ctx.lineTo(1920, baseY)
  for (let x = 1920; x >= 0; x -= 40) {
    const flame = Math.abs(Math.sin(x * 0.02 + fr(t) * 0.2)) * 90
    ctx.lineTo(x, baseY + flame)
  }
  ctx.closePath()
  ctx.fill()
}

/** 手 + 白球 + 骷髅钻出 */
function emerge(f: FrameCtx) {
  const { ctx, t } = f
  ctx.fillStyle = '#050505'
  ctx.fillRect(0, 0, 1920, 1080)
  floor(ctx, 640, clamp((t - 114.3) / 0.5))
  redBlock(ctx, 620, 260, 360, 150, 500)
  // 左手按地、右手（原片两只手在地面上）
  ctx.drawImage(handSprite(360, false, true), 300, 560, 360, 360)
  ctx.drawImage(handSprite(340, true, true), 900, 540, 340, 340)
  // 左侧白球
  ball(ctx, 230, 560, 150, false)
  // 骷髅从下钻出：114.9 起上升，含住球
  const rise = ease.outCubic(clamp((t - 114.9) / 1.4))
  const skY = lerp(1250, 470, rise)
  const jaw = 0.5 + 0.3 * Math.sin(t * 6)
  ctx.drawImage(skullSprite(440, jaw), 730, skY, 440, 594)
  ball(ctx, 950, skY + 470, 60, false)
}

/** 骷髅坐在白球上 */
function seated(f: FrameCtx) {
  const { ctx, t } = f
  ctx.fillStyle = '#050505'
  ctx.fillRect(0, 0, 1920, 1080)
  const zoom = 1 + (t - 116.7) * 0.06
  ctx.save()
  ctx.translate(960, 620)
  ctx.scale(zoom, zoom)
  ctx.translate(-960, -620)
  floor(ctx, 720, 1)
  ball(ctx, 960, 760, 118, false)
  const jaw = 0.2 + 0.15 * Math.max(0, Math.sin(t * 3.5))
  ctx.drawImage(skullSprite(430, jaw), 745, 300, 430, 580)
  ctx.restore()
}

/** 结尾淡出 */
function fadeout(f: FrameCtx) {
  const { ctx, t } = f
  ctx.fillStyle = '#050505'
  ctx.fillRect(0, 0, 1920, 1080)
  const a = 1 - clamp((t - 119.0) / 1.0)
  if (a > 0.01) {
    ctx.save()
    ctx.globalAlpha = a
    floor(ctx, 720, 1)
    ball(ctx, 960, 760, 118, false)
    ctx.drawImage(skullSprite(430, 0.2), 745, 300, 430, 580)
    ctx.restore()
  }
}

export function drawS5(f: FrameCtx) {
  const t = f.t
  if (t < 114.3) return inkWave(f)
  if (t < 116.7) return emerge(f)
  if (t < 119.0) return seated(f)
  return fadeout(f)
}
