/**
 * 77.6–82.95s：街区数据卡片连成网络 → 网线汇聚成大脑（后脑视角，中间一条亮白脊柱）→ 大脑拉远缩小。
 *
 * ASSET：大脑 = brainCanvas()，在离屏画布上用数千条随机曲线填满「两半球 + 小脑 + 脑干」形状的遮罩，
 * 近似原片的纤维状 X 光大脑。替换：把 brainCanvas 改成加载一张 1300×1300 的透明底大脑图即可。
 */
import type { FrameCtx, Scene } from '../../../engine/types'
import { clamp, ease, hash, lerp, rng, seg } from '../../../engine/math'
import { cachedCanvas, dataCard } from './common'

const BW = 1300
const BH = 1300

/** 大脑遮罩（后视图）：局部坐标以画布中心为原点 */
function brainPath(c: CanvasRenderingContext2D) {
  const cx = BW / 2
  const cy = BH / 2
  c.beginPath()
  const el = (x: number, y: number, rx: number, ry: number, rot: number) => {
    c.moveTo(x + rx * Math.cos(rot), y + rx * Math.sin(rot))
    c.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2)
  }
  // 左右半球（后视）：上窄下宽——两个外倾的高椭圆，按原片 82.0s 轮廓量（最宽处约在 60% 高度）
  el(cx - 250, cy - 110, 330, 400, 0.13)
  el(cx + 250, cy - 110, 330, 400, -0.13)
  // 中缝填充
  el(cx, cy - 80, 200, 400, 0)
  // 小脑（底部两瓣，比大脑窄）
  el(cx - 215, cy + 300, 280, 150, 0.12)
  el(cx + 215, cy + 300, 280, 150, -0.12)
  // 脑干
  c.moveTo(cx - 55, cy + 330)
  c.rect(cx - 55, cy + 330, 110, 280)
}

export function brainCanvas() {
  return cachedCanvas('p2-brain', BW, BH, (c) => {
    const cx = BW / 2
    const cy = BH / 2
    // 遮罩
    const mask = document.createElement('canvas')
    mask.width = BW
    mask.height = BH
    const m = mask.getContext('2d')!
    m.fillStyle = '#fff'
    brainPath(m)
    m.fill()
    const md = m.getImageData(0, 0, BW, BH).data
    const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < BW && y < BH && md[(Math.floor(y) * BW + Math.floor(x)) * 4 + 3] > 0
    c.save()
    brainPath(c)
    c.clip()
    // 底色：暗灰半透明体积
    const g = c.createRadialGradient(cx, cy, 100, cx, cy, 700)
    g.addColorStop(0, 'rgba(95,97,102,0.6)')
    g.addColorStop(1, 'rgba(45,46,50,0.45)')
    c.fillStyle = g
    c.fillRect(0, 0, BW, BH)
    const R = rng(81)
    // 纤维：短曲线
    for (let i = 0; i < 14000; i++) {
      const x = R.range(0, BW)
      const y = R.range(0, BH)
      if (!inside(x, y)) continue
      const a = R.range(0, Math.PI * 2)
      const len = R.range(20, 140)
      c.strokeStyle = `rgba(235,238,245,${R.range(0.08, 0.45)})`
      c.lineWidth = R.range(0.6, 1.6)
      c.beginPath()
      c.moveTo(x, y)
      c.quadraticCurveTo(x + Math.cos(a + 1) * len * 0.5, y + Math.sin(a + 1) * len * 0.5, x + Math.cos(a) * len, y + Math.sin(a) * len)
      c.stroke()
    }
    // 脑回：沿半球表面的长弧
    for (let i = 0; i < 700; i++) {
      const side = R.chance(0.5) ? -1 : 1
      const ex = cx + side * 250
      const r0 = R.range(120, 460)
      const a0 = R.range(-Math.PI, Math.PI)
      c.strokeStyle = `rgba(245,245,250,${R.range(0.18, 0.6)})`
      c.lineWidth = R.range(1.2, 3)
      c.beginPath()
      for (let k = 0; k <= 12; k++) {
        const a = a0 + k * 0.09
        const rr = r0 + Math.sin(k * 1.7 + i) * 18
        c.lineTo(ex + Math.cos(a) * rr * 0.72, cy - 110 + Math.sin(a) * rr * 0.87)
      }
      c.stroke()
    }
    // 中线亮脊柱
    for (let i = 0; i < 70; i++) {
      const x = cx + R.range(-50, 50) * (R.chance(0.7) ? 0.5 : 1)
      c.strokeStyle = `rgba(255,255,255,${R.range(0.1, 0.45)})`
      c.lineWidth = R.range(0.8, 2.5)
      c.beginPath()
      c.moveTo(x, R.range(120, 260))
      c.bezierCurveTo(x + R.range(-30, 30), 450, x + R.range(-30, 30), 800, x + R.range(-20, 20), BH - 80)
      c.stroke()
    }
    // 小脑上缘的亮横线（小脑幕）
    for (let i = 0; i < 25; i++) {
      c.strokeStyle = `rgba(255,255,255,${R.range(0.06, 0.25)})`
      c.lineWidth = R.range(1, 3)
      c.beginPath()
      c.moveTo(cx - 440, cy + 230 + R.range(-20, 20))
      c.quadraticCurveTo(cx - 250, cy + 60 + R.range(-30, 30), cx, cy + 150 + R.range(-15, 15))
      c.quadraticCurveTo(cx + 250, cy + 60 + R.range(-30, 30), cx + 440, cy + 230 + R.range(-20, 20))
      c.stroke()
    }
    // 散落的小数据块
    for (let i = 0; i < 160; i++) {
      const x = R.range(0, BW)
      const y = R.range(0, BH)
      if (!inside(x, y)) continue
      c.fillStyle = R.chance(0.5) ? 'rgba(20,20,22,0.9)' : 'rgba(210,210,210,0.7)'
      c.fillRect(x, y, R.range(10, 30), R.range(6, 14))
    }
    c.restore()
    // 外轮廓辉光：只描并集的外边（描粗线后挖掉内部）
    const edge = document.createElement('canvas')
    edge.width = BW
    edge.height = BH
    const e = edge.getContext('2d')!
    e.strokeStyle = '#fff'
    e.lineWidth = 7
    brainPath(e)
    e.stroke()
    e.globalCompositeOperation = 'destination-out'
    brainPath(e)
    e.fill()
    c.save()
    c.shadowColor = 'rgba(255,255,255,0.9)'
    c.shadowBlur = 16
    c.globalAlpha = 0.35
    c.drawImage(edge, 0, 0)
    c.restore()
  })
}

