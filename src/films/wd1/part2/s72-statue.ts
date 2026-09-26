/**
 * 71.9–77.1  自由女神：远景小像（带水面倒影）急推到近景，左侧 "last year / the / average American" 白底黑字逐行打出；
 * 右后方出现斜纹「数字影子」大剪影；文字擦除、白条右滑出画；斜纹字 "Digital Shadow" 从左显出；
 * 深色大数字 "2" + ".3Gb" 在影子里逐步放大（2.3Gb），镜头向左平移，自由女神移出左侧。
 * ASSET：statuePath()/drawStatue() 是手写多边形剪影 + 随机面片明暗的低多边形近似，换成真实模型渲染图替换 drawStatue 即可；
 *        影子复用同一剪影（放大 + 斜纹填充）。
 */
import type { Scene } from '../../../engine/types'
import { rng } from '../../../engine/math'
import { offscreen } from '../../../fx/canvas'
import { FONT, U, ease, eraseHead, ref, setFont, span, track, typed } from './common'

/** 加一个多边形子路径，统一成屏幕顺时针（非零环绕规则下各部件才能正确并集，不会互相挖洞） */
function poly(ctx: CanvasRenderingContext2D, pts: [number, number][]) {
  let area = 0
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i]
    const [x2, y2] = pts[(i + 1) % pts.length]
    area += x1 * y2 - x2 * y1
  }
  const list = area < 0 ? [...pts].reverse() : pts
  list.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
  ctx.closePath()
}

/** 剪影路径（坐标 = 72.8s 画面里的像素，皇冠中心约在 (240,170)） */
function statuePath(ctx: CanvasRenderingContext2D) {
  ctx.beginPath()
  poly(ctx, [[165, 640], [335, 640], [335, 730], [165, 730]])
  poly(ctx, [[178, 612], [322, 612], [322, 642], [178, 642]])
  // 长袍
  poly(ctx, [[208, 200], [276, 196], [292, 300], [306, 420], [316, 560], [306, 615], [186, 615], [178, 540], [190, 400], [198, 300]])
  // 举火炬的手臂
  poly(ctx, [[206, 235], [228, 208], [202, 42], [184, 46]])
  // 火炬
  poly(ctx, [[176, 44], [210, 38], [202, 14], [193, -18], [185, 16]])
  // 头
  const head: [number, number][] = []
  for (let k = 0; k < 20; k++) head.push([242 + Math.cos((k / 20) * Math.PI * 2) * 22, 174 + Math.sin((k / 20) * Math.PI * 2) * 25])
  poly(ctx, head)
  // 冠冕尖刺
  for (let i = 0; i < 7; i++) {
    const a = (-150 + i * 22) * (Math.PI / 180)
    const bx = 244 + Math.cos(a) * 18
    const by = 162 + Math.sin(a) * 12
    const nx = -Math.sin(a) * 3.5
    const ny = Math.cos(a) * 3.5
    poly(ctx, [[bx + nx, by + ny], [bx + Math.cos(a) * 46, by + Math.sin(a) * 46], [bx - nx, by - ny]])
  }
  // 法典（抱在左臂）
  poly(ctx, [[288, 300], [330, 284], [346, 346], [304, 362]])
}

const FACETS = (() => {
  const R = rng(7272)
  const out: [number, number, number, number, number, number, number][] = []
  for (let i = 0; i < 260; i++) {
    const x = R.range(130, 350)
    const y = R.range(-20, 720)
    const s = R.range(10, 40)
    out.push([x, y, x + R.range(-s, s), y + R.range(0, s * 1.6), x + R.range(-s, s), y + R.range(-s * 0.4, s), R.range(-1, 1)])
  }
  return out
})()

/** ASSET：低多边形金属质感的自由女神 */
function drawStatue(ctx: CanvasRenderingContext2D) {
  ctx.save()
  statuePath(ctx)
  ctx.clip()
  const g = ctx.createLinearGradient(150, 0, 340, 0)
  g.addColorStop(0, '#3a3a3a')
  g.addColorStop(0.45, '#a4a4a4')
  g.addColorStop(0.7, '#6a6a6a')
  g.addColorStop(1, '#262626')
  ctx.fillStyle = g
  ctx.fillRect(120, -40, 260, 800)
  for (const [x1, y1, x2, y2, x3, y3, v] of FACETS) {
    ctx.fillStyle = v > 0 ? `rgba(255,255,255,${v * 0.35})` : `rgba(0,0,0,${-v * 0.45})`
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.lineTo(x3, y3)
    ctx.fill()
  }
  ctx.restore()
}

