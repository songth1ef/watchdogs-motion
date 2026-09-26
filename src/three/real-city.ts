/**
 * 真实城市（OSM 建筑轮廓 + 高度）的 three.js 构建函数。数据来自 src/assets/geo.ts（需先预加载）。
 *
 * 坐标约定：three 世界 X = 向东、Z = 向南（= −北）、Y = 高度；1 世界单位 = 1/scale 米。
 * 默认以 center（芝加哥 = State & Madison）为原点，radius 米以内的建筑。
 *
 * 性能：所有建筑合并成「一个」BufferGeometry（墙 + 屋顶共享顶点，flatShading 出面法线），
 * 芝加哥全量 ~5.4 万栋 ≈ 75 万顶点，一次 draw call；边线同理合并为一个 LineSegments。
 */
import * as THREE from 'three'
import { geo, type GeoRegion, type LineLayer, type PolyLayer, type RegionId } from '../assets/geo'

export type CityStyle = 'clay' | 'wire' | 'dark'

export interface RealCityOpts {
  region?: RegionId
  style: CityStyle
  /** 中心：本地米坐标；或用 centerLonLat 给经纬度。默认区域原点 */
  center?: [number, number]
  centerLonLat?: [number, number]
  /** 只取中心 radius 米内的建筑（按外环中心判断），默认全部 */
  radius?: number
  /** 或者用矩形（本地米）筛选 [x0, y0, x1, y1] */
  rect?: [number, number, number, number]
  /** 世界单位 / 米，默认 1 */
  scale?: number
  /** 高度夸张倍数，默认 1 */
  heightScale?: number
  /** 丢弃低于该高度（米）/ 面积（平方米）的建筑，用来减面 */
  minHeight?: number
  minArea?: number
  /** 以 center 为世界原点（默认 true）；false 时世界原点 = 区域原点 */
  recenter?: boolean
  /** 建筑颜色 / 亮度抖动（0..1，按建筑序号确定性抖动，给素模一点层次） */
  color?: THREE.ColorRepresentation
  jitter?: number
  /** 边线：wire / dark 默认开启 */
  edges?: boolean
  edgeColor?: THREE.ColorRepresentation
  edgeOpacity?: number
  /** 竖向棱线：相邻两边转角大于该角度（度）才画，默认 25 */
  edgeAngle?: number
  /** 地面板颜色；false = 不要地面。clay 默认纯黑（原片街道是黑的），dark 默认 0x141414，wire 默认无 */
  ground?: THREE.ColorRepresentation | false
  /** 水面（湖 + 河）颜色；false = 不画。默认：wire 不画，其余略暗于地面 */
  water?: THREE.ColorRepresentation | false
  /** 道路线（贴地 LineSegments）：false 不画；可给等级过滤 */
  roads?: false | { color?: THREE.ColorRepresentation; opacity?: number; filter?: (cls: number) => boolean }
}

export interface RealCity {
  group: THREE.Group
  mesh: THREE.Mesh | null
  edges: THREE.LineSegments | null
  count: number
  /** 本地米坐标 → three 世界坐标 */
  toWorld(x: number, y: number, h?: number): THREE.Vector3
  /** 经纬度 → three 世界坐标 */
  fromLonLat(lon: number, lat: number, h?: number): THREE.Vector3
  /** 选中建筑的世界包围盒 */
  bounds: THREE.Box3
}

const hash01 = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

