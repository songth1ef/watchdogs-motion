/**
 * WD2 part1 内部通用工具。
 * 这里的函数都不依赖具体镜头，其他 WD2 段落也用得上（见 docs/shots/wd2-part1.md「建议上提到共享库」）。
 */
import { clamp, ease, hash } from '../../../engine/math'
import { FONT, font, tracking } from '../../../fx/text'
import { WD2 } from '../../../theme'

/** 原片内容实际是 30fps（60fps 容器里每帧重复一次），逐帧故障/闪烁按 30fps 量化 */
export const fr = (t: number) => Math.floor(t * 30)

/** 私有缓存（离屏纹理、预计算数据）。key 全局唯一，建议带 `wd2p1:` 前缀 */
const store = new Map<string, unknown>()
export function cached<T>(key: string, build: () => T): T {
  if (!store.has(key)) store.set(key, build())
  return store.get(key) as T
}

export function makeCanvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return { canvas: c, ctx: c.getContext('2d', { willReadFrequently: true })! }
}

/** 二维哈希 → 0..1 */
export const h2 = (x: number, y: number, s = 0) => hash(Math.imul(x | 0, 73856093) ^ Math.imul(y | 0, 19349663) ^ Math.imul(s | 0, 83492791))

/** 值噪声（双线性插值 + smoothstep） */
export function vnoise(x: number, y: number, seed = 0) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = x - xi
  const yf = y - yi
  const u = xf * xf * (3 - 2 * xf)
  const v = yf * yf * (3 - 2 * yf)
  const a = h2(xi, yi, seed)
  const b = h2(xi + 1, yi, seed)
  const c = h2(xi, yi + 1, seed)
  const d = h2(xi + 1, yi + 1, seed)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}

/** 分形噪声，返回约 0..1 */
export function fbm(x: number, y: number, seed = 0, oct = 4) {
  let s = 0
  let amp = 0.5
  let f = 1
  let norm = 0
  for (let i = 0; i < oct; i++) {
    s += amp * vnoise(x * f, y * f, seed + i * 17)
    norm += amp
    amp *= 0.5
    f *= 2
  }
  return s / norm
}

export interface SatOpts {
  seed: number
  w: number
  h: number
  /** 陆地亮度基准 0..1 */
  bright: number
  /** 街道网格间距（px），0 = 不画 */
  street: number
  /** 街网旋转（弧度），用多个分区模拟城市不同朝向的路网 */
  streetAngle?: number
  /** 水域判定：返回 true 的像素画成近黑色 */
  water?: (x: number, y: number) => boolean
  /** 灯点/亮斑密度 */
  specks?: number
  /** 噪声尺度（越大越细碎） */
  grain?: number
}

/**
 * ASSET 程序化卫星夜景/航拍：噪声底 + 规则街网 + 亮斑 + 水域。
 * 替换真实素材：让本函数返回一张加载好的卫星图 canvas/Image（尺寸同 w×h）即可，调用方只做 drawImage。
 */
