/**
 * 43.0–47.92s：BIG BROTHER 大字 → 碎成白色小方块 → 镜头推进，小方块翻转露出人脸 → 切到人脸卡片。
 */
import type { FrameCtx, Scene } from '../../../engine/types'
import { ease, hash, lerp, rng, seg } from '../../../engine/math'
import { FONT, font, tracking } from '../../../fx/text'
import { WD2 } from '../../../theme'
import { cachedCanvas, faceCard, fr } from './common'

/** 版式（1080p 坐标）：两行左对齐，整体水平居中；BIG 字高约 370px */
const BIG = { size: 552, base: 646, track: -18 }
const BRO = { size: 192, base: 830, track: -9 }
const CX = 960
const CY = 560

function layoutX(ctx: CanvasRenderingContext2D) {
  font(ctx, BIG.size, 700, FONT.sans)
  tracking(ctx, BIG.track)
  const w = ctx.measureText('BIG').width
  tracking(ctx, 0)
  return CX - w / 2
}

function drawBig(ctx: CanvasRenderingContext2D, x: number, dx = 0, dy = 0) {
  font(ctx, BIG.size, 700, FONT.sans)
  tracking(ctx, BIG.track)
  ctx.fillText('BIG', x + dx, BIG.base + dy)
  tracking(ctx, 0)
}
function drawBro(ctx: CanvasRenderingContext2D, x: number, n = 7) {
  font(ctx, BRO.size, 700, FONT.sans)
  tracking(ctx, BRO.track)
  ctx.fillText('BROTHER'.slice(0, n), x + 6, BRO.base)
  tracking(ctx, 0)
}

/** 文字转小方块：光栅化后按网格采样 */
interface Chip {
  x: number
  y: number
  z0: number
  vx: number
  vy: number
  vz: number
  rot: number
  spin: number
  tumble: number
  phase: number
  tone: number
  seed: number
}
let chipCache: Chip[] | null = null
function chips(): Chip[] {
  if (chipCache) return chipCache
  const mask = cachedCanvas('bb-mask', 1920, 1080, (c) => {
    c.fillStyle = '#fff'
    const x = layoutX(c)
    drawBig(c, x)
    drawBro(c, x)
  })
  const d = mask.getContext('2d')!.getImageData(0, 0, 1920, 1080).data
  const R = rng(4242)
  const out: Chip[] = []
  const step = 13
  for (let y = 200; y < 900; y += step)
    for (let x = 400; x < 1520; x += step) {
      const px = Math.round(x + R.range(-3, 3))
      const py = Math.round(y + R.range(-3, 3))
      if (d[(py * 1920 + px) * 4 + 3] < 128) continue
      const ang = Math.atan2(py - CY, px - CX)
      const sp = R.range(15, 90)
      out.push({
        x: px,
        y: py,
        z0: 1 + R.range(-0.02, 0.02),
        vx: Math.cos(ang) * sp + R.range(-25, 25),
        vy: Math.sin(ang) * sp * 0.7 + R.range(-25, 25),
        vz: R.range(-0.12, 0.12),
        rot: R.range(-0.6, 0.6),
        spin: R.range(-2, 2),
        tumble: R.range(1, 4),
        phase: R.range(0, Math.PI * 2),
        tone: R.range(0.35, 1),
        seed: R.int(1, 400),
      })
    }
  chipCache = out
  return out
}

/** 43.2 附近一帧：上一镜头（part1 的黄绿色 DedSec 画面）闪回，这里用黄绿色块噪点近似 */
function greenFlash(ctx: CanvasRenderingContext2D, W: number, H: number, frame: number) {
  ctx.fillStyle = '#56631a'
  ctx.fillRect(0, 0, W, H)
  const R = rng(frame * 31 + 5)
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = R.chance(0.5) ? '#9fb33a' : '#27300a'
    ctx.fillRect(Math.floor(R.next() * 96) * 20, Math.floor(R.next() * 54) * 20, R.int(1, 5) * 20, R.int(1, 3) * 20)
  }
}

function renderText(f: FrameCtx) {
  const { ctx, t, W, H } = f
  const frame = fr(t)
  if (t >= 43.18 && t < 43.26) {
    greenFlash(ctx, W, H, frame)
    return
  }
  if (t < 43.27) return
  const x = layoutX(ctx)
  ctx.fillStyle = WD2.fg
  if (t < 43.56) {
    // 故障段：几份 BIG 副本错位，每份只露出几条水平切片（按 30fps 跳变）
    const k = Math.floor(t * 30)
    for (let i = 0; i < 3; i++) {
      const R = rng(k * 17 + i * 101)
      const dx = R.range(-420, 420)
      const dy = R.range(-260, 280)
      const bands = R.int(1, 3)
      for (let b = 0; b < bands; b++) {
        const y0 = R.range(250, 800)
        const hh = R.range(40, 170)
        ctx.save()
        ctx.beginPath()
        ctx.rect(0, y0, W, hh)
        ctx.clip()
        drawBig(ctx, x, dx, dy)
        ctx.restore()
      }
    }
    if (t > 43.45) {
      ctx.fillStyle = '#dc3a1c'
      drawBro(ctx, x + 380, 3)
    }
    return
  }
  // 43.56 起：BIG 稳定，BROTHER 红色逐字打出，43.73 变白；随后缓慢放大
  const s = 1 + 0.045 * ease.inOutCubic(seg(t, 43.7, 45.9))
  ctx.save()
  ctx.translate(CX, CY)
  ctx.scale(s, s)
  ctx.translate(-CX, -CY)
  ctx.fillStyle = WD2.fg
  drawBig(ctx, x)
  const n = Math.ceil(7 * seg(t, 43.56, 43.68))
  // 原片这里的红偏橙
  ctx.fillStyle = t < 43.73 ? '#dc3a1c' : WD2.fg
  drawBro(ctx, x, n)
  ctx.restore()
}

