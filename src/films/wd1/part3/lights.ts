/**
 * WD1 133.4s–139.3s：手机上的城市那一镜的 2D 图层。
 * - `skyline`：远处夜景天际线（画在 3D 城市之前 = 背景）。先是虚焦的光斑，137.6 焦点拉到远处变清晰，
 *   138.1 起窗灯一片片熄灭，139.25 全黑。ASSET：程序化天际线，替换 `buildSkyline()` 为真实夜景照片即可。
 * - `turnOut`："TURN OUT THE LIGHTS." 从画面上方巨大、虚焦、深灰，一路缩小下移、变清晰变白（136.0 完全清晰），
 *   随相机后拉继续缩小，138.6 起变暗，139.3 黑场。
 */
import type { Scene } from '../../../engine/types'
import { clamp, ease, hash, lerp, rng, seg } from '../../../engine/math'
import { offscreen } from '../../../fx/canvas'
import { memo } from '../../../engine/three-host'
import { FONT } from '../../../fx/text'
import { S } from './util'

// ---------- 天际线 ----------
const SKY_W = 1020 // 1920 坐标下的宽度
const SKY_H = 300

interface Win {
  x: number
  y: number
  k: number
}
function buildSkyline() {
  const R = rng(4242)
  const sil: { x: number; w: number; h: number }[] = []
  // 天际线轮廓：几座地标高楼 + 大量低矮楼
  const land = [
    { c: 0.3, w: 34, h: 255 },
    { c: 0.27, w: 28, h: 150 },
    { c: 0.46, w: 30, h: 205 },
    { c: 0.35, w: 40, h: 90 },
    { c: 0.63, w: 26, h: 150 },
    { c: 0.72, w: 36, h: 175 },
    { c: 0.76, w: 22, h: 125 },
    { c: 0.52, w: 22, h: 110 },
    // V2：原片天际线两翼也有一排中高层（138.2 参考帧：灯带横跨 ~1020px）
    { c: 0.08, w: 26, h: 70 },
    { c: 0.15, w: 30, h: 95 },
    { c: 0.2, w: 20, h: 60 },
    { c: 0.57, w: 26, h: 85 },
    { c: 0.84, w: 30, h: 90 },
    { c: 0.9, w: 24, h: 65 },
  ]
  for (const l of land) sil.push({ x: l.c * SKY_W - l.w / 2, w: l.w, h: l.h })
  for (let x = 0; x < SKY_W; ) {
    const w = R.range(10, 34)
    const center = Math.exp(-(((x / SKY_W - 0.5) / 0.3) ** 2))
    sil.push({ x, w, h: R.range(22, 48) + R.range(0, 80) * center })
    x += w * R.range(0.6, 1.1)
  }
  const wins: Win[] = []
  for (const b of sil)
    for (let y = SKY_H - b.h + 4; y < SKY_H - 3; y += 6)
      for (let x = b.x + 2; x < b.x + b.w - 2; x += 5) if (R.chance(0.72)) wins.push({ x, y, k: R.next() })
  return { sil, wins }
}

function drawSkyline(ctx: CanvasRenderingContext2D, off: number, t: number) {
  const sk = memo('p3-skyline', buildSkyline)
  const o = offscreen('p3-skyline', SKY_W, SKY_H)
  const c = o.ctx
  c.clearRect(0, 0, SKY_W, SKY_H)
  // 楼身几乎全黑，只有窗灯
  c.fillStyle = '#050505'
  for (const b of sk.sil) c.fillRect(b.x, SKY_H - b.h, b.w, b.h)
  const frame = Math.floor(t * 30)
  for (const w of sk.wins) {
    // 熄灯：k 小的先灭；熄灯过程中偶尔闪一下
    if (w.k < off && !(w.k > off - 0.04 && hash(frame * 13 + Math.floor(w.x * 7 + w.y)) < 0.3)) continue
    c.fillStyle = w.k > 0.85 ? '#ffffff' : '#cfcfcf'
    c.fillRect(w.x, w.y, 2.5, 2.5)
  }
  // 楼顶灯
  c.fillStyle = '#fff'
  for (const b of sk.sil.slice(0, 8)) if (off < 0.95) c.fillRect(b.x + 2, SKY_H - b.h, b.w - 4, 4)
  return o.canvas
}

