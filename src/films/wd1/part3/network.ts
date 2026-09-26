/**
 * WD1 110.8s–120.3s：分类色块 → NETWORK 字标。
 * 110.8 "Nigerian Email Scams" 巨大白字压在上一镜的网络上打出，110.98 白底出现，黑色 D 形色块收缩到位 →
 * 112.0 快速横移，"Hardcore Pornography"（ASCII 字符画梯形）从右滑入 → 113.3 两块移开，
 * "Online Shopping" 圆饼进入 → 114.5 空白 → 114.6 "Emergency Services" 色块长成字母 N →
 * 115.8 起相机边右移边拉远，E（横条）T（方块+竖条）W（斜线）O（圆）R（D 形）K（字符画）依次出现 →
 * 119.3 完整 NETWORK → 继续拉远，119.75 露出白色大屏边缘 → 120.3 硬切舞台。
 *
 * 全部 2D 绘制，坐标写成参考片 1280×720 的像素（绘制前统一 ×1.5）。
 * `drawNetworkWord()` 也被舞台镜头的大屏、地面小屏复用。
 * ASSET：Hardcore 色块里的人物照片用程序化 ASCII 字符画代替（`asciiTexture()`）。
 */
import type { Scene } from '../../../engine/types'
import { clamp, ease, lerp, rng, seg } from '../../../engine/math'
import { offscreen } from '../../../fx/canvas'
import { memo } from '../../../engine/three-host'
import { FONT } from '../../../fx/text'
import { S } from './util'

// ---------------- 小工具 ----------------

/** 关键帧插值：keys = [t, ...values]，段内 inOutCubic */
export function keyed(t: number, keys: number[][], easing = ease.inOutCubic): number[] {
  if (t <= keys[0][0]) return keys[0].slice(1)
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i]
    const b = keys[i + 1]
    if (t <= b[0]) {
      const p = easing(clamp((t - a[0]) / (b[0] - a[0])))
      return a.slice(1).map((v, j) => lerp(v, b[j + 1], p))
    }
  }
  return keys[keys.length - 1].slice(1)
}

function label(ctx: CanvasRenderingContext2D, lines: string[], x: number, y: number, cap: number, color = '#fff') {
  ctx.fillStyle = color
  ctx.font = `500 ${cap / 0.72}px ${FONT.sans}`
  ctx.letterSpacing = `${-cap * 0.03}px`
  ctx.textBaseline = 'alphabetic'
  lines.forEach((l, i) => ctx.fillText(l, x, y + i * cap * 1.3))
  ctx.letterSpacing = '0px'
}

/** 黑色色块里的淡灰网络连线 + 极小的说明字（原片里是 "Data is interconnected" 那张网的残影） */
function netLines(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, seed: number, alpha = 0.35) {
  const R = rng(seed)
  const pts = Array.from({ length: 12 }, () => [x + R.next() * w, y + R.next() * h])
  ctx.strokeStyle = `rgba(200,200,200,${alpha})`
  ctx.lineWidth = 0.8
  ctx.beginPath()
  for (let i = 0; i < 22; i++) {
    const a = pts[R.int(0, pts.length - 1)]
    const b = pts[R.int(0, pts.length - 1)]
    ctx.moveTo(a[0], a[1])
    ctx.lineTo(b[0], b[1])
  }
  ctx.stroke()
  ctx.fillStyle = `rgba(220,220,220,${alpha * 1.6})`
  for (const p of pts) ctx.fillRect(p[0] - 1.5, p[1] - 1.5, 3, 3)
  ctx.fillStyle = `rgba(200,200,200,${alpha})`
  for (let i = 0; i < 6; i++) {
    const p = pts[i]
    for (let k = 0; k < 3; k++) ctx.fillRect(p[0] + 6, p[1] + k * 4, R.range(12, 26) * Math.min(1, w / 400), 1.5)
  }
}

/** ASSET：Hardcore Pornography 色块里的 ASCII 字符画（程序化人物剪影亮度场） */
function asciiTexture() {
  return memo('p3-ascii', () => {
    const W = 700
    const H = 760
    const { canvas, ctx } = offscreen('p3-ascii-tex', W, H)
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, W, H)
    ctx.font = `700 11px ${FONT.mono}`
    ctx.textBaseline = 'top'
    const ramp = ' .:-!icoC0A'
    const figure = (x: number, y: number) => {
      // 两个模糊人形：头（圆）+ 躯干（椭圆），越靠近越暗
      let d = 1
      for (const [cx, cy] of [
        [0.33, 0.28],
        [0.62, 0.62],
      ]) {
        const head = Math.hypot((x - cx) / 0.06, (y - cy) / 0.05)
        const body = Math.hypot((x - cx) / 0.12, (y - cy - 0.2) / 0.16)
        d = Math.min(d, Math.min(head, body))
      }
      return clamp(d)
    }
    for (let y = 0; y < H; y += 8)
      for (let x = 0; x < W; x += 6.5) {
        const v = figure(x / W, y / H)
        const ch = ramp[Math.floor(clamp(v) * (ramp.length - 1))]
        ctx.fillStyle = `rgba(240,240,240,${0.35 + v * 0.65})`
        ctx.fillText(ch, x, y)
      }
    return canvas
  })
}

