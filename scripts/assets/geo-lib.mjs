// 资产处理共用工具：本地米制投影、线段合并、矩形裁剪、海岸线拼陆地、抽稀、WDGEO 二进制编码。
import { gzipSync } from 'node:zlib'

// ---------------- 投影 ----------------
const R = 6378137
const D2R = Math.PI / 180
/** 本地等距投影：x 向东米、y 向北米（原点 origin=[lon,lat]） */
export function localProj(origin) {
  const [lon0, lat0] = origin
  const kx = R * D2R * Math.cos(lat0 * D2R)
  const ky = R * D2R
  return {
    fwd: (lon, lat) => [(lon - lon0) * kx, (lat - lat0) * ky],
    inv: (x, y) => [lon0 + x / kx, lat0 + y / ky],
  }
}

// ---------------- 几何 ----------------
export function ringArea(pts) {
  let a = 0
  for (let i = 0, n = pts.length; i < n; i++) {
    const p = pts[i]
    const q = pts[(i + 1) % n]
    a += p[0] * q[1] - q[0] * p[1]
  }
  return a / 2
}

export function pointInRing(x, y, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Douglas–Peucker 抽稀（开放折线；闭合环请去掉重复末点后调用并保留首点） */
export function simplify(pts, tol) {
  if (pts.length <= 2 || tol <= 0) return pts
  const keep = new Uint8Array(pts.length)
  keep[0] = keep[pts.length - 1] = 1
  const stack = [[0, pts.length - 1]]
  const t2 = tol * tol
  while (stack.length) {
    const [a, b] = stack.pop()
    const [ax, ay] = pts[a]
    const [bx, by] = pts[b]
    const dx = bx - ax
    const dy = by - ay
    const L2 = dx * dx + dy * dy
    let best = -1
    let bi = -1
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i]
      let d2
      if (L2 === 0) d2 = (px - ax) ** 2 + (py - ay) ** 2
      else {
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2))
        d2 = (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2
      }
      if (d2 > best) {
        best = d2
        bi = i
      }
    }
    if (best > t2) {
      keep[bi] = 1
      stack.push([a, bi], [bi, b])
    }
  }
  return pts.filter((_, i) => keep[i])
}

/** 闭合环抽稀：输入不含重复末点；太小的环返回 null */
export function simplifyRing(ring, tol) {
  if (ring.length < 3) return null
  // 从最远点处断开，避免首点被强制保留造成尖角
  const s = simplify([...ring, ring[0]], tol)
  s.pop()
  return s.length >= 3 ? s : null
}

export function dedupe(pts, eps = 1e-9) {
  const out = []
  for (const p of pts) {
    const q = out[out.length - 1]
    if (!q || Math.abs(q[0] - p[0]) > eps || Math.abs(q[1] - p[1]) > eps) out.push(p)
  }
  return out
}

// ---------------- 线段合并（按端点首尾相接） ----------------
/**
 * 把若干折线按端点拼成更长的链。
 * allowReverse=false 时保持方向（OSM 海岸线：陆地在左手边）。
 * 返回 { closed: 环[], open: 链[] }（环不含重复末点）。
 */
export function joinChains(lines, allowReverse = true) {
  const key = (p) => `${p[0].toFixed(7)},${p[1].toFixed(7)}`
  const pool = lines.filter((l) => l.length >= 2).map((l) => l.slice())
  const closed = []
  const open = []
  const used = new Uint8Array(pool.length)
  const byStart = new Map()
  const byEnd = new Map()
  const add = (m, k, i) => (m.has(k) ? m.get(k).push(i) : m.set(k, [i]))
  pool.forEach((l, i) => {
    add(byStart, key(l[0]), i)
    add(byEnd, key(l[l.length - 1]), i)
  })
  const take = (m, k) => {
    const arr = m.get(k)
    if (!arr) return -1
    for (const i of arr) if (!used[i]) return i
    return -1
  }
  for (let i = 0; i < pool.length; i++) {
    if (used[i]) continue
    used[i] = 1
    let chain = pool[i]
    // 向后延伸
    for (;;) {
      if (key(chain[0]) === key(chain[chain.length - 1]) && chain.length > 3) break
      const ek = key(chain[chain.length - 1])
      let j = take(byStart, ek)
      if (j >= 0) {
        used[j] = 1
        chain = chain.concat(pool[j].slice(1))
        continue
      }
      if (allowReverse) {
        j = take(byEnd, ek)
        if (j >= 0) {
          used[j] = 1
          chain = chain.concat(pool[j].slice().reverse().slice(1))
          continue
        }
      }
      break
    }
    // 向前延伸
    for (;;) {
      if (key(chain[0]) === key(chain[chain.length - 1]) && chain.length > 3) break
      const sk = key(chain[0])
      let j = take(byEnd, sk)
      if (j >= 0) {
        used[j] = 1
        chain = pool[j].slice(0, -1).concat(chain)
        continue
      }
      if (allowReverse) {
        j = take(byStart, sk)
        if (j >= 0) {
          used[j] = 1
          chain = pool[j].slice().reverse().slice(0, -1).concat(chain)
          continue
        }
      }
      break
    }
    if (key(chain[0]) === key(chain[chain.length - 1]) && chain.length > 3) closed.push(chain.slice(0, -1))
    else open.push(chain)
  }
  return { closed, open }
}

