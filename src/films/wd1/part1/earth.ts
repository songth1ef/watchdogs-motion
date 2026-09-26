import * as THREE from 'three'
import { memo } from '../../../engine/three-host'
import type { ThreeHost } from '../../../engine/three-host'
import { hash, rng } from '../../../engine/math'
import { LAND, LIGHTS, WATER_HOLES, type LonLat } from './geo'

const TW = 2048
const TH = 1024

const px = (p: LonLat): [number, number] => [((p[0] + 180) / 360) * TW, ((90 - p[1]) / 180) * TH]

function poly(ctx: CanvasRenderingContext2D, pts: LonLat[]) {
  ctx.beginPath()
  pts.forEach((p, i) => {
    const [x, y] = px(p)
    if (i) ctx.lineTo(x, y)
    else ctx.moveTo(x, y)
  })
  ctx.closePath()
}

/** 平滑值噪声（可复现），返回 0..1 */
function valueNoise(seed: number, x: number, y: number) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = x - xi
  const yf = y - yi
  const h = (a: number, b: number) => hash(a * 374761393 + b * 668265263 + seed * 1442695)
  const s = (q: number) => q * q * (3 - 2 * q)
  const a = h(xi, yi)
  const b = h(xi + 1, yi)
  const c = h(xi, yi + 1)
  const d = h(xi + 1, yi + 1)
  const u = s(xf)
  const v = s(yf)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}
export function fbm(seed: number, x: number, y: number, oct = 5) {
  let s = 0
  let amp = 0.5
  let f = 1
  for (let i = 0; i < oct; i++) {
    s += amp * valueNoise(seed + i, x * f, y * f)
    f *= 2.03
    amp *= 0.5
  }
  return s
}

/**
 * ASSET：程序化地球夜景贴图（等距圆柱投影，灰度）。
 * 换真实素材：把返回的 canvas 换成 NASA Black Marble 与地形灰度图的合成即可，UV 约定不变。
 */
export function earthTexture() {
  return memo('wd1p1:earthTex', () => {
    const mask = document.createElement('canvas')
    mask.width = TW
    mask.height = TH
    const m = mask.getContext('2d', { willReadFrequently: true })!
    m.fillStyle = '#fff'
    for (const p of LAND) {
      poly(m, p)
      m.fill()
    }
    m.globalCompositeOperation = 'destination-out'
    for (const p of WATER_HOLES) {
      poly(m, p)
      m.fill()
    }
    // 边缘稍微柔化，像海岸线
    const soft = document.createElement('canvas')
    soft.width = TW
    soft.height = TH
    const sc = soft.getContext('2d', { willReadFrequently: true })!
    sc.filter = 'blur(3px)'
    sc.drawImage(mask, 0, 0)
    const md = sc.getImageData(0, 0, TW, TH).data

    const out = document.createElement('canvas')
    out.width = TW
    out.height = TH
    const o = out.getContext('2d', { willReadFrequently: true })!
    const img = o.createImageData(TW, TH)
    const d = img.data
    for (let y = 0; y < TH; y++) {
      const lat = 90 - (y / TH) * 180
      for (let x = 0; x < TW; x++) {
        const i = (y * TW + x) * 4
        const land = md[i + 3] / 255
        const n = fbm(3, x / 40, y / 40, 5)
        const ridge = 1 - Math.abs(fbm(9, x / 90, y / 90, 4) * 2 - 1)
        let ocean = 20 + n * 12 + Math.pow(ridge, 10) * 10
        // 北冰洋海冰：纬度 70→82 渐变变亮，边缘带噪声
        const ice = Math.min(1, Math.max(0, (lat - 70 - (n - 0.5) * 10) / 10))
        ocean = ocean * (1 - ice) + (lat > 80 ? 52 : 44 + n * 22) * ice
        const nd = fbm(21, x / 9, y / 9, 3)
        let ground = 26 + n * 18 + nd * 26 + Math.pow(ridge, 4) * 16
        if (lat > 62) ground = ground * 0.5 + (52 + n * 26) * 0.5
        const v = ocean * (1 - land) + ground * land
        d[i] = d[i + 1] = d[i + 2] = v
        d[i + 3] = 255
      }
    }
    o.putImageData(img, 0, 0)

    // 城市灯光：高斯团 + 陆地遮罩
    const lights = document.createElement('canvas')
    lights.width = TW
    lights.height = TH
    const l = lights.getContext('2d')!
    const R = rng(2003)
    const gauss = () => {
      let s = 0
      for (let k = 0; k < 4; k++) s += R.next()
      return (s - 2) / 0.58
    }
    for (const [lon, lat, w, spread] of LIGHTS) {
      const n = Math.round(w * 170)
      for (let k = 0; k < n; k++) {
        const [x, y] = px([lon + gauss() * spread * 1.4, lat + gauss() * spread])
        const b = R.next()
        l.fillStyle = `rgba(255,255,255,${0.25 + b * 0.6})`
        const s = b > 0.95 ? 1.8 : 1
        l.fillRect(x, y, s, s)
      }
    }
    l.globalCompositeOperation = 'destination-in'
    l.drawImage(mask, 0, 0)
    o.globalCompositeOperation = 'lighter'
    o.filter = 'blur(3px)'
    o.globalAlpha = 0.35
    o.drawImage(lights, 0, 0)
    o.globalAlpha = 1
    o.filter = 'none'
    o.drawImage(lights, 0, 0)
    const tex = new THREE.CanvasTexture(out)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 4
    return tex
  })
}