// ---------------- 分类色块 ----------------

/** "Nigerian Email Scams"：右侧半圆的 D 形黑块。x,y 左上角，h 高度，宽 = 1.54h */
function nigerian(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, textP = 1, panel = true) {
  const w = 1.54 * h
  const r = h / 2
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x + w - r, y)
  ctx.arc(x + w - r, y + r, r, -Math.PI / 2, Math.PI / 2)
  ctx.lineTo(x, y + h)
  ctx.closePath()
  if (panel) {
    ctx.fillStyle = '#000'
    ctx.fill()
    ctx.clip()
    netLines(ctx, x, y + h * 0.3, w * 0.8, h * 0.7, 11)
  }
  const lines = ['Nigerian', 'Email', 'Scams']
  const cap = h * 0.125
  const n = Math.round(textP * 20)
  let used = 0
  const shown = lines.map((l) => {
    const k = clamp(n - used, 0, l.length)
    used += l.length
    return l.slice(0, k)
  })
  label(ctx, shown, x + w * 0.23, y + h * 0.44, cap)
  ctx.restore()
}

/** "Hardcore Pornography"：左边垂直、右边斜切的梯形，填 ASCII 字符画。h 高度 */
function hardcore(ctx: CanvasRenderingContext2D, x: number, y: number, h: number) {
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x + 0.38 * h, y)
  ctx.lineTo(x + 1.1 * h, y + h)
  ctx.lineTo(x, y + h)
  ctx.closePath()
  ctx.fillStyle = '#000'
  ctx.fill()
  ctx.clip()
  ctx.drawImage(asciiTexture(), x, y, 1.1 * h, h)
  label(ctx, ['Hardcore', 'Pornography'], x + h * 0.02, y + h * 0.48, h * 0.084)
  ctx.restore()
}

/** "Online Shopping"：黑色圆饼（顶部缺一道细楔形）。cx,cy 圆心，r 半径 */
function online(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, wedge = true) {
  ctx.save()
  ctx.beginPath()
  if (wedge) {
    ctx.moveTo(cx, cy)
    ctx.arc(cx, cy, r, -Math.PI / 2 + 0.07, -Math.PI / 2 + 2 * Math.PI - 0.02)
    ctx.closePath()
  } else ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fillStyle = '#000'
  ctx.fill()
  ctx.clip()
  netLines(ctx, cx - r, cy - r * 0.6, r * 2, r * 1.4, 23, 0.4)
  label(ctx, ['Online', 'Shopping'], cx - r * 0.58, cy - r * 0.02, r * 0.1)
  ctx.restore()
}

// ---------------- NETWORK 字标 ----------------

/**
 * 画 NETWORK 字标。坐标系：字标左上角 (x, y)，z = 缩放（z=1 时整词宽 1019、字高 150，参考片 1280 坐标）。
 * reveal(i) 返回第 i 个字母（N E T W O R K）的出现进度 0..1；省略 = 全部显示。
 */
