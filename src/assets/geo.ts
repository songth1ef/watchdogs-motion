/**
 * 真实地理数据加载器（OpenStreetMap / Natural Earth / AWS Terrain Tiles 预处理产物，见 docs/assets.md）。
 *
 * 镜头渲染是时间的纯函数，不能在 render() 里等网络：
 *   1. 启动时 `preloadAssets()`（src/main.ts 的 ready 流程已调用）把所有资产异步加载进内存；
 *   2. 镜头里用同步取用函数 `geo('chicago')` / `world()` / `bayTerrain()`，未加载完会抛错（而不是悄悄画空）。
 *   `hasGeo()` 可用来在资产缺失时回退到程序化替代品。
 *
 * 坐标系（区域数据）：本地米制，x = 向东米，y = 向北米，原点 = region.origin（经纬度）。
 *   2D 画布上 y 要取反（见 geo-draw.ts 的 MapView）；three.js 里约定 X = x、Z = -y、Y = 高度（见 three/real-city.ts）。
 */

export type RegionId = 'chicago' | 'sf' | 'bay'
type TA = Int8Array | Uint8Array | Int16Array | Uint16Array | Int32Array | Uint32Array | Float32Array

/** 面集合：第 i 个面的环 = ringStart[polyStart[i] .. polyStart[i+1]]，第 r 个环的点 = xy[2*ringStart[r] .. 2*ringStart[r+1]] */
export interface PolyLayer {
  kind: 'poly'
  count: number
  polyStart: Uint32Array
  ringStart: Uint32Array
  /** 交错的 x,y（米） */
  xy: Float32Array
  props: Record<string, TA>
}
/** 线集合：第 i 条线的点 = xy[2*lineStart[i] .. 2*lineStart[i+1]] */
export interface LineLayer {
  kind: 'line'
  count: number
  lineStart: Uint32Array
  xy: Float32Array
  props: Record<string, TA>
}
export type Layer = PolyLayer | LineLayer

export interface GeoRegion {
  id: RegionId
  /** 本地坐标原点 [lon, lat] */
  origin: [number, number]
  /** [west, south, east, north] */
  bboxLonLat: [number, number, number, number]
  /** 数据覆盖范围（米）[x0, y0, x1, y1] */
  rect: [number, number, number, number]
  layers: {
    /** 建筑（props.h / props.min：分米；props.src：高度来源） */
    buildings?: PolyLayer
    /** 道路（props.cls：见 ROAD） */
    roads?: LineLayer
    /** 铁路 / CTA L 线（props.cls：0 rail 1 subway 2 light_rail 3 elevated；0x40 隧道） */
    rail?: LineLayer
    /** 河道中心线 */
    rivers?: LineLayer
    /** 河道/池塘水面 */
    water?: PolyLayer
    /** 密歇根湖水面（已沿 bbox 补边闭合） */
    lake?: PolyLayer
    /** 湖岸线 */
    shore?: LineLayer
    /** 陆地面（海岸线拼接，bbox 内；水面 = rect 减去 land） */
    land?: PolyLayer
    /** 海岸线 */
    coast?: LineLayer
  }
  toLocal(lon: number, lat: number): [number, number]
  toLonLat(x: number, y: number): [number, number]
}

/** 道路等级（roads.props.cls 的低 4 位） */
export const ROAD = {
  motorway: 0,
  trunk: 1,
  primary: 2,
  secondary: 3,
  tertiary: 4,
  residential: 5,
  unclassified: 6,
  living_street: 7,
  LINK: 0x10,
  BRIDGE: 0x20,
  TUNNEL: 0x40,
} as const
export const roadRank = (cls: number) => cls & 0x0f

const BASE = import.meta.env.BASE_URL + 'assets/geo/'

// ---------------- 通用：取文件 + gzip 解压 ----------------
export async function fetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`资产加载失败 ${res.status}：${url}`)
  const buf = new Uint8Array(await res.arrayBuffer())
  // 服务器可能已经按 Content-Encoding 解过压：看魔数决定
  if (buf[0] === 0x1f && buf[1] === 0x8b) {
    const ds = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))
    return new Uint8Array(await new Response(ds).arrayBuffer())
  }
  return buf
}

const CTORS: Record<string, new (b: ArrayBuffer, o: number, l: number) => TA> = {
  i8: Int8Array,
  u8: Uint8Array,
  i16: Int16Array,
  u16: Uint16Array,
  i32: Int32Array,
  u32: Uint32Array,
  f32: Float32Array,
}

