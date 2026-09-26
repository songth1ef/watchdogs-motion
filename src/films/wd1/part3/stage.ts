/**
 * WD1 120.3s–123.6s：舞台大屏。
 * 120.3 硬切：舞台（剪影桁架、灯箱、雾气逆光）中间的白色大屏还显示着 NETWORK，
 * 巨大的 "SHUTDOWN" 从镜头前压进屏幕、青底从左擦出 → 120.95 巨大的 "THE ENTIRE NORTHEAST" 同样压入，
 * SHUTDOWN 上移缩小 → 相机持续后拉，地面露出许多显示 NETWORK 的小屏 → 122.85 舞台灯熄，只剩屏幕与灯箱 →
 * 123.3 急速后退成黑场，交给素模城市。
 *
 * 全部 2D 近似。坐标 = 「舞台空间」：122.5s 那一帧的参考片 1280×720 像素；
 * 每帧按 zoom(t) 以 (630,335) 为中心缩放（模拟相机后拉）。
 * ASSET：舞台剪影（`drawSet()`）是手绘几何，换成真实舞台模型渲染图只需替换该函数。
 */
import type { Scene } from '../../../engine/types'
import { ease, lerp, seg } from '../../../engine/math'
import { FONT } from '../../../fx/text'
import { WD1 } from '../../../theme'
import { drawNetworkWord, keyed } from './network'
import { S } from './util'

const CX = 630
const CY = 335
/** 大屏在舞台空间里的位置 */
const SCR = { x: 400, y: 205, w: 460, h: 260 }

/** 地面小屏（舞台空间，x,y,w,h） */
const FLOOR_SCREENS = [
  [200, 595, 50, 33],
  [263, 603, 74, 50],
  [385, 606, 73, 50],
  [533, 663, 84, 55],
  [857, 598, 50, 35],
  [1045, 688, 160, 50],
  [460, 700, 70, 40],
  [700, 640, 40, 28],
  [990, 640, 150, 110],
]

function silhouetteColor(dark: number) {
  // dark: 0 = 舞台亮着，1 = 熄灯
  return `rgba(28,28,28,${1 - dark})`
}

