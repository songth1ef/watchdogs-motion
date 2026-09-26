// 把 fetch-osm.mjs 下载的 OSM 原始 JSON 处理成 public/assets/geo/<region>.wdgeo.gz。
// 用法：node scripts/assets/build-geo.mjs [region]
// 处理：本地米制投影（x 东 / y 北）→ 抽稀 → 量化 → WDGEO 二进制 + gzip。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { OUT_DIR, RAW_DIR, REGIONS } from './regions.mjs'
import { clipLine, dedupe, encodeWdgeo, joinChains, localProj, packCollection, pointInRing, ringArea, simplify, simplifyRing, stitchArea } from './geo-lib.mjs'

mkdirSync(OUT_DIR, { recursive: true })
const only = process.argv[2]

const raw = (region, layer) => {
  const f = `${RAW_DIR}/${region}-${layer}.json`
  if (!existsSync(f)) return null
  return JSON.parse(readFileSync(f, 'utf8')).elements
}

// ---------------- 高度解析 ----------------
function parseLen(v) {
  if (v == null) return null
  const s = String(v).trim().toLowerCase().replace(',', '.')
  let m = s.match(/^(\d+)'\s*(\d+)?"?$/) // 12'6"
  if (m) return (Number(m[1]) + Number(m[2] ?? 0) / 12) * 0.3048
  m = s.match(/^([\d.]+)\s*(m|meters?|metres?|ft|feet|')?$/)
  if (!m) return null
  const n = Number(m[1])
  if (!Number.isFinite(n)) return null
  return m[2] && /ft|feet|'/.test(m[2]) ? n * 0.3048 : n
}
const LEVEL_H = 3.5
/** 按类型给的兜底高度（米） */
const TYPE_H = { house: 8, detached: 8, garage: 3.5, garages: 3.5, shed: 3, roof: 5, carport: 3, residential: 11, apartments: 14, commercial: 14, retail: 7, industrial: 10, warehouse: 9, church: 18, school: 12, parking: 12 }

function heightOf(tags) {
  const h = parseLen(tags.height) ?? parseLen(tags['building:height'])
  const lv = Number(tags['building:levels'])
  const roofLv = Number(tags['roof:levels']) || 0
  let min = parseLen(tags.min_height)
  const minLv = Number(tags['building:min_level'])
  if (min == null && Number.isFinite(minLv)) min = minLv * LEVEL_H
  if (h != null && h > 0) return { h, min: min ?? 0, src: 0 }
  if (Number.isFinite(lv) && lv > 0) return { h: (lv + roofLv) * LEVEL_H, min: min ?? 0, src: 1 }
  return { h: null, min: min ?? 0, src: 2 }
}

// ---------------- OSM 元素 → 环 ----------------
const geomToLL = (g) => dedupe(g.filter(Boolean).map((p) => [p.lon, p.lat]))

/** way / multipolygon relation → [{outer, inners}]（经纬度） */
function elementPolys(el) {
  if (el.type === 'way') {
    const r = geomToLL(el.geometry ?? [])
    if (r.length < 4) return []
    const ring = r.slice(0, -1)
    return [{ outer: ring, inners: [] }]
  }
  if (el.type === 'relation') {
    const outers = []
    const inners = []
    for (const m of el.members ?? []) if (m.type === 'way' && m.geometry) (m.role === 'inner' ? inners : outers).push(geomToLL(m.geometry))
    const O = joinChains(outers).closed
    const I = joinChains(inners).closed
    return O.map((o) => ({ outer: o, inners: I.filter((i) => pointInRing(i[0][0], i[0][1], o)) }))
  }
  return []
}

// ---------------- 区域处理 ----------------
function buildRegion(name) {
  const reg = REGIONS[name]
  const P = localProj(reg.origin)
  const q = reg.quantum
  const [s, w, n, e] = reg.bbox
  const [bx0, by0] = P.fwd(w, s)
  const [bx1, by1] = P.fwd(e, n)
  const rect = [bx0, by0, bx1, by1]
  const toXY = (ring) => ring.map(([lon, lat]) => P.fwd(lon, lat))
  const arrays = {}
  const layers = {}
  const stats = {}

  // ---- 建筑 ----
  const bEls = raw(name, 'buildings')
  if (bEls) {
    const parts = []
    const whole = []
    for (const el of bEls) {
      const t = el.tags ?? {}
      const isPart = !!t['building:part'] && !t.building
      for (const p of elementPolys(el)) {
        const outer = simplifyRing(toXY(p.outer), q * 0.6)
        if (!outer) continue
        const area = Math.abs(ringArea(outer))
        if (area < 6) continue
        // 统一方向：外环逆时针、内环顺时针
        if (ringArea(outer) < 0) outer.reverse()
        const inners = p.inners
          .map((r) => simplifyRing(toXY(r), q * 0.6))
          .filter(Boolean)
          .map((r) => (ringArea(r) > 0 ? r.reverse() : r))
        const cx = outer.reduce((a, v) => a + v[0], 0) / outer.length
        const cy = outer.reduce((a, v) => a + v[1], 0) / outer.length
        const item = { rings: [outer, ...inners], cx, cy, area, tags: t, ...heightOf(t), part: isPart }
        ;(isPart ? parts : whole).push(item)
      }
    }
    // 有 building:part 的建筑：用部件代替外轮廓（OSM 3D 惯例）
    const grid = new Map()
    const G = 50
    const gk = (x, y) => `${Math.floor(x / G)},${Math.floor(y / G)}`
    for (const p of parts) {
      const k = gk(p.cx, p.cy)
      grid.has(k) ? grid.get(k).push(p) : grid.set(k, [p])
    }
    const kept = []
    let replaced = 0
    for (const b of whole) {
      let xs = Infinity, xe = -Infinity, ys = Infinity, ye = -Infinity
      for (const [x, y] of b.rings[0]) {
        xs = Math.min(xs, x); xe = Math.max(xe, x); ys = Math.min(ys, y); ye = Math.max(ye, y)
      }
      let has = false
      for (let gx = Math.floor(xs / G); gx <= Math.floor(xe / G) && !has; gx++)
        for (let gy = Math.floor(ys / G); gy <= Math.floor(ye / G) && !has; gy++)
          for (const p of grid.get(`${gx},${gy}`) ?? []) if (pointInRing(p.cx, p.cy, b.rings[0])) { has = true; p.parent = b; break }
      if (has) replaced++
      else kept.push(b)
    }
    // 部件缺高度时继承父建筑
    for (const p of parts) if (p.h == null && p.parent?.h != null) { p.h = p.parent.h; p.src = p.parent.src }
    const all = [...kept, ...parts]
    // 缺失高度：按 300m 网格内已知高度的中位数估计；再兜底按类型
    const C = 300
    const cells = new Map()
    for (const b of all) if (b.h != null && b.src !== 2) {
      const k = `${Math.floor(b.cx / C)},${Math.floor(b.cy / C)}`
      cells.has(k) ? cells.get(k).push(b.h) : cells.set(k, [b.h])
    }
    const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1] }
    const known = all.filter((b) => b.h != null).map((b) => b.h)
    const globalMed = known.length ? median(known) : 10
    for (const b of all) {
      if (b.h != null) continue
      const vals = []
      const ix = Math.floor(b.cx / C)
      const iy = Math.floor(b.cy / C)
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) vals.push(...(cells.get(`${ix + dx},${iy + dy}`) ?? []))
      const typeH = TYPE_H[b.tags.building] ?? null
      let est = vals.length >= 5 ? median(vals) : typeH ?? globalMed
      // 小房子不应该吃到周边摩天楼的中位数
      if (b.area < 150) est = Math.min(est, typeH ?? 9)
      if (typeH && (b.tags.building === 'garage' || b.tags.building === 'shed')) est = typeH
      b.h = Math.max(3, est)
      b.src = 2
    }
    all.sort((a, b) => a.cx - b.cx || a.cy - b.cy)
    const items = all.map((b) => ({ rings: b.rings, props: { h: Math.round(b.h * 10), min: Math.round(Math.min(b.min, b.h - 0.5) * 10), src: b.src | (b.part ? 8 : 0) } }))
    Object.assign(arrays, packCollection('buildings', 'poly', items, q, { h: Uint16Array, min: Uint16Array, src: Uint8Array }))
    layers.buildings = { kind: 'poly', count: items.length, props: { h: '高度（分米）', min: '底面高度（分米）', src: '0=height 标签 1=层数×3.5m 2=估计；+8=building:part' } }
    const srcCount = [0, 0, 0].map((_, i) => all.filter((b) => b.src === i).length)
    stats.buildings = { count: items.length, partsReplacedOutlines: replaced, parts: parts.length, bySource: { height: srcCount[0], levels: srcCount[1], estimated: srcCount[2] }, maxH: Math.max(...all.map((b) => b.h)).toFixed(0) }
  }

  // ---- 线（道路 / 铁路 / 河道中心线） ----
  const lineLayer = (layer, clsOf, tol) => {
    const els = raw(name, layer)
    if (!els) return
    const items = []
    for (const el of els) {
      if (el.type !== 'way' || !el.geometry) continue
      const c = clsOf(el.tags ?? {})
      if (c == null) continue
      for (const piece of clipLine(toXY(geomToLL(el.geometry)), rect)) {
        const pts = simplify(piece, tol)
        if (pts.length >= 2) items.push({ pts, props: { cls: c } })
      }
    }
    items.sort((a, b) => a.props.cls - b.props.cls)
    Object.assign(arrays, packCollection(layer, 'line', items, q, { cls: Uint8Array }))
    layers[layer] = { kind: 'line', count: items.length }
    stats[layer] = items.length
  }
  const HW = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'living_street']
  lineLayer(
    'roads',
    (t) => {
      const base = String(t.highway ?? '').replace(/_link$/, '')
      const i = HW.indexOf(base)
      if (i < 0) return null
      return i | (t.highway.endsWith('_link') ? 0x10 : 0) | (t.bridge && t.bridge !== 'no' ? 0x20 : 0) | (t.tunnel && t.tunnel !== 'no' ? 0x40 : 0)
    },
    q * 2,
  )
  if (layers.roads) layers.roads.props = { cls: `低 4 位：${HW.map((h, i) => `${i}=${h}`).join(' ')}；0x10=匝道 0x20=桥 0x40=隧道` }
  const RAIL = ['rail', 'subway', 'light_rail', 'elevated']
  lineLayer('rail', (t) => (RAIL.includes(t.railway) ? RAIL.indexOf(t.railway) | (t.tunnel && t.tunnel !== 'no' ? 0x40 : 0) : null), q * 2)
  if (layers.rail) layers.rail.props = { cls: '0=rail 1=subway（CTA L 线多为此类，含高架）2=light_rail 3=elevated；0x40=隧道' }
  lineLayer('rivers', (t) => (t.waterway === 'river' ? 0 : t.waterway === 'canal' ? 1 : null), q * 2)

  // ---- 水面（河道/池塘多边形） ----
  const wEls = raw(name, 'water')
  if (wEls) {
    const items = []
    for (const el of wEls)
      for (const p of elementPolys(el)) {
        const outer = simplifyRing(toXY(p.outer), q)
        if (!outer || Math.abs(ringArea(outer)) < 50) continue
        if (ringArea(outer) < 0) outer.reverse()
        const inners = p.inners.map((r) => simplifyRing(toXY(r), q)).filter(Boolean)
        items.push({ rings: [outer, ...inners], props: {} })
      }
    Object.assign(arrays, packCollection('water', 'poly', items, q))
    layers.water = { kind: 'poly', count: items.length }
    stats.water = items.length
  }

  // ---- 湖（密歇根湖）：成员岸线拼接 + 沿 bbox 补边 ----
  const lEls = raw(name, 'lake')
  if (lEls) {
    const lines = lEls.filter((x) => x.type === 'way' && x.geometry).map((x) => toXY(geomToLL(x.geometry)))
    const { open, closed } = joinChains(lines, true)
    const [tx, ty] = P.fwd(...reg.lakePoint)
    let rings = stitchArea(open, [], rect)
    if (!rings.some((r) => pointInRing(tx, ty, r))) rings = stitchArea(open.map((c) => c.slice().reverse()), [], rect)
    rings = rings.filter((r) => pointInRing(tx, ty, r))
    void closed
    const items = rings.map((r) => ({ rings: [simplifyRing(r, q)], props: {} })).filter((x) => x.rings[0])
    Object.assign(arrays, packCollection('lake', 'poly', items, q))
    layers.lake = { kind: 'poly', count: items.length }
    // 岸线本身（画线用）
    const shore = []
    for (const c of open) for (const p of clipLine(c, rect)) shore.push({ pts: simplify(p, q), props: {} })
    Object.assign(arrays, packCollection('shore', 'line', shore, q))
    layers.shore = { kind: 'line', count: shore.length }
    stats.lake = `${items.length} 面 / ${shore.length} 段岸线`
  }

  // ---- 海岸线 → 陆地面（OSM：陆地在左）----
  const coastSrc = name === 'sf' ? raw('bay', 'coast') : raw(name, 'coast')
  if (coastSrc) {
    const lines = coastSrc.filter((x) => x.type === 'way' && x.geometry).map((x) => toXY(geomToLL(x.geometry)))
    const { open, closed } = joinChains(lines, false)
    const tol = q
    const land = stitchArea(open, closed, rect)
      .map((r) => simplifyRing(r, tol))
      .filter((r) => r && Math.abs(ringArea(r)) > 2000)
    Object.assign(arrays, packCollection('land', 'poly', land.map((r) => ({ rings: [r], props: {} })), q))
    layers.land = { kind: 'poly', count: land.length }
    const coast = []
    for (const c of [...open, ...closed.map((r) => [...r, r[0]])]) for (const p of clipLine(c, rect)) coast.push({ pts: simplify(p, tol), props: {} })
    Object.assign(arrays, packCollection('coast', 'line', coast, q))
    layers.coast = { kind: 'line', count: coast.length }
    stats.land = `${land.length} 面 / ${coast.length} 段海岸线`
  }

  const meta = {
    format: 'wdgeo',
    version: 1,
    region: name,
    origin: reg.origin,
    bboxLonLat: [w, s, e, n],
    rect: rect.map((v) => Math.round(v)),
    quantum: q,
    crs: '本地等距投影：x=向东米，y=向北米（原点 origin）',
    source: '© OpenStreetMap contributors, ODbL 1.0',
    layers,
  }
  const gz = encodeWdgeo(meta, arrays)
  const out = `${OUT_DIR}/${name}.wdgeo.gz`
  writeFileSync(out, gz)
  console.log(`${out}  ${(gz.length / 1e6).toFixed(2)} MB`, JSON.stringify(stats))
}

for (const name of Object.keys(REGIONS)) if (!only || only === name) buildRegion(name)