/** 解码 WDGEO 容器（格式见 scripts/assets/geo-lib.mjs encodeWdgeo） */
export function decodeWdgeo(bytes: Uint8Array) {
  const magic = String.fromCharCode(...bytes.subarray(0, 6))
  if (magic !== 'WDGEO1') throw new Error('不是 WDGEO 文件')
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const hl = dv.getUint32(8, true)
  const header = JSON.parse(new TextDecoder().decode(bytes.subarray(12, 12 + hl)))
  const base = Math.ceil((12 + hl) / 8) * 8
  // 拷到对齐的新缓冲区，保证 TypedArray 视图对齐
  const body = bytes.slice(base).buffer
  const arrays: Record<string, TA> = {}
  for (const [name, a] of Object.entries(header.arrays as Record<string, { type: string; offset: number; length: number }>)) arrays[name] = new CTORS[a.type](body, a.offset, a.length)
  return { header, arrays }
}

function toRegion(id: RegionId, bytes: Uint8Array): GeoRegion {
  const { header, arrays } = decodeWdgeo(bytes)
  const q: number = header.quantum
  const layers: Record<string, Layer> = {}
  for (const [name, info] of Object.entries(header.layers as Record<string, { kind: 'poly' | 'line'; count: number }>)) {
    const raw = arrays[`${name}.xy`]
    const xy = new Float32Array(raw.length)
    for (let i = 0; i < raw.length; i++) xy[i] = raw[i] * q
    const props: Record<string, TA> = {}
    for (const k of Object.keys(arrays)) {
      const [ln, pn] = k.split('.')
      if (ln === name && !['xy', 'poly', 'ring', 'line'].includes(pn)) props[pn] = arrays[k]
    }
    layers[name] =
      info.kind === 'poly'
        ? { kind: 'poly', count: info.count, polyStart: arrays[`${name}.poly`] as Uint32Array, ringStart: arrays[`${name}.ring`] as Uint32Array, xy, props }
        : { kind: 'line', count: info.count, lineStart: arrays[`${name}.line`] as Uint32Array, xy, props }
  }
  const [lon0, lat0] = header.origin as [number, number]
  const R = 6378137
  const d2r = Math.PI / 180
  const kx = R * d2r * Math.cos(lat0 * d2r)
  const ky = R * d2r
  return {
    id,
    origin: [lon0, lat0],
    bboxLonLat: header.bboxLonLat,
    rect: header.rect,
    layers: layers as GeoRegion['layers'],
    toLocal: (lon, lat) => [(lon - lon0) * kx, (lat - lat0) * ky],
    toLonLat: (x, y) => [lon0 + x / kx, lat0 + y / ky],
  }
}

// ---------------- 区域（芝加哥 / 旧金山半岛 / 湾区） ----------------
const regions = new Map<RegionId, GeoRegion>()
const pending = new Map<string, Promise<unknown>>()

function once<T>(key: string, f: () => Promise<T>): Promise<T> {
  if (!pending.has(key)) pending.set(key, f())
  return pending.get(key) as Promise<T>
}

export function loadGeo(id: RegionId): Promise<GeoRegion> {
  return once(`geo:${id}`, async () => {
    const r = toRegion(id, await fetchBytes(`${BASE}${id}.wdgeo.gz`))
    regions.set(id, r)
    return r
  })
}
export const hasGeo = (id: RegionId) => regions.has(id)
/** 同步取用（必须先 preloadAssets / loadGeo） */
export function geo(id: RegionId): GeoRegion {
  const r = regions.get(id)
  if (!r) throw new Error(`地理资产 ${id} 还没加载：先在启动流程里 await loadGeo('${id}')`)
  return r
}

// ---------------- 迭代工具 ----------------
/** 遍历面：cb(i, rings)，rings 为每个环的 [起点下标, 终点下标)（点下标，xy 下标需 ×2） */
export function forEachPoly(layer: PolyLayer, cb: (i: number, rings: [number, number][]) => void) {
  const { polyStart, ringStart } = layer
  for (let i = 0; i < layer.count; i++) {
    const rings: [number, number][] = []
    for (let r = polyStart[i]; r < polyStart[i + 1]; r++) rings.push([ringStart[r], ringStart[r + 1]])
    cb(i, rings)
  }
}
/** 面的外环包围盒中心（米） */
export function polyCenter(layer: PolyLayer, i: number): [number, number] {
  const r = layer.polyStart[i]
  const a = layer.ringStart[r]
  const b = layer.ringStart[r + 1]
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (let k = a; k < b; k++) {
    const x = layer.xy[2 * k]
    const y = layer.xy[2 * k + 1]
    if (x < x0) x0 = x
    if (x > x1) x1 = x
    if (y < y0) y0 = y
    if (y > y1) y1 = y
  }
  return [(x0 + x1) / 2, (y0 + y1) / 2]
}
/** 建筑高度（米） */
export const buildingHeight = (b: PolyLayer, i: number) => b.props.h[i] / 10
export const buildingBase = (b: PolyLayer, i: number) => b.props.min[i] / 10

