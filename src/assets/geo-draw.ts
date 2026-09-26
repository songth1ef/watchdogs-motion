/**
 * 区域地理数据（本地米制坐标）的 2D 绘制工具：道路、水体、海岸线、建筑轮廓。
 *
 * MapView 描述「米 → 画布像素」的相似变换（平移 + 缩放 + 旋转，北朝上时 y 取反）：
 *   屏幕 = (ox, oy) + Rot(rot) · ( scale·(x − cx), −scale·(y − cy) )
 * 路径在米空间里构建一次（Path2D 缓存），每帧只换变换矩阵，几万条道路也能逐帧重画。
 */
import { geo, roadRank, type GeoRegion, type Layer, type RegionId } from './geo'

export interface MapView {
  /** 画面中心对准的本地坐标（米） */
  cx: number
  cy: number
  /** 像素 / 米 */
  scale: number
  /** 画面旋转（弧度，正 = 顺时针） */
  rot?: number
  /** 画面中心像素，默认 960,540 */
  ox?: number
  oy?: number
}

export function viewMatrix(v: MapView): [number, number, number, number, number, number] {
  const s = v.scale
  const c = Math.cos(v.rot ?? 0)
  const n = Math.sin(v.rot ?? 0)
  const a = s * c
  const b = s * n
  const cc = s * n
  const d = -s * c
  const ox = v.ox ?? 960
  const oy = v.oy ?? 540
  return [a, b, cc, d, ox - a * v.cx - cc * v.cy, oy - b * v.cx - d * v.cy]
}
export function toScreen(v: MapView, x: number, y: number): [number, number] {
  const [a, b, c, d, e, f] = viewMatrix(v)
  return [a * x + c * y + e, b * x + d * y + f]
}
export function fromScreen(v: MapView, sx: number, sy: number): [number, number] {
  const [a, b, c, d, e, f] = viewMatrix(v)
  const det = a * d - b * c
  const X = sx - e
  const Y = sy - f
  return [(d * X - c * Y) / det, (-b * X + a * Y) / det]
}
/** 让 rect（米）铺满 W×H 画面（contain），pad 为像素边距 */
export function fitView(rect: [number, number, number, number], W = 1920, H = 1080, pad = 0, rot = 0): MapView {
  const [x0, y0, x1, y1] = rect
  const scale = Math.min((W - pad * 2) / (x1 - x0), (H - pad * 2) / (y1 - y0))
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, scale, rot, ox: W / 2, oy: H / 2 }
}
/** 以经纬度为中心的视图 */
export function viewAt(region: GeoRegion, lon: number, lat: number, scale: number, rot = 0, ox = 960, oy = 540): MapView {
  const [cx, cy] = region.toLocal(lon, lat)
  return { cx, cy, scale, rot, ox, oy }
}

// ---------------- Path2D 缓存 ----------------
/** 预设过滤器：道路按等级筛选 */
export const ROAD_FILTERS = {
  all: () => true,
  /** 高速 / 快速路 / 主干 / 次干 */
  major: (cls: number) => roadRank(cls) <= 3,
  /** 三级路以下（街区里的小街） */
  minor: (cls: number) => roadRank(cls) >= 4,
  highway: (cls: number) => roadRank(cls) <= 1,
} satisfies Record<string, (cls: number) => boolean>

const paths = new Map<string, Path2D>()

/**
 * 某图层的 Path2D（米空间，y 向北）。filter 按 props.cls 过滤，filterKey 区分缓存。
 * 面图层的所有环都放进同一个路径，填充请用 'evenodd'（洞自然挖空）。
 */
export function layerPath(regionId: RegionId, layer: keyof GeoRegion['layers'], filter?: (cls: number, i: number) => boolean, filterKey = 'all'): Path2D {
  const key = `${regionId}/${layer}/${filterKey}`
  let p = paths.get(key)
  if (p) return p
  p = new Path2D()
  const L = geo(regionId).layers[layer] as Layer | undefined
  if (L) {
    const cls = L.props.cls
    const xy = L.xy
    if (L.kind === 'line') {
      for (let i = 0; i < L.count; i++) {
        if (filter && !filter(cls ? cls[i] : 0, i)) continue
        const a = L.lineStart[i]
        const b = L.lineStart[i + 1]
        p.moveTo(xy[2 * a], xy[2 * a + 1])
        for (let k = a + 1; k < b; k++) p.lineTo(xy[2 * k], xy[2 * k + 1])
      }
    } else {
      for (let i = 0; i < L.count; i++) {
        if (filter && !filter(cls ? cls[i] : 0, i)) continue
        for (let r = L.polyStart[i]; r < L.polyStart[i + 1]; r++) {
          const a = L.ringStart[r]
          const b = L.ringStart[r + 1]
          p.moveTo(xy[2 * a], xy[2 * a + 1])
          for (let k = a + 1; k < b; k++) p.lineTo(xy[2 * k], xy[2 * k + 1])
          // 不用 closePath()：Chromium 的 Path2D 在几万个子路径时 closePath 极慢（实测 5 万栋楼 20s）
          p.lineTo(xy[2 * a], xy[2 * a + 1])
        }
      }
    }
  }
  paths.set(key, p)
  return p
}