/** 构建真实城市 Group（调用方负责 memo 缓存，和 three/city.ts 一样） */
export function buildRealCity(o: RealCityOpts): RealCity {
  const R: GeoRegion = geo(o.region ?? 'chicago')
  const s = o.scale ?? 1
  const hs = o.heightScale ?? 1
  const center = o.centerLonLat ? R.toLocal(o.centerLonLat[0], o.centerLonLat[1]) : (o.center ?? [0, 0])
  const [ox, oy] = o.recenter === false ? [0, 0] : center
  const toWorld = (x: number, y: number, h = 0) => new THREE.Vector3((x - ox) * s, h * s, -(y - oy) * s)
  const group = new THREE.Group()
  const style = o.style
  const B = R.layers.buildings
  const inside = makeFilter(center, o.radius, o.rect)

  let mesh: THREE.Mesh | null = null
  let edges: THREE.LineSegments | null = null
  let count = 0
  const bounds = new THREE.Box3()
  if (B) {
    const built = extrude(B, { inside, s, hs, ox, oy, minH: o.minHeight ?? 0, minA: o.minArea ?? 0, jitter: o.jitter ?? 0, edges: o.edges ?? style !== 'clay', edgeAngle: o.edgeAngle ?? 25, wire: style === 'wire' })
    count = built.count
    bounds.copy(built.bounds)
    if (style !== 'wire') {
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(built.pos, 3))
      if (built.col) g.setAttribute('color', new THREE.Float32BufferAttribute(built.col, 3))
      g.setIndex(built.idx.length > 65535 ? new THREE.Uint32BufferAttribute(built.idx, 1) : new THREE.Uint16BufferAttribute(built.idx, 1))
      const color = o.color ?? (style === 'clay' ? 0xf2f2f2 : 0x8a8a8a)
      const mat =
        style === 'clay'
          ? new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0, flatShading: true, vertexColors: !!built.col })
          : new THREE.MeshLambertMaterial({ color, flatShading: true, vertexColors: !!built.col })
      mesh = new THREE.Mesh(g, mat)
      mesh.castShadow = style === 'clay'
      mesh.receiveShadow = style === 'clay'
      group.add(mesh)
    }
    if (built.edgePos.length) {
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(built.edgePos, 3))
      edges = new THREE.LineSegments(
        g,
        new THREE.LineBasicMaterial({ color: o.edgeColor ?? 0xffffff, transparent: true, opacity: o.edgeOpacity ?? (style === 'wire' ? 0.55 : 0.35), depthWrite: style !== 'wire' }),
      )
      group.add(edges)
    }
  }

  // 地面 / 水面 / 道路
  const groundColor = o.ground ?? (style === 'clay' ? 0x000000 : style === 'dark' ? 0x141414 : false)
  const area = selectionRect(R, center, o.radius, o.rect)
  if (groundColor !== false) {
    const [x0, y0, x1, y1] = area
    const plane = new THREE.Mesh(new THREE.PlaneGeometry((x1 - x0) * s, (y1 - y0) * s), new THREE.MeshBasicMaterial({ color: groundColor }))
    plane.rotation.x = -Math.PI / 2
    plane.position.copy(toWorld((x0 + x1) / 2, (y0 + y1) / 2, -0.05))
    plane.receiveShadow = style === 'clay'
    group.add(plane)
  }
  const waterColor = o.water ?? (style === 'wire' ? false : style === 'clay' ? 0x050505 : 0x0b0b0b)
  if (waterColor !== false) {
    for (const name of ['lake', 'water'] as const) {
      const L = R.layers[name]
      if (L) group.add(buildGeoPolys(L, { color: waterColor, s, ox, oy, y: 0.02, clip: area }))
    }
  }
  if (o.roads) {
    const L = R.layers.roads
    if (L) group.add(buildGeoLines(L, { color: o.roads.color ?? 0x00c8d8, opacity: o.roads.opacity ?? 0.8, filter: o.roads.filter, s, ox, oy, y: 0.1, clip: area }))
  }
  return { group, mesh, edges, count, toWorld, fromLonLat: (lon, lat, h = 0) => toWorld(...R.toLocal(lon, lat), h), bounds }
}

function makeFilter(center: [number, number], radius?: number, rect?: [number, number, number, number]) {
  return (x: number, y: number) => {
    if (rect && (x < rect[0] || x > rect[2] || y < rect[1] || y > rect[3])) return false
    if (radius != null && Math.hypot(x - center[0], y - center[1]) > radius) return false
    return true
  }
}
function selectionRect(R: GeoRegion, center: [number, number], radius?: number, rect?: [number, number, number, number]): [number, number, number, number] {
  let r: [number, number, number, number] = [...R.rect]
  if (rect) r = [Math.max(r[0], rect[0]), Math.max(r[1], rect[1]), Math.min(r[2], rect[2]), Math.min(r[3], rect[3])]
  if (radius != null) r = [Math.max(r[0], center[0] - radius), Math.max(r[1], center[1] - radius), Math.min(r[2], center[0] + radius), Math.min(r[3], center[1] + radius)]
  return r
}