/** ASSET：舞台剪影 + 雾气背景 */
function drawSet(ctx: CanvasRenderingContext2D, dark: number, floorY = 520, z = 1) {
  const a = 1 - dark
  if (a > 0) {
    // 雾气逆光背景
    const g = ctx.createRadialGradient(CX, 120, 40, CX, 200, 900)
    g.addColorStop(0, `rgba(250,250,250,${a})`)
    g.addColorStop(0.45, `rgba(200,200,200,${a})`)
    g.addColorStop(1, `rgba(135,135,135,${a})`)
    ctx.fillStyle = g
    ctx.fillRect(-1400, -800, 3800, 1330)
    const sc = silhouetteColor(dark)
    ctx.fillStyle = sc
    ctx.strokeStyle = sc
    // 顶部弧形桁架
    ctx.lineWidth = 22
    ctx.beginPath()
    ctx.moveTo(-300, 30)
    ctx.quadraticCurveTo(CX, 135, 1600, 10)
    ctx.stroke()
    // 吊架：竖杆 + 倒 V
    ctx.lineWidth = 3
    for (const [x, base] of [
      [65, 190],
      [220, 190],
      [495, 205],
      [628, 205],
      [760, 205],
    ]) {
      ctx.beginPath()
      ctx.moveTo(x, 60)
      ctx.lineTo(x, base - 70)
      ctx.lineTo(x - 42, base)
      ctx.moveTo(x, base - 70)
      ctx.lineTo(x + 42, base)
      ctx.stroke()
    }
    // 左侧房屋剪影（坡屋顶）
    ctx.beginPath()
    ctx.moveTo(-600, 190)
    ctx.lineTo(-600, 140)
    ctx.lineTo(160, 140)
    ctx.lineTo(250, 190)
    ctx.closePath()
    ctx.fill()
    ctx.fillRect(-600, 190, 600, 330)
    // 左侧中景构筑物、柱子
    ctx.fillRect(292, 285, 60, 180)
    ctx.fillRect(352, 305, 48, 145)
    ctx.fillRect(292, 465, 8, 70)
    ctx.fillRect(345, 465, 8, 70)
    ctx.fillRect(240, 465, 10, 75)
    ctx.fillRect(282, 465, 10, 75)
    // 右侧大体块 + 平台桁架。V2：近景体块有视差——推得越近越往画面中间靠（120.5 原片右侧黑块从 x≈1080 开始）
    ctx.save()
    ctx.translate(-(z - 1) * 57, 0)
    ctx.beginPath()
    ctx.moveTo(915, 140)
    ctx.lineTo(950, 125)
    ctx.lineTo(1900, 125)
    ctx.lineTo(1900, 520)
    ctx.lineTo(915, 520)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = `rgba(150,150,150,${a})`
    ctx.fillRect(930, 368, 185, 110)
    ctx.fillStyle = sc
    ctx.lineWidth = 3
    ctx.strokeRect(930, 368, 185, 110)
    ctx.beginPath()
    ctx.moveTo(930, 368)
    ctx.lineTo(1022, 478)
    ctx.lineTo(1115, 368)
    ctx.moveTo(930, 478)
    ctx.lineTo(1022, 368)
    ctx.lineTo(1115, 478)
    ctx.stroke()
    ctx.fillRect(862, 275, 60, 8)
    ctx.fillRect(862, 275, 6, 280)
    ctx.fillRect(876, 283, 6, 270)
    ctx.restore()
    // 大屏下方的楼梯、吊架影子
    ctx.lineWidth = 2
    ctx.beginPath()
    for (let i = 0; i < 6; i++) {
      ctx.moveTo(430 + i * 6, 520 - i * 10)
      ctx.lineTo(530 + i * 6, 520 - i * 10)
      ctx.moveTo(705 + i * 6, 520 - i * 10)
      ctx.lineTo(780 + i * 6, 520 - i * 10)
    }
    ctx.stroke()
    // 卫星锅（线框）
    ctx.save()
    ctx.translate(962, 488)
    ctx.rotate(-0.35)
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.ellipse(0, 0, 58, 30, 0, 0, Math.PI * 2)
    for (let i = -2; i <= 2; i++) {
      ctx.moveTo(i * 22, -28)
      ctx.lineTo(i * 22, 28)
    }
    ctx.moveTo(-56, 0)
    ctx.lineTo(56, 0)
    ctx.stroke()
    ctx.restore()
    // 地面：黑色，大屏脚下一团雾光。V2：地平线随相机后拉在舞台空间里下移（原片 120.5≈425、121.0≈461、122.5≈498，
    // 真实相机有俯仰/平移，2D 缩放近似不了，只能让地面线跟着走）
    ctx.fillStyle = '#000'
    ctx.fillRect(-1400, floorY, 3800, 1200)
    const gl = ctx.createRadialGradient(CX, floorY, 10, CX, floorY, 520)
    gl.addColorStop(0, `rgba(255,255,255,${0.55 * a})`)
    gl.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.save()
    ctx.translate(0, floorY)
    ctx.scale(1, 0.18)
    ctx.translate(0, -floorY)
    ctx.fillStyle = gl
    ctx.fillRect(-400, floorY - 520, 2100, 1040)
    ctx.restore()
  }
  // 左侧灯箱（熄灯后仍亮）
  ctx.save()
  ctx.shadowColor = 'rgba(255,255,255,0.9)'
  ctx.shadowBlur = 18
  for (const x0 of [-33, 118]) {
    ctx.fillStyle = '#f2f2f2'
    ctx.fillRect(x0, 182, 138, 284)
  }
  ctx.restore()
  ctx.fillStyle = 'rgba(60,60,60,0.9)'
  for (const x0 of [-33, 118]) {
    for (let i = 1; i < 5; i++) ctx.fillRect(x0 + (i * 138) / 5 - 1, 182, 2, 284)
    for (let j = 1; j < 9; j++) ctx.fillRect(x0, 182 + (j * 284) / 9 - 1, 138, 2)
  }
}