/** 大脑内部采样点（网络汇聚的目标） */
let nodes: { x: number; y: number }[] | null = null
function brainNodes() {
  if (nodes) return nodes
  const R = rng(82)
  const out: { x: number; y: number }[] = []
  while (out.length < 220) {
    const x = R.range(-560, 560)
    const y = R.range(-560, 560)
    const inHemi = ((Math.abs(x) - 240) / 340) ** 2 + ((y + 110) / 400) ** 2 < 1
    const inCere = ((Math.abs(x) - 215) / 280) ** 2 + ((y - 300) / 150) ** 2 < 1
    if (inHemi || inCere) out.push({ x: x * (R.chance(0.3) ? 0.15 : 1), y })
  }
  nodes = out
  return out
}

const scaleAt = (t: number) => {
  // 按原片大脑宽度反算（影片 81.0 ≈ 1900px、82.0 ≈ 1080px、82.8 ≈ 730px；内部时间 = 影片 − 0.07）
  const k: [number, number][] = [[77.6, 3.0], [79.0, 2.2], [80.0, 1.9], [80.93, 1.6], [81.93, 0.93], [82.5, 0.72], [82.73, 0.63], [82.95, 0.54]]
  for (let i = 0; i < k.length - 1; i++)
    if (t <= k[i + 1][0]) return lerp(k[i][1], k[i + 1][1], ease.inOutCubic(clamp((t - k[i][0]) / (k[i + 1][0] - k[i][0]))))
  return 0.54
}

