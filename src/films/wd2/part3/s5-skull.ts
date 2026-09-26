/**
 * 113.1–121s（V2：按 wd2-1080 原片 10–30fps 抽帧重排）：
 *  A 113.10–113.95 融化：拼贴继续下摇，顶部残留一条拼贴，下面是灰色竖向拖影（拼贴像素被拉长），
 *                   黑色火焰轮廓从下往上吞没
 *  B 113.95–114.85 黑底：左侧两只眼球、中右上方品红半调球、两只半调手向下按；114.5 起手向两侧张开、
 *                   骷髅（眼罩）从下方翻上来，114.75 起出现灰色半调地板
 *  C 114.85–116.93 骷髅居中悬在地板上方（椭圆阴影），两侧大手，115.75 起手淡出；
 *                   115.55 一颗眼球从骷髅嘴里掉出、滚向镜头并越来越大
 *  D 116.93–117.13 眼球占满下半屏 + 横向切片故障
 *  E 117.13–117.40 逐 2 帧（30fps）换色：青 → 黄绿 → 紫 → 品红（眼球特写）→ 深蓝 → 橄榄/紫/暗红「炸弹」图案
 *  F 117.40–121    纯黑，只剩字幕（字幕由 subtitles.ts 负责）
 * V1 在 117–121 仍画着骷髅与白球，与原片黑场不符，已修正。
 * 骷髅 / 手 / 眼球为 ASSET 近似（art.ts）。
 */
import type { FrameCtx } from '../../../engine/types'
import { clamp, ease, lerp, rng } from '../../../engine/math'
import { halftone } from '../../../fx/image'
import { eyeballSprite, handSprite, skullSprite, sprite } from './art'
import { fh } from './common'
import { COLLAGE_H, collageCanvas, drawCollageView, flameEdge } from './s4-collage'

const BLACK = '#040404'

type Key = [number, ...number[]]
/** 关键帧插值：keys = [t, v0, v1, ...]，返回插值后的数组（两端夹紧），ease 为段内缓动 */
function keyed(keys: Key[], t: number, e: (x: number) => number = ease.inOutCubic): number[] {
  if (t <= keys[0][0]) return keys[0].slice(1)
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) {
      const a = keys[i - 1]
      const b = keys[i]
      const p = e((t - a[0]) / (b[0] - a[0]))
      return a.slice(1).map((v, k) => lerp(v, b[k + 1], p))
    }
  }
  return keys[keys.length - 1].slice(1)
}

// ------------------------------------------------------------------ 静态精灵

/** 半调地板：顶缘暗、下方渐亮的灰面（原片 114.8–117 骷髅脚下） */
function floorSprite() {
  const H = 440
  return sprite('s5-floor', 1920, H, (g, W) => {
    const tmp = document.createElement('canvas')
    tmp.width = W / 4
    tmp.height = H / 4
    const s = tmp.getContext('2d')!
    const gr = s.createLinearGradient(0, 0, 0, tmp.height)
    gr.addColorStop(0, '#0c0c0c')
    gr.addColorStop(0.3, '#4a4a4a')
    gr.addColorStop(1, '#c8c8c8')
    s.fillStyle = gr
    s.fillRect(0, 0, tmp.width, tmp.height)
    // 左右暗角
    const side = s.createLinearGradient(0, 0, tmp.width, 0)
    side.addColorStop(0, 'rgba(0,0,0,0.55)')
    side.addColorStop(0.3, 'rgba(0,0,0,0)')
    side.addColorStop(0.7, 'rgba(0,0,0,0)')
    side.addColorStop(1, 'rgba(0,0,0,0.55)')
    s.fillStyle = side
    s.fillRect(0, 0, tmp.width, tmp.height)
    g.fillStyle = BLACK
    g.fillRect(0, 0, W, H)
    halftone(g, tmp, { x: 0, y: 0, w: W, h: H, cell: 5, color: '#e6e6e6', invert: true })
  })
}