// ---------------- 挤出 ----------------
function extrude(
  B: PolyLayer,
  o: { inside: (x: number, y: number) => boolean; s: number; hs: number; ox: number; oy: number; minH: number; minA: number; jitter: number; edges: boolean; edgeAngle: number; wire: boolean },
) {
  const pos: number[] = []
  const idx: number[] = []
  const col: number[] | null = o.jitter > 0 ? [] : null
  const edgePos: number[] = []
  const bounds = new THREE.Box3()
  const cosT = Math.cos((o.edgeAngle * Math.PI) / 180)
  const { xy, polyStart, ringStart } = B
  const H = B.props.h
  const MIN = B.props.min
  let count = 0
  const X = (x: number) => (x - o.ox) * o.s
  const Z = (y: number) => -(y - o.oy) * o.s
  for (let i = 0; i < B.count; i++) {
    const r0 = polyStart[i]
    const a0 = ringStart[r0]
    const b0 = ringStart[r0 + 1]
    // 外环中心 + 面积
    let cx = 0
    let cy = 0
    let area = 0
    for (let k = a0; k < b0; k++) {
      const k2 = k + 1 < b0 ? k + 1 : a0
      cx += xy[2 * k]
      cy += xy[2 * k + 1]
      area += xy[2 * k] * xy[2 * k2 + 1] - xy[2 * k2] * xy[2 * k + 1]
    }
    cx /= b0 - a0
    cy /= b0 - a0
    area = Math.abs(area) / 2
    const hM = H[i] / 10
    if (!o.inside(cx, cy) || hM < o.minH || area < o.minA) continue
    count++
    const top = hM * o.hs * o.s
    const bot = (MIN[i] / 10) * o.hs * o.s
    const tint = col ? 1 - o.jitter * hash01(i) : 1
    // 每个环：底 + 顶两圈顶点
    const contour: THREE.Vector2[] = []
    const holes: THREE.Vector2[][] = []
    const topBase: number[] = [] // 每个环顶圈的起始顶点号
    for (let r = r0; r < polyStart[i + 1]; r++) {
      const a = ringStart[r]
      const b = ringStart[r + 1]
      const n = b - a
      const base = pos.length / 3
      for (let k = a; k < b; k++) pos.push(X(xy[2 * k]), bot, Z(xy[2 * k + 1]))
      for (let k = a; k < b; k++) pos.push(X(xy[2 * k]), top, Z(xy[2 * k + 1]))
      if (col) for (let k = 0; k < n * 2; k++) col.push(tint, tint, tint)
      topBase.push(base + n)
      // 墙：外环逆时针（北朝上）→ 在 three 里 (A0,B0,B1)(A0,B1,A1) 朝外
      for (let k = 0; k < n; k++) {
        const k2 = (k + 1) % n
        idx.push(base + k, base + k2, base + n + k2, base + k, base + n + k2, base + n + k)
      }
      const ring = []
      for (let k = a; k < b; k++) ring.push(new THREE.Vector2(xy[2 * k], xy[2 * k + 1]))
      if (r === r0) contour.push(...ring)
      else holes.push(ring)
      bounds.expandByPoint(new THREE.Vector3(X(xy[2 * a]), top, Z(xy[2 * a + 1])))
      bounds.expandByPoint(new THREE.Vector3(X(xy[2 * a]), bot, Z(xy[2 * a + 1])))
      // 边线：顶圈（wire 再加底圈）+ 转角竖线
      if (o.edges) {
        for (let k = 0; k < n; k++) {
          const p = a + k
          const q = a + ((k + 1) % n)
          const px = X(xy[2 * p]), pz = Z(xy[2 * p + 1]), qx = X(xy[2 * q]), qz = Z(xy[2 * q + 1])
          edgePos.push(px, top, pz, qx, top, qz)
          if (o.wire) edgePos.push(px, bot, pz, qx, bot, qz)
          // 转角判断：前一边与后一边夹角
          const m = a + ((k + n - 1) % n)
          const ux = xy[2 * p] - xy[2 * m], uy = xy[2 * p + 1] - xy[2 * m + 1]
          const vx = xy[2 * q] - xy[2 * p], vy = xy[2 * q + 1] - xy[2 * p + 1]
          const c = (ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy) || 1)
          if (c < cosT) edgePos.push(px, bot, pz, px, top, pz)
        }
      }
    }
    // 屋顶：耳切三角化（外环 + 洞），索引映射回顶圈顶点
    const faces = THREE.ShapeUtils.triangulateShape(contour, holes)
    const map: number[] = []
    let ri = 0
    for (const ring of [contour, ...holes]) {
      for (let k = 0; k < ring.length; k++) map.push(topBase[ri] + k)
      ri++
    }
    for (const [f0, f1, f2] of faces) {
      const A = map[f0], Bv = map[f1], C = map[f2]
      // 保证法线朝上
      const ax = pos[3 * A], az = pos[3 * A + 2]
      const cyv = (pos[3 * Bv + 2] - az) * (pos[3 * C] - ax) - (pos[3 * Bv] - ax) * (pos[3 * C + 2] - az)
      if (cyv >= 0) idx.push(A, Bv, C)
      else idx.push(A, C, Bv)
    }
  }
  return { pos, idx, col, edgePos, count, bounds }
}