export function satelliteTexture(key: string, o: SatOpts) {
  return cached(`wd2p1:sat:${key}`, () => {
    const { canvas, ctx } = makeCanvas(o.w, o.h)
    const img = ctx.createImageData(o.w, o.h)
    const d = img.data
    const g = o.grain ?? 1
    for (let y = 0; y < o.h; y++)
      for (let x = 0; x < o.w; x++) {
        const i = (y * o.w + x) * 4
        let v: number
        if (o.water?.(x, y)) v = 4 + h2(x, y, 9) * 6
        else {
          const n = fbm((x / 260) * g, (y / 260) * g, o.seed, 5)
          const fine = h2(x >> 1, y >> 1, o.seed + 3)
          const blocks = h2(Math.floor(x / 7), Math.floor(y / 7), o.seed + 5)
          v = 255 * o.bright * (0.25 + n * 1.1) * (0.55 + fine * 0.3 + blocks * 0.35)
        }
        d[i] = d[i + 1] = d[i + 2] = clamp(v, 0, 255)
        d[i + 3] = 255
      }
    ctx.putImageData(img, 0, 0)
    if (o.street > 0) {
      ctx.save()
      ctx.translate(o.w / 2, o.h / 2)
      ctx.rotate(o.streetAngle ?? 0)
      const R = Math.hypot(o.w, o.h) / 2
      let idx = 0
      for (let k = -R; k < R; k += o.street) {
        idx++
        const major = idx % 8 === 0
        for (const axis of [0, 1]) {
          // 街道不是完美网格：随机缺段、亮度起伏
          if (!major && h2(idx, axis, o.seed + 40) < 0.25) continue
          const a = major ? 0.5 : 0.12 + h2(idx, axis, o.seed + 41) * 0.2
          ctx.strokeStyle = `rgba(190,195,200,${a * Math.min(1, o.bright * 5)})`
          ctx.lineWidth = major ? 1.6 : 1
          ctx.beginPath()
          const from = -R + h2(idx, axis, o.seed + 42) * R * 0.8
          const to = R - h2(idx, axis, o.seed + 43) * R * 0.8
          if (axis === 0) {
            ctx.moveTo(from, k)
            ctx.lineTo(to, k)
          } else {
            ctx.moveTo(k, from)
            ctx.lineTo(k, to)
          }
          ctx.stroke()
        }
      }
      ctx.restore()
      if (o.water) {
        // 水面上不应有街道：按行扫描重新抹黑
        const id = ctx.getImageData(0, 0, o.w, o.h)
        for (let y = 0; y < o.h; y += 1)
          for (let x = 0; x < o.w; x += 1)
            if (o.water(x, y)) {
              const i = (y * o.w + x) * 4
              id.data[i] = id.data[i + 1] = id.data[i + 2] = 5
            }
        ctx.putImageData(id, 0, 0)
      }
    }
    const n = o.specks ?? 0
    for (let k = 0; k < n; k++) {
      const x = h2(k, 1, o.seed) * o.w
      const y = h2(k, 2, o.seed) * o.h
      if (o.water?.(x, y)) continue
      const s = 1 + h2(k, 3, o.seed) * 2.5
      ctx.fillStyle = `rgba(255,255,255,${0.35 + h2(k, 4, o.seed) * 0.65})`
      ctx.fillRect(x, y, s, s)
    }
    return canvas
  })
}

/** 红色飞机俯视剪影（原片机场航线上的航班图标）。size = 翼展 px，angle = 机头朝向（0 = 向右） */
export function plane(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, angle: number, color: string = WD2.red) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angle)
  const s = size / 2
  ctx.fillStyle = color
  ctx.beginPath()
  // 机身
  ctx.moveTo(s * 1.0, 0)
  ctx.quadraticCurveTo(s * 0.95, -s * 0.09, s * 0.8, -s * 0.09)
  ctx.lineTo(s * 0.2, -s * 0.09)
  // 主翼
  ctx.lineTo(-s * 0.15, -s * 1.0)
  ctx.lineTo(-s * 0.33, -s * 1.0)
  ctx.lineTo(-s * 0.15, -s * 0.09)
  ctx.lineTo(-s * 0.7, -s * 0.09)
  // 尾翼
  ctx.lineTo(-s * 0.88, -s * 0.42)
  ctx.lineTo(-s * 1.0, -s * 0.42)
  ctx.lineTo(-s * 0.93, 0)
  ctx.lineTo(-s * 1.0, s * 0.42)
  ctx.lineTo(-s * 0.88, s * 0.42)
  ctx.lineTo(-s * 0.7, s * 0.09)
  ctx.lineTo(-s * 0.15, s * 0.09)
  ctx.lineTo(-s * 0.33, s * 1.0)
  ctx.lineTo(-s * 0.15, s * 1.0)
  ctx.lineTo(s * 0.2, s * 0.09)
  ctx.lineTo(s * 0.8, s * 0.09)
  ctx.quadraticCurveTo(s * 0.95, s * 0.09, s * 1.0, 0)
  ctx.fill()
  ctx.restore()
}