export function drawNetworkWord(ctx: CanvasRenderingContext2D, x: number, y: number, z: number, reveal?: (i: number) => number, eWidth = 1) {
  const H = 150
  const rv = (i: number) => (reveal ? clamp(reveal(i)) : 1)
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(z, z)
  ctx.translate(-133, -228)
  ctx.fillStyle = '#000'
  const top = 228
  const bot = top + H
  const clipLeft = (x0: number, x1: number, p: number, draw: () => void) => {
    if (p <= 0) return
    ctx.save()
    ctx.beginPath()
    ctx.rect(x0 - 10, top - 30, (x1 - x0 + 20) * ease.outCubic(p), H + 60)
    ctx.clip()
    draw()
    ctx.restore()
  }
  // N：整块减去右上三角
  clipLeft(133, 257, rv(0), () => {
    const w = 124
    ctx.beginPath()
    ctx.moveTo(133, top)
    ctx.lineTo(133 + 0.27 * w, top)
    ctx.lineTo(133 + 0.76 * w, top + 0.7 * H)
    ctx.lineTo(133 + 0.76 * w, top)
    ctx.lineTo(257, top)
    ctx.lineTo(257, bot)
    ctx.lineTo(133, bot)
    ctx.closePath()
    ctx.fill()
    label(ctx, ['Emergency', 'Services'], 140, top + H * 0.83, H * 0.068)
    ctx.fillStyle = '#000'
  })
  // E：16 条横纹
  clipLeft(273, 388, rv(1), () => {
    const pat = 'FFFSSSFFFSSSSFFF'
    const pitch = H / 16
    // eWidth：E 刚出现时比最终窄（原片 116s 左右 E 只有 N 的一半宽，随后拉宽）
    for (let i = 0; i < 16; i++) ctx.fillRect(273, top + i * pitch, (pat[i] === 'F' ? 115 : 62) * eWidth, pitch * 0.5)
  })
  // T：左方块 + 竖条 + 右方块
  if (rv(2) > 0) {
    const p = rv(2)
    ctx.fillRect(440, top, 25, H * ease.outCubic(clamp(p / 0.6)))
    if (p > 0.5) {
      ctx.fillRect(390, top, 23, 24)
      ctx.fillRect(490, top, 22, 24)
    }
  }
  // W：四道斜笔画，每道由 7 条细斜线组成
  clipLeft(520, 712, rv(3), () => {
    ctx.strokeStyle = '#000'
    ctx.lineWidth = 2.2
    // 每道笔画：[顶端 x, 底端 x]，\ / \ / 交替
    const strokes: [number, number][] = [
      [520, 565],
      [610, 565],
      [612, 657],
      [702, 657],
    ]
    ctx.beginPath()
    for (const [xt, xb] of strokes)
      for (let j = 0; j < 7; j++) {
        ctx.moveTo(xt + j * 5.5, top)
        ctx.lineTo(xb + j * 5.5, bot)
      }
    ctx.stroke()
  })
  // O：圆
  if (rv(4) > 0) {
    const r = 83 * ease.outBack(rv(4))
    online(ctx, 787, 302, r, false)
    ctx.fillStyle = '#000'
  }
  // R：竖干 + 圆角碗 + 斜腿
  clipLeft(878, 1000, rv(5), () => {
    ctx.beginPath()
    ctx.moveTo(878, top)
    ctx.lineTo(955, top)
    ctx.arc(955, top + 45, 45, -Math.PI / 2, Math.PI / 2)
    ctx.lineTo(1000, bot)
    ctx.lineTo(962, bot)
    ctx.lineTo(925, top + 92)
    ctx.lineTo(925, bot)
    ctx.lineTo(878, bot)
    ctx.closePath()
    ctx.fill()
    label(ctx, ['Nigerian', 'Email', 'Scams'], 907, top + 32, 10)
    ctx.fillStyle = '#000'
  })
  // K：字符画填充
  clipLeft(1018, 1152, rv(6), () => {
    ctx.save()
    ctx.beginPath()
    ctx.moveTo(1018, top)
    ctx.lineTo(1050, top)
    ctx.lineTo(1050, top + 70)
    ctx.lineTo(1110, top)
    ctx.lineTo(1150, top)
    ctx.lineTo(1080, top + 78)
    ctx.lineTo(1152, bot)
    ctx.lineTo(1018, bot)
    ctx.closePath()
    ctx.fill()
    ctx.clip()
    ctx.globalAlpha = 0.75
    ctx.drawImage(asciiTexture(), 1018, top, 150, H)
    ctx.globalAlpha = 1
    label(ctx, ['Hardcore', 'Pornography'], 1021, top + 72, 9)
    ctx.restore()
  })
  ctx.restore()
}

// 字标相机（115.0–120.3）：[t, 字标左上角 x, y, 缩放]
const CAM = [
  [114.6, 236, 50, 3.9],
  [115.8, 212, 76, 3.45],
  [116.0, 207, 80, 3.35],
  [117.3, 144, 150, 2.23],
  [118.5, 113, 200, 1.39],
  [119.3, 133, 228, 1.0],
  [120.0, 260, 260, 0.72],
  [120.3, 290, 268, 0.66],
]
/** 字母出现时间（N E T W O R K） */
const APPEAR = [114.6, 115.8, 116.15, 116.6, 117.2, 117.9, 118.55]

