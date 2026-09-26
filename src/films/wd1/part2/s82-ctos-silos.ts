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
  line('CT', 102, 234, 86, 81.78, 30)
  line('OS', 212, 234, 134, 81.86, 30)
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
function sideFace(t: number, key = 'wd1p2-cube-side') {
  const o = offscreen(key, FW * RES, FH * RES)
  const g = o.ctx
  g.setTransform(1, 0, 0, 1, 0, 0)
  g.clearRect(0, 0, FW * RES, FH * RES)
  g.setTransform(RES, 0, 0, RES, 0, 0)
  g.fillStyle = '#fff'
  // V2（对 5fps 参考帧）：85.0 前保持横条（84.4 看起来像方块是侧面透视压缩），85.0–85.3 收成小方块，85.35–85.8 方块拉成放射状短划（长轴指向阵列中心外）
  const k1 = span(t, 85.0, 85.3, ease.inOutCubic)
  const k2 = span(t, 85.35, 85.8, ease.inOutCubic)
  for (let r = 0; r < 5; r++)
    for (let c = 0; c < 6; c++) {
      const cx = 30 + c * 70
      const cy = 60 + r * 76
      const ang = Math.atan2(cy - 212, cx - 205)
      const w = 58 - 34 * k1 + 14 * k2
      const h = 14 + 10 * k1 - 6 * k2
      g.save()
      g.translate(cx, cy)
      g.rotate(k2 * ang + (1 - k2) * k1 * ((c + r) % 3 - 1) * 0.12)
      g.fillRect(-w / 2, -h / 2, w, h)
      g.restore()
    }
  setFont(g, 40, 500, FONT.sans, -0.03)
  g.fillText('Data Silos'.slice(0, typed('Data Silos', t, 84.75, 20).n), 8, 30)
  return o.canvas
}

/** 横条面：翻转前的卡片状态（粗横条 6×5），V2 翻转后从左侧滑过、贴到阵列右边 */
function barsFace() {
  const o = offscreen('wd1p2-cube-bars', FW * RES, FH * RES)
  const g = o.ctx
  g.setTransform(1, 0, 0, 1, 0, 0)
  g.clearRect(0, 0, FW * RES, FH * RES)
  g.setTransform(RES, 0, 0, RES, 0, 0)
  g.fillStyle = '#fff'
  for (let r = 0; r < 5; r++)
    for (let c = 0; c < 6; c++) card(g, 30 + c * 70, 60 + r * 76, 62, 22, 0, ((c + r) % 3) * 0.12)
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
  end: 87.62,
  note: 'But a ctOS includes much more → 立方体转面 → Data Silos',
  render({ ctx, t }) {
    ref(ctx)
    // 旋转角、面尺寸、中心
    const th = track(t, [
      [84.0, 0],
      [84.2, 0.1],
      [84.4, 0.85],
      [84.6, 1.2],
      [84.8, 1.4],
      [85.1, Math.PI / 2],
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
    // 85.85–86.05：阵列绕竖轴翻半圈（85.95 只剩一条竖线），之后正对镜头（V2：按原片 10fps 逐帧重对）
    const flip = span(t, 85.85, 86.05, ease.inOutCubic) * Math.PI
    const hW = S / 2
    const hH = (S * FH) / FW / 2
    const f = hW * 5 // 透视焦距
    const proj = (x: number, y: number, z: number): [number, number] => {
      const X = x * Math.cos(th) - z * Math.sin(th)
      const Z = x * Math.sin(th) + z * Math.cos(th)
      // V2：归一化使 th=0 时正面与 83.95 前的平面文档等大（V1 在 84.0 跳大 25%）
      const k = (f / (f - Z)) * (1 - 0.2 * Math.max(0, Math.cos(th)))
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
        // V2：翻完后阵列不消失——86.2 横向一压、86.35 起一块「横条面」（翻转前的卡片状态）从左侧滑到右侧
        // 并贴在阵列右边，87.1 起整组缩小上移，87.45–87.6 淡出（原片 87.4 仍可见，飞散块同时从下方升起）
        const c = Math.cos(flip) * (1 - 0.55 * Math.sin(Math.PI * span(t, 86.12, 86.28)))
        const shrink = 1 - 0.4 * span(t, 87.05, 87.5, ease.inOutCubic)
        const gx = cx + 20 * span(t, 86.6, 87.0) - 30 * span(t, 87.05, 87.5)
        const gy = cy - 30 * span(t, 87.05, 87.5, ease.inCubic)
        ctx.save()
        ctx.globalAlpha = 1 - span(t, 87.45, 87.62)
        ctx.translate(gx, gy)
        ctx.scale(shrink, shrink)
        // 横条面
        if (t > 86.33) {
          const bars = barsFace()
          // 横条面从右侧画外滑入，停在阵列右下（原片 86.5 在右缘、87.0 与阵列右下角重叠）
          const bx = track(t, [
            [86.35, 760],
            [86.5, 520],
            [86.8, 330],
            [87.0, 170],
            [87.5, 150],
          ])
          const by = track(t, [
            [86.35, 0],
            [86.8, 10],
            [87.0, 90],
            [87.5, 100],
          ])
          const bw = 1
          ctx.drawImage(bars, bx - hW * bw, by - hH, hW * 2 * bw, hH * 2)
        }
        ctx.save()
        ctx.scale(Math.max(0.012, Math.abs(c)) * (1 + 0.45 * span(t, 86.3, 86.5, ease.outCubic)), 1)
        ctx.drawImage(side, -hW, -hH, hW * 2, hH * 2)
        ctx.restore()
        ctx.restore()
      }
    }
  },
}