/** 按进度生长的虚线 */
export function dashLine(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  o: { color?: string; width?: number; dash?: [number, number]; p?: number; offset?: number } = {},
) {
  const p = clamp(o.p ?? 1)
  if (p <= 0) return
  ctx.save()
  ctx.strokeStyle = o.color ?? WD2.red
  ctx.lineWidth = o.width ?? 2
  ctx.setLineDash(o.dash ?? [14, 10])
  ctx.lineDashOffset = o.offset ?? 0
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x1 + (x2 - x1) * p, y1 + (y2 - y1) * p)
  ctx.stroke()
  ctx.restore()
}

/** 数值小标签「□ 494.21」（湾区/旧金山地图上满屏都是） */
export function numLabel(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, size = 15, color = 'rgba(255,255,255,0.85)') {
  ctx.save()
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = 1.2
  const b = size * 0.62
  ctx.strokeRect(x + 0.5, y - b + 0.5, b, b)
  font(ctx, size, 400, FONT.mono)
  tracking(ctx, size * 0.08)
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(text, x + b + size * 0.45, y)
  tracking(ctx, 0)
  ctx.restore()
}

/**
 * ctOS 标志：青色方块 + 黑色 "ctOS"（O 是白芯黑圈），下方一条白色细线。
 * p 0..1 逐字「打出」：先闪出青色竖条，再依次出现 c / t / O / S，最后底线与数据细纹。
 * 返回标志宽高。x,y 为左上角，h 为青色方块高度。
 */
