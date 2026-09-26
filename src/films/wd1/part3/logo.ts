/**
 * WD1 140.7s–151s：黑底 WATCH_DOGS 故障标志 + "everything is connected" / "connection is power"。
 *
 * 故障节奏全部按 30fps 帧号（原片逐帧对照得来）写成时间表 `logoState()`，
 * 标志本体是程序化压窄粗体字（ASSET：换成官方矢量标志只需替换 `baseLogo()`）。
 */
import type { Scene } from '../../../engine/types'
import { clamp, hash, rng } from '../../../engine/math'
import { offscreen } from '../../../fx/canvas'
import { FONT } from '../../../fx/text'
import { F30, condensedText, scrambleLR } from './util'

// 标志局部坐标：字宽 1080、字高（大写高度）160，离屏画布四周留白
const LW = 1080
const CAP = 160
const PAD = 120
const TOP = 60 // 大写字母顶边在离屏里的 y
const CW = LW + PAD * 2
const CH = 300
const INK = '#e4e6e0'
// V2：按评分管线（与 snap 相同的 RGB 转换）量得原片底色灰度≈1，V1 的 #020401 偏亮
const BG = '#010101'

/** ASSET：干净的 WATCH_DOGS 字标（离屏缓存） */
function baseLogo() {
  const o = offscreen('p3-logo-base', CW, CH)
  if ((o.canvas as HTMLCanvasElement & { _ok?: boolean })._ok) return o.canvas
  o.ctx.clearRect(0, 0, CW, CH)
  o.ctx.fillStyle = INK
  // 下划线用矩形画：字体里的 "_" 太低，原片下划线底边与字母底边齐平
  const c = o.ctx
  c.font = `700 ${CAP / 0.72}px ${FONT.sans}`
  c.fontStretch = 'condensed'
  const k = LW / c.measureText('WATCH_DOGS').width
  const x1 = PAD + c.measureText('WATCH').width * k
  const x2 = PAD + c.measureText('WATCH_').width * k
  condensedText(c, 'WATCH', PAD, TOP + CAP, CAP, c.measureText('WATCH').width * k, 700)
  c.font = `700 ${CAP / 0.72}px ${FONT.sans}`
  c.fontStretch = 'condensed'
  condensedText(c, 'DOGS', x2, TOP + CAP, CAP, c.measureText('DOGS').width * k, 700)
  c.fillRect(x1 + 4, TOP + CAP * 0.9, x2 - x1 - 8, CAP * 0.1)
  ;(o.canvas as HTMLCanvasElement & { _ok?: boolean })._ok = true
  return o.canvas
}

const ASCII = 'MATx<>^06SCc28&f!I5_'

interface LogoState {
  alpha: number
  /** 故障花样 seed：同一 seed 画出同一种错位 */
  seed: number
  /** 下半部像素溃散程度 0..1 */
  dissolve: number
  /** 大幅切片错位 0..1 */
  slices: number
  blur: number
  /** 灰色残块（结尾） */
  blocks: boolean
  /** 整体灰度（半亮的「残影」帧） */
  grey: boolean
}

/**
 * 逐帧时间表（F = 30fps 帧号）。来源：140.5–149.5s 逐帧抽帧对照。
 * 140.50 起前 7 帧是若隐若现的暗影，140.73 标志出现，下半部像素溃散到 141.3，
 * 141.53 一帧大切片，141.6–141.8 模糊/马赛克，之后稳定并有零星微抖；148.9 起收尾故障，149.2 黑场。
 */
