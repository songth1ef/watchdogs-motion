import * as THREE from 'three'
import { memo } from '../../../engine/three-host'
import { tune } from './tune'
import type { ThreeHost } from '../../../engine/three-host'
import { hash, rng } from '../../../engine/math'
import { LAND, LIGHTS, WATER_HOLES, type LonLat } from './geo'
import { earthImage, earthTexture as realEarthTexture, hasEarth } from '../../../assets/earth'

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
 * 真实地球合成参数（按 9s 参考帧取样：海洋 ≈36–47、陆地 ≈43–53、格陵兰 ≈53，灯光叠加）。
 * 原片是低反差的「海底 + 陆地浮雕」灰度图，所以海洋也要有测深纹理，雪/冰不能过曝。
 */
export const REAL_EARTH = { ocean0: 18, oceanK: 0.32, land0: 26, landK: 0.05, landCap: 170, topoK: 0.12, relief: 3, lights: 1.05, w: 4096, h: 2048 }

/**
 * 真实贴图合成（本镜头专用，assets/earth.ts 的 earthComposite 不能按海陆分开调增益，在这里包一层）：
 *   海洋 = ocean0 + Blue Marble 测深灰度 × oceanK
 *   陆地 = land0 + min(Blue Marble 灰度, landCap) × landK + GEBCO 高程 × topoK
 *   + 高程东西向梯度做的浮雕（relief） + Black Marble 夜光灰度 × lights
 */
function realEarthCanvas() {
  const o = { ...REAL_EARTH }
  for (const k of Object.keys(o) as (keyof typeof o)[]) o[k] = tune('tex.' + k, o[k])
  return memo('wd1p1:realEarth:' + JSON.stringify(o), () => {
    const W = o.w
    const H = o.h
    const c = document.createElement('canvas')
    c.width = W
    c.height = H
    const g = c.getContext('2d', { willReadFrequently: true })!
    const layer = (m: 'night' | 'blue' | 'topo') => {
      g.clearRect(0, 0, W, H)
      g.drawImage(earthImage(m), 0, 0, W, H)
      return g.getImageData(0, 0, W, H).data
    }
    const blue = layer('blue')
    const topo = layer('topo')
    const night = layer('night')
    const out = g.createImageData(W, H)
    const d = out.data
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4
        const r = blue[i]
        const gg = blue[i + 1]
        const b = blue[i + 2]
        const lum = 0.3 * r + 0.59 * gg + 0.11 * b
        // Blue Marble 海洋偏蓝、陆地偏绿/棕/白：用蓝色优势判海
        const sea = b > r + 12 && b > gg ? 1 : 0
        const xl = x > 0 ? i - 4 : i
        const xr = x < W - 1 ? i + 4 : i
        const yu = y > 0 ? i - W * 4 : i
        const relief = (topo[xl] - topo[xr]) * 0.7 + (topo[yu] - topo[i]) * 0.5
        let v = sea ? o.ocean0 + lum * o.oceanK + (lum - blue[xr]) * 0.6 : o.land0 + Math.min(lum, o.landCap) * o.landK + topo[i] * o.topoK + relief * o.relief
        const L = 0.3 * night[i] + 0.59 * night[i + 1] + 0.11 * night[i + 2]
        v += L * o.lights
        v = Math.max(0, Math.min(255, v))
        d[i] = d[i + 1] = d[i + 2] = v
        d[i + 3] = 255
      }
    }
    g.putImageData(out, 0, 0)
    c.dataset.key = JSON.stringify(o)
    return c
  })
}

/**
 * 回退用：程序化地球夜景贴图（等距圆柱投影，灰度）。
 * 换真实素材：把返回的 canvas 换成 NASA Black Marble 与地形灰度图的合成即可，UV 约定不变。
 */
export function earthTexture(): THREE.Texture {
  // V2：真实贴图（GEBCO 地形浮雕 + Black Marble 夜光灰度合成）可用时直接用；加载失败才回退到下面的程序化贴图
  if (hasEarth('night') && hasEarth('topo')) {
    const c = realEarthCanvas()
    return realEarthTexture(c, 'wd1p1-earth:' + c.dataset.key)
  }
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
/** 相机距离（地球半径倍数）。V2：原片几乎是正交投影（9s 参考帧拟合东京/迈阿密/洛杉矶/格陵兰得 D≈40），V1 的 4 倍透视过强 */
export const CAM_D = 40

const earthScene = () =>
  memo('wd1p1:earthScene', () => {
    const scene = new THREE.Scene()
    const mat = new THREE.MeshBasicMaterial({ map: earthTexture() })
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 160, 100), mat)
    scene.add(mesh)
    const fov = 2 * Math.atan((Math.tan(Math.asin(1 / CAM_D)) * 540) / EARTH_R0) * (180 / Math.PI)
    const cam = new THREE.PerspectiveCamera(fov, 1920 / 1080, CAM_D - 2, CAM_D + 2)
    return { scene, cam, mesh, mat }
  })

/**
 * 渲染地球：视线中心 (lon, lat)，roll 为画面内旋转（度）。
 * 返回 three 画布，地球在其中心、半径 EARTH_R0。
 */
export function renderEarth(three: ThreeHost, lon: number, lat: number, roll: number) {
  const { scene, cam, mat } = earthScene()
  const map = earthTexture()
  if (mat.map !== map) {
    mat.map = map
    mat.needsUpdate = true
  }
  const dir = lonLatVec(lon, lat)
  cam.position.copy(dir.clone().multiplyScalar(CAM_D))
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
  cam.position.copy(dir.clone().multiplyScalar(CAM_D))
  const north = new THREE.Vector3(0, 1, 0)
  const up = north.clone().sub(dir.clone().multiplyScalar(north.dot(dir))).normalize()
  up.applyAxisAngle(dir, (roll * Math.PI) / 180)
  cam.up.copy(up)
  cam.lookAt(0, 0, 0)
  cam.updateMatrixWorld()
  const p = lonLatVec(lon, lat)
  const vis = p.dot(dir) > 1 / CAM_D
  const v = p.clone().project(cam)
  const sx = (v.x * 960) / 1 // NDC → 以中心为原点的像素（three 画布 1920×1080）
  const sy = -v.y * 540
  const k = r / EARTH_R0
  return vis ? { x: cx + sx * k, y: cy + sy * k } : null
}