export interface LayerStyle {
  stroke?: string
  fill?: string
  /** 线宽（像素，不随缩放变化）；也可给 widthMeters 让线宽随缩放 */
  width?: number
  widthMeters?: number
  alpha?: number
  dash?: number[]
  filter?: (cls: number, i: number) => boolean
  filterKey?: string
}

/** 在 view 下画某个图层 */
export function drawLayer(ctx: CanvasRenderingContext2D, regionId: RegionId, layer: keyof GeoRegion['layers'], view: MapView, st: LayerStyle) {
  const p = layerPath(regionId, layer, st.filter, st.filterKey ?? (st.filter ? String(st.filter) : 'all'))
  ctx.save()
  ctx.transform(...viewMatrix(view))
  if (st.alpha != null) ctx.globalAlpha *= st.alpha
  if (st.fill) {
    ctx.fillStyle = st.fill
    ctx.fill(p, 'evenodd')
  }
  if (st.stroke) {
    ctx.strokeStyle = st.stroke
    ctx.lineWidth = st.widthMeters ?? (st.width ?? 1) / view.scale
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    if (st.dash) ctx.setLineDash(st.dash.map((d) => d / view.scale))
    ctx.stroke(p)
  }
  ctx.restore()
}

/**
 * 水面：有 land 图层（sf / bay）时，给了 landColor 就先铺水色再盖陆地色；
 * 不给 landColor 则只涂「rect 减陆地」的水面，陆地上已画的内容保留。
 * 芝加哥没有 land 图层，直接画 lake + water。
 */
export function drawWater(ctx: CanvasRenderingContext2D, regionId: RegionId, view: MapView, water: string, landColor?: string) {
  const r = geo(regionId)
  if (r.layers.land) {
    ctx.save()
    ctx.transform(...viewMatrix(view))
    const [x0, y0, x1, y1] = r.rect
    if (landColor) {
      ctx.fillStyle = water
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0)
      ctx.fillStyle = landColor
      ctx.fill(layerPath(regionId, 'land'), 'nonzero')
    } else {
      // 只涂水面（rect 减陆地），陆地上已有的内容（如地形晕渲）保留
      const p = new Path2D()
      p.rect(x0, y0, x1 - x0, y1 - y0)
      p.addPath(layerPath(regionId, 'land'))
      ctx.fillStyle = water
      ctx.fill(p, 'evenodd')
    }
    ctx.restore()
  } else {
    if (r.layers.lake) drawLayer(ctx, regionId, 'lake', view, { fill: water })
    if (r.layers.water) drawLayer(ctx, regionId, 'water', view, { fill: water })
  }
}

/** 常用样式：把区域画成一张地图（离屏 canvas，按 key 缓存），可直接当贴图或 drawImage */
const maps = new Map<string, HTMLCanvasElement>()
export function mapCanvas(key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  let c = maps.get(key)
  if (c) return c
  c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d')!)
  maps.set(key, c)
  return c
}

/** 把覆盖 rect（本地米，图像上边 = 北）的栅格图（如 bayTerrain().hillshade）按 view 画到画布上 */
export function drawRaster(ctx: CanvasRenderingContext2D, img: CanvasImageSource, rect: [number, number, number, number], view: MapView, alpha = 1) {
  const [x0, y0, x1, y1] = rect
  ctx.save()
  ctx.transform(...viewMatrix(view))
  ctx.translate(x0, y1)
  ctx.scale(1, -1)
  ctx.globalAlpha *= alpha
  ctx.drawImage(img, 0, 0, x1 - x0, y1 - y0)
  ctx.restore()
}
