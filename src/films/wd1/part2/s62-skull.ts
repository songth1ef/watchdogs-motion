/**
 * 62.6–69.4  黑底 CT 头部扫描：
 *  62.9–65.9 俯视单张 CT 切片，从头顶逐层向下扫（颅骨环 → 眼眶/鼻腔 → 上颌），右下 "Personal Data Collection / is the key commodity" 青底打字；
 *  65.9–68.4 已扫描的切片堆叠成 3D 体：俯视（同心环）→ 正视（横条纹）→ 斜俯视旋转；
 *  68.4–69.3 头部缩小成网络中心节点（接 s69-network）。
 * ASSET：ctSlice()（单张 CT 切片图）和 headSlices()（切片轮廓体）都是程序化近似；
 *        换成真实 CT 序列图：让 ctSlice(level) 返回对应层的图片，headSlices 改为从图片提取的轮廓即可。
 */
import type { Scene } from '../../../engine/types'
import { rng } from '../../../engine/math'
import { WD1 } from '../../../theme'
import { drawNetworkWorld } from './s69-network'
import { FONT, clamp, ease, ref, setFont, span, track, typed } from './common'

const N_LEVEL = 40
/** 头部在高度 y（-1 下巴 .. 1 头顶）处的截面半径系数 */
function widthAt(y: number) {
  const top = Math.sqrt(Math.max(0, 1 - ((y - 0.05) / 0.95) ** 2))
  const jaw = y < -0.35 ? 1 - (-0.35 - y) * 0.9 : 1
  return top * Math.max(0.25, jaw)
}
/** 截面中心的前后偏移（下半部脸往前凸） */
const faceShift = (y: number) => (y < -0.1 ? (-0.1 - y) * 0.18 : 0)

const cache = new Map<number, HTMLCanvasElement>()
/** ASSET：程序化 CT 切片（256×256，前方朝上） */
function ctSlice(level: number) {
  const q = Math.round(((level + 1) / 2) * (N_LEVEL - 1))
  const hit = cache.get(q)
  if (hit) return hit
  const y = (q / (N_LEVEL - 1)) * 2 - 1
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')!
  const R = rng(900 + q)
  const w = widthAt(y)
  const rx = 0.72 * w * 110
  const rz = 0.9 * w * 110
  const cy = 128 - faceShift(y) * 110
  if (w <= 0.02) {
    cache.set(q, c)
    return c
  }
  // 软组织
  g.fillStyle = '#8a8a8a'
  g.beginPath()
  g.ellipse(128, cy, rx + 4, rz + 4, 0, 0, Math.PI * 2)
  g.fill()
  // 脑组织纹理
  g.save()
  g.beginPath()
  g.ellipse(128, cy, rx - 6, rz - 6, 0, 0, Math.PI * 2)
  g.clip()
  g.fillStyle = y > 0.1 ? '#9c9c9c' : '#a8a8a8'
  g.fillRect(0, 0, 256, 256)
  for (let i = 0; i < 1400; i++) {
    const v = R.int(70, 235)
    g.fillStyle = `rgba(${v},${v},${v},${R.range(0.15, 0.5)})`
    const s = R.range(1, 4)
    g.fillRect(R.range(0, 256), R.range(0, 256), s, s)
  }
  if (y > 0.1) {
    // 脑回沟
    g.strokeStyle = 'rgba(60,60,60,0.55)'
    g.lineWidth = 1
    for (let i = 0; i < 40; i++) {
      let x = 128 + R.range(-rx, rx)
      let z = cy + R.range(-rz, rz)
      g.beginPath()
      g.moveTo(x, z)
      for (let k = 0; k < 5; k++) {
        x += R.range(-8, 8)
        z += R.range(-8, 8)
        g.lineTo(x, z)
      }
      g.stroke()
    }
    // 中线
    g.fillStyle = 'rgba(230,230,230,0.6)'
    g.fillRect(127, cy - rz, 2, rz * 2)
  } else {
    // 眼眶、鼻腔、骨块
    const eyeY = cy - rz * 0.62
    g.fillStyle = '#1a1a1a'
    for (const sx of [-1, 1]) {
      g.beginPath()
      g.ellipse(128 + sx * rx * 0.42, eyeY, rx * 0.15, rz * 0.11, 0, 0, Math.PI * 2)
      g.fill()
    }
    // 颅底骨结构：大量不规则亮块
    g.fillStyle = 'rgba(250,250,250,0.85)'
    for (let i = 0; i < 38; i++) {
      const a = R.range(0, Math.PI * 2)
      const r = R.range(0.1, 0.85)
      g.beginPath()
      g.ellipse(128 + Math.cos(a) * rx * r, cy + Math.sin(a) * rz * r, R.range(2, 9), R.range(2, 7), R.range(0, 3), 0, Math.PI * 2)
      g.fill()
    }
    g.strokeStyle = 'rgba(245,245,245,0.9)'
    g.lineWidth = 3
    for (let i = 0; i < 14; i++) {
      g.beginPath()
      const a = R.range(0, Math.PI * 2)
      const r = R.range(0.2, 0.8)
      const x = 128 + Math.cos(a) * rx * r
      const z = cy + Math.sin(a) * rz * r
      g.moveTo(x, z)
      g.lineTo(x + R.range(-14, 14), z + R.range(-14, 14))
      g.stroke()
    }
    g.fillStyle = '#333'
    g.beginPath()
    g.ellipse(128, eyeY + 6, 5, 14, 0, 0, Math.PI * 2)
    g.fill()
    // 小脑/枕部亮块
    g.fillStyle = 'rgba(235,235,235,0.7)'
    g.beginPath()
    g.ellipse(128, cy + rz * 0.35, rx * 0.35, rz * 0.25, 0, 0, Math.PI * 2)
    g.fill()
  }
  g.restore()
  // 颅骨环（亮白）
  g.strokeStyle = '#f2f2f2'
  g.lineWidth = y > 0.1 ? 9 : 6
  g.beginPath()
  g.ellipse(128, cy, rx - 2, rz - 2, 0, 0, Math.PI * 2)
  g.stroke()
  g.strokeStyle = 'rgba(255,255,255,0.4)'
  g.lineWidth = 2
  g.beginPath()
  g.ellipse(128, cy, rx + 3, rz + 3, 0, 0, Math.PI * 2)
  g.stroke()
  cache.set(q, c)
  return c
}