/** N 的特殊生长：114.6 先是左下的 "Emergency Services" 色块，115.0 长出斜边，115.2 右竖从顶上落下 */
function growN(ctx: CanvasRenderingContext2D, x: number, y: number, z: number, t: number) {
  const H = 150 * z
  const w = 124 * z
  const a = seg(t, 114.85, 115.1)
  const b = seg(t, 114.95, 115.3)
  const c = seg(t, 115.15, 115.7)
  ctx.fillStyle = '#000'
  ctx.save()
  // 左下色块从下往上长
  const bw = w * 0.3 + w * 0.46 * b
  const bh = H * lerp(0.43, 1, a)
  ctx.beginPath()
  ctx.moveTo(x, y + H)
  ctx.lineTo(x, y + H - bh)
  if (b > 0) {
    ctx.lineTo(x + 0.27 * w, y + H - bh)
    ctx.lineTo(x + lerp(0.27, 0.76, b) * w, y + H - bh + (0.7 * H) * b)
    ctx.lineTo(x + lerp(0.27, 0.76, b) * w, y + H)
  } else ctx.lineTo(x + bw, y + H - bh), ctx.lineTo(x + bw, y + H)
  ctx.closePath()
  ctx.fill()
  // 右竖：先是顶上的一个方块，再往下长
  if (c > 0) ctx.fillRect(x + 0.76 * w, y, 0.24 * w, lerp(0.16, 1, ease.inOutCubic(c)) * H)
  ctx.beginPath()
  ctx.rect(x, y, bw, H)
  ctx.clip()
  label(ctx, ['Emergency', 'Services'], x + 7 * z, y + H * 0.83, H * 0.068)
  ctx.restore()
}

export const network: Scene = {
  id: 'wd1-110-network',
  start: 110.8,
  end: 120.3,
  note: '分类色块（Nigerian Email Scams / Hardcore Pornography / Online Shopping / Emergency Services）→ 拼成 NETWORK 字标 → 拉远成白色大屏',
  render(f) {
    const { ctx, W, H, t } = f
    ctx.save()
    // 110.8–110.98：只在上一镜（Data is interconnected 的网）上叠巨大的白字；110.98 起白底 + D 形黑块收缩到位
    if (t >= 110.98) {
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, W, H)
    }
    ctx.scale(S, S)
    if (t < 111.0) {
      const [x, y, h] = keyed(t, [
        [110.8, 122, -330, 980],
        [110.9, 122, -290, 920],
        [111.0, 150, -120, 750],
      ])
      nigerian(ctx, x, y, h, seg(t, 110.8, 111.35), t >= 110.98)
    } else if (t < 114.55) {
      const [nx, ny, nh] = keyed(t, [
        [111.0, 150, -120, 750],
        [111.2, 207, 13, 614],
        [111.5, 215, 25, 607],
        [111.85, 225, 30, 590],
        [112.1, -330, -20, 480],
        [112.5, -400, 0, 350],
        [112.95, -330, 0, 350],
        [113.25, 193, 0, 377],
        [113.5, 490, 7, 368],
        [114.0, 866, 70, 304],
        [114.3, 1350, 70, 304],
      ])
      nigerian(ctx, nx, ny, nh, seg(t, 110.8, 111.35))
      if (t > 111.95 && t < 113.85) {
        const [hx, hy, hh] = keyed(t, [
          [111.95, 1300, -40, 760],
          [112.25, 300, -40, 760],
          [113.0, 310, -40, 760],
          [113.3, 940, -20, 720],
          [113.5, 1147, 5, 710],
          [113.85, 1400, 5, 710],
        ])
        hardcore(ctx, hx, hy, hh)
      }
      if (t > 113.3 && t < 114.5) {
        const [cx, cy, r] = keyed(t, [
          [113.3, -330, 180, 300],
          [113.5, -250, 180, 318],
          [114.0, 518, 360, 318],
          [114.25, 793, 360, 318],
          [114.5, 1500, 360, 318],
        ])
        online(ctx, cx, cy, r)
      }
    } else {
      // 114.55 起：NETWORK 字标（相机右移拉远）
      const [x, y, z] = keyed(t, CAM, ease.linear)
      if (t < 115.8) growN(ctx, x, y, z, t)
      drawNetworkWord(ctx, x, y, z, (i) => (i === 0 ? (t < 115.8 ? 0 : 1) : seg(t, APPEAR[i], APPEAR[i] + 0.25)), lerp(0.55, 1, ease.inOutCubic(seg(t, 116.1, 117.1))))
      // 119.75 起露出大屏边缘：屏幕外是舞台暗部
      const edge = seg(t, 119.7, 120.3)
      if (edge > 0) {
        // 大屏（1280 坐标）：120.0 时屏幕 (100,27)–(1167,633)，字标 (260,260) z=0.72，按比例跟随相机
        const sx = x - 222 * z
        const sw = 1482 * z
        const sy = y - 324 * z
        const sh = 842 * z
        ctx.fillStyle = '#0b0b0b'
        ctx.beginPath()
        ctx.rect(-10, -10, 1300, 740)
        ctx.rect(sx + sw, sy, -sw, sh)
        ctx.fill('evenodd')
      }
    }
    ctx.restore()
  },
}
