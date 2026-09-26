// Natural Earth（公有领域）GeoJSON → public/assets/geo/world-50m.json.gz / world-110m.json.gz
// 用法：node scripts/assets/build-world.mjs
// 输出结构（经纬度 ×100 取整，每个环是扁平整数数组 [lon0,lat0, dlon1,dlat1, ...] 差分编码）：
//   { q:100, land: Poly[], lakes: {name,polys}[], coast: Line[], countries: {name,iso,polys}[],
//     states: {name,postal,polys}[], cities: [name, iso, lon, lat, pop][] }
//   Poly = Ring[]（首环外环，其余为洞）；Ring/Line = number[]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { gzipSync } from 'node:zlib'

const RAW = 'node_modules/.cache/wd-ne-raw'
const OUT = 'public/assets/geo'
mkdirSync(OUT, { recursive: true })
const Q = 100
const load = (n) => JSON.parse(readFileSync(`${RAW}/${n}.geojson`, 'utf8')).features

/** 量化 + 差分 + 去重；点数太少的环丢弃 */
function enc(coords, closed) {
  const out = []
  let px = null
  let py = null
  let n = 0
  const pts = closed ? coords.slice(0, -1) : coords
  for (const [lon, lat] of pts) {
    const x = Math.round(lon * Q)
    const y = Math.round(lat * Q)
    if (x === px && y === py) continue
    if (px === null) out.push(x, y)
    else out.push(x - px, y - py)
    px = x
    py = y
    n++
  }
  return n >= (closed ? 3 : 2) ? out : null
}
function polysOf(geom) {
  const P = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : []
  return P.map((poly) => poly.map((r) => enc(r, true)).filter(Boolean)).filter((p) => p.length)
}
function linesOf(geom) {
  const L = geom.type === 'LineString' ? [geom.coordinates] : geom.type === 'MultiLineString' ? geom.coordinates : []
  return L.map((l) => enc(l, false)).filter(Boolean)
}

function build(res) {
  const land = load(`ne_${res}_land`).flatMap((f) => polysOf(f.geometry))
  const coast = load(`ne_${res}_coastline`).flatMap((f) => linesOf(f.geometry))
  const countries = load(`ne_${res}_admin_0_countries`).map((f) => ({ name: f.properties.NAME ?? f.properties.name, iso: f.properties.ADM0_A3 ?? f.properties.adm0_a3, polys: polysOf(f.geometry) }))
  const out = { source: 'Natural Earth（公有领域）', res, q: Q, land, coast, countries }
  if (res === '50m') {
    // 美国州界（含大湖切口版）+ 加拿大省界
    out.states = load('ne_50m_admin_1_states_provinces_lakes')
      .filter((f) => ['USA', 'CAN'].includes(f.properties.adm0_a3))
      .map((f) => ({ name: f.properties.name, postal: f.properties.postal, country: f.properties.adm0_a3, polys: polysOf(f.geometry) }))
    out.lakes = load('ne_50m_lakes')
      .filter((f) => f.properties.name)
      .map((f) => ({ name: f.properties.name, polys: polysOf(f.geometry) }))
    out.cities = load('ne_50m_populated_places_simple')
      .map((f) => f.properties)
      .filter((p) => p.pop_max >= 300000 || p.adm0_a3 === 'USA')
      .sort((a, b) => b.pop_max - a.pop_max)
      .map((p) => [p.name, p.adm0_a3, Math.round(p.longitude * 1000) / 1000, Math.round(p.latitude * 1000) / 1000, p.pop_max])
  }
  const gz = gzipSync(Buffer.from(JSON.stringify(out)), { level: 9 })
  writeFileSync(`${OUT}/world-${res}.json.gz`, gz)
  console.log(`world-${res}.json.gz ${(gz.length / 1e6).toFixed(2)} MB  land=${land.length} countries=${countries.length} states=${out.states?.length ?? 0} lakes=${out.lakes?.length ?? 0} cities=${out.cities?.length ?? 0}`)
}
build('50m')
build('110m')