/** 3D 投影：先绕 Y 轴 yaw，再绕 X 轴 pitch（pitch=90° 为俯视），最后屏幕内 roll */
function projector(yaw: number, pitch: number, roll: number, cx: number, cy: number, s: number) {
  const cyw = Math.cos(yaw)
  const syw = Math.sin(yaw)
  const cp = Math.cos(pitch)
  const sp = Math.sin(pitch)
  const cr = Math.cos(roll)
  const sr = Math.sin(roll)
  return (x: number, y: number, z: number) => {
    const x1 = x * cyw + z * syw
    const z1 = -x * syw + z * cyw
    // 俯仰：视线方向 = -z（屏幕里），pitch 把 +y（头顶）转向观察者
    const y2 = y * cp - z1 * sp
    const z2 = y * sp + z1 * cp
    const X = x1 * cr - y2 * sr
    const Y = x1 * sr + y2 * cr
    return [cx + X * s, cy - Y * s, z2] as const
  }
}

/** 切片体里的青色数据点（固定随机） */
const DOTS = (() => {
  const R = rng(77)
  const out: [number, number, number][] = []
  for (let i = 0; i < 46; i++) {
    const y = R.range(-0.3, 0.95)
    const w = widthAt(y)
    const a = R.range(0, Math.PI * 2)
    const r = Math.sqrt(R.next()) * 0.95
    out.push([Math.cos(a) * 0.72 * w * r, y, Math.sin(a) * 0.9 * w * r + faceShift(y)])
  }
  return out
})()

