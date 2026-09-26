import type { Scene } from '../../../engine/types'
import { clamp, ease, hash, seg } from '../../../engine/math'
import { WD1 } from '../../../theme'
import { FONT, font, measure, tracking } from '../../../fx/text'
import { dossierText } from './s07-raymond'
import { bitmap57, spline, typeBox, typed } from './util'

/**
 * 26.6–30.6  USB 图标 + 点阵「VIRUS」+「...and walked away」+ 四个白色饼图 + 数据小字列，29s 起整体缩小。
 * 29.9–33.35 「OVERLOADED」迷你文字块拼成的点阵大字 + 档案网 +「the grid shutdown」，最后缩成一点。
 * 世界坐标以 28.4s（VIRUS）/ 31.8s（OVERLOADED）画面为基准。
 */

/** 黄绿网：若干长线 + 环形节点 + 档案小字 */
function limeNet(ctx: CanvasRenderingContext2D, t: number, t0: number, seed: number, box: { x: number; y: number; w: number; h: number }, n: number) {
  for (let i = 0; i < n; i++) {
    const q = seg(t, t0 + hash(seed + i * 7) * 1.2, t0 + hash(seed + i * 7) * 1.2 + 0.4)
    if (q <= 0) continue
    const x1 = box.x + hash(seed + i * 7 + 1) * box.w
    const y1 = box.y + hash(seed + i * 7 + 2) * box.h
    const x2 = box.x + hash(seed + i * 7 + 3) * box.w * 1.6 - box.w * 0.3
    const y2 = box.y + hash(seed + i * 7 + 4) * box.h * 1.6 - box.h * 0.3
    ctx.strokeStyle = hash(seed + i * 7 + 5) > 0.35 ? 'rgba(214,240,60,0.45)' : 'rgba(220,220,220,0.4)'
    ctx.lineWidth = 1.3
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x1 + (x2 - x1) * q, y1 + (y2 - y1) * q)
    ctx.stroke()
    if (i % 2 === 0) {
      ctx.strokeStyle = WD1.lime
      ctx.beginPath()
      ctx.arc(x1, y1, 4, 0, Math.PI * 2)
      ctx.stroke()
      const lines = i % 4 === 0 ? ['PSYCHIATRIC ASSESSMENT', 'WISC TEST RESULTS 05.04.04', 'DEMENTIA STAGE 3'] : ['HOMELAND OFFICE - DALLAS', 'FILE NO. : 01A-220B-488YZ']
      font(ctx, 13, 500, FONT.sans)
      ctx.fillStyle = WD1.lime
      ctx.globalAlpha = q
      lines.forEach((l, k) => ctx.fillText(l, x1 + 10, y1 + 6 + k * 14))
      ctx.globalAlpha = 1
    }
  }
}

/** 竖向「迷你数据列」：一列很小的灰色字行 */
function dataColumn(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, seed: number, a: number) {
  ctx.fillStyle = `rgba(200,200,200,${0.7 * a})`
  for (let yy = 0; yy < h; yy += 5) {
    const w = 8 + hash(seed * 131 + yy) * 18
    ctx.fillRect(x, y + yy, w, 1.6)
  }
}

/** 饼图：白色圆盘缺一个扇形；grow 0..1 为扫出进度 */
function pie(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, grow: number, gapStart: number, gap: number) {
  if (grow <= 0) return
  const a0 = gapStart + gap
  const a1 = a0 + (Math.PI * 2 - gap) * ease.outCubic(grow)
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.arc(x, y, r, a0, a1)
  ctx.closePath()
  ctx.fill()
}