/** 雕像相机：模型点 (240,170) 落在屏幕 (cx,cy)，缩放 s */
function statueCam(t: number) {
  return {
    s: track(t, [
      [71.9, 0.16],
      [72.0, 0.5],
      [72.15, 0.9],
      [72.3, 1.0],
      [72.8, 1.02],
      [73.6, 1.25],
      [74.2, 1.35],
      [74.6, 1.45],
      [75.4, 1.6],
      [76.0, 1.8],
    ]),
    cx: track(t, [
      [71.9, 578],
      [72.0, 440],
      [72.15, 320],
      [72.3, 260],
      [72.8, 230],
      [73.6, 150],
      [74.2, 80],
      [74.6, 20],
      [75.4, -150],
      [76.0, -420],
    ]),
    cy: track(t, [
      [71.9, 360],
      [72.0, 262],
      [72.15, 200],
      [72.3, 180],
      [72.8, 160],
      [73.6, 130],
      [74.2, 80],
      [74.6, 40],
      [75.4, 0],
      [76.0, -60],
    ]),
  }
}

function shadowCam(t: number) {
  return {
    s: track(t, [
      [72.4, 2.1],
      [72.8, 2.2],
      [74.2, 2.6],
      [75.4, 3.0],
      [76.4, 3.4],
      [77.1, 3.8],
    ]),
    cx: track(t, [
      [72.4, 500],
      [72.8, 480],
      [74.2, 420],
      [75.4, 300],
      [76.4, 160],
      [77.1, 60],
    ]),
    cy: track(t, [
      [72.4, 150],
      [72.8, 140],
      [74.2, 60],
      [75.4, -60],
      [76.4, -160],
      [77.1, -240],
    ]),
  }
}

/** 斜纹填充：在当前 clip 内铺 45° 细线 */
function hatch(ctx: CanvasRenderingContext2D, gap = 6.5, color = 'rgba(235,235,235,0.75)', lw = 1.2) {
  ctx.strokeStyle = color
  ctx.lineWidth = lw
  ctx.beginPath()
  for (let x = -760; x < 1300; x += gap) {
    ctx.moveTo(x, 740)
    ctx.lineTo(x + 760, -20)
  }
  ctx.stroke()
}

const ROWS: { text: string; y: number; t0: number; boxT: number }[] = [
  { text: 'last year', y: 304, t0: 71.95, boxT: 71.93 },
  { text: 'the', y: 362, t0: 72.2, boxT: 72.05 },
  { text: 'average American', y: 424, t0: 72.35, boxT: 72.28 },
]

