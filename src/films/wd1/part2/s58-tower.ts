/**
 * 57.75–62.7  白底页面：威利斯塔剪影 + "THE ANSWER IS..." 深色标签 → "Private companies…" 打字（青色高亮）
 * → 引线 + 黑底 "ctOS" 字标 + T. Rushmore 引语 → 页面整体上移出画，露出黑底。
 * 页面坐标 = 原片 61.3s 时的屏幕坐标（此时缩放 = 1）。镜头运动用 track() 关键帧（量自参考帧）。
 * ASSET：塔楼 drawTower() 是分层矩形 + 雾化渐变的剪影，换成真实照片/渲染图只需替换该函数。
 */
import type { Scene } from '../../../engine/types'
import { WD1 } from '../../../theme'
import { FONT, darkLabel, drawTyped, ease, ref, setFont, span, track, typed } from './common'

const AX = 372
const AY = 240

/** 页面 → 屏幕：缩放 s 以锚点 A（标签左上角）为中心，A 在屏幕上的位置为 (ox, oy) */
function cam(t: number) {
  const s = t < 58.1 ? track(t, [[57.72, 3.3], [57.85, 2.6], [58.1, 1.4]]) : 1 + 0.4 * Math.exp(-(t - 58.1) * 1.05)
  const ox = track(t, [
    [57.72, 240],
    [57.85, 258],
    [58.1, 290],
    [58.8, 452],
    [59.2, 472],
    [60.2, 488],
    [60.65, 488],
    [61.0, 424],
    [61.3, 372],
    [61.6, 352],
    [61.9, 340],
    [62.2, 340],
  ])
  const oy = track(t, [
    [57.72, 318],
    [57.85, 322],
    [58.1, 328],
    [58.8, 342],
    [59.2, 344],
    [60.2, 346],
    [60.65, 346],
    [61.0, 288],
    [61.3, 240],
    [61.6, 220],
    [61.9, 212],
    [62.1, 180],
    [62.3, 60],
    [62.5, -343],
    [62.7, -800],
  ])
  return { s, ox, oy }
}

/** ASSET：威利斯塔剪影（页面坐标） */
function drawTower(ctx: CanvasRenderingContext2D) {
  const g = ctx.createLinearGradient(0, 90, 0, 720)
  g.addColorStop(0, 'rgba(210,214,214,0.6)')
  g.addColorStop(0.3, '#9ca1a1')
  g.addColorStop(0.6, '#6c7373')
  g.addColorStop(1, '#434b4b')
  ctx.fillStyle = g
  // 天线
  ctx.fillRect(280, 104, 1.6, 66)
  ctx.fillRect(309, 96, 1.8, 74)
  ctx.fillRect(273, 150, 1, 20)
  ctx.fillRect(316, 148, 1, 22)
  // 各层筒体（从上到下逐层变宽）
  ctx.fillRect(266, 168, 59, 560)
  ctx.fillRect(271, 247, 36, 480)
  ctx.fillRect(305, 252, 46, 480)
  ctx.fillRect(243, 354, 122, 380)
  // 层间的明暗分隔
  ctx.fillStyle = 'rgba(255,255,255,0.18)'
  ctx.fillRect(266, 168, 5, 90)
  ctx.fillStyle = 'rgba(0,0,0,0.08)'
  ctx.fillRect(305, 252, 46, 102)
  ctx.fillRect(330, 354, 35, 380)
  // 顶部雾化
  const fog = ctx.createLinearGradient(0, 90, 0, 300)
  fog.addColorStop(0, 'rgba(252,252,252,0.95)')
  fog.addColorStop(1, 'rgba(252,252,252,0)')
  ctx.fillStyle = fog
  ctx.fillRect(230, 90, 150, 210)
}

const QUOTE = [
  '/ "WE\'RE NOT REMOVING FREEDOMS.',
  '/ IT TAKES A LONG TIME TO APPRECIATE FREEDOM.',
  '/ IT TAKES CRUSHING DOMINANCE TO TRULY APPRECIATE FREEDOM."',
  '/ T. RUSHMORE, JUNE 2011',
]