// ---------------- 矩形裁剪 ----------------
/** 折线裁剪到矩形 [x0,y0,x1,y1]，返回若干段（Liang–Barsky 逐段） */
export function clipLine(pts, rect) {
  const [x0, y0, x1, y1] = rect
  const out = []
  let cur = null
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i]
    const [bx, by] = pts[i + 1]
    const dx = bx - ax
    const dy = by - ay
    let t0 = 0
    let t1 = 1
    let ok = true
    for (const [p, q] of [
      [-dx, ax - x0],
      [dx, x1 - ax],
      [-dy, ay - y0],
      [dy, y1 - ay],
    ]) {
      if (p === 0) {
        if (q < 0) ok = false
      } else {
        const r = q / p
        if (p < 0) {
          if (r > t1) ok = false
          else if (r > t0) t0 = r
        } else {
          if (r < t0) ok = false
          else if (r < t1) t1 = r
        }
      }
      if (!ok) break
    }
    if (!ok) {
      if (cur) out.push(cur)
      cur = null
      continue
    }
    const A = [ax + t0 * dx, ay + t0 * dy]
    const B = [ax + t1 * dx, ay + t1 * dy]
    if (!cur || t0 > 0) {
      if (cur) out.push(cur)
      cur = [A]
    }
    cur.push(B)
    if (t1 < 1) {
      out.push(cur)
      cur = null
    }
  }
  if (cur) out.push(cur)
  return out.filter((c) => c.length >= 2)
}

/** Sutherland–Hodgman 多边形裁剪到矩形 */
export function clipRing(ring, rect) {
  const [x0, y0, x1, y1] = rect
  let pts = ring
  const edges = [
    (p) => p[0] >= x0,
    (p) => p[0] <= x1,
    (p) => p[1] >= y0,
    (p) => p[1] <= y1,
  ]
  const inter = [
    (a, b) => [x0, a[1] + ((b[1] - a[1]) * (x0 - a[0])) / (b[0] - a[0])],
    (a, b) => [x1, a[1] + ((b[1] - a[1]) * (x1 - a[0])) / (b[0] - a[0])],
    (a, b) => [a[0] + ((b[0] - a[0]) * (y0 - a[1])) / (b[1] - a[1]), y0],
    (a, b) => [a[0] + ((b[0] - a[0]) * (y1 - a[1])) / (b[1] - a[1]), y1],
  ]
  for (let e = 0; e < 4; e++) {
    const inside = edges[e]
    const res = []
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]
      const b = pts[(i + 1) % pts.length]
      const ia = inside(a)
      const ib = inside(b)
      if (ia) res.push(a)
      if (ia !== ib) res.push(inter[e](a, b))
    }
    pts = res
    if (!pts.length) return null
  }
  return pts.length >= 3 ? pts : null
}

/**
 * 海岸线/湖岸线 → 面：链的左手边是「面内」（OSM 海岸线约定：陆地在左）。
 * 与矩形相交的开放链沿矩形边界逆时针补齐；完全在矩形内的闭合链直接成环。
 */