/** 经纬度 → 与 THREE.SphereGeometry UV 一致的单位向量 */
export function lonLatVec(lon: number, lat: number) {
  const phi = ((lon + 180) / 360) * Math.PI * 2
  const theta = ((90 - lat) / 180) * Math.PI
  return new THREE.Vector3(-Math.cos(phi) * Math.sin(theta), Math.cos(theta), Math.sin(phi) * Math.sin(theta))
}

/** 地球在 three 画布里的投影半径（px）；外部按这个比例 drawImage 到目标圆 */
export const EARTH_R0 = 520

const earthScene = () =>
  memo('wd1p1:earthScene', () => {
    const scene = new THREE.Scene()
    const mat = new THREE.MeshBasicMaterial({ map: earthTexture() })
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 160, 100), mat)
    scene.add(mesh)
    const fov = 2 * Math.atan((Math.tan(Math.asin(1 / 4)) * 540) / EARTH_R0) * (180 / Math.PI)
    const cam = new THREE.PerspectiveCamera(fov, 1920 / 1080, 0.1, 20)
    return { scene, cam, mesh }
  })

/**
 * 渲染地球：视线中心 (lon, lat)，roll 为画面内旋转（度）。
 * 返回 three 画布，地球在其中心、半径 EARTH_R0。
 */
export function renderEarth(three: ThreeHost, lon: number, lat: number, roll: number) {
  const { scene, cam } = earthScene()
  const dir = lonLatVec(lon, lat)
  cam.position.copy(dir.clone().multiplyScalar(4))
  // 以北极为「上」，再绕视线旋转 roll
  const north = new THREE.Vector3(0, 1, 0)
  const up = north.clone().sub(dir.clone().multiplyScalar(north.dot(dir))).normalize()
  up.applyAxisAngle(dir, (roll * Math.PI) / 180)
  cam.up.copy(up)
  cam.lookAt(0, 0, 0)
  cam.updateMatrixWorld()
  return three.render(scene, cam)
}

/** 把 (lon,lat) 投影到画面（地球中心 cx,cy 半径 r），不可见返回 null */
export function projectLonLat(lon: number, lat: number, viewLon: number, viewLat: number, roll: number, cx: number, cy: number, r: number) {
  const { cam } = earthScene()
  const dir = lonLatVec(viewLon, viewLat)
  cam.position.copy(dir.clone().multiplyScalar(4))
  const north = new THREE.Vector3(0, 1, 0)
  const up = north.clone().sub(dir.clone().multiplyScalar(north.dot(dir))).normalize()
  up.applyAxisAngle(dir, (roll * Math.PI) / 180)
  cam.up.copy(up)
  cam.lookAt(0, 0, 0)
  cam.updateMatrixWorld()
  const p = lonLatVec(lon, lat)
  const vis = p.dot(dir) > 0.1
  const v = p.clone().project(cam)
  const sx = (v.x * 960) / 1 // NDC → 以中心为原点的像素（three 画布 1920×1080）
  const sy = -v.y * 540
  const k = r / EARTH_R0
  return vis ? { x: cx + sx * k, y: cy + sy * k } : null
}