// ---------------- 世界矢量（Natural Earth） ----------------
/** 经纬度折线/环：交错 [lon, lat, lon, lat, ...] */
export type LonLatRing = Float32Array
/** 面 = 环数组（首环外环，其余为洞） */
export type LonLatPoly = LonLatRing[]
export interface WorldGeo {
  res: '50m' | '110m'
  land: LonLatPoly[]
  coast: LonLatRing[]
  countries: { name: string; iso: string; polys: LonLatPoly[] }[]
  /** 仅 50m：美国州 + 加拿大省（湖面已切掉） */
  states: { name: string; postal: string; country: 'USA' | 'CAN'; polys: LonLatPoly[] }[]
  /** 仅 50m：有名字的湖（五大湖：Lake Superior / Michigan / Huron / Erie / Ontario） */
  lakes: { name: string; polys: LonLatPoly[] }[]
  /** 仅 50m：城市 [名称, 国家 ISO3, lon, lat, 人口]，按人口降序（美国全收，其他国家 ≥30 万） */
  cities: [string, string, number, number, number][]
}
const worlds = new Map<string, WorldGeo>()

function decRing(a: number[], q: number): Float32Array {
  const out = new Float32Array(a.length)
  let x = 0
  let y = 0
  for (let i = 0; i < a.length; i += 2) {
    x += a[i]
    y += a[i + 1]
    out[i] = x / q
    out[i + 1] = y / q
  }
  return out
}

export function loadWorld(res: '50m' | '110m' = '50m'): Promise<WorldGeo> {
  return once(`world:${res}`, async () => {
    const j = JSON.parse(new TextDecoder().decode(await fetchBytes(`${BASE}world-${res}.json.gz`)))
    const q = j.q
    const P = (polys: number[][][]) => polys.map((p) => p.map((r) => decRing(r, q)))
    const w: WorldGeo = {
      res,
      land: P(j.land),
      coast: j.coast.map((r: number[]) => decRing(r, q)),
      countries: j.countries.map((c: { name: string; iso: string; polys: number[][][] }) => ({ name: c.name, iso: c.iso, polys: P(c.polys) })),
      states: (j.states ?? []).map((s: { name: string; postal: string; country: 'USA' | 'CAN'; polys: number[][][] }) => ({ ...s, polys: P(s.polys) })),
      lakes: (j.lakes ?? []).map((l: { name: string; polys: number[][][] }) => ({ name: l.name, polys: P(l.polys) })),
      cities: j.cities ?? [],
    }
    worlds.set(res, w)
    return w
  })
}
export const hasWorld = (res: '50m' | '110m' = '50m') => worlds.has(res)
export function world(res: '50m' | '110m' = '50m'): WorldGeo {
  const w = worlds.get(res)
  if (!w) throw new Error(`世界矢量 ${res} 还没加载：先 await loadWorld('${res}')`)
  return w
}
export const GREAT_LAKES = ['Lake Superior', 'Lake Michigan', 'Lake Huron', 'Lake Erie', 'Lake Ontario'] as const

// ---------------- 湾区地形（晕渲 / 高程栅格） ----------------
export interface Terrain {
  /** 晕渲（灰度，水面纯黑） */
  hillshade: HTMLImageElement
  /** 高程：像素值 × 1000/255 = 米 */
  elevation: HTMLImageElement
  /** 栅格覆盖的本地米制范围（bay 区域坐标）[x0, y0, x1, y1]，图像上边 = y1（北） */
  rect: [number, number, number, number]
  metersPerPixel: number
}
let terrain: Terrain | null = null

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((ok, fail) => {
    const im = new Image()
    im.decoding = 'async'
    im.onload = () => ok(im)
    im.onerror = () => fail(new Error(`图片加载失败：${url}`))
    im.src = url
  })
}

export function loadBayTerrain(): Promise<Terrain> {
  return once('terrain:bay', async () => {
    const [meta, hillshade, elevation] = await Promise.all([
      fetch(`${BASE}bay-terrain.json`).then((r) => r.json()),
      loadImage(`${BASE}bay-hillshade.jpg`),
      loadImage(`${BASE}bay-elevation.png`),
    ])
    terrain = { hillshade, elevation, rect: meta.rect, metersPerPixel: meta.metersPerPixel }
    return terrain
  })
}
export const hasBayTerrain = () => !!terrain
export function bayTerrain(): Terrain {
  if (!terrain) throw new Error('湾区地形还没加载：先 await loadBayTerrain()')
  return terrain
}