export function stitchArea(chains, closedRings, rect) {
  const [x0, y0, x1, y1] = rect
  const W = x1 - x0
  const H = y1 - y0
  const P = 2 * (W + H)
  const eps = 1e-6
  const sOf = ([x, y]) => {
    if (Math.abs(y - y0) < eps) return x - x0
    if (Math.abs(x - x1) < eps) return W + (y - y0)
    if (Math.abs(y - y1) < eps) return W + H + (x1 - x)
    return 2 * W + H + (y1 - y)
  }
  const corners = [
    [W, [x1, y0]],
    [W + H, [x1, y1]],
    [2 * W + H, [x0, y1]],
    [P, [x0, y0]],
  ]
  const rings = []
  for (const r of closedRings) {
    const c = clipRing(r, rect)
    if (c) rings.push(c)
  }
  const pieces = []
  for (const ch of chains) for (const p of clipLine(ch, rect)) pieces.push(p)
  // 只保留两端都落在边界上的段（数据缺口造成的悬空段丢弃）
  const onEdge = ([x, y]) => Math.abs(x - x0) < eps || Math.abs(x - x1) < eps || Math.abs(y - y0) < eps || Math.abs(y - y1) < eps
  const ps = pieces.filter((p) => onEdge(p[0]) && onEdge(p[p.length - 1])).map((p) => ({ pts: p, sIn: sOf(p[0]), sOut: sOf(p[p.length - 1]), used: false }))
  for (const start of ps) {
    if (start.used) continue
    const ring = []
    let cur = start
    for (let guard = 0; guard < 10000; guard++) {
      cur.used = true
      ring.push(...cur.pts)
      // 从出口逆时针找最近的入口
      let best = null
      let bestD = Infinity
      for (const q of ps) {
        if (q.used && q !== start) continue
        let d = q.sIn - cur.sOut
        if (d < -1e-9) d += P
        if (d < bestD) {
          bestD = d
          best = q
        }
      }
      if (!best) break
      // 补上经过的矩形角点
      const sA = cur.sOut
      for (let k = 0; k < 8; k++) {
        const [cs, cp] = corners[k % 4]
        let d = cs + (k >= 4 ? P : 0) - sA
        if (cs === P && sA < eps) d = P // 起点正好在左下角
        if (d > 1e-9 && d < bestD) ring.push(cp)
      }
      if (best === start) break
      cur = best
    }
    if (ring.length >= 3) rings.push(dedupe(ring))
  }
  return rings
}

// ---------------- WDGEO 二进制容器 ----------------
const TYPES = { i8: Int8Array, u8: Uint8Array, i16: Int16Array, u16: Uint16Array, i32: Int32Array, u32: Uint32Array, f32: Float32Array }

/**
 * 编码：gzip( "WDGEO1\0\0" | u32 头长 | 头 JSON | 对齐到 8 | 各数组（8 字节对齐） )
 * arrays: { name: TypedArray }
 */
export function encodeWdgeo(meta, arrays) {
  const entries = []
  let off = 0
  for (const [name, arr] of Object.entries(arrays)) {
    const type = Object.entries(TYPES).find(([, C]) => arr instanceof C)?.[0]
    if (!type) throw new Error(`不支持的数组类型：${name}`)
    entries.push({ name, type, arr, offset: off })
    off += arr.byteLength
    off = Math.ceil(off / 8) * 8
  }
  const header = { ...meta, arrays: Object.fromEntries(entries.map((e) => [e.name, { type: e.type, offset: e.offset, length: e.arr.length }])) }
  const hj = Buffer.from(JSON.stringify(header), 'utf8')
  const headLen = Math.ceil((12 + hj.length) / 8) * 8
  const buf = Buffer.alloc(headLen + off)
  buf.write('WDGEO1\0\0', 0, 'latin1')
  buf.writeUInt32LE(hj.length, 8)
  hj.copy(buf, 12)
  for (const e of entries) Buffer.from(e.arr.buffer, e.arr.byteOffset, e.arr.byteLength).copy(buf, headLen + e.offset)
  return gzipSync(buf, { level: 9 })
}

/**
 * 把「面集合」「线集合」打包成数组。
 * polys: [{ rings: [[ [x,y]... ]...], props }]；lines: [{ pts, props }]
 * 坐标按 quantum 量化成整数（能放进 i16 就用 i16）。
 */
export function packCollection(prefix, kind, items, quantum, propSpec) {
  const out = {}
  const xy = []
  if (kind === 'poly') {
    const polyStart = [0]
    const ringStart = [0]
    for (const it of items) {
      for (const r of it.rings) {
        for (const [x, y] of r) xy.push(Math.round(x / quantum), Math.round(y / quantum))
        ringStart.push(xy.length / 2)
      }
      polyStart.push(ringStart.length - 1)
    }
    out[`${prefix}.poly`] = Uint32Array.from(polyStart)
    out[`${prefix}.ring`] = Uint32Array.from(ringStart)
  } else {
    const lineStart = [0]
    for (const it of items) {
      for (const [x, y] of it.pts) xy.push(Math.round(x / quantum), Math.round(y / quantum))
      lineStart.push(xy.length / 2)
    }
    out[`${prefix}.line`] = Uint32Array.from(lineStart)
  }
  const max = xy.reduce((m, v) => Math.max(m, Math.abs(v)), 0)
  out[`${prefix}.xy`] = max <= 32767 ? Int16Array.from(xy) : Int32Array.from(xy)
  for (const [name, C] of Object.entries(propSpec ?? {})) out[`${prefix}.${name}`] = C.from(items.map((it) => it.props[name] ?? 0))
  return out
}
