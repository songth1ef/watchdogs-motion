/**
 * WD1 part1 私有工具。凡是可能被其它段复用的，都在 docs/shots/wd1-part1.md 末尾「建议上提到共享库」里列了。
 */
import { clamp, ease, hash, lerp } from '../../../engine/math'
import { FONT, font, measure, tracking } from '../../../fx/text'

/** 关键帧插值：keys 按时间升序，[t, v]；段间用 inOutCubic（ease=false 时线性）。区间外夹紧。 */
export function kf(t: number, keys: [number, number][], smooth = true) {
  if (t <= keys[0][0]) return keys[0][1]
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1] = keys[i]
    if (t <= t1) {
      const [t0, v0] = keys[i - 1]
      const q = (t - t0) / (t1 - t0)
      return lerp(v0, v1, smooth ? ease.inOutCubic(q) : q)
    }
  }
  return keys[keys.length - 1][1]
}

/**
 * 分段线性但速度连续的关键帧（单调三次 Hermite，类似 AE 的「连续贝塞尔」）。
 * 适合相机推拉这种不能在关键帧处顿一下的运动。
 */
export function spline(t: number, keys: [number, number][]) {
  const n = keys.length
  if (t <= keys[0][0]) return keys[0][1]
  if (t >= keys[n - 1][0]) return keys[n - 1][1]
  let i = 1
  while (keys[i][0] < t) i++
  const [x0, y0] = keys[i - 1]
  const [x1, y1] = keys[i]
  const slope = (a: number) => {
    if (a <= 0 || a >= n - 1) {
      const b = a <= 0 ? 1 : n - 1
      return (keys[b][1] - keys[b - 1][1]) / (keys[b][0] - keys[b - 1][0])
    }
    const s0 = (keys[a][1] - keys[a - 1][1]) / (keys[a][0] - keys[a - 1][0])
    const s1 = (keys[a + 1][1] - keys[a][1]) / (keys[a + 1][0] - keys[a][0])
    return s0 * s1 <= 0 ? 0 : (s0 + s1) / 2
  }
  const h = x1 - x0
  const q = (t - x0) / h
  const m0 = slope(i - 1) * h
  const m1 = slope(i) * h
  const q2 = q * q
  const q3 = q2 * q
  return (2 * q3 - 3 * q2 + 1) * y0 + (q3 - 2 * q2 + q) * m0 + (-2 * q3 + 3 * q2) * y1 + (q3 - q2) * m1
}

/** 帧号（30fps） */
export const fr = (t: number) => Math.floor(t * 30 + 1e-6)

/** 块状光标是否亮（原片约 4 帧一翻） */
export const blink = (t: number, period = 8) => fr(t) % period < period / 2

/** 打字进度：从 t0 开始，每秒 cps 个字符，返回显示的字符数 */
export const typed = (t: number, t0: number, cps: number, len: number) => Math.max(0, Math.min(len, Math.floor((t - t0) * cps)))

/** 水平方向压缩/拉伸以适配目标宽度（PEGI 标这类窄体字用） */
export function fitText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, align: 'left' | 'center' = 'left') {
  const w = measure(ctx, text)
  const sx = width / w
  ctx.save()
  ctx.translate(align === 'center' ? x - width / 2 : x, y)
  ctx.scale(sx, 1)
  ctx.fillText(text, 0, 0)
  ctx.restore()
}

export interface TypeBoxOpts {
  text: string
  /** 可见字符数（可为小数，向下取整） */
  n: number
  x: number
  /** 文字基线 */
  y: number
  size: number
  family?: string
  weight?: number | string
  track?: number
  box?: string
  color?: string
  padX?: number
  padTop?: number
  padBottom?: number
  /** 底块宽度：'text' = 随文字增长；'full' = 全文宽度；数值 = 0..1 的擦出进度（按全文宽度） */
  boxMode?: 'text' | 'full' | number
  /** 末尾块光标：true 时在已打出文字后画一个实心块 */
  cursor?: boolean
  cursorW?: number
  /** 从左侧擦除：0..1，擦掉底块和文字的左侧部分 */
  eraseL?: number
  /** 从右侧回删：0..1 */
  eraseR?: number
}

/**
 * WD1 的「打字底块」：底块随文字一起向右长，末尾跟一个块光标；消失时从左往右擦掉。
 * 与 fx/text.ts 的 highlight 不同，这里底块宽度可以跟随已打出的字符（原片大部分标签就是这样）。
 * 返回全文宽度与底块上下沿。
 */
export function typeBox(ctx: CanvasRenderingContext2D, o: TypeBoxOpts) {
  const padX = o.padX ?? o.size * 0.2
  const padTop = o.padTop ?? o.size * 0.12
  const padBottom = o.padBottom ?? o.size * 0.22
  font(ctx, o.size, o.weight ?? 500, o.family ?? FONT.sans)
  tracking(ctx, o.track ?? -o.size * 0.04)
  const full = measure(ctx, o.text)
  const n = Math.floor(clamp(o.n, 0, o.text.length))
  const shown = o.text.slice(0, n)
  const sw = measure(ctx, shown)
  const top = o.y - o.size * 0.78 - padTop
  const bot = o.y + padBottom
  const cw = o.cursorW ?? o.size * 0.5
  let bw: number
  if (o.boxMode === 'full') bw = full + padX * 2
  else if (typeof o.boxMode === 'number') bw = (full + padX * 2) * clamp(o.boxMode)
  else bw = sw + padX * 2 + (o.cursor ? cw : 0)
  const eL = clamp(o.eraseL ?? 0)
  const eR = clamp(o.eraseR ?? 0)
  const x0 = o.x + bw * eL
  const x1 = o.x + bw * (1 - eR)
  if (x1 > x0 && (n > 0 || o.cursor || o.boxMode !== 'text')) {
    ctx.save()
    ctx.beginPath()
    ctx.rect(x0, top - 2, x1 - x0, bot - top + 4)
    ctx.clip()
    ctx.fillStyle = o.box ?? '#fff'
    ctx.fillRect(o.x, top, bw, bot - top)
    ctx.fillStyle = o.color ?? '#000'
    ctx.fillText(shown, o.x + padX, o.y)
    if (o.cursor) {
      ctx.fillStyle = o.color ?? '#000'
      if (o.boxMode === 'text') {
        // 底块本身就是光标：随文字长出的那一截
      } else ctx.fillRect(o.x + padX + sw, top + padTop, cw, bot - top - padTop * 2)
    }
    ctx.restore()
  }
  tracking(ctx, 0)
  return { w: full + padX * 2, top, bot, shownW: sw + padX * 2 }
}