export const s58Tower: Scene = {
  id: 'wd1-058-tower-answer-ctos',
  start: 57.75,
  end: 62.7,
  note: '白底威利斯塔 + THE ANSWER IS... + Private companies… + ctOS 字标，页面上移出画',
  render({ ctx, t }) {
    ref(ctx)
    // 白色页面：57.75–58.05 从左侧扩展铺满
    const wx = track(t, [
      [57.72, 120],
      [57.8, 580],
      [57.9, 808],
      [58.02, 1280],
    ])
    const wy = track(t, [
      [57.72, 260],
      [57.8, 144],
      [57.9, 0],
      [58.0, 0],
    ])
    const { s, ox, oy } = cam(t)
    const toS = (x: number, y: number) => [(x - AX) * s + ox, (y - AY) * s + oy]
    // 页面下边缘（页面坐标 683），下方是黑底
    const [, pageBottom] = toS(0, 683)
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, wy, wx, Math.min(720, pageBottom) - wy)
    ctx.clip()
    ctx.fillStyle = '#fcfcfc'
    ctx.fillRect(0, 0, 1280, 720)

    ctx.translate(ox, oy)
    ctx.scale(s, s)
    ctx.translate(-AX, -AY)

    // 塔楼与页面有视差：推近阶段塔楼更快地移出左侧
    ctx.save()
    ctx.translate(-Math.max(0, s - 1.2) * 600, 0)
    drawTower(ctx)
    ctx.restore()

    // THE ANSWER IS...（标签底先展开，再打字）
    const tt = typed('THE ANSWER IS...', t, 57.8, 34)
    const lw = Math.max(282 * span(t, 57.9, 58.05, ease.outCubic), 40 + tt.n * 14) * span(t, 57.7, 57.76)
    if (lw > 1) {
      darkLabel(ctx, 'THE ANSWER IS...'.slice(0, tt.n), AX, AY, lw, 28, 11)
    }

    // Private companies that have / everything to gain from a...
    setFont(ctx, 27.5, 400, FONT.sans, -0.015)
    const l1a = 'Private companies'
    const l1 = 'Private companies that have'
    const l2 = 'everything to gain from a...'
    const hiW = ctx.measureText(l1a).width
    const t1 = typed(l1, t, 59.08, 44)
    if (t >= 59.0) {
      // 青色高亮随打字向右延伸
      const typedW = ctx.measureText(l1.slice(0, t1.n)).width
      const hw = Math.min(hiW + 2, Math.max(8, typedW)) * span(t, 59.0, 59.08, (x) => x) + 0
      ctx.fillStyle = WD1.cyan
      ctx.fillRect(AX, 170, hw, 27)
    }
    drawTyped(ctx, l1, AX + 1, 192, t, 59.08, 44, '#111')
    drawTyped(ctx, l2, AX + 1, 224, t, 59.72, 27, '#111')

    // 引线：标签右下 → ctOS 字标
    const lp = span(t, 60.78, 61.0, ease.outCubic)
    ctx.strokeStyle = '#444'
    ctx.lineWidth = 0.8
    if (lp > 0) {
      ctx.beginPath()
      ctx.moveTo(654, 268)
      ctx.lineTo(654 + (722 - 654) * lp, 268 + (436 - 268) * lp)
      ctx.stroke()
    }

    // ctOS 字标：黑底块逐字弹出（C T 小型大写，O S 大写，O/S 底块更高）
    const letters: { ch: string; x: number; w: number; top: number; size: number; t0: number }[] = [
      { ch: 'C', x: 722, w: 82, top: 436, size: 118, t0: 60.95 },
      { ch: 'T', x: 804, w: 78, top: 436, size: 118, t0: 61.02 },
      { ch: 'O', x: 882, w: 128, top: 396, size: 168, t0: 61.08 },
      { ch: 'S', x: 1010, w: 108, top: 396, size: 168, t0: 61.3 },
    ]
    for (const L of letters) {
      if (t < L.t0) continue
      ctx.fillStyle = '#1b1f1f'
      ctx.fillRect(L.x, L.top, L.w + 0.5, 558 - L.top)
      setFont(ctx, L.size, 500, FONT.sans, 0)
      ctx.fillStyle = '#fff'
      ctx.fillText(L.ch, L.x + 6, 542)
    }

    // 小方块 + 斜线（指向塔楼的注释）
    if (t >= 61.05) {
      const q = span(t, 61.05, 61.3, ease.outCubic)
      ctx.fillStyle = '#1f2e2e'
      ctx.beginPath()
      ctx.moveTo(390, 516)
      ctx.lineTo(412, 516)
      ctx.lineTo(412, 538)
      ctx.lineTo(390, 538)
      ctx.closePath()
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(412, 516)
      ctx.lineTo(412 + (722 - 412) * q, 516 - 40 * q)
      ctx.stroke()
    }

    // 塔身青色半透明块
    if (t >= 60.9) {
      const q = span(t, 60.9, 61.1, ease.outCubic)
      ctx.fillStyle = 'rgba(40,235,225,0.75)'
      ctx.globalCompositeOperation = 'multiply'
      ctx.fillRect(228, 550, 122 * q, 62)
      ctx.globalCompositeOperation = 'source-over'
      ctx.fillStyle = 'rgba(79,245,227,0.9)'
      ctx.fillRect(228, 550, 12 * q, 62)
    }

    // 引语（等宽小字，逐行打出，第一行 61.8 起青色高亮）
    ctx.font = `400 8.6px ${FONT.mono}`
    ctx.letterSpacing = '1.3px'
    QUOTE.forEach((q, i) => {
      const t0 = 60.92 + i * 0.16
      const n = typed(q, t, t0, 75).n
      if (n <= 0) return
      if (i === 0 && t > 61.7) {
        ctx.fillStyle = WD1.cyan
        ctx.fillRect(376, 582 + i * 13, ctx.measureText(q.slice(0, 22)).width * span(t, 61.7, 62.0), 11)
      }
      ctx.fillStyle = '#333'
      ctx.fillText(q.slice(0, n), 378, 590 + i * 13)
    })
    ctx.letterSpacing = '0px'
    ctx.restore()

    // 页面下方的黑底：顶部一道灰绿色柔光（原片是页面边缘的反光）
    if (pageBottom < 720) {
      const g = ctx.createLinearGradient(0, pageBottom, 0, pageBottom + 60)
      g.addColorStop(0, 'rgba(40,52,52,1)')
      g.addColorStop(1, 'rgba(0,0,0,1)')
      ctx.fillStyle = g
      ctx.fillRect(0, pageBottom, 1280, 60)
      ctx.fillStyle = '#000'
      ctx.fillRect(0, pageBottom + 60, 1280, 720)
    }
  },
}
