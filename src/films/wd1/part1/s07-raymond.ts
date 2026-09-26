import type { Scene } from '../../../engine/types'
import { clamp, ease, hash, seg } from '../../../engine/math'
import { WD1 } from '../../../theme'
import { FONT, font, measure, tracking } from '../../../fx/text'
import { hatchRect } from '../../../fx/image'
import { spline, typed } from './util'

/**
 * 24.35–26.95  「Raymond / Kenney」斜纹白底大字 +「DISGRUNTLED EMPLOYEE」+ 头像/X 光全身照 + 黄绿档案小字网络，
 * 26s 起整层加速向左平移出画。坐标以 25.8s 画面为基准。
 * ASSET：两张照片是程序化剪影，换真实素材时替换 drawFace()/drawBody()。
 */

/** 档案小字（黄绿色）：节点位置 + 多行文字（25.8s 画面坐标 ×1.5） */
export const DOSSIER: [number, number, string[]][] = [
  [960, 634, ['HOMELAND OFFICE - DALLAS', 'FILE NO. : 01A-220B-488YZ']],
  [1135, 634, ['PSYCHIATRIC ASSESSMENT', 'WISC TEST RESULTS 05.04.04', 'DEMENTIA STAGE 3']],
  [1310, 634, ['THIS INFORMATION HAS BEEN REDACTED']],
  [1083, 987, ['THIS INFORMATION HAS BEEN REDACTED', 'FILE NO. : 01A-220B-488YZ']],
  [1785, 1010, ['THIS INFORMATION HAS BEEN REDACTED', 'FILE NO. : 01A-220B-488YZ']],
  [1822, 477, ['PSYCHIATRIC ASSESSMENT', 'WISC TEST RESULTS 05.04.04', 'DEMENTIA STAGE 3']],
  [-60, 200, ['HOMELAND OFFICE - DALLAS', 'FILE NO. : 01A-220B-488YZ']],
  [2300, 870, ['HOMELAND OFFICE - DALLAS', 'FILE NO. : 01A-220B-488YZ']],
]

export function dossierText(ctx: CanvasRenderingContext2D, x: number, y: number, lines: string[], a = 1, size = 13) {
  ctx.fillStyle = WD1.lime
  ctx.globalAlpha = a
  ctx.fillRect(x - 4, y - 4, 8, 8)
  font(ctx, size, 500, FONT.sans)
  lines.forEach((l, i) => ctx.fillText(l, x + 15, y + 14 + i * size * 1.1))
  ctx.globalAlpha = 1
}

/** 黄绿细线网：节点之间的长连线 */
function netLines(ctx: CanvasRenderingContext2D) {
  const pts: [number, number][] = DOSSIER.map(([x, y]) => [x, y])
  pts.push([-300, 700], [2400, 300], [600, 1200], [300, -100], [1500, -100], [2200, 1150], [-200, 1000])
  ctx.lineWidth = 1.2
  for (let i = 0; i < pts.length; i++)
    for (let j = i + 1; j < pts.length; j++) {
      if (hash(i * 31 + j) > 0.42) continue
      ctx.strokeStyle = hash(i * 7 + j) > 0.5 ? 'rgba(214,240,60,0.28)' : 'rgba(200,200,200,0.16)'
      ctx.beginPath()
      ctx.moveTo(pts[i][0], pts[i][1])
      ctx.lineTo(pts[j][0], pts[j][1])
      ctx.stroke()
    }
}