function logoState(F: number): LogoState | null {
  const k = F - 4215 // 140.5s
  const base: LogoState = { alpha: 1, seed: 7, dissolve: 0, slices: 0, blur: 0, blocks: false, grey: false }
  if (k < 0) return null
  if (k <= 6) {
    if (k === 1 || k === 3 || k === 4) return null
    return { ...base, alpha: k === 6 ? 0.12 : 0.3, seed: k, dissolve: 0.5, blur: 1.5 }
  }
  if (k <= 9) return { ...base, seed: k, dissolve: 0.35 }
  if (k <= 24) return { ...base, seed: k, dissolve: 0.85 - ((k - 10) / 14) * 0.45 }
  if (k <= 29) return { ...base, seed: k, slices: 0.25 }
  if (k === 30) return { ...base, seed: 3 }
  if (k === 31) return { ...base, seed: k, slices: 1, alpha: 0.85 }
  if (k === 32) return { ...base, seed: k, slices: 0.6, alpha: 0.8 }
  if (k <= 39) return { ...base, seed: 3, blur: 7 - (k - 33) * 0.8 }
  // 结尾：148.9 大故障 → 149.0–149.07 半亮 → 149.1 全亮 → 149.13–149.17 灰残块 → 黑
  const e = F - 4467 // 148.9s
  if (e >= 0) {
    if (e <= 2) return { ...base, seed: 900 + e, slices: 0.8, dissolve: 0.3 }
    if (e <= 5) return { ...base, seed: 900 + e, grey: true, alpha: 0.6 }
    if (e === 6) return { ...base, seed: 906 }
    if (e <= 8) return { ...base, seed: 900 + e, blocks: true }
    return null
  }
  // 稳定期：每 ~0.4s 换一次错位花样，零星单帧跳变
  const epoch = Math.floor(F / 12)
  const jump = hash(F * 7 + 3) < 0.12
  return { ...base, seed: jump ? 5000 + F : 100 + epoch, slices: jump ? 0.3 : 0 }
}

/** 把干净字标加工成原片那种「上半完整、下半切片 + 缺口里嵌小字符」的故障版 */
function glitchLogo(st: LogoState) {
  const src = baseLogo()
  const o = offscreen('p3-logo-g', CW, CH)
  const c = o.ctx
  c.setTransform(1, 0, 0, 1, 0, 0)
  c.clearRect(0, 0, CW, CH)
  const R = rng(st.seed * 9973 + 11)
  const yBand = TOP + CAP * 0.5
  const yLow = TOP + CAP * 0.6
  // 上半：完整
  c.drawImage(src, 0, 0, CW, yBand, 0, 0, CW, yBand)
  // 中间细带：轻微错位
  let y = yBand
  while (y < yLow) {
    const h = Math.round(R.range(3, 7))
    const dx = Math.round(R.range(-5, 5) * (1 + st.slices * 6))
    c.drawImage(src, 0, y, CW, h, dx, y, CW, h)
    y += h
  }
  // 下半：水平切片错位，部分切片变灰（残影）
  y = yLow
  while (y < CH) {
    const h = Math.round(R.range(5, 16))
    const dx = Math.round(R.range(-7, 7) * (1 + st.slices * 8))
    c.globalAlpha = R.chance(0.1) ? 0.5 : 1
    c.drawImage(src, 0, y, CW, h, dx, y, CW, h)
    c.globalAlpha = 1
    y += h
  }
  // 灰色重影：下半部整体右移一次
  c.globalAlpha = 0.12
  c.drawImage(src, 0, yLow, CW, CH - yLow, R.range(6, 14), yLow + 2, CW, CH - yLow)
  c.globalAlpha = 1
  // 缺口 + 小字符
  c.font = `400 22px ${FONT.mono}`
  c.textBaseline = 'top'
  for (let i = 0; i < 26; i++) {
    const x = PAD + R.range(0, LW)
    const yy = yLow + R.range(0, CAP * 0.45)
    const w = R.range(14, 44)
    const h = R.range(14, 26)
    c.globalCompositeOperation = 'destination-out'
    c.fillRect(x, yy, w, h)
    c.globalCompositeOperation = 'source-over'
    if (R.chance(0.7)) {
      c.fillStyle = INK
      c.fillText(ASCII[R.int(0, ASCII.length - 1)], x + 2, yy + 1)
    }
  }
  // 贯穿标志两侧的灰色横线
  c.fillStyle = 'rgba(200,200,200,0.55)'
  const ly = TOP + CAP * 0.56
  c.fillRect(PAD - R.range(30, 55), ly, R.range(26, 40), 3)
  c.fillRect(PAD + LW - 10, ly - 4, R.range(40, 70), 3)
  for (let i = 0; i < 4; i++) c.fillRect(PAD + R.range(0, LW), ly + R.range(-2, 6), R.range(20, 60), 3)
  return o.canvas
}

/** 下半部像素溃散：把低处像素打成小方块，向下随机散落 */
function dissolve(canvas: HTMLCanvasElement, amount: number, seed: number) {
  const c = canvas.getContext('2d')!
  const y0 = Math.round(TOP + CAP * 0.45)
  const img = c.getImageData(0, y0, CW, CH - y0)
  c.clearRect(0, y0, CW, CH - y0)
  const d = img.data
  const cell = 3
  c.fillStyle = INK
  for (let y = 0; y < img.height; y += cell)
    for (let x = 0; x < CW; x += cell) {
      if (d[(y * CW + x) * 4 + 3] < 100) continue
      const hsh = hash(x * 7919 + y * 104729 + seed * 13)
      const depth = y / img.height // 越往下越碎
      if (hsh < amount * depth * 0.9) {
        // 掉落的点
        if (hash(x + y * 31 + seed) < 0.35) {
          const dy = hash(x * 3 + y + seed * 5) * amount * 70
          c.fillRect(x, y0 + y + dy, 2, 2)
        }
        continue
      }
      c.fillRect(x, y0 + y, cell, cell)
    }
}

