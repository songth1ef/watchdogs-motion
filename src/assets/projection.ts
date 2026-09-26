/**
 * 经纬度 → 画布投影（给 2D 地图镜头用，数据来自 geo.ts 的 world()）。
 *
 * 所有投影都返回 [x, y, 可见]；可见 = false 只出现在正交球面投影的背面。
 * 约定：lon/lat 用度；画布 y 向下；北朝上。
 */
import type { LonLatPoly, LonLatRing } from './geo'

export type Projector = (lon: number, lat: number) => [number, number, boolean]
const D = Math.PI / 180

/** 等距圆柱：以 (lon0, lat0) 为画面中心 (cx, cy)，scale = 像素/度 */
export function equirect(o: { lon0: number; lat0: number; scale: number; cx?: number; cy?: number; scaleY?: number }): Projector {
  const cx = o.cx ?? 960
  const cy = o.cy ?? 540
  const sy = o.scaleY ?? o.scale
  return (lon, lat) => [cx + (lon - o.lon0) * o.scale, cy - (lat - o.lat0) * sy, true]
}

/** 墨卡托：scale = 像素/弧度（赤道处 1° ≈ scale·π/180 像素） */
export function mercator(o: { lon0: number; lat0: number; scale: number; cx?: number; cy?: number }): Projector {
  const cx = o.cx ?? 960
  const cy = o.cy ?? 540
  const my = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (Math.max(-85, Math.min(85, lat)) * D) / 2))
  const y0 = my(o.lat0)
  return (lon, lat) => [cx + (lon - o.lon0) * D * o.scale, cy - (my(lat) - y0) * o.scale, true]
}
/** 墨卡托下「在纬度 lat 处 1 公里 = 多少像素」 */
export const mercatorPxPerKm = (scale: number, lat: number) => scale / (6378.137 * Math.cos(lat * D))

/**
 * 正交球面：视点在 (lon0, lat0) 正上方，roll 为画面旋转（度，正 = 逆时针），r = 球半径像素。
 * 注意 wd1 part1 earth.ts 是透视相机（距球心 4 个半径），轮廓附近与正交投影略有差别。
 */
export function orthographic(o: { lon0: number; lat0: number; r: number; cx?: number; cy?: number; roll?: number }): Projector {
  const cx = o.cx ?? 960
  const cy = o.cy ?? 540
  const sl0 = Math.sin(o.lat0 * D)
  const cl0 = Math.cos(o.lat0 * D)
  const rc = Math.cos((o.roll ?? 0) * D)
  const rs = Math.sin((o.roll ?? 0) * D)
  return (lon, lat) => {
    const l = (lon - o.lon0) * D
    const p = lat * D
    const cp = Math.cos(p)
    const x = cp * Math.sin(l)
    const y = cl0 * Math.sin(p) - sl0 * cp * Math.cos(l)
    const z = sl0 * Math.sin(p) + cl0 * cp * Math.cos(l)
    const X = x * rc - y * rs
    const Y = x * rs + y * rc
    return [cx + X * o.r, cy - Y * o.r, z >= 0]
  }
}

/** 正交投影下的「贴边」版本：背面点径向压到球的轮廓上，适合填充面（不会出现穿过球面的连线） */
export function clampToLimb(proj: Projector, cx: number, cy: number, r: number): Projector {
  return (lon, lat) => {
    const [x, y, vis] = proj(lon, lat)
    if (vis) return [x, y, true]
    const dx = x - cx
    const dy = y - cy
    const L = Math.hypot(dx, dy) || 1
    return [cx + (dx / L) * r, cy + (dy / L) * r, false]
  }
}

// ---------------- 路径构建 ----------------
/** 把一个环/折线加入路径；stroke 模式下遇到不可见点断开，closed 时闭合 */
export function traceRing(ctx: CanvasRenderingContext2D | Path2D, ring: LonLatRing, proj: Projector, closed: boolean, breakHidden = true) {
  let pen = false
  let px = 0
  for (let i = 0; i < ring.length; i += 2) {
    const [x, y, vis] = proj(ring[i], ring[i + 1])
    // 跨越 ±180° 经线（等距/墨卡托）时断开，避免横穿全图的线
    const jump = pen && Math.abs(x - px) > 5000
    if ((breakHidden && !vis) || jump) {
      pen = false
      if (!vis) continue
    }
    if (pen) ctx.lineTo(x, y)
    else ctx.moveTo(x, y)
    pen = true
    px = x
  }
  if (closed && !breakHidden) ctx.closePath()
}

/** 填充面集合（正交投影请先用 clampToLimb 包一层） */
export function fillPolys(ctx: CanvasRenderingContext2D, polys: LonLatPoly[], proj: Projector, style: string) {
  ctx.beginPath()
  for (const p of polys) for (const r of p) traceRing(ctx, r, proj, true, false)
  ctx.fillStyle = style
  ctx.fill('evenodd')
}

/** 描边环/线集合；不可见段自动断开 */
export function strokeRings(ctx: CanvasRenderingContext2D, rings: LonLatRing[], proj: Projector, style: string, width = 1, closed = true) {
  ctx.beginPath()
  for (const r of rings) {
    traceRing(ctx, r, proj, false, true)
    if (closed && r.length >= 4) {
      // 闭合：补最后一段
      const [x0, y0, v0] = proj(r[0], r[1])
      const [x1, y1, v1] = proj(r[r.length - 2], r[r.length - 1])
      if (v0 && v1) {
        ctx.moveTo(x1, y1)
        ctx.lineTo(x0, y0)
      }
    }
  }
  ctx.strokeStyle = style
  ctx.lineWidth = width
  ctx.stroke()
}
/** 面集合的所有环（描边国界/州界用） */
export const ringsOf = (polys: LonLatPoly[]) => polys.flat()

// ---------------- 点阵（WD2 世界地图数据点等） ----------------
const dotCache = new Map<string, Float32Array>()
/**
 * 陆地规则点阵：每 step 度一个点（纬度 -60..85），返回交错 [lon, lat, ...]。
 * 用一张离屏等距圆柱栅格做点内判定，结果按 key 缓存。
 */
export function landDots(land: LonLatPoly[], step = 1, key = 'default'): Float32Array {
  const k = `${key}/${step}`
  const c = dotCache.get(k)
  if (c) return c
  const W = 2048
  const H = 1024
  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  const g = cv.getContext('2d', { willReadFrequently: true })!
  fillPolys(g, land, equirect({ lon0: 0, lat0: 0, scale: W / 360, cx: W / 2, cy: H / 2 }), '#fff')
  const px = g.getImageData(0, 0, W, H).data
  const out: number[] = []
  for (let lat = 85; lat >= -60; lat -= step)
    for (let lon = -180 + step / 2; lon < 180; lon += step) {
      const x = Math.floor(((lon + 180) / 360) * W)
      const y = Math.floor(((90 - lat) / 180) * H)
      if (px[(y * W + x) * 4] > 127) out.push(lon, lat)
    }
  const arr = Float32Array.from(out)
  dotCache.set(k, arr)
  return arr
}