/** 等宽小字块（黄绿色档案小字等），n 行，按 seed 生成类似 "FILE NO. 014-2206-4887" 的乱码行 */
export function fakeLines(seed: number, n: number, minLen = 8, maxLen = 28) {
  const out: string[] = []
  const words = ['HOMELAND', 'OFFICE', 'DALLAS', 'FILE', 'NO.', 'PSYCHIATRIC', 'ASSESSMENT', 'MMPI', 'TEST', 'RESULTS', 'DEMENTIA', 'STAGE', 'INFORMATION', 'REDACTED', 'THIS', 'HAS', 'BEEN', '014-2206-4887', '28-39-44', 'SUBJECT', 'EMPLOYEE', 'GRID', 'NODE']
  for (let i = 0; i < n; i++) {
    const len = minLen + Math.floor(hash(seed * 31 + i) * (maxLen - minLen))
    let s = ''
    let k = 0
    while (s.length < len) s += (s ? ' ' : '') + words[Math.floor(hash(seed * 97 + i * 13 + k++) * words.length)]
    out.push(s)
  }
  return out
}

/** 简单的屏幕空间缩放相机：把一个以 (fx,fy) 为焦点、缩放 s 的变换应用到 ctx */
export function zoomAbout(ctx: CanvasRenderingContext2D, fx: number, fy: number, s: number, tx = 0, ty = 0) {
  ctx.translate(fx + tx, fy + ty)
  ctx.scale(s, s)
  ctx.translate(-fx, -fy)
}

/**
 * 折线「海岸线化」：递归中点位移，把粗糙的多边形变成锯齿状海岸。确定性（按 seed）。
 * minLen 以下的线段不再细分。
 */
export function roughen(pts: [number, number][], seed: number, amount = 0.22, minLen = 5, closed = true): [number, number][] {
  const out: [number, number][] = []
  let k = 0
  const rec = (a: [number, number], b: [number, number], depth: number) => {
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const len = Math.hypot(dx, dy)
    if (len < minLen || depth > 12) {
      out.push(b)
      return
    }
    const off = (hash(seed * 7919 + k++ * 31) - 0.5) * 2 * amount * len
    const m: [number, number] = [(a[0] + b[0]) / 2 - (dy / len) * off, (a[1] + b[1]) / 2 + (dx / len) * off]
    rec(a, m, depth + 1)
    rec(m, b, depth + 1)
  }
  out.push(pts[0])
  const n = closed ? pts.length : pts.length - 1
  for (let i = 0; i < n; i++) rec(pts[i], pts[(i + 1) % pts.length], 0)
  return out
}

const rasterCache = new Map<string, { w: number; h: number; bits: Uint8Array }>()
/**
 * 把文字光栅化成 rows 行高的位图（缓存）。fx/dot-matrix.ts 里有同类实现但没导出位图本身，
 * 这里需要逐格自定义画法（竖双短划 / 迷你文字块），所以单独做一份。
 */
export function rasterText(text: string, rows: number, family: string, weight: number | string = 400) {
  const key = `${text}|${rows}|${family}|${weight}`
  const hit = rasterCache.get(key)
  if (hit) return hit
  const probe = document.createElement('canvas').getContext('2d')!
  probe.font = `${weight} ${rows}px ${family}`
  const w = Math.ceil(probe.measureText(text).width) + 2
  const h = Math.ceil(rows * 1.1)
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d', { willReadFrequently: true })!
  g.font = `${weight} ${rows}px ${family}`
  g.textBaseline = 'top'
  g.fillStyle = '#fff'
  g.fillText(text, 1, 0)
  const d = g.getImageData(0, 0, w, h).data
  const bits = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) bits[i] = d[i * 4 + 3] > 110 ? 1 : 0
  // 裁掉上下空行
  let top = 0
  let bot = h - 1
  const rowEmpty = (y: number) => bits.subarray(y * w, y * w + w).every((b) => !b)
  while (top < bot && rowEmpty(top)) top++
  while (bot > top && rowEmpty(bot)) bot--
  const out = { w, h: bot - top + 1, bits: bits.slice(top * w, (bot + 1) * w) }
  rasterCache.set(key, out)
  return out
}

/** 5×7 点阵字库（只含本段用到的字母）。'#' = 亮格 */
const FONT57: Record<string, string[]> = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  I: ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
}

/** 5×7 点阵位图（字间空 1 列）。返回 w/h/bits，与 rasterText 同形 */
export function bitmap57(text: string) {
  const w = text.length * 6 - 1
  const h = 7
  const bits = new Uint8Array(w * h)
  ;[...text].forEach((ch, k) => {
    const g = FONT57[ch]
    if (!g) return
    for (let j = 0; j < 7; j++) for (let i = 0; i < 5; i++) if (g[j][i] === '#') bits[j * w + k * 6 + i] = 1
  })
  return { w, h, bits }
}