/** ASSET：头像（高反差黑白：白底、黑发、墨镜） */
function drawFace(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.save()
  ctx.fillStyle = '#f2f2f2'
  ctx.fillRect(x, y, w, h)
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.clip()
  // 头发：一团卷发（很多小黑圆）
  ctx.fillStyle = '#111'
  for (let i = 0; i < 120; i++) {
    const a = hash(i * 3 + 1) * Math.PI * 2
    const rr = Math.sqrt(hash(i * 3 + 2))
    ctx.beginPath()
    ctx.arc(x + w * (0.5 + Math.cos(a) * rr * 0.42), y + h * (0.42 + Math.sin(a) * rr * 0.4), w * (0.04 + 0.06 * hash(i * 3 + 3)), 0, Math.PI * 2)
    ctx.fill()
  }
  // 脸
  const g = ctx.createRadialGradient(x + w * 0.52, y + h * 0.55, 2, x + w * 0.5, y + h * 0.6, w * 0.3)
  g.addColorStop(0, '#9a9a9a')
  g.addColorStop(1, '#2a2a2a')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.ellipse(x + w * 0.5, y + h * 0.62, w * 0.25, h * 0.36, 0, 0, Math.PI * 2)
  ctx.fill()
  // 墨镜
  ctx.fillStyle = '#050505'
  ctx.fillRect(x + w * 0.27, y + h * 0.5, w * 0.46, h * 0.09)
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.fillRect(x + w * 0.3, y + h * 0.5, w * 0.4, 2)
  ctx.restore()
}

/** ASSET：X 光全身照（浅灰底 + 深色人形 + 骨架高光） */
function drawBody(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.save()
  const bg = ctx.createLinearGradient(x, y, x + w, y + h)
  bg.addColorStop(0, '#e6e6e6')
  bg.addColorStop(1, '#cfcfcf')
  ctx.fillStyle = bg
  ctx.fillRect(x, y, w, h)
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.clip()
  ctx.filter = 'blur(3px)'
  ctx.fillStyle = 'rgba(40,40,40,0.85)'
  const cx = x + w * 0.5
  const u = h / 100
  ctx.beginPath()
  ctx.ellipse(cx, y + 10 * u, 5 * u, 6 * u, 0, 0, Math.PI * 2) // 头
  ctx.fill()
  ctx.fillRect(cx - 11 * u, y + 17 * u, 22 * u, 34 * u) // 躯干
  ctx.fillRect(cx - 16 * u, y + 19 * u, 5 * u, 30 * u) // 左臂
  ctx.fillRect(cx + 11 * u, y + 19 * u, 5 * u, 22 * u) // 右臂
  ctx.fillRect(cx - 10 * u, y + 50 * u, 8 * u, 46 * u) // 腿
  ctx.fillRect(cx + 2 * u, y + 50 * u, 8 * u, 46 * u)
  ctx.filter = 'none'
  // 骨架高光
  ctx.strokeStyle = 'rgba(210,210,210,0.55)'
  ctx.lineWidth = 1.5
  for (let i = 0; i < 9; i++) {
    ctx.beginPath()
    ctx.moveTo(cx - 8 * u, y + (21 + i * 3) * u)
    ctx.quadraticCurveTo(cx, y + (19 + i * 3) * u, cx + 8 * u, y + (21 + i * 3) * u)
    ctx.stroke()
  }
  ctx.beginPath()
  ctx.moveTo(cx, y + 17 * u)
  ctx.lineTo(cx, y + 50 * u)
  for (const s of [-1, 1]) {
    ctx.moveTo(cx + s * 6 * u, y + 52 * u)
    ctx.lineTo(cx + s * 6 * u, y + 94 * u)
  }
  ctx.stroke()
  ctx.restore()
}

/** 斜纹白底块（hatch 在白底上画浅灰斜线） */
function hatchBox(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  if (w <= 0) return
  ctx.fillStyle = '#fff'
  ctx.fillRect(x, y, w, h)
  hatchRect(ctx, x, y, w, h, 16, 'rgba(0,0,0,0.13)', 1.2)
}

/** 大字一行：底块随字长出，最后一个字符是灰色「幽灵」 */
function bigLine(ctx: CanvasRenderingContext2D, text: string, n: number, x: number, base: number, size: number, boxTop: number, boxBot: number, fullW: number, weight: number, hatch: boolean, trackPx: number) {
  if (n <= 0) return
  font(ctx, size, weight, FONT.sans)
  tracking(ctx, trackPx)
  const shown = text.slice(0, n)
  const w = n >= text.length ? fullW : Math.min(fullW, measure(ctx, shown) + size * 0.25)
  if (hatch) hatchBox(ctx, x, boxTop, w, boxBot - boxTop)
  else {
    ctx.fillStyle = '#fff'
    ctx.fillRect(x, boxTop, w, boxBot - boxTop)
  }
  ctx.fillStyle = '#000'
  const done = n >= text.length ? shown : shown.slice(0, -1)
  ctx.fillText(done, x + 3, base)
  if (n < text.length) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)'
    ctx.fillText(shown.slice(-1), x + 3 + measure(ctx, done), base)
  }
  tracking(ctx, 0)
}