/** 品红半调球（原片 114 前后骷髅上方那颗） */
function redSphere(r: number) {
  return sprite('s5-redsphere', r * 2, r * 2, (g, W) => {
    const tmp = document.createElement('canvas')
    tmp.width = W / 6
    tmp.height = W / 6
    const s = tmp.getContext('2d')!
    const c = tmp.width / 2
    const gr = s.createRadialGradient(c * 0.8, c * 0.7, c * 0.1, c, c, c)
    gr.addColorStop(0, '#fff')
    gr.addColorStop(0.8, '#bbb')
    gr.addColorStop(1, '#444')
    s.fillStyle = gr
    s.beginPath()
    s.arc(c, c, c, 0, Math.PI * 2)
    s.fill()
    halftone(g, tmp, { x: 0, y: 0, w: W, h: W, cell: 6, color: '#d0145e', invert: true })
  })
}

/** 被拉长的拼贴像素：取拼贴里一条 40px 的横带缩成 1 行，再竖向拉满（去色） */
function smearSprite() {
  return sprite('s5-smear', 1920, 64, (g, W) => {
    const c = collageCanvas()
    g.filter = 'grayscale(1) contrast(1.1) brightness(0.8)'
    g.drawImage(c, 0, Math.min(COLLAGE_H - 40, 2640), W, 40, 0, 0, W, 64)
  })
}

// ------------------------------------------------------------------ 元素

function drawSmear(ctx: CanvasRenderingContext2D, y0: number, y1: number, alpha = 1) {
  if (y1 <= y0 || alpha <= 0) return
  ctx.save()
  ctx.globalAlpha = alpha
  // 1px 行竖向拉伸 → 竖向拖影
  ctx.drawImage(smearSprite(), 0, 30, 1920, 1, 0, y0, 1920, y1 - y0)
  // 少量横向亮暗带，模拟拖影里残留的块
  const R = rng(1133)
  for (let i = 0; i < 18; i++) {
    const x = R.range(0, 1920)
    ctx.fillStyle = R.chance(0.5) ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)'
    ctx.fillRect(x, y0, R.range(20, 120), (y1 - y0) * R.range(0.3, 1))
  }
  ctx.restore()
}

/** 参差竖条拖影：每 24px 一列，长度随机（原片 114 前后顶部残留的灰色滴流） */
function dripTail(ctx: CanvasRenderingContext2D, len: number) {
  const spr = smearSprite()
  const R = rng(1140)
  for (let x = 0; x < 1920; x += 24) {
    const l = len * R.range(0.35, 1.15)
    if (R.chance(0.2)) continue
    ctx.drawImage(spr, x, 30, 24, 1, x, 0, 24, l)
  }
}

/** 黑色火焰：flameY 以下全黑，上缘火苗朝上 */
function drawFlames(ctx: CanvasRenderingContext2D, flameY: number, seed: number) {
  ctx.fillStyle = BLACK
  ctx.beginPath()
  ctx.moveTo(0, flameY)
  flameEdge(ctx, 0, 1920, flameY, flameY - 40, -1, seed, 200)
  ctx.lineTo(1920, 1080)
  ctx.lineTo(0, 1080)
  ctx.closePath()
  ctx.fill()
}

/** 眼球（尾巴朝右）；ex, ey 为球心，r 半径 */
function eyeball(ctx: CanvasRenderingContext2D, ex: number, ey: number, r: number, look = 1) {
  const spr = eyeballSprite(200, look)
  const s = r / 96
  ctx.save()
  ctx.translate(ex, ey)
  ctx.scale(-s, s) // 镜像：尾巴朝右
  ctx.drawImage(spr, -(320 - 100), -100)
  ctx.restore()
}

/** 手：rot 为旋转（0 = 手指朝上），a 为透明度，dim 为变暗程度 */
function hand(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, rot: number, flip: boolean, a = 1, dim = 0) {
  if (a <= 0) return
  ctx.save()
  ctx.globalAlpha = a
  ctx.translate(cx, cy)
  ctx.rotate(rot)
  if (dim > 0) ctx.filter = `brightness(${1 - dim})`
  ctx.drawImage(handSprite(420, flip, true), -size / 2, -size / 2, size, size)
  ctx.restore()
}