/** 大屏上的文字（舞台空间，超出屏幕也照画——原片里巨大的字会压到屏幕外） */
function drawText(ctx: CanvasRenderingContext2D, t: number) {
  const word = (text: string, cap: number, baseline: number, cx: number, box: number, dim: number, linear = false) => {
    const size = cap / 0.72
    ctx.font = `500 ${size}px ${FONT.sans}`
    ctx.letterSpacing = `${-size * 0.02}px`
    const w = ctx.measureText(text).width
    const x = cx - w / 2
    if (box > 0) {
      ctx.fillStyle = WD1.cyan
      const padX = cap * 0.2
      ctx.fillRect(x - padX, baseline - cap * 1.18, (w + padX * 2) * (linear ? box : ease.outCubic(box)), cap * 1.5)
    }
    ctx.fillStyle = `rgba(0,0,0,${1 - dim})`
    ctx.fillText(text, x, baseline)
    ctx.letterSpacing = '0px'
  }
  if (t >= 120.3) {
    const [cap, base, cx] = keyed(
      t,
      [
        [120.3, 168, 409, 630],
        [120.5, 126, 389, 635],
        [120.7, 61, 360, 632],
        [121.0, 49, 347, 632],
        [121.4, 40, 338, 630],
        [121.8, 31, 334, 628],
        [122.2, 26, 330, 626],
        [122.6, 23, 327, 626],
      ],
      ease.outQuad,
    )
    word('SHUTDOWN', cap, base, cx, seg(t, 120.44, 120.66), 0, true)
  }
  if (t >= 120.95) {
    const [cap, base, cx] = keyed(
      t,
      [
        [120.95, 200, 575, 650],
        [121.1, 110, 535, 645],
        [121.3, 68, 445, 640],
        // V2：按 121.5–122.6 参考帧量字宽（换算回舞台空间），收缩要持续到 122.6 才定版
        [121.5, 44, 420, 639],
        [121.8, 35, 398, 638],
        [122.0, 31.5, 390, 638],
        [122.4, 28, 380, 638],
        [122.6, 26.5, 376, 638],
      ],
      ease.outQuad,
    )
    word('THE ENTIRE NORTHEAST', cap, base, cx, seg(t, 121.12, 121.45), 0)
  }
}

export const stage: Scene = {
  id: 'wd1-120-stage-shutdown',
  start: 120.3,
  end: 123.6,
  note: '舞台大屏：SHUTDOWN / THE ENTIRE NORTHEAST 巨大字压入并缩到屏幕里；相机后拉露出地面小屏；熄灯；急退黑场',
  render(f) {
    const { ctx, W, H, t } = f
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, W, H)
    const [z] = keyed(
      t,
      [
        [120.3, 1.97],
        [120.5, 1.9],
        [120.7, 1.8],
        [121.0, 1.62],
        [121.5, 1.35],
        [122.0, 1.2],
        [122.5, 1.0],
        // V2：原片熄灯前后拉变慢（122.6 ≈0.92、123.1 ≈0.84），123.1 后才急退
        [122.9, 0.88],
        [123.1, 0.84],
        [123.2, 0.77],
        [123.3, 0.63],
        [123.4, 0.47],
        [123.6, 0.08],
      ],
      ease.linear,
    )
    const dark = seg(t, 122.85, 123.1)
    ctx.save()
    ctx.scale(S, S)
    ctx.translate(CX, CY)
    ctx.scale(z, z)
    ctx.translate(-CX, -CY)
    ctx.globalAlpha = 1 - seg(t, 123.4, 123.6)
    const [floorY] = keyed(
      t,
      [
        [120.3, 420],
        [120.5, 425],
        [121.0, 461],
        [122.0, 490],
        [122.5, 498],
        [123.0, 505],
      ],
      ease.linear,
    )
    drawSet(ctx, dark, floorY, z)
    // 大屏
    ctx.save()
    ctx.shadowColor = 'rgba(255,255,255,0.9)'
    ctx.shadowBlur = 30 * (1 - dark)
    ctx.fillStyle = '#fbfbfb'
    ctx.fillRect(SCR.x, SCR.y, SCR.w, SCR.h)
    ctx.restore()
    // 屏幕里残留的 NETWORK（灰，半透明）
    ctx.save()
    ctx.globalAlpha *= lerp(0.9, 0.4, seg(t, 120.3, 120.7))
    const wz = 0.3
    drawNetworkWord(ctx, CX - (1019 * wz) / 2, 305, wz)
    ctx.restore()
    drawText(ctx, t)
    // 地面小屏（121.7 起随相机后拉进入画面）
    const vis = seg(t, 121.6, 121.9)
    if (vis > 0) {
      for (const [x, y, w, h] of FLOOR_SCREENS) {
        ctx.save()
        ctx.globalAlpha *= vis
        ctx.shadowColor = 'rgba(255,255,255,0.8)'
        ctx.shadowBlur = 12
        ctx.fillStyle = '#f4f4f4'
        ctx.fillRect(x, y, w, h)
        ctx.restore()
        drawNetworkWord(ctx, x + w * 0.15, y + h * 0.4, (w * 0.7) / 1019)
      }
    }
    ctx.restore()
  },
}
