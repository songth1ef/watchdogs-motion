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

/**
 * 剪影路径。V2：按真实雕像比例重画（宽袍、右臂高举到画面顶端、左臂抱法典、两级底座），
 * 多边形写在「72.9s 画面坐标」里（皇冠中心 (213,180)），再平移到模型坐标（皇冠中心 (240,170)）。
 * 仍是手写近似（ASSET），原片是低多边形金属雕像渲染。
 */
function statuePath(ctx: CanvasRenderingContext2D) {
  ctx.beginPath()
  const P = (pts: [number, number][]) => poly(ctx, pts.map(([x, y]) => [x + 27, y - 10] as [number, number]))
  // 底座
  P([[55, 668], [305, 668], [305, 740], [55, 740]])
  P([[80, 648], [292, 648], [292, 670], [80, 670]])
  // 长袍（左缘外摆、右缘收）
  P([
    [122, 196], [150, 182], [185, 205], [250, 212], [262, 250], [258, 330], [256, 420], [266, 520], [278, 600], [290, 652],
    [88, 652], [96, 600], [110, 520], [122, 420], [128, 330], [116, 260],
  ])
  // 高举的右臂 + 手
  P([[132, 196], [140, 58], [150, 40], [182, 40], [184, 60], [180, 170], [172, 205]])
  // 火炬（杆 + 托盘 + 火焰）
  P([[156, 42], [174, 42], [178, 12], [152, 12]])
  P([[138, 14], [190, 14], [184, 4], [144, 4]])
  P([[150, 4], [178, 4], [170, -26], [160, -30]])
  // 头
  const head: [number, number][] = []
  for (let k = 0; k < 20; k++) head.push([213 + Math.cos((k / 20) * Math.PI * 2) * 24, 192 + Math.sin((k / 20) * Math.PI * 2) * 27])
  P(head)
  // 冠冕尖刺（七道，朝左上到右侧扇形展开）
  const tips: [number, number][] = [[182, 128], [198, 112], [222, 106], [246, 116], [266, 130], [284, 150], [288, 172]]
  for (const [tx, ty] of tips) {
    const a = Math.atan2(ty - 176, tx - 213)
    const nx = -Math.sin(a) * 4
    const ny = Math.cos(a) * 4
    const bx = 213 + Math.cos(a) * 20
    const by = 176 + Math.sin(a) * 16
    P([[bx + nx, by + ny], [tx, ty], [bx - nx, by - ny]])
  }
  // 法典（左臂抱着，斜放）
  P([[252, 276], [330, 286], [322, 334], [248, 322]])
}

const FACETS = (() => {
  const R = rng(7272)
  const out: [number, number, number, number, number, number, number][] = []
  for (let i = 0; i < 420; i++) {
    const x = R.range(100, 370)
    const y = R.range(-40, 740)
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
  const g = ctx.createLinearGradient(110, 0, 360, 0)
  // V2：原片是深色金属 + 亮面高光，整体比 V1 暗
  g.addColorStop(0, '#222')
  g.addColorStop(0.45, '#7a7a7a')
  g.addColorStop(0.7, '#474747')
  g.addColorStop(1, '#181818')
  ctx.fillStyle = g
  ctx.fillRect(60, -60, 340, 820)
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

/** V2：影子在 75.0 后放大得比 V1 快得多（76.0 起几乎铺满画面），整体也更靠右 */
function shadowCam(t: number) {
  return {
    s: track(t, [
      [72.4, 2.1],
      [72.8, 2.2],
      [74.2, 2.6],
      [75.0, 2.8],
      [75.5, 3.2],
      [76.0, 4.2],
      [76.5, 5.5],
      [77.1, 7.0],
    ]),
    cx: track(t, [
      [72.4, 500],
      [72.8, 480],
      [74.2, 470],
      [75.0, 500],
      [75.5, 480],
      [76.0, 520],
      [76.5, 800],
      [77.1, 1000],
    ]),
    cy: track(t, [
      [72.4, 150],
      [72.8, 140],
      [74.2, 60],
      [75.0, -10],
      [75.5, -60],
      [76.0, -160],
      [76.5, -300],
      [77.1, -480],
    ]),
  }
}

/**
 * 斜纹填充：在当前 clip 内铺细斜线。V2：按原片逐像素量出的参数——方向「\」（每下移 1px 右移 0.9px），
 * 影子横向间距 12.93px、相位 x≡11.3（屏幕空间固定，不随镜头缩放），线宽约 1.2px、亮度约 130。
 * V1 是「/」方向、间距 6.5，方向反了、密度翻倍。
 */
function hatch(ctx: CanvasRenderingContext2D, gap = 12.93, color = 'rgba(235,235,235,0.55)', lw = 1.25) {
  ctx.strokeStyle = color
  ctx.lineWidth = lw
  ctx.beginPath()
  for (let x = 11.3 - gap * Math.ceil(720 / gap); x < 1300; x += gap) {
    ctx.moveTo(x - 0.9 * 20, -20)
    ctx.lineTo(x + 0.9 * 740, 740)
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
      hatch(l, 12.93 / 2, 'rgba(235,235,235,1)', 2.6)
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

    // 深色数字 2 / .3Gb（在影子上挖出黑字）。V2：画在 Digital Shadow 之上（原片 77.0 巨大的「3」盖住了 "Digita"）
    if (t > 74.3) {
      const s2 = track(t, [
        [74.3, 190],
        [74.6, 210],
        [75.4, 280],
        [76.0, 375],
        [76.4, 440],
        [77.08, 1000],
      ])
      const x2 = track(t, [
        [74.3, 486],
        [74.6, 480],
        [75.4, 410],
        [76.0, 330],
        [76.4, 300],
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
      // V2：原片 73.5 时 "the" 已擦空、另两行仍完整；74.0 三行文字全空只剩白条
      const er = i === 1 ? span(t, 73.3, 73.45) : i === 0 ? span(t, 73.55, 73.75) : span(t, 73.6, 73.9)
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