function drawHead(ctx: CanvasRenderingContext2D, P: ReturnType<typeof projector>, cutY: number, alpha: number, fillK = 1) {
  const n = 44
  const slices: { y: number; i: number; pts: (readonly [number, number, number])[]; depth: number }[] = []
  for (let i = 0; i < n; i++) {
    const y = 0.98 - (i / (n - 1)) * (0.98 - cutY)
    const w = widthAt(y)
    if (w < 0.05) continue
    const pts = []
    let depth = 0
    for (let k = 0; k <= 40; k++) {
      const a = (k / 40) * Math.PI * 2
      const p = P(Math.cos(a) * 0.72 * w, y, Math.sin(a) * 0.9 * w + faceShift(y))
      pts.push(p)
      depth += p[2]
    }
    slices.push({ y, i, pts, depth: depth / 41 })
  }
  slices.sort((a, b) => a.depth - b.depth)
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.lineJoin = 'round'
  for (const s of slices) {
    ctx.beginPath()
    s.pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
    ctx.closePath()
    // 每层灰度按层号起伏，叠出等高线般的台阶感；正视时（fillK→0）只剩横条纹
    const v = 150 + 70 * (((s.i % 5) / 4) ** 1.5)
    ctx.fillStyle = `rgba(${v},${v},${v},${0.95 * fillK})`
    if (fillK > 0.02) ctx.fill()
    ctx.strokeStyle = 'rgba(245,245,245,0.85)'
    ctx.lineWidth = 1.8
    ctx.stroke()
    ctx.strokeStyle = 'rgba(60,60,60,0.7)'
    ctx.lineWidth = 0.7
    ctx.stroke()
  }
  // 青色数据点
  ctx.fillStyle = WD1.cyan
  for (const [x, y, z] of DOTS) {
    if (y < cutY) continue
    const [sx, sy] = P(x, y, z)
    ctx.globalAlpha = alpha * 0.85
    ctx.fillRect(sx - 3, sy - 3, 6, 6)
  }
  ctx.restore()
}

/** 头部两侧的白色小胶囊（扫描定位标记） */
function sideMarks(ctx: CanvasRenderingContext2D, P: ReturnType<typeof projector>, alpha: number) {
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.fillStyle = '#e8e8e8'
  for (const sx of [-1, 1]) {
    const a = P(sx * 0.95, 0.0, -0.12)
    const b = P(sx * 0.95, 0.0, 0.12)
    const c = P(sx * 0.95, -0.25, 0.0)
    ctx.beginPath()
    ctx.moveTo(a[0], a[1])
    ctx.lineTo(b[0], b[1])
    ctx.lineTo(c[0] + (b[0] - a[0]) * 0.15, c[1])
    ctx.closePath()
    ctx.lineWidth = 5
    ctx.strokeStyle = '#e8e8e8'
    ctx.stroke()
  }
  ctx.restore()
}