function skull(ctx: CanvasRenderingContext2D, cx: number, cy: number, scale: number, rot: number, jaw: number, fadeLow = 0) {
  const w = 430 * scale
  const h = w * 1.35
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(rot)
  ctx.drawImage(skullSprite(430, jaw), -w / 2, -h / 2, w, h)
  if (fadeLow > 0) {
    // 下颌渐隐进黑暗（原片 116 起骷髅下半变成稀疏半调）
    const g = ctx.createLinearGradient(0, -h * 0.05, 0, h / 2)
    g.addColorStop(0, 'rgba(4,4,4,0)')
    g.addColorStop(1, `rgba(4,4,4,${0.75 * fadeLow})`)
    ctx.fillStyle = g
    ctx.fillRect(-w / 2, -h * 0.05, w, h * 0.55)
  }
  ctx.restore()
}

/** 白色眼球（滚向镜头），pupilA 为瞳孔所在角度（球面上的位置） */
function whiteBall(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, pupilA: number, fill = '#f4f4f0', shade = true) {
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fillStyle = fill
  ctx.fill()
  ctx.clip()
  if (shade) {
    const g = ctx.createRadialGradient(cx - r * 0.2, cy - r * 0.35, r * 0.3, cx, cy, r * 1.05)
    g.addColorStop(0, 'rgba(0,0,0,0)')
    g.addColorStop(0.75, 'rgba(0,0,0,0.05)')
    g.addColorStop(1, 'rgba(0,0,0,0.55)')
    ctx.fillStyle = g
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2)
  }
  // 瞳孔：球面上的圆斑，按角度投影（cos 控制可见 / 压扁）
  const vis = Math.cos(pupilA)
  if (vis > 0) {
    const py = cy - Math.sin(pupilA) * r * 0.85
    ctx.fillStyle = '#060606'
    ctx.beginPath()
    ctx.ellipse(cx, py, r * 0.32, r * 0.32 * Math.max(0.15, vis), 0, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

// ------------------------------------------------------------------ 各阶段

/** A：融化 */
function melt(f: FrameCtx) {
  const { ctx, t } = f
  const p = clamp((t - 113.15) / 0.8)
  drawCollageView(ctx, t)
  if (p <= 0) return
  // 顶部残留拼贴高度；其下灰色拖影；火焰线上升
  const topH = lerp(330, 0, clamp((t - 113.15) / 0.4))
  // 火焰线：113.3≈900 → 113.7≈600 → 113.95≈380（原片逐帧量）
  const flameY = keyed([[113.15, 1080], [113.3, 900], [113.7, 600], [113.95, 380]], t, (x) => x)[0]
  ctx.fillStyle = BLACK
  ctx.fillRect(0, topH, 1920, 1080 - topH)
  drawSmear(ctx, topH, flameY + 60)
  drawFlames(ctx, flameY, 1134)
  // 顶缘拼贴逐帧切片错位
  if (fh(t, 3) < 0.5) {
    const y = fh(t, 4) * topH
    ctx.drawImage(ctx.canvas, 0, y, 1920, 30, (fh(t, 5) - 0.5) * 120, y, 1920, 30)
  }
  // 末尾：眼球 / 品红球 / 手从黑里浮出（与 B 衔接）
  if (t > 113.8) propsB(ctx, t, clamp((t - 113.8) / 0.25))
}

/** B 段道具（眼球、品红球、下按的手）；a 为整体淡入 */
function propsB(ctx: CanvasRenderingContext2D, t: number, a: number) {
  const lift = Math.max(0, 114.3 - t) * 260 // 仍在下摇：道具从下往上就位
  ctx.save()
  ctx.globalAlpha = a
  // 品红球
  const red = redSphere(150)
  if (t < 114.55 || fh(t, 7) < 0.6) ctx.drawImage(red, 1040 - 150, 290 - 150 + lift)
  else {
    // 114.55 起横向切片故障
    for (let i = 0; i < 6; i++) {
      const y = i * 50
      ctx.drawImage(red, 0, y, 300, 50, 890 + (fh(t, 20 + i) - 0.5) * 160, 140 + y + lift, 300, 50)
    }
  }
  ctx.restore()
  // 眼球（左侧两只）
  ctx.save()
  ctx.globalAlpha = a
  eyeball(ctx, 300, 270 + lift, 115, 1)
  eyeball(ctx, 190, 620 + lift, 95, 0)
  ctx.restore()
  // 两只手：先向下按（手指朝下），114.5 起向两侧上方张开
  const open = ease.inOutCubic(clamp((t - 114.5) / 0.35))
  const dim = 0.55 * (1 - clamp((t - 113.95) / 0.3))
  hand(ctx, lerp(640, 470, open), lerp(760, 300, open) + lift, 460, lerp(Math.PI, 0.25, open), false, a, dim)
  hand(ctx, lerp(1250, 1450, open), lerp(760, 300, open) + lift, 420, lerp(Math.PI, -0.25, open), true, a, dim)
}

/** B：黑底道具 + 骷髅翻上来 */
function props(f: FrameCtx) {
  const { ctx, t } = f
  ctx.fillStyle = BLACK
  ctx.fillRect(0, 0, 1920, 1080)
  // 顶部残余拖影淡出
  // 顶部残余拖影：参差的竖条向上缩回（113.95≈480 → 114.2≈300 → 114.45 消失）
  const tail = keyed([[113.95, 520], [114.2, 300], [114.45, 0]], t, (x) => x)[0]
  if (tail > 0) dripTail(ctx, tail)
  if (t > 114.6) floorIn(ctx, clamp((t - 114.6) / 0.1))
  propsB(ctx, t, 1)
  if (t > 114.55) skullAnim(ctx, t)
}

function floorIn(ctx: CanvasRenderingContext2D, a: number) {
  ctx.save()
  ctx.globalAlpha = a
  ctx.drawImage(floorSprite(), 0, 640)
  ctx.restore()
}

/** 骷髅位姿：114.55 从下方斜着翻上来 → 115.0 回正居中 */
function skullAnim(ctx: CanvasRenderingContext2D, t: number, fadeLow = 0) {
  const [cx, cy, s, rot] = keyed(
    [
      [114.55, 960, 1250, 0.35, -0.3],
      [114.72, 1030, 960, 0.45, -0.4],
      [114.8, 620, 560, 0.85, -0.35],
      [115.0, 930, 470, 1, 0.1],
      [115.2, 960, 460, 1, 0],
    ],
    t,
    ease.outCubic,
  )
  // 阴影
  if (t > 114.8) {
    ctx.fillStyle = 'rgba(0,0,0,0.9)'
    ctx.beginPath()
    ctx.ellipse(cx, 880, 250 * s, 24 * s, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  const jaw = t < 115.6 ? 0.6 + 0.2 * Math.sin(t * 9) : 0.4
  skull(ctx, cx, cy, s, rot, jaw, fadeLow)
}

/** 眼球滚向镜头的轨迹（中心 x, y, 半径, 瞳孔角度） */
const BALL: Key[] = [
  [115.55, 940, 700, 70, 1.2],
  [115.8, 900, 800, 110, 0.2],
  [116.3, 790, 860, 125, -1.2],
  [116.8, 790, 800, 215, -2.8],
  [116.93, 800, 770, 280, 2.2],
  [117.12, 860, 640, 470, 1.45],
]

/** C：骷髅居中 + 两侧手 + 眼球滚出 */
function seated(f: FrameCtx) {
  const { ctx, t } = f
  ctx.fillStyle = BLACK
  ctx.fillRect(0, 0, 1920, 1080)
  ctx.drawImage(floorSprite(), 0, 640)
  // 两侧大手（手心朝前、手指张开），115.75 起淡出
  const ha = 1 - clamp((t - 115.75) / 0.3)
  const breathe = Math.sin((t - 114.85) * 5) * 10
  hand(ctx, 470, 300 + breathe, 460, 0.25, false, ha)
  hand(ctx, 1450, 300 - breathe, 460, -0.25, true, ha)
  skullAnim(ctx, t, clamp((t - 116.0) / 0.6))
  if (t >= 115.55) {
    const [bx, by, br, pa] = keyed(BALL, t, (x) => x)
    // 眼球阴影
    ctx.fillStyle = 'rgba(0,0,0,0.85)'
    ctx.beginPath()
    ctx.ellipse(bx + br * 0.15, by + br * 0.98, br * 1.0, br * 0.16, 0, 0, Math.PI * 2)
    ctx.fill()
    whiteBall(ctx, bx, by, br, pa)
  }
}

/** D：眼球占满下半屏 + 横向切片故障 */
function ballGlitch(f: FrameCtx) {
  seated(f)
  const { ctx, t } = f
  if (t < 117.03) return
  // 30fps 切片：白色横条 + 整行错位
  const R = rng(Math.floor(t * 30) * 13)
  for (let i = 0; i < 9; i++) {
    const y = R.range(0, 1000)
    const h = R.range(12, 70)
    ctx.drawImage(ctx.canvas, 0, y, 1920, h, R.range(-160, 160), y, 1920, h)
  }
  ctx.fillStyle = '#f2f2ef'
  for (let i = 0; i < 6; i++) ctx.fillRect(R.range(0, 1700), R.range(0, 700), R.range(80, 420), R.range(14, 40))
}

/** 炸弹图案（斜排的黑色炸弹 / 鱼形剪影），E 段后四帧的底纹 */
function bombPattern(ctx: CanvasRenderingContext2D, base: string, ink: string) {
  ctx.fillStyle = base
  ctx.fillRect(0, 0, 1920, 1080)
  ctx.save()
  ctx.fillStyle = ink
  ctx.rotate(-0.55)
  for (let row = -4; row < 14; row++) {
    for (let col = -2; col < 14; col++) {
      const x = col * 190 + (row % 2) * 95
      const y = row * 120
      ctx.beginPath()
      ctx.ellipse(x, y, 58, 32, 0, 0, Math.PI * 2)
      ctx.moveTo(x - 50, y)
      ctx.lineTo(x - 95, y - 26)
      ctx.lineTo(x - 95, y + 26)
      ctx.closePath()
      ctx.fill()
    }
  }
  ctx.restore()
  // 细网点质感
  ctx.fillStyle = 'rgba(0,0,0,0.18)'
  for (let y = 0; y < 1080; y += 6) ctx.fillRect(0, y, 1920, 2)
}

/** E：逐 2 帧换色 */
function colorFlash(f: FrameCtx) {
  const { ctx, t } = f
  const k = clamp(Math.floor((t - 117.12) * 30), 0, 7)
  ctx.fillStyle = BLACK
  ctx.fillRect(0, 0, 1920, 1080)
  const balls: [string, number, number, number, number][] = [
    ['#3ccbe9', 880, 900, 640, 1.2],
    ['#cfe45e', 900, 860, 760, 1.05],
    ['#b24ad8', 940, 700, 1000, 0.55],
  ]
  if (k < 3) {
    const [c, x, y, r, pa] = balls[k]
    whiteBall(ctx, x, y, r, pa, c)
    // 残留横向切片
    const R = rng(k * 31 + 5)
    for (let i = 0; i < 5; i++) {
      const yy = R.range(0, 1000)
      ctx.drawImage(ctx.canvas, 0, yy, 1920, 16, R.range(-120, 120), yy, 1920, 16)
    }
    return
  }
  if (k === 3) {
    ctx.fillStyle = '#e1197c'
    ctx.fillRect(0, 0, 1920, 1080)
    const g = ctx.createRadialGradient(900, 380, 60, 900, 380, 520)
    g.addColorStop(0, 'rgba(0,0,0,1)')
    g.addColorStop(0.5, 'rgba(0,0,0,0.85)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 1920, 1080)
    return
  }
  if (k === 4) {
    ctx.fillStyle = '#03182c'
    ctx.fillRect(0, 0, 1920, 1080)
    ctx.fillStyle = 'rgba(40,80,120,0.25)'
    for (let y = 0; y < 1080; y += 5) ctx.fillRect(0, y, 1920, 1)
    return
  }
  const pats: [string, string][] = [
    ['#4a5c1c', 'rgba(10,16,4,0.8)'],
    ['#4b1768', 'rgba(14,4,22,0.8)'],
    ['#8e1040', 'rgba(26,2,10,0.8)'],
  ]
  const [base, ink] = pats[k - 5]
  bombPattern(ctx, base, ink)
}

export function drawS5(f: FrameCtx) {
  const t = f.t
  if (t < 113.95) return melt(f)
  if (t < 114.85) return props(f)
  if (t < 116.93) return seated(f)
  if (t < 117.12) return ballGlitch(f)
  if (t < 117.4) return colorFlash(f)
  // F：纯黑（字幕层另画）
  f.ctx.fillStyle = '#000'
  f.ctx.fillRect(0, 0, 1920, 1080)
}