export const virus: Scene = {
  id: 'wd1-027-virus',
  start: 26.6,
  end: 30.6,
  note: 'USB 图标从 Raymond 的横线延伸出来，点阵 VIRUS 逐格出现，「...and walked away」打字后擦除，四个饼图扫出，29s 起整体缩小淡出',
  render({ ctx, t }) {
    const dx = spline(t, [[26.6, 1000], [26.7, 720], [26.9, 326], [27.4, 9], [28.4, 0]])
    const s = spline(t, [[28.9, 1], [29.3, 0.97], [29.8, 0.84], [30.3, 0.62], [30.6, 0.52]])
    const fade = 1 - seg(t, 30.15, 30.55)
    ctx.save()
    ctx.globalAlpha = fade
    ctx.translate(705, 385)
    ctx.scale(s, s)
    ctx.translate(-705 + dx, -385)

    // 背景 × 网格 + 大 ×
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'
    ctx.lineWidth = 1.2
    ctx.beginPath()
    for (let y = 170; y < 1300; y += 240)
      for (let x = -300; x < 2400; x += 240) {
        ctx.moveTo(x - 4, y - 4)
        ctx.lineTo(x + 4, y + 4)
        ctx.moveTo(x + 4, y - 4)
        ctx.lineTo(x - 4, y + 4)
      }
    ctx.stroke()
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'
    ctx.beginPath()
    for (const [x, y] of [[276, 672], [1188, 672], [2100, 672]]) {
      ctx.moveTo(x - 14, y - 14)
      ctx.lineTo(x + 14, y + 14)
      ctx.moveTo(x + 14, y - 14)
      ctx.lineTo(x - 14, y + 14)
    }
    ctx.stroke()

    limeNet(ctx, t, 27.6, 90, { x: 0, y: 150, w: 1900, h: 900 }, 12)

    // USB 图标
    const tip = spline(t, [[26.6, 60], [26.7, 79], [26.9, 269], [27.4, 377], [28.4, 408]])
    const Y = 403
    const cx = 197
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(-2000, Y)
    ctx.lineTo(cx - 41, Y)
    ctx.moveTo(cx + 41, Y)
    ctx.lineTo(cx + tip - 45, Y)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(cx, Y, 41, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(cx + tip - 45, Y - 24)
    ctx.lineTo(cx + tip, Y)
    ctx.lineTo(cx + tip - 45, Y + 24)
    ctx.closePath()
    ctx.stroke()
    const br = ease.outCubic(seg(t, 26.95, 27.5))
    if (br > 0) {
      const sc = 0.4 + 0.6 * ease.outCubic(seg(t, 27.0, 28.0))
      ctx.beginPath()
      // 上支：斜上到小圆
      ctx.moveTo(cx + 60, Y)
      ctx.lineTo(cx + 60 + 70 * br, Y - 60 * br)
      ctx.lineTo(cx + 130 + 80 * br, Y - 60 * br - 17 * br)
      ctx.moveTo(cx + 90, Y)
      ctx.lineTo(cx + 90 + 70 * br, Y + 60 * br)
      ctx.lineTo(cx + 160 + 90 * br, Y + 60 * br + 12 * br)
      ctx.stroke()
      const ux = cx + 130 + 80 * br + 26 * sc
      ctx.beginPath()
      ctx.arc(ux, Y - 77 * br, 26 * sc, 0, Math.PI * 2)
      ctx.stroke()
      const sq = 53 * sc
      ctx.strokeRect(cx + 160 + 90 * br, Y + 72 * br - sq / 2, sq, sq)
    }
    // 小圆点、小竖条（26.9 帧里的装饰）
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(cx + 400, Y - 75, 5, 0, Math.PI * 2)
    ctx.stroke()
    if (t < 27.3) ctx.strokeRect(cx + 437, Y + 45, 8, 38)

    // 点阵 VIRUS：每格两条竖短划，斜体
    const R = bitmap57('VIRUS')
    const cw = 732 / R.w
    const ch = 204 / R.h
    ctx.save()
    ctx.translate(636, 300)
    ctx.transform(1, 0, -0.18, 1, 0, 0)
    ctx.fillStyle = 'rgba(235,235,235,0.9)'
    for (let j = 0; j < R.h; j++)
      for (let i = 0; i < R.w; i++) {
        if (!R.bits[j * R.w + i]) continue
        const tt = 26.85 + hash(i * 17 + j * 131) * 0.9
        if (t < tt) continue
        const x = i * cw + ch * 0.18 * R.h
        ctx.fillRect(x + cw * 0.22, j * ch + ch * 0.2, 4, ch * 0.55)
        ctx.fillRect(x + cw * 0.58, j * ch + ch * 0.2, 4, ch * 0.55)
      }
    ctx.restore()

    // ...and walked away
    if (t >= 27.5 && t < 28.95) {
      const er = seg(t, 28.45, 28.8)
      const nA = typed(t, 27.5, 30, 6)
      font(ctx, 38, 400, FONT.plex)
      tracking(ctx, 1)
      ctx.fillStyle = `rgba(160,160,160,${1 - clamp(er * 3)})`
      ctx.fillText('...and'.slice(0, nA), 1080, 460)
      tracking(ctx, 0)
      const nW = typed(t, 27.72, 26, 11)
      if (nW > 0 || t > 27.6) {
        typeBox(ctx, { text: 'walked away', n: nW, x: 1272, y: 460, size: 38, family: FONT.plex, weight: 400, track: 1, padX: 10, padTop: 9, padBottom: 12, boxMode: 'text', cursor: nW < 11, eraseL: clamp(er * 1.15) })
      }
      if (er >= 0.99 && t < 28.95) {
        ctx.fillStyle = '#fff'
        ctx.fillRect(1560, 420, 26, 40)
      }
    }

    // 饼图
    const pies: [number, number, number, number][] = [
      [708, 643, 28.75, 0.2],
      [708, 888, 28.95, 4.0],
      [936, 643, 29.05, 5.2],
      [936, 888, 29.35, 2.4],
    ]
    const gone = seg(t, 30.1, 30.35)
    pies.forEach(([x, y, t0, g0], i) => {
      const grow = seg(t, t0, t0 + 0.35)
      const gap = 0.5 + 0.6 * (0.5 + 0.5 * Math.sin(t * 2.2 + i * 1.7))
      if (gone < 1) pie(ctx, x, y, 100, grow * (1 - gone), g0 + t * 0.8, gap)
    })
    // 数据小字列
    const colA = seg(t, 29.0, 29.3)
    if (colA > 0) {
      for (let k = 0; k < 7; k++) dataColumn(ctx, 1130 + k * 34 + (k > 3 ? 90 : 0), 590 + hash(k) * 60, 200 + hash(k + 9) * 140, k, colA)
      for (let k = 0; k < 5; k++) dataColumn(ctx, 500 + k * 30, 600 + hash(k + 3) * 80, 100 + hash(k + 5) * 80, k + 20, colA)
      for (let k = 0; k < 4; k++) dataColumn(ctx, 1900 + k * 30, 560, 280, k + 40, colA)
    }
    ctx.restore()
    void measure
  },
}

export const overloaded: Scene = {
  id: 'wd1-030-overloaded',
  start: 29.9,
  end: 33.35,
  note: '迷你文字块拼成的点阵「OVERLOADED」+ 档案网，31.45s「the grid shutdown」白底打字，32.6s 起整体缩成一点',
  render({ ctx, t }) {
    const s = spline(t, [[29.9, 1.5], [30.3, 1.34], [30.8, 1.3], [31.3, 1.1], [31.8, 1.0], [32.4, 0.945], [32.9, 0.63], [33.1, 0.2], [33.25, 0.01]])
    const cy = spline(t, [[29.9, 720], [30.3, 666], [30.8, 585], [31.3, 546], [31.8, 543]])
    if (s < 0.02) {
      // 缩没后的一道横向闪光
      const a = 1 - seg(t, 33.25, 33.35)
      ctx.fillStyle = `rgba(255,255,255,${0.8 * a})`
      ctx.fillRect(900, 539, 120, 2)
      return
    }
    const a = seg(t, 29.9, 30.25)
    ctx.save()
    ctx.globalAlpha = a
    ctx.translate(960, cy)
    ctx.scale(s, s)
    ctx.translate(-960, -546)

    // 迷你文字块点阵
    const R = bitmap57('OVERLOADED')
    const cw = 1296 / R.w
    const ch = 180 / R.h
    ctx.fillStyle = 'rgba(175,175,175,0.9)'
    for (let j = 0; j < R.h; j++)
      for (let i = 0; i < R.w; i++) {
        if (!R.bits[j * R.w + i]) continue
        if (t < 29.9 + hash(i * 7 + j * 53) * 0.4) continue
        const x = 312 + i * cw
        const y = 456 + j * ch
        for (let k = 0; k < ch - 2; k += 4) ctx.fillRect(x, y + k, cw * (0.35 + 0.55 * hash(i * 97 + j * 31 + k)), 1.5)
      }

    // 档案网（聚向一点的白线 + 黄绿小字）
    const focus: [number, number] = [1100, 610]
    ctx.lineWidth = 1.3
    for (let i = 0; i < 16; i++) {
      const x = 450 + hash(i * 3 + 400) * 1000
      const y = 330 + hash(i * 3 + 401) * 420
      ctx.strokeStyle = i % 3 ? 'rgba(214,240,60,0.4)' : 'rgba(255,255,255,0.45)'
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(focus[0], focus[1])
      ctx.stroke()
      if (i % 2 === 0) dossierText(ctx, x, y, i % 4 ? ['HOMELAND OFFICE - DALLAS', 'FILE NO. : 01A-220B-488YZ'] : ['PSYCHIATRIC ASSESSMENT', 'WISC TEST RESULTS 05.04.04', 'DEMENTIA STAGE 3'], a * 0.75, 10)
    }

    // the grid shutdown
    if (t >= 31.35) {
      const n = typed(t, 31.4, 26, 17)
      typeBox(ctx, { text: 'the grid shutdown', n, x: 852, y: 568, size: 84, weight: 500, track: -3.5, padX: 6, padTop: 10, padBottom: 20, boxMode: 'text', cursor: n < 17 })
    }
    ctx.restore()
  },
}