// ---------------- 贴地线 / 面 ----------------
export interface FlatOpts {
  color: THREE.ColorRepresentation
  opacity?: number
  /** 世界单位 / 米 */
  s?: number
  /** 世界原点对应的本地米坐标 */
  ox?: number
  oy?: number
  /** 离地高度（世界单位） */
  y?: number
  filter?: (cls: number) => boolean
  /** 只保留与该矩形（本地米）相交的要素 */
  clip?: [number, number, number, number]
}

/** 线图层（道路 / 铁路 / 岸线）→ 贴地 LineSegments */
export function buildGeoLines(L: LineLayer, o: FlatOpts): THREE.LineSegments {
  const s = o.s ?? 1
  const ox = o.ox ?? 0
  const oy = o.oy ?? 0
  const y = o.y ?? 0
  const pos: number[] = []
  const cls = L.props.cls
  const c = o.clip
  for (let i = 0; i < L.count; i++) {
    if (o.filter && !o.filter(cls ? cls[i] : 0)) continue
    for (let k = L.lineStart[i]; k < L.lineStart[i + 1] - 1; k++) {
      const x1 = L.xy[2 * k], y1 = L.xy[2 * k + 1], x2 = L.xy[2 * k + 2], y2 = L.xy[2 * k + 3]
      if (c && ((x1 < c[0] && x2 < c[0]) || (x1 > c[2] && x2 > c[2]) || (y1 < c[1] && y2 < c[1]) || (y1 > c[3] && y2 > c[3]))) continue
      pos.push((x1 - ox) * s, y, -(y1 - oy) * s, (x2 - ox) * s, y, -(y2 - oy) * s)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: o.color, transparent: (o.opacity ?? 1) < 1, opacity: o.opacity ?? 1 }))
}

/** 面图层（水面 / 陆地）→ 贴地平面 Mesh */
export function buildGeoPolys(L: PolyLayer, o: FlatOpts): THREE.Mesh {
  const s = o.s ?? 1
  const ox = o.ox ?? 0
  const oy = o.oy ?? 0
  const y = o.y ?? 0
  const pos: number[] = []
  const c = o.clip
  for (let i = 0; i < L.count; i++) {
    const rings: THREE.Vector2[][] = []
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (let r = L.polyStart[i]; r < L.polyStart[i + 1]; r++) {
      const ring: THREE.Vector2[] = []
      for (let k = L.ringStart[r]; k < L.ringStart[r + 1]; k++) {
        const X = L.xy[2 * k], Y = L.xy[2 * k + 1]
        ring.push(new THREE.Vector2(X, Y))
        if (r === L.polyStart[i]) {
          x0 = Math.min(x0, X); x1 = Math.max(x1, X); y0 = Math.min(y0, Y); y1 = Math.max(y1, Y)
        }
      }
      rings.push(ring)
    }
    if (c && (x1 < c[0] || x0 > c[2] || y1 < c[1] || y0 > c[3])) continue
    const [outer, ...holes] = rings
    const all = [outer, ...holes].flat()
    for (const [a, b, d] of THREE.ShapeUtils.triangulateShape(outer, holes)) {
      const A = all[a], Bv = all[b], D = all[d]
      // 朝上：本地 (x,y) 逆时针 → three 里 y 取反后需要反转
      const cross = (Bv.x - A.x) * (D.y - A.y) - (Bv.y - A.y) * (D.x - A.x)
      const tri = cross > 0 ? [A, Bv, D] : [A, D, Bv]
      for (const p of tri) pos.push((p.x - ox) * s, y, -(p.y - oy) * s)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: o.color, transparent: (o.opacity ?? 1) < 1, opacity: o.opacity ?? 1, side: THREE.DoubleSide }))
}
