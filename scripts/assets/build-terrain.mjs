// 湾区地形：下载 AWS Terrain Tiles（Terrarium 编码，z11），重投影到 bay 区域的本地米制坐标，
// 输出 public/assets/geo/bay-hillshade.jpg（晕渲，灰度）与 bay-elevation.png（高程 0–1000m → 0–255，灰度）。
// 用法：node scripts/assets/build-terrain.mjs     依赖系统 curl + ffmpeg（PNG 编解码）
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { OUT_DIR, REGIONS } from './regions.mjs'
import { localProj } from './geo-lib.mjs'

const Z = 11
const CACHE = 'node_modules/.cache/wd-terrain-raw'
mkdirSync(CACHE, { recursive: true })
const reg = REGIONS.bay
const [s, w, n, e] = reg.bbox
const P = localProj(reg.origin)
const [x0, y0] = P.fwd(w, s)
const [x1, y1] = P.fwd(e, n)

const lon2t = (lon) => ((lon + 180) / 360) * 2 ** Z
const lat2t = (lat) => ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * 2 ** Z
const tx0 = Math.floor(lon2t(w))
const tx1 = Math.floor(lon2t(e))
const ty0 = Math.floor(lat2t(n))
const ty1 = Math.floor(lat2t(s))
const TW = (tx1 - tx0 + 1) * 256
const TH = (ty1 - ty0 + 1) * 256
const elev = new Float32Array(TW * TH)
for (let tx = tx0; tx <= tx1; tx++)
  for (let ty = ty0; ty <= ty1; ty++) {
    const f = `${CACHE}/${Z}-${tx}-${ty}.png`
    if (!existsSync(f)) execFileSync('curl', ['-sS', '-f', '-m', '120', '-o', f, `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${Z}/${tx}/${ty}.png`])
    const rgb = execFileSync('ffmpeg', ['-loglevel', 'error', '-i', f, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 24 })
    for (let j = 0; j < 256; j++)
      for (let i = 0; i < 256; i++) {
        const k = (j * 256 + i) * 3
        elev[((ty - ty0) * 256 + j) * TW + (tx - tx0) * 256 + i] = rgb[k] * 256 + rgb[k + 1] + rgb[k + 2] / 256 - 32768
      }
  }
console.log(`瓦片 ${tx1 - tx0 + 1}×${ty1 - ty0 + 1}，拼图 ${TW}×${TH}`)

// 重投影到本地米制栅格
const OW = 2048
const OH = Math.round((OW * (y1 - y0)) / (x1 - x0))
const mpp = (x1 - x0) / OW
const sample = (u, v) => {
  const iu = Math.max(0, Math.min(TW - 2, Math.floor(u)))
  const iv = Math.max(0, Math.min(TH - 2, Math.floor(v)))
  const fu = u - iu
  const fv = v - iv
  const a = elev[iv * TW + iu]
  const b = elev[iv * TW + iu + 1]
  const c = elev[(iv + 1) * TW + iu]
  const d = elev[(iv + 1) * TW + iu + 1]
  return a + (b - a) * fu + (c - a) * fv + (a - b - c + d) * fu * fv
}
const E = new Float32Array(OW * OH)
for (let j = 0; j < OH; j++)
  for (let i = 0; i < OW; i++) {
    const [lon, lat] = P.inv(x0 + (i + 0.5) * mpp, y1 - (j + 0.5) * mpp)
    E[j * OW + i] = sample((lon2t(lon) - tx0) * 256 - 0.5, (lat2t(lat) - ty0) * 256 - 0.5)
  }
// 晕渲：光源西北 315°、高度 45°，垂直夸张 2
const shade = Buffer.alloc(OW * OH)
const elev8 = Buffer.alloc(OW * OH)
const az = (315 * Math.PI) / 180
const alt = (45 * Math.PI) / 180
const zf = 2
for (let j = 0; j < OH; j++)
  for (let i = 0; i < OW; i++) {
    const g = (a, b) => E[Math.max(0, Math.min(OH - 1, b)) * OW + Math.max(0, Math.min(OW - 1, a))]
    const dzdx = ((g(i + 1, j) - g(i - 1, j)) / (2 * mpp)) * zf
    const dzdy = ((g(i, j - 1) - g(i, j + 1)) / (2 * mpp)) * zf // 行向下 = 向南
    // 法线 (-dz/dx, -dz/dy, 1) 与光源方向（方位角顺时针自北）点积
    const L = [Math.cos(alt) * Math.sin(az), Math.cos(alt) * Math.cos(az), Math.sin(alt)]
    const nl = Math.hypot(dzdx, dzdy, 1)
    let v = (-dzdx * L[0] - dzdy * L[1] + L[2]) / nl
    const h = E[j * OW + i]
    if (h <= 0.5) v = 0 // 水面/海平面：纯黑
    shade[j * OW + i] = Math.max(0, Math.min(255, Math.round(v * 255)))
    elev8[j * OW + i] = Math.max(0, Math.min(255, Math.round((h / 1000) * 255)))
  }
const png = (buf, out) => execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'gray', '-s', `${OW}x${OH}`, '-i', '-', '-compression_level', '9', out], { input: buf })
execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "gray", "-s", `${OW}x${OH}`, "-i", "-", "-q:v", "3", `${OUT_DIR}/bay-hillshade.jpg`], { input: shade })
png(elev8, `${OUT_DIR}/bay-elevation.png`)
writeFileSync(`${OUT_DIR}/bay-terrain.json`, JSON.stringify({ region: 'bay', width: OW, height: OH, rect: [x0, y0, x1, y1].map(Math.round), metersPerPixel: mpp, elevationScale: '像素值 × 1000/255 = 米（0–1000m 截断）', zoom: Z }, null, 1))
console.log(`bay-hillshade.jpg / bay-elevation.png ${OW}×${OH}，${mpp.toFixed(1)} m/px`)