export const skyline: Scene = {
  id: 'wd1-133-skyline',
  start: 133.4,
  end: 139.3,
  note: '远处夜景天际线：虚焦光斑 → 137.6 对焦 → 138.1 起熄灯',
  render(f) {
    const { ctx, t } = f
    const img = drawSkyline(ctx, seg(t, 138.1, 139.25), t)
    // 底边 y（1280 坐标）：133.8→133，134.5→235，136.5→290，之后停在 ~300
    const base = S * (t < 134.5 ? lerp(60, 235, seg(t, 133.4, 134.5)) : t < 136.5 ? lerp(235, 290, ease.outQuad(seg(t, 134.5, 136.5))) : lerp(290, 300, seg(t, 136.5, 138.3)))
    const cx = 632 * S
    const blur = 11 * (1 - seg(t, 137.6, 138.0))
    ctx.save()
    ctx.globalAlpha = seg(t, 133.4, 134.2)
    if (blur > 0.3) {
      // 虚焦：先整体模糊，再叠一层更大的模糊增亮，近似散景光斑
      ctx.filter = `blur(${blur}px)`
      ctx.drawImage(img, cx - SKY_W / 2, base - SKY_H)
      ctx.globalCompositeOperation = 'lighter'
      ctx.filter = `blur(${blur * 0.6}px) brightness(1.6)`
      ctx.drawImage(img, cx - SKY_W / 2, base - SKY_H)
    } else ctx.drawImage(img, cx - SKY_W / 2, base - SKY_H)
    ctx.restore()
  },
}

// ---------- TURN OUT THE LIGHTS. ----------
/** 关键帧（1280 坐标）：时间、中心 x、基线 y、大写高度、模糊、亮度 */
const TK: [number, number, number, number, number, number][] = [
  [133.4, 440, 50, 105, 14, 0.18],
  [133.8, 450, 150, 104, 13, 0.2],
  [134.5, 465, 300, 100, 10, 0.24],
  [135.3, 485, 350, 80, 7, 0.32],
  [135.8, 495, 375, 70, 2, 0.8],
  [136.0, 500, 383, 67, 0, 1],
  [136.5, 520, 393, 62, 0, 1],
  [137.0, 541, 395, 55, 0, 1],
  [137.5, 561, 400, 47, 0, 1],
  [138.3, 595, 428, 38, 0, 0.95],
  [138.7, 605, 430, 34, 0.5, 0.8],
  [139.25, 625, 432, 27, 1, 0.3],
]

function tkAt(t: number) {
  if (t <= TK[0][0]) return TK[0]
  for (let i = 0; i < TK.length - 1; i++) {
    const a = TK[i]
    const b = TK[i + 1]
    if (t <= b[0]) {
      const p = (t - a[0]) / (b[0] - a[0])
      return a.map((v, j) => lerp(v, b[j], p)) as typeof a
    }
  }
  return TK[TK.length - 1]
}

export const turnOut: Scene = {
  id: 'wd1-133-turn-out-the-lights',
  start: 133.4,
  end: 139.3,
  note: '"TURN OUT THE LIGHTS." 大号虚焦深灰 → 136.0 清晰白字 → 随相机后拉缩小 → 138.6 起变暗',
  render(f) {
    const { ctx, t } = f
    const [, cx, base, cap, blur, lum] = tkAt(t)
    const size = (cap * S) / 0.72
    ctx.save()
    ctx.font = `500 ${size}px ${FONT.sans}`
    ctx.letterSpacing = '0px'
    const text = 'TURN OUT THE LIGHTS.'
    const w = ctx.measureText(text).width
    // 原片字宽 ≈ 13.3 × 大写高度，横向拉到这个宽度
    const target = cap * 13.3 * S
    ctx.translate(cx * S, base * S)
    ctx.rotate(-0.012)
    ctx.scale(target / w, 1)
    if (blur > 0.2) ctx.filter = `blur(${blur * S}px)`
    const v = Math.round(clamp(lum) * 240)
    ctx.fillStyle = `rgb(${v},${v},${v})`
    ctx.textBaseline = 'alphabetic'
    ctx.fillText(text, -w / 2, 0)
    ctx.restore()
  },
}