export function ctosLogo(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, p: number, frame: number, opts: { sub?: string; data?: boolean } = {}) {
  const w = h * 2.15
  if (p <= 0) return { w, h }
  ctx.save()
  const step = p * 6
  // 逐块出现的青色底：p<0.6 时只有若干竖条
  ctx.fillStyle = WD2.teal
  if (step >= 4) ctx.fillRect(x, y, w, h)
  else {
    const n = Math.floor(step * 2) + 1
    for (let i = 0; i < n; i++) {
      const bx = x + (i / 8) * w
      const bw = w / 8 - (hash(frame * 3 + i) > 0.5 ? 2 : 0)
      ctx.fillRect(bx, y + (i % 2) * h * 0.1, bw, h * (0.8 + (i % 2) * 0.1))
    }
  }
  font(ctx, h * 0.9, 700, FONT.sans)
  tracking(ctx, -h * 0.06)
  ctx.textBaseline = 'alphabetic'
  const base = y + h * 0.84
  const glyphs = ['c', 't', 'O', 'S']
  tracking(ctx, 0)
  const adv = glyphs.map((g) => ctx.measureText(g).width)
  const total = adv.reduce((a, b) => a + b, 0) - h * 0.12
  let cx = x + (w - total) / 2
  for (let i = 0; i < 4; i++) {
    const g = glyphs[i]
    const gw = adv[i]
    if (step > 1 + i * 0.7) {
      if (g === 'O') {
        // 白芯黑圈
        const r = gw * 0.47
        const ox = cx + gw / 2
        const oy = y + h * 0.5
        ctx.fillStyle = '#0a0a0a'
        ctx.beginPath()
        ctx.arc(ox, oy, r, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#f4f4f0'
        ctx.beginPath()
        ctx.arc(ox, oy, r * 0.68, 0, Math.PI * 2)
        ctx.fill()
        if (step < 5) {
          ctx.fillStyle = '#0a0a0a'
          ctx.beginPath()
          ctx.arc(ox, oy, r * 0.25, 0, Math.PI * 2)
          ctx.fill()
        }
      } else {
        ctx.fillStyle = '#0a0a0a'
        ctx.fillText(g, cx, base)
      }
    }
    cx += gw - h * 0.04
  }
  tracking(ctx, 0)
  if (step > 4.5) {
    ctx.fillStyle = '#f4f4f0'
    ctx.fillRect(x, y + h + h * 0.04, w * clamp((step - 4.5) / 1), h * 0.06)
  }
  if (opts.sub && step > 4) {
    font(ctx, h * 0.5, 700, FONT.sans)
    ctx.fillStyle = WD2.fg
    ctx.fillText(opts.sub.slice(0, Math.ceil((step - 4) * 2)), x + w + h * 0.06, y + h * 1.02)
  }
  if (opts.data && step > 5) {
    // 标志下方的青色数据细纹
    ctx.fillStyle = 'rgba(95,211,217,0.55)'
    for (let i = 0; i < 6; i++) {
      const lw = w * (0.35 + hash(i * 7 + 3) * 0.6)
      ctx.fillRect(x + w - lw, y + h * 1.25 + i * h * 0.12, lw, 1.5)
    }
  }
  ctx.restore()
  return { w, h }
}

/**
 * WD2 大字「白块擦出」：先一块白底从左向右擦满整词，再从左向右收走，露出白字（黑底上）。
 * p 0..1。y 为基线。返回文字宽度。
 */
export function wordReveal(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, p: number, o: { color?: string; weight?: number } = {}) {
  font(ctx, size, o.weight ?? 700, FONT.sans)
  tracking(ctx, -size * 0.035)
  const w = ctx.measureText(text).width
  const q = clamp(p)
  if (q <= 0) {
    tracking(ctx, 0)
    return w
  }
  const top = y - size * 0.78
  const hh = size * 0.98
  const a = ease.outCubic(clamp(q / 0.35)) // 白块右沿
  const b = ease.inOutCubic(clamp((q - 0.3) / 0.7)) // 白块左沿（=文字已露出部分）
  ctx.save()
  ctx.beginPath()
  ctx.rect(x - 4, top - size * 0.2, w * b + 4, size * 1.5)
  ctx.clip()
  ctx.fillStyle = o.color ?? WD2.fg
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(text, x, y)
  ctx.restore()
  if (b < 1) {
    ctx.fillStyle = o.color ?? WD2.fg
    ctx.fillRect(x + w * b, top, Math.max(0, w * a - w * b), hh)
  }
  tracking(ctx, 0)
  return w
}

/** 字距加宽的等宽地名标签（SACRAMENTO / NEVADA / SAN JOSE） */
export function spacedLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, spacing: number, color = 'rgba(255,255,255,0.8)') {
  font(ctx, size, 400, FONT.mono)
  tracking(ctx, spacing)
  ctx.fillStyle = color
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(text, x, y)
  tracking(ctx, 0)
}

/** 方框中间一个点的地标符号（SACRAMENTO 前那种） */
export function boxDot(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color = '#fff') {
  ctx.save()
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = Math.max(1.5, s * 0.14)
  ctx.strokeRect(x - s / 2, y - s / 2, s, s)
  ctx.beginPath()
  ctx.arc(x, y, s * 0.18, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

/** 画一个带 clip 的水平切条故障（把 draw 画出的内容切成水平条，各条随机平移） */
export function sliceDraw(
  ctx: CanvasRenderingContext2D,
  region: { x: number; y: number; w: number; h: number },
  n: number,
  seed: number,
  maxShift: number,
  draw: () => void,
) {
  let y = region.y
  let i = 0
  while (y < region.y + region.h) {
    const bh = Math.max(3, (region.h / n) * (0.3 + h2(i, seed, 1) * 1.4))
    const dx = (h2(i, seed, 2) - 0.5) * 2 * maxShift * (h2(i, seed, 3) < 0.6 ? 1 : 0)
    ctx.save()
    ctx.beginPath()
    ctx.rect(region.x - maxShift, y, region.w + maxShift * 2, bh)
    ctx.clip()
    ctx.translate(dx, 0)
    draw()
    ctx.restore()
    y += bh
    i++
  }
}
