// 从 OpenStreetMap（Overpass API）下载原始数据，缓存到 node_modules/.cache/wd-geo-raw/（不入库）。
// 用法：node scripts/assets/fetch-osm.mjs [region] [layer]
// 数据 © OpenStreetMap contributors，ODbL 1.0。依赖系统 curl（它会走 HTTPS_PROXY）。
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { RAW_DIR, REGIONS } from './regions.mjs'

const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
]
const UA = 'watchdogs-motion-asset-fetch/0.1 (personal learning project)'
const [onlyRegion, onlyLayer] = process.argv.slice(2)
mkdirSync(RAW_DIR, { recursive: true })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

for (const [name, reg] of Object.entries(REGIONS)) {
  if (onlyRegion && onlyRegion !== name) continue
  const b = reg.bbox.join(',')
  for (const [layer, q] of Object.entries(reg.queries)) {
    if (onlyLayer && onlyLayer !== layer) continue
    const out = `${RAW_DIR}/${name}-${layer}.json`
    if (existsSync(out) && statSync(out).size > 1000 && !onlyLayer) {
      console.log(`跳过（已缓存）${out}`)
      continue
    }
    // 大范围查询容易 504：regions.mjs 里 split[layer] = n 时切成 n×n 块分别下载再按 id 去重合并
    const n = reg.split?.[layer] ?? 1
    const tiles = []
    const [S, Wd, N, E] = reg.bbox
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++)
        tiles.push([S + ((N - S) * i) / n, Wd + ((E - Wd) * j) / n, S + ((N - S) * (i + 1)) / n, Wd + ((E - Wd) * (j + 1)) / n].map((v) => +v.toFixed(5)).join(','))
    const merged = new Map()
    for (const [ti, tb] of tiles.entries()) {
      const part = n === 1 ? out : `${out}.part${ti}`
      if (n > 1 && existsSync(part) && statSync(part).size > 100) {
        for (const el of JSON.parse(readFileSync(part, 'utf8')).elements) merged.set(`${el.type}/${el.id}`, el)
        continue
      }
      let ok = false
      for (let attempt = 0; attempt < 8 && !ok; attempt++) {
        const url = MIRRORS[attempt % MIRRORS.length]
        try {
          console.log(`${name}/${layer}${n > 1 ? ` [${ti + 1}/${tiles.length}]` : ''} ← ${url}`)
          execFileSync('curl', ['-sS', '-f', '-m', '600', '-A', UA, '-o', part, url, '--data-urlencode', `data=${q(tb)}`], { stdio: 'inherit' })
          const head = execFileSync('head', ['-c', '200', part]).toString()
          if (!head.trimStart().startsWith('{')) throw new Error('不是 JSON：' + head.slice(0, 120))
          // Overpass 超时/内存不足时会在 JSON 里带 remark
          const tail = execFileSync('tail', ['-c', '600', part]).toString()
          if (/"remark"\s*:\s*"runtime (error|remark)/.test(tail)) throw new Error('Overpass remark：' + tail)
          console.log(`  ✓ ${(statSync(part).size / 1e6).toFixed(1)} MB`)
          ok = true
        } catch (e) {
          console.warn(`  ✗ ${String(e.message ?? e).slice(0, 300)}`)
          await sleep(15000)
        }
      }
      if (!ok) throw new Error(`${name}/${layer} 所有镜像都失败`)
      if (n > 1) for (const el of JSON.parse(readFileSync(part, 'utf8')).elements) merged.set(`${el.type}/${el.id}`, el)
      await sleep(3000)
    }
    if (n > 1) writeFileSync(out, JSON.stringify({ elements: [...merged.values()] }))
  }
}