export const raymond: Scene = {
  id: 'wd1-024-raymond',
  start: 24.35,
  end: 26.95,
  note: 'Raymond / Kenney 斜纹白底大字逐字打出，DISGRUNTLED EMPLOYEE 粗体白底，头像放大、X 光全身照弹出，黄绿档案网，26s 起向左甩出',
  render({ ctx, t }) {
    const dx = spline(t, [[24.35, 130], [24.5, 124], [25.1, 38], [25.3, 21], [25.8, 0], [26.0, -20], [26.4, -281], [26.7, -1241], [26.95, -2300]])
    const dy = spline(t, [[24.35, 26], [24.5, 26], [25.1, 5], [25.8, 0]])
    const bgA = seg(t, 24.4, 24.7)
    ctx.save()
    ctx.translate(dx, dy)

    // × 网格（小）+ 几个大 ×
    ctx.strokeStyle = `rgba(255,255,255,${0.35 * bgA})`
    ctx.lineWidth = 1.2
    ctx.beginPath()
    for (let y = 70; y < 1100; y += 100)
      for (let x = -2000; x < 3200; x += 174) {
        const ox = (Math.floor(y / 100) % 2) * 87
        ctx.moveTo(x + ox - 4, y - 4)
        ctx.lineTo(x + ox + 4, y + 4)
        ctx.moveTo(x + ox + 4, y - 4)
        ctx.lineTo(x + ox - 4, y + 4)
      }
    ctx.stroke()
    ctx.strokeStyle = `rgba(255,255,255,${0.8 * bgA})`
    ctx.lineWidth = 1.6
    ctx.beginPath()
    for (const x of [15, 920, 1827, 2734, -892]) {
      ctx.moveTo(x - 16, 654)
      ctx.lineTo(x + 16, 686)
      ctx.moveTo(x + 16, 654)
      ctx.lineTo(x - 16, 686)
    }
    ctx.stroke()

    // 档案网：25.0 起
    const netA = seg(t, 24.9, 25.3)
    if (netA > 0) {
      ctx.globalAlpha = netA
      netLines(ctx)
      ctx.globalAlpha = 1
      DOSSIER.forEach(([x, y, lines], i) => {
        if (t > 25.0 + i * 0.07) dossierText(ctx, x, y, lines, netA)
      })
    }

    // 顶部细线（25.3 起向右长）
    ctx.fillStyle = 'rgba(255,255,255,0.8)'
    ctx.fillRect(315, 402, 177 + 1100 * ease.inOutCubic(seg(t, 25.35, 26.4)), 2)

    // 照片
    const faceP = seg(t, 24.95, 25.75)
    if (faceP > 0) {
      const s = 0.18 + 0.82 * ease.inOutCubic(faceP)
      const w = 185 * s
      const h = 187 * s
      drawFace(ctx, 1004 - w, 390 - h, w, h)
    }
    const bodyP = ease.outBack(seg(t, 25.5, 25.68))
    if (bodyP > 0) {
      const w = 326 * bodyP
      const h = 325 * bodyP
      drawBody(ctx, 1013, 224 + (325 - h) / 2, w, h)
    }

    // 大字
    const nR = typed(t, 24.4, 35, 7)
    const nK = typed(t, 24.62, 28, 6)
    const nD = typed(t, 24.83, 36, 20)
    bigLine(ctx, 'Raymond', nR, 315, 540, 162, 408, 580, 700, 300, true, -5)
    bigLine(ctx, 'Kenney', nK, 315, 718, 162, 578, 766, 555, 300, true, -5)
    bigLine(ctx, 'DISGRUNTLED EMPLOYEE', nD, 315, 826, 74, 770, 836, 948, 700, false, -1.5)
    ctx.restore()
    void clamp
  },
}