function render(f: FrameCtx) {
  const { ctx, t } = f
  const s = scaleAt(t)
  const cx = 960
  const cy = t < 81.93 ? 620 + 30 * seg(t, 80.5, 81.93) : t < 82.5 ? lerp(650, 510, seg(t, 81.93, 82.5)) : lerp(510, 430, seg(t, 82.5, 82.95))
  // 1) 漂浮卡片 + 网线（77.6–80.8）
  const netA = 1 - seg(t, 79.8, 80.8)
  if (netA > 0) {
    const R = rng(777)
    const N = brainNodes()
    const pull = ease.inOutCubic(seg(t, 77.8, 79.6))
    ctx.lineWidth = 1
    for (let i = 0; i < 150; i++) {
      const x0 = R.range(-100, 2020)
      const y0 = R.range(-60, 1100)
      const w = R.range(40, 130)
      const n = N[R.int(0, N.length - 1)]
      const tx = cx + n.x * s
      const ty = cy + n.y * s
      // 卡片慢慢被拉向大脑内部
      const x = lerp(x0, tx, pull * 0.45)
      const y = lerp(y0, ty, pull * 0.45)
      const col = R.chance(0.08) ? 'rgba(63,182,196,' : R.chance(0.06) ? 'rgba(214,200,80,' : 'rgba(230,230,230,'
      ctx.strokeStyle = `${col}${0.16 * netA * seg(t, 77.6 + R.next() * 0.8, 78.2 + R.next() * 0.8)})`
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(tx, ty)
      const m = N[R.int(0, N.length - 1)]
      ctx.moveTo(x, y)
      ctx.lineTo(cx + m.x * s, cy + m.y * s)
      ctx.stroke()
      dataCard(ctx, R.int(1, 99999), x, y, w * 0.6, netA)
    }
    // 大脑内部的网线（先于纤维出现，勾出形状）
    const R2 = rng(79)
    ctx.strokeStyle = `rgba(235,235,240,${0.1 * netA * seg(t, 78.2, 79.2)})`
    ctx.beginPath()
    for (let i = 0; i < 500; i++) {
      const a = N[R2.int(0, N.length - 1)]
      const b = N[R2.int(0, N.length - 1)]
      if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) > 500) continue
      ctx.moveTo(cx + a.x * s, cy + a.y * s)
      ctx.lineTo(cx + b.x * s, cy + b.y * s)
    }
    ctx.stroke()
  }
  // 1.5) 纤维束：原片 78.3 起先在画面正中长出一条竖直亮脊，79.3 起从底部向两侧弯出 U 形下缘，勾出大脑轮廓
  fibers(ctx, t, netA)
  // 2) 大脑纤维体（78.6 起显形）
  const bA = seg(t, 80.55, 81.1)
  if (bA > 0) {
    const img = brainCanvas()
    // 放大充满画面时原片整体偏暗（均亮约 50），拉远到完整大脑后才变亮
    ctx.globalAlpha = bA * lerp(0.5, 1, seg(t, 81.2, 81.9))
    ctx.drawImage(img, cx - (BW / 2) * s, cy - (BH / 2) * s, BW * s, BH * s)
    ctx.globalAlpha = 1
  }
  // 3) 拉远后周围的零星白点
  const dotA = seg(t, 80.8, 81.6)
  if (dotA > 0) {
    ctx.fillStyle = `rgba(230,230,230,${0.6 * dotA})`
    for (let i = 0; i < 160; i++) {
      const x = hash(i * 2 + 1) * 1920
      const y = hash(i * 2 + 2) * 1080
      const r = hash(i + 700)
      if (r > 0.85) ctx.strokeRect(x, y, 8, 8)
      else ctx.fillRect(x, y, 2 + r * 3, 2 + r * 3)
    }
  }
}

function fibers(ctx: CanvasRenderingContext2D, t: number, netA: number) {
  const grow = seg(t, 78.25, 79.3)
  if (grow <= 0) return
  const fa = 1 - seg(t, 80.8, 81.2)
  if (fa <= 0) return
  const R = rng(4242)
  ctx.save()
  ctx.lineWidth = 1.2
  for (let i = 0; i < 70; i++) {
    const x0 = 960 + R.range(-30, 30)
    const yEnd = lerp(-20, 1100, grow) * R.range(0.8, 1)
    ctx.strokeStyle = `rgba(240,240,245,${R.range(0.08, 0.35) * fa})`
    ctx.beginPath()
    ctx.moveTo(x0, -20)
    for (let y = 40; y < yEnd; y += 60) ctx.lineTo(x0 + Math.sin(y * 0.013 + i) * R.range(4, 26), y)
    ctx.stroke()
  }
  const lobe = seg(t, 79.2, 80.4)
  if (lobe > 0) {
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < 90; i++) {
        const j = R.range(-40, 40)
        ctx.strokeStyle = `rgba(240,240,245,${R.range(0.08, 0.45) * fa * lobe})`
        ctx.beginPath()
        ctx.moveTo(960 + side * R.range(10, 40), 1040 + j * 0.5)
        ctx.bezierCurveTo(960 + side * 380, 1060 + j, 960 + side * 760, 900 + j, 960 + side * (780 + j), lerp(900, 250, lobe) + j * 2)
        ctx.stroke()
      }
    }
  }
  ctx.restore()
}

export const brainScene: Scene = {
  id: 'wd2-077-brain',
  start: 77.6,
  end: 82.95,
  note: '数据卡片连成网络并被拉向中心，网线勾出大脑形状，纤维状大脑显形后拉远缩小',
  render,
}