export const s72Statue: Scene = {
  id: 'wd1-072-statue-digital-shadow',
  start: 71.9,
  end: 77.45,
  note: '自由女神 + last year the average American + Digital Shadow 2.3Gb',
  render({ ctx, t }) {
    ref(ctx)
    // 斜纹影子（72.45 起自上而下显出）
    if (t > 72.45) {
      const sc = shadowCam(t)
      const reveal = span(t, 72.45, 72.9, ease.outCubic)
      ctx.save()
      ctx.beginPath()
      ctx.rect(0, 0, 1280, 720 * reveal)
      ctx.clip()
      ctx.translate(sc.cx, sc.cy)
      ctx.scale(sc.s, sc.s)
      ctx.translate(-240, -170)
      statuePath(ctx)
      ctx.restore()
      ctx.save()
      ctx.beginPath()
      ctx.rect(0, 0, 1280, 720 * reveal)
      ctx.clip()
      ctx.translate(sc.cx, sc.cy)
      ctx.scale(sc.s, sc.s)
      ctx.translate(-240, -170)
      statuePath(ctx)
      ctx.clip()
      ctx.setTransform(U, 0, 0, U, 0, 0)
      hatch(ctx)
      ctx.restore()
    }

    // 雕像（71.9–72.3 带水面倒影）
    const c = statueCam(t)
    if (c.cx > -600) {
      ctx.save()
      ctx.translate(c.cx, c.cy)
      ctx.scale(c.s, c.s)
      ctx.translate(-240, -170)
      drawStatue(ctx)
      const refl = 1 - span(t, 72.05, 72.35)
      if (refl > 0) {
        ctx.save()
        ctx.globalAlpha = 0.35 * refl
        ctx.translate(0, 1460)
        ctx.scale(1, -1)
        drawStatue(ctx)
        ctx.restore()
      }
      ctx.restore()
    }

    // 深色数字 2 / .3Gb（在影子上挖出黑字）
    if (t > 74.3) {
      const s2 = track(t, [
        [74.3, 190],
        [74.6, 210],
        [75.4, 280],
        [76.4, 330],
        [77.08, 1000],
      ])
      const x2 = track(t, [
        [74.3, 486],
        [74.6, 480],
        [75.4, 410],
        [76.4, 290],
        [77.08, -420],
      ])
      const y2 = track(t, [
        [74.3, 408],
        [74.6, 410],
        [75.4, 430],
        [76.4, 450],
        [77.08, 700],
      ])
      ctx.save()
      ctx.globalAlpha = span(t, 74.3, 74.5)
      ctx.fillStyle = '#0c0c0c'
      setFont(ctx, s2, 500, FONT.sans, -0.03)
      ctx.fillText('2', x2, y2)
      const w2 = ctx.measureText('2').width
      const gb = '.3Gb'
      const n = typed(gb, t, 74.95, 3.5).n
      if (n > 0) {
        const sg = track(t, [
          [74.95, 45],
          [75.4, 60],
          [76.0, 110],
          [76.4, 180],
          [76.8, 330],
          [77.08, 520],
        ])
        const xg = track(t, [
          [75.4, 550],
          [76.0, 560],
          [76.4, 540],
          [76.8, 420],
          [77.08, 300],
        ])
        const yg = track(t, [
          [75.4, 430],
          [76.0, 450],
          [76.4, 480],
          [76.8, 640],
          [77.08, 700],
        ])
        setFont(ctx, sg, 500, FONT.sans, -0.03)
        ctx.fillText(gb.slice(0, n), Math.max(xg, x2 + w2 * 0.95), yg)
      }
      ctx.restore()
    }

    // 斜纹字 "Digital Shadow"（73.5 起从左显出）
    if (t > 73.45) {
      const o = offscreen('wd1p2-hatch-text', 1920, 1080)
      const l = o.ctx
      l.setTransform(1, 0, 0, 1, 0, 0)
      l.clearRect(0, 0, 1920, 1080)
      l.setTransform(U, 0, 0, U, 0, 0)
      setFont(l, 106, 500, FONT.sans, -0.03)
      l.fillStyle = '#fff'
      l.fillText('Digital Shadow', 410, 560)
      l.globalCompositeOperation = 'source-in'
      l.fillStyle = '#000'
      l.fillRect(0, 0, 1280, 720)
      hatch(l, 3.2, 'rgba(235,235,235,1)', 1.3)
      l.globalCompositeOperation = 'source-over'
      const rv = span(t, 73.45, 74.25)
      ctx.save()
      ctx.beginPath()
      ctx.rect(0, 0, 410 + 730 * rv, 720)
      ctx.clip()
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.drawImage(o.canvas, 0, 0)
      ctx.restore()
    }

    // 77.2 起整体压暗淡出（REPRESENT 镜头已在上层开始）
    const out = span(t, 77.02, 77.32)
    if (out > 0) {
      ctx.fillStyle = `rgba(0,0,0,${out})`
      ctx.fillRect(0, 0, 1280, 720)
    }

    // 白底黑字：打字 → 擦除 → 白条右滑出画
    const bc = statueCam(Math.min(t, 72.3))
    const bs = bc.s
    const bx = (224 - 240) * bs + bc.cx
    ROWS.forEach((r, i) => {
      if (t < r.boxT) return
      const by = (r.y - 180) * bs + bc.cy
      setFont(ctx, 46 * bs, 700, FONT.sans, -0.045)
      const full = ctx.measureText(r.text).width
      const boxW = (i === 2 ? 446 : full + 12 * bs) * span(t, r.boxT, r.boxT + 0.08)
      const slide = span(t, 73.55 + i * 0.08, 74.05 + i * 0.08, ease.inCubic) * 1100
      const bw = i === 1 && t > 73.55 ? 106 : boxW
      const x0 = bx + slide + (i === 1 ? span(t, 73.5, 73.65) * 280 : 0)
      ctx.fillStyle = '#fff'
      ctx.fillRect(x0, by, bw, 50 * bs)
      // 擦除：头部字符逐个消失（行 1、2 先，行 3 随右滑）
      const er = i < 2 ? span(t, 73.4 + i * 0.05, 73.6 + i * 0.05) : span(t, 73.6, 74.1)
      const txt = eraseHead(r.text.slice(0, typed(r.text, t, r.t0, 26).n), er)
      ctx.save()
      ctx.beginPath()
      ctx.rect(x0, by, bw, 50 * bs)
      ctx.clip()
      ctx.fillStyle = '#000'
      ctx.fillText(txt, x0 + 1 * bs, by + 40 * bs)
      ctx.restore()
    })
  },
}