export const s62Skull: Scene = {
  id: 'wd1-062-skull-scan',
  start: 62.6,
  end: 69.4,
  note: 'CT 头部扫描 + Personal Data Collection is the key commodity，切片体旋转后缩成网络节点',
  render({ ctx, t }) {
    ref(ctx)
    const cx = track(t, [
      [62.9, 640],
      [63.4, 640],
      [64.4, 655],
      [65.6, 655],
      [66.4, 660],
      [67.2, 650],
      [67.8, 660],
      [68.4, 650],
      [68.8, 652],
      [69.3, 640],
    ])
    const cy = track(t, [
      [62.9, 395],
      [63.4, 380],
      [64.4, 360],
      [65.6, 380],
      [66.4, 360],
      [67.2, 370],
      [67.8, 380],
      [68.4, 390],
      [68.8, 355],
      [69.3, 380],
    ])
    const sc = track(t, [
      [62.9, 60],
      [63.0, 165],
      [63.4, 190],
      [64.4, 232],
      [65.6, 205],
      [66.1, 205],
      [66.4, 185],
      [67.2, 175],
      [67.8, 180],
      [68.4, 165],
      [68.8, 120],
      [69.1, 55],
      [69.3, 6],
    ])

    // 67.6 起网络在头骨后面生长
    if (t >= 67.6) {
      drawNetworkWorld(ctx, t)
      ref(ctx)
    }

    // V2：原片 66.0 仍是俯视单张切片（上颌层），66.1 起才换成 3D 体
    if (t < 66.08) {
      // 单张 CT 切片（俯视）
      const level = track(t, [
        [62.9, 0.85],
        [63.4, 0.55],
        [64.4, -0.12],
        [65.6, -0.5],
        [66.08, -0.56],
      ])
      const img = ctSlice(level)
      const size = (256 / 110) * sc
      ctx.save()
      ctx.globalAlpha = span(t, 62.85, 63.0)
      ctx.drawImage(img, cx - size / 2, cy - size / 2, size, size)
      // 切片内的青色点
      const R = rng(Math.round(level * 40) + 300)
      ctx.fillStyle = WD1.cyan
      for (let i = 0; i < 10; i++) {
        const a = R.range(0, Math.PI * 2)
        const r = Math.sqrt(R.next()) * 0.6 * widthAt(level)
        ctx.globalAlpha = 0.8
        ctx.fillRect(cx + Math.cos(a) * r * 0.72 * sc - 3, cy + Math.sin(a) * r * 0.9 * sc - 3, 6, 6)
      }
      ctx.restore()
      if (t > 63.3) sideMarks(ctx, projector(0, Math.PI / 2, 0, cx, cy, sc), span(t, 63.3, 63.5))
    } else {
      // 3D 切片体
      const pitch = track(t, [
        [66.08, Math.PI / 2],
        [66.35, 0.0],
        [66.6, 0.0],
        [67.2, 0.9],
        [67.8, 0.85],
        [68.4, 1.1],
        [68.9, 1.35],
      ])
      const yaw = track(t, [
        [66.08, 0],
        [66.6, 0],
        [67.2, 1.3],
        [67.8, 1.5],
        [68.4, 1.4],
        [68.9, 0.2],
      ])
      const roll = track(t, [
        [66.08, 0],
        [66.6, 0],
        [67.2, 0.1],
        [67.8, -0.2],
        [68.4, -0.5],
        [68.9, 0],
      ])
      const P = projector(yaw, pitch, roll, cx, cy, sc)
      drawHead(ctx, P, -0.28, 1, clamp(Math.abs(Math.sin(pitch)) * 3))
      if (sc > 30) sideMarks(ctx, P, 1)
    }

    // 文字：Personal Data Collection / is the key commodity（65.6 后下移、左移并收窄消失）
    const tx = track(t, [
      [65.5, 640],
      [65.8, 472],
      [66.0, 392],
      [66.2, 355],
      [66.5, 339],
    ])
    const ty = track(t, [
      [65.1, 440],
      [65.4, 475],
      [65.6, 541],
      [65.8, 608],
      [66.2, 605],
    ])
    // V2：原片 65.8 剩 80%、66.0 剩 30%、66.2 剩 13%——先快后慢
    const collapse = span(t, 65.7, 66.5, ease.outQuad)
    if (t > 62.95 && collapse < 1) {
      ctx.save()
      const l1 = 'Personal Data Collection'
      const l2 = 'is the key commodity'
      setFont(ctx, 47, 400, FONT.sans, -0.02)
      const w1 = ctx.measureText(l1).width + 8
      const n1 = typed(l1, t, 62.95, 30).n
      const bw1 = Math.min(w1, ctx.measureText(l1.slice(0, n1)).width + 30) * (1 - collapse)
      ctx.beginPath()
      ctx.rect(tx - 2, ty - 60, Math.max(0, bw1 + 2), 120)
      ctx.clip()
      // V2：原片先在切片上打黑字（无底），63.3–63.6 青底才从左扫出
      ctx.fillStyle = WD1.cyan
      ctx.fillRect(tx - 2, ty - 36, Math.min(bw1, w1 * span(t, 63.3, 63.6)), 42)
      ctx.fillStyle = '#000'
      ctx.fillText(l1.slice(0, n1), tx, ty)
      // 第二行：先出斜纹浅青底，再打字
      setFont(ctx, 31, 400, FONT.sans, -0.01)
      const w2 = ctx.measureText(l2).width + 10
      if (t > 63.8) {
        const n2 = typed(l2, t, 64.05, 20).n
        const bw2 = w2 * span(t, 63.8, 64.1, ease.outCubic)
        ctx.fillStyle = 'rgba(79,245,227,0.75)'
        ctx.fillRect(tx - 2, ty + 6, bw2, 36)
        ctx.strokeStyle = 'rgba(0,80,80,0.35)'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        for (let x = -28; x < bw2; x += 5) {
          ctx.moveTo(tx - 2 + x, ty + 42)
          ctx.lineTo(tx - 2 + x + 36, ty + 6)
        }
        ctx.stroke()
        ctx.fillStyle = '#000'
        ctx.fillText(l2.slice(0, n2), tx, ty + 34)
      }
      ctx.restore()
    }
  },
}