export const logo: Scene = {
  id: 'wd1-140-watchdogs-logo',
  start: 139.3,
  end: 151,
  note: '黑场 → 140.73 WATCH_DOGS 故障标志出现并缓慢放大；144.07 "everything is connected" 乱码解出；146.17 白底 "connection is power"；148.6 标语消失，148.9 收尾故障，149.2 黑场到片尾',
  render(f) {
    const { ctx, W, H, t } = f
    // V2：原片 149.2 之后的「黑场」其实仍是底色（灰度 3），150.1 才真正变成 0
    ctx.fillStyle = t >= 140.73 && t < 150.08 ? BG : '#000'
    ctx.fillRect(0, 0, W, H)
    const F = F30(t)
    const st = logoState(F)
    if (!st) return
    const g = glitchLogo(st)
    if (st.dissolve > 0) dissolve(g, st.dissolve, st.seed)
    // 标志随时间缓慢放大：142s 宽 945px，每秒 +18px（1920 坐标）
    const width = 945 + 18 * (t - 142)
    const s = width / LW
    const cx = 947
    const cy = 507
    ctx.save()
    ctx.translate(cx - (PAD + LW / 2) * s, cy - (TOP + CAP / 2) * s)
    ctx.scale(s, s)
    ctx.globalAlpha = st.alpha
    if (st.grey) ctx.filter = 'brightness(0.55)'
    if (st.blur > 0) {
      // 模糊帧：先马赛克再模糊，接近原片那种糊掉的块感
      const pix = offscreen('p3-logo-pix', Math.round(CW / 5), Math.round(CH / 5))
      pix.ctx.clearRect(0, 0, pix.canvas.width, pix.canvas.height)
      pix.ctx.drawImage(g, 0, 0, pix.canvas.width, pix.canvas.height)
      ctx.filter = `blur(${st.blur}px)`
      ctx.drawImage(pix.canvas, 0, 0, CW, CH)
      ctx.filter = 'none'
    } else if (st.blocks) {
      const R = rng(st.seed)
      ctx.fillStyle = 'rgba(120,120,120,0.55)'
      for (let i = 0; i < 16; i++) ctx.fillRect(R.range(0, CW), TOP + R.range(-10, CAP), R.range(40, 260), R.range(6, 30))
      ctx.fillStyle = 'rgba(60,60,60,0.8)'
      for (let i = 0; i < 6; i++) ctx.fillRect(0, TOP + R.range(0, CAP * 1.2), CW, 2)
    } else {
      ctx.drawImage(g, 0, 0)
    }
    ctx.filter = 'none'
    ctx.globalAlpha = 1

    // 标语（跟随标志一起缩放）
    font(ctx)
    if (t >= 144.07 && t < 146.15) {
      const p = clamp((t - 144.07) / 0.45)
      const text = scrambleLR('everything is connected', p, F)
      ctx.fillStyle = INK
      ctx.fillText(text, PAD + 100, TOP + CAP * 1.66)
    }
    if (t >= 146.15 && t < 148.62) {
      const p = clamp((t - 146.15) / 0.38)
      const full = 'connection is power'
      const text = p >= 1 ? full : scrambleLR(full, p, F)
      const shown = text.trimEnd()
      const bx = PAD + LW * 0.46
      const by = TOP + CAP * 1.46
      const bw = p >= 1 ? LW * 0.45 : Math.min(LW * 0.45, ctx.measureText(shown).width + 24)
      ctx.fillStyle = '#ececec'
      ctx.fillRect(bx, by, bw, CAP * 0.32)
      ctx.fillStyle = '#000'
      ctx.fillText(shown, bx + 10, by + CAP * 0.25)
    }
    ctx.restore()
  },
}

function font(ctx: CanvasRenderingContext2D) {
  ctx.font = `400 ${CAP * 0.32}px ${FONT.sans}`
  ctx.letterSpacing = '0px'
  ctx.textBaseline = 'alphabetic'
}
