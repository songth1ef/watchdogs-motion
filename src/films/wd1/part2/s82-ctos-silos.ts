/**
 * 81.6–86.4  "But a / ctOS / includes much / more"（写在文档框同一位置，文档顶线保留为上横线）
 * → 84.0 起整块作为立方体的正面向左转走，右侧面是 "Data Silos" 小卡片阵列 → 卡片各自绕轴翻转
 * → 85.9 阵列整体翻成侧面（一条竖线）再翻回，变宽成三块并排（接 s86 的飞散/像素字）。
 * 立方体用「竖条带仿射」近似透视：把面图切成 48 条竖条，每条按投影后的上下端点画。
 */
import type { Scene } from '../../../engine/types'
import { offscreen } from '../../../fx/canvas'
import { DOC } from './s77-represent'
import { FONT, ease, ref, setFont, span, track, typed } from './common'

const FW = 418
const FH = 394
const RES = 2

/** 正面：But a ctOS includes much more（面坐标 0..FW × 0..FH，原点 = 文档左上角） */
function frontFace(t: number) {
  const o = offscreen('wd1p2-cube-front', FW * RES, FH * RES)
  const g = o.ctx
  g.setTransform(1, 0, 0, 1, 0, 0)
  g.clearRect(0, 0, FW * RES, FH * RES)
  g.setTransform(RES, 0, 0, RES, 0, 0)
  g.fillStyle = '#fff'
  g.fillRect(8, 3, 394, 5) // 顶线（原文档第 0 行）
  const line = (text: string, x: number, y: number, size: number, t0: number, cps: number) => {
    setFont(g, size, 500, FONT.sans, -0.035)
    g.fillStyle = '#fff'
    g.fillText(text.slice(0, typed(text, t, t0, cps).n), x, y)
  }
  line('But a', 8, 102, 56, 81.62, 30)
  line('CT', 102, 234, 86, 81.85, 14)
  line('OS', 212, 234, 134, 81.98, 14)
  line('includes much', 8, 298, 56, 82.1, 17)
  line('more', 8, 352, 56, 82.95, 10)
  return o.canvas
}

/** 卡片：宽 w 高 h 的白色小片，绕竖轴转 a、绕横轴转 b（投影为缩放+错切） */
function card(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, a: number, b: number) {
  g.save()
  g.translate(x, y)
  g.transform(Math.cos(a), Math.sin(a) * 0.35, Math.sin(b) * 0.35, Math.cos(b), 0, 0)
  g.fillRect(-w / 2, -h / 2, w, h)
  g.restore()
}

/** 侧面：Data Silos 阵列（6 列 × 5 行卡片） */
function sideFace(t: number) {
  const o = offscreen('wd1p2-cube-side', FW * RES, FH * RES)
  const g = o.ctx
  g.setTransform(1, 0, 0, 1, 0, 0)
  g.clearRect(0, 0, FW * RES, FH * RES)
  g.setTransform(RES, 0, 0, RES, 0, 0)
  g.fillStyle = '#fff'
  const k = span(t, 84.9, 85.4, ease.inOutCubic)
  for (let r = 0; r < 5; r++)
    for (let c = 0; c < 6; c++) {
      const cx = 30 + c * 70
      const cy = 60 + r * 76
      // 转到正面之前是横条（像文档的行），之后各卡片按位置相位翻转成放射状
      const ph = (c - 2.5) * 0.45 + (r - 2) * 0.3
      const a = k * (ph + Math.sin(t * 3 + c + r) * 0.25)
      const b = k * (r - 2) * 0.25
      const w = 58 - 30 * k
      const h = 12 + 30 * k
      card(g, cx, cy, w, h, a, b)
    }
  setFont(g, 40, 500, FONT.sans, -0.03)
  g.fillText('Data Silos'.slice(0, typed('Data Silos', t, 84.75, 20).n), 8, 30)
  return o.canvas
}

/** 把面图贴到 3D 四边形上（按竖条近似透视） */
function drawFace(
  ctx: CanvasRenderingContext2D,
  img: HTMLCanvasElement,
  P: (u: number, v: number) => [number, number],
  strips = 48,
) {
  for (let i = 0; i < strips; i++) {
    const u0 = i / strips
    const u1 = (i + 1) / strips
    const [x0, y0] = P(u0, 0)
    const [x1, y1] = P(u1, 0)
    const [x2, y2] = P(u0, 1)
    const sw = img.width / strips
    ctx.save()
    // 源矩形 (sw × H) → 平行四边形 (x0,y0)-(x1,y1)-(x2,y2)
    ctx.transform((x1 - x0) / sw, (y1 - y0) / sw, (x2 - x0) / img.height, (y2 - y0) / img.height, x0, y0)
    ctx.drawImage(img, i * sw, 0, sw + 0.6, img.height, 0, 0, sw + 0.6, img.height)
    ctx.restore()
  }
}

export const s82CtosSilos: Scene = {
  id: 'wd1-082-ctos-includes-more-data-silos',
  start: 81.6,
  end: 87.1,
  note: 'But a ctOS includes much more → 立方体转面 → Data Silos',
  render({ ctx, t }) {
    ref(ctx)
    // 旋转角、面尺寸、中心
    const th = track(t, [
      [83.97, 0],
      [84.3, 0.35],
      [84.5, 0.8],
      [84.8, 1.35],
      [85.0, Math.PI / 2],
    ])
    const S = track(t, [
      [83.95, FW],
      [84.3, 340],
      [84.5, 295],
      [84.8, 255],
      [85.2, 225],
      [85.8, 222],
    ])
    const cx = track(t, [
      [83.95, DOC.x + FW / 2],
      [84.5, 640],
      [85.4, 643],
    ])
    const cy = track(t, [
      [83.95, DOC.y + FH / 2],
      [84.3, 352],
      [85.4, 357],
    ])
    // 85.9–86.3：阵列绕竖轴翻一圈（翻到侧面时只剩一条竖线）
    const flip = span(t, 85.85, 86.3, ease.inOutCubic) * Math.PI
    const hW = S / 2
    const hH = (S * FH) / FW / 2
    const f = hW * 5 // 透视焦距
    const proj = (x: number, y: number, z: number): [number, number] => {
      const X = x * Math.cos(th) - z * Math.sin(th)
      const Z = x * Math.sin(th) + z * Math.cos(th)
      const k = f / (f - Z)
      return [cx + X * k, cy + y * k]
    }
    // 文档剩余条块（仍在消失中）
    if (t < 83.95) {
      ctx.drawImage(frontFace(t), DOC.x, DOC.y, FW, FH)
      return
    }
    // 正面（z = +hW）
    if (Math.cos(th) > 0.02) drawFace(ctx, frontFace(t), (u, v) => proj(-hW + u * 2 * hW, -hH + v * 2 * hH, hW))
    // 右侧面（x = +hW），翻转阶段额外绕自身竖轴转
    if (Math.sin(th) > 0.02) {
      const side = sideFace(t)
      if (flip <= 0) drawFace(ctx, side, (u, v) => proj(hW, -hH + v * 2 * hH, hW - u * 2 * hW))
      else {
        const c = Math.cos(flip)
        const wide = 1 + span(t, 86.1, 86.4, ease.outCubic) * 0.35
        ctx.save()
        ctx.globalAlpha = 1 - span(t, 86.9, 87.1)
        ctx.translate(cx, cy - span(t, 86.35, 87.1, ease.inCubic) * 60)
        ctx.scale(Math.max(0.012, Math.abs(c)) * wide, 1)
        ctx.drawImage(side, -hW, -hH, hW * 2, hH * 2)
        ctx.restore()
      }
    }
  },
}