/** 碎片阶段：3D 透视，镜头沿 z 推进 */
function renderChips(f: FrameCtx) {
  const { ctx, t } = f
  const tau = t - 45.88
  const list = chips()
  // 镜头 z：先缓慢，47.2 之后加速冲进去
  const cz = 0.04 * tau + 0.65 * Math.pow(seg(t, 47.35, 47.92), 2.4)
  const s0 = 1 + 0.045
  const shrink = lerp(1.05, 0.82, seg(tau, 0, 0.25))
  for (let i = 0; i < list.length; i++) {
    const c = list[i]
    const z = c.z0 + c.vz * tau - cz
    if (z < 0.08) continue
    const k = s0 / z
    const e = 1 - Math.exp(-tau * 2.6)
    const wx = (c.x - CX) * (1 + 0.12 * e) + c.vx * e * 1.5 + c.vx * 0.15 * tau
    const wy = (c.y - CY) * (1 + 0.2 * e) + c.vy * e * 1.5 + c.vy * 0.15 * tau
    // 46.5 起云团像被镜头绕着转：水平收拢、整体右移，字形被打散
    const squeeze = lerp(1, 0.62, ease.inOutCubic(seg(t, 46.4, 47.6)))
    const jit = seg(t, 46.2, 47.4)
    const jx = (hash(i * 3 + 1) - 0.5) * 260 * jit
    const jy = (hash(i * 3 + 2) - 0.5) * 200 * jit
    const sx = CX + 170 * seg(t, 46.4, 47.6) + (wx * squeeze + jx) * k
    const sy = CY + (wy + jy) * k
    const size = 18 * shrink * k
    if (sx < -size || sx > 1920 + size || sy < -size || sy > 1080 + size) continue
    const flip = Math.cos(c.phase + c.tumble * tau * (tau > 0.05 ? 1 : 0))
    ctx.save()
    ctx.translate(sx, sy)
    ctx.rotate(c.rot * seg(tau, 0, 0.3) + c.spin * tau * 0.3)
    ctx.scale(Math.max(0.08, Math.abs(flip)), 1)
    const faceP = seg(tau, 0.5 + hash(i) * 0.6, 1.4 + hash(i) * 0.4)
    if (size > 9 && faceP > 0) {
      faceCard(ctx, c.seed, size, size > 60 ? 12 : 8, size > 40)
      if (faceP < 1) {
        ctx.globalAlpha = 1 - faceP
        ctx.fillStyle = '#f2f2f2'
        ctx.fillRect(-size / 2, -size / 2, size, size)
      }
    } else {
      const v = Math.round(255 * lerp(1, c.tone, seg(tau, 0.1, 0.6)) * (0.75 + 0.25 * Math.abs(flip)))
      ctx.fillStyle = `rgb(${v},${v},${v})`
      ctx.fillRect(-size / 2, -size / 2, size, size)
    }
    ctx.restore()
  }
  // 碎片之间若隐若现的暗青色连线
  if (tau > 0.15) {
    const R = rng(55)
    ctx.strokeStyle = `rgba(90,150,160,${0.35 * seg(tau, 0.15, 0.5)})`
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let i = 0; i < 160; i++) {
      const a = list[R.int(0, list.length - 1)]
      const b = list[R.int(0, list.length - 1)]
      if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) > 120) continue
      const k = s0 / Math.max(0.1, 1 - cz)
      ctx.moveTo(CX + (a.x - CX) * 1.1 * k, CY + (a.y - CY) * 1.15 * k)
      ctx.lineTo(CX + (b.x - CX) * 1.1 * k, CY + (b.y - CY) * 1.15 * k)
    }
    ctx.stroke()
  }
  // 极短的「整块字」到「碎片」衔接：前 0.08s 叠一层渐隐的实心字
  const a = 1 - seg(tau, 0, 0.1)
  if (a > 0) {
    ctx.globalAlpha = a
    ctx.save()
    ctx.translate(CX, CY)
    ctx.scale(s0, s0)
    ctx.translate(-CX, -CY)
    ctx.fillStyle = WD2.fg
    const x = layoutX(ctx)
    drawBig(ctx, x)
    drawBro(ctx, x)
    ctx.restore()
    ctx.globalAlpha = 1
  }
}

export const bigBrother: Scene[] = [
  {
    id: 'wd2-043-big-brother',
    start: 43,
    end: 45.88,
    note: 'BIG 故障错位 → BROTHER 红字打出后变白 → 缓慢推近',
    render: renderText,
  },
  {
    id: 'wd2-045-chips',
    start: 45.88,
    end: 47.92,
    note: '大字碎成白色小方块向外散开，镜头推进，方块翻转露出马赛克人脸',
    render: renderChips,
  },
]

