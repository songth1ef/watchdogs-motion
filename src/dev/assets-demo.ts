/**
 * 真实资产演示页（开发用，不注册进 films）：
 *   pnpm dev → http://localhost:5173/src/dev/assets-demo.html?v=chicago-clay
 *   node scripts/assets-demo.mjs → 无头渲染全部视图到 snaps/assets/
 */
import * as THREE from 'three'
import { ThreeHost } from '../engine/three-host'
import { preloadAssets, geo, world, bayTerrain, GREAT_LAKES } from '../assets'
import { earthComposite, earthTexture } from '../assets/earth'
import { drawLayer, drawRaster, drawWater, viewAt, ROAD_FILTERS, type MapView } from '../assets/geo-draw'
import { clampToLimb, equirect, fillPolys, landDots, mercator, orthographic, ringsOf, strokeRings } from '../assets/projection'
import { buildRealCity } from '../three/real-city'

const W = 1920
const H = 1080
const canvas = document.getElementById('out') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const three = new ThreeHost(W, H)
const memo = new Map<string, unknown>()
const once = <T>(k: string, f: () => T): T => {
  if (!memo.has(k)) memo.set(k, f())
  return memo.get(k) as T
}

function orbitCam(cam: THREE.PerspectiveCamera, target: THREE.Vector3, dist: number, elDeg: number, azDeg: number) {
  const el = (elDeg * Math.PI) / 180
  const az = (azDeg * Math.PI) / 180
  cam.position.set(target.x + dist * Math.cos(el) * Math.sin(az), target.y + dist * Math.sin(el), target.z + dist * Math.cos(el) * Math.cos(az))
  cam.lookAt(target)
  cam.updateMatrixWorld()
}

const VIEWS: Record<string, () => void> = {
  /** WD1 124–129s：白色素模近俯拍（对照 wd1 125–128s） */
  'chicago-clay-top'() {
    const s = once('clay', () => {
      const scene = new THREE.Scene()
      const city = buildRealCity({ region: 'chicago', style: 'clay', radius: 1100, center: [-300, 250], jitter: 0.12 })
      scene.add(city.group)
      scene.add(new THREE.AmbientLight(0xffffff, 0.9))
      const sun = new THREE.DirectionalLight(0xffffff, 2.2)
      sun.position.set(-600, 900, -300)
      sun.castShadow = true
      sun.shadow.mapSize.set(4096, 4096)
      Object.assign(sun.shadow.camera, { left: -1200, right: 1200, top: 1200, bottom: -1200, near: 10, far: 3000 })
      scene.add(sun)
      three.renderer.shadowMap.enabled = true
      const cam = new THREE.PerspectiveCamera(40, W / H, 5, 8000)
      return { scene, cam }
    })
    orbitCam(s.cam, new THREE.Vector3(0, 0, 0), 900, 72, 25)
    ctx.drawImage(three.render(s.scene, s.cam, 0x000000, 1), 0, 0)
  },
  /** WD1 129–134s：斜俯视、压低（对照 wd1 131–134s） */
  'chicago-clay-oblique'() {
    const s = once('clay2', () => {
      const scene = new THREE.Scene()
      const city = buildRealCity({ region: 'chicago', style: 'clay', radius: 2600, center: [-300, 250], jitter: 0.1 })
      scene.add(city.group)
      scene.add(new THREE.AmbientLight(0xffffff, 1.0))
      const sun = new THREE.DirectionalLight(0xffffff, 2.0)
      sun.position.set(-500, 800, -200)
      scene.add(sun)
      const cam = new THREE.PerspectiveCamera(38, W / H, 5, 12000)
      return { scene, cam }
    })
    three.renderer.shadowMap.enabled = false
    orbitCam(s.cam, new THREE.Vector3(0, 0, -300), 2600, 16, 150)
    ctx.drawImage(three.render(s.scene, s.cam, 0x000000, 1), 0, 0)
  },
  /** WD1 38–50s：灰色城市 + 白色边线（对照 wd1 44–48s） */
  'chicago-dark'() {
    const s = once('dark', () => {
      const scene = new THREE.Scene()
      const city = buildRealCity({ region: 'chicago', style: 'dark', jitter: 0.35, edgeOpacity: 0.3 })
      scene.add(city.group)
      scene.add(new THREE.AmbientLight(0xffffff, 0.5))
      const sun = new THREE.DirectionalLight(0xffffff, 1.6)
      sun.position.set(-300, 1000, 200)
      scene.add(sun)
      // 地铁（CTA L）用青色线
      const cam = new THREE.PerspectiveCamera(42, W / H, 5, 12000)
      return { scene, cam, city }
    })
    orbitCam(s.cam, new THREE.Vector3(0, 0, 0), 2200, 45, 20)
    ctx.drawImage(three.render(s.scene, s.cam, 0x000000, 1), 0, 0)
  },
  /** WD2 3.6–8.7s：线框城市 + 贴地道路（对照 wd2 5–7s） */
  'chicago-wire'() {
    const s = once('wire', () => {
      const scene = new THREE.Scene()
      const city = buildRealCity({ region: 'chicago', style: 'wire', edgeColor: 0x9fe8ee, edgeOpacity: 0.35, roads: { color: 0xffffff, opacity: 0.35 } })
      scene.add(city.group)
      const cam = new THREE.PerspectiveCamera(55, W / H, 5, 12000)
      return { scene, cam }
    })
    orbitCam(s.cam, new THREE.Vector3(0, 0, -800), 900, 6, 190)
    ctx.drawImage(three.render(s.scene, s.cam, 0x000000, 1), 0, 0)
  },
  /** WD2 8.3–14.3s：俯拍芝加哥街道地图，湖在左上（对照 wd2 9–10s） */
  'chicago-map'() {
    const R = geo('chicago')
    const v: MapView = { ...viewAt(R, -87.635, 41.885, 0.3), rot: (-125 * Math.PI) / 180 }
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, W, H)
    drawWater(ctx, 'chicago', v, '#0a0d10')
    drawLayer(ctx, 'chicago', 'roads', v, { stroke: 'rgba(200,210,215,0.35)', width: 0.8, filter: ROAD_FILTERS.minor, filterKey: 'minor' })
    drawLayer(ctx, 'chicago', 'roads', v, { stroke: 'rgba(235,240,240,0.8)', width: 1.6, filter: ROAD_FILTERS.major, filterKey: 'major' })
    drawLayer(ctx, 'chicago', 'rail', v, { stroke: 'rgba(79,245,227,0.55)', width: 1.2 })
    drawLayer(ctx, 'chicago', 'shore', v, { stroke: 'rgba(255,255,255,0.6)', width: 1.2 })
    drawLayer(ctx, 'chicago', 'buildings', v, { fill: 'rgba(255,255,255,0.08)' })
  },
  /** WD2 36.9–40.7s：旧金山半岛暗蓝街区（对照 wd2 38–39s） */
  'sf-peninsula'() {
    const R = geo('sf')
    const v: MapView = { ...viewAt(R, -122.44, 37.765, 0.085), rot: (-20 * Math.PI) / 180 }
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, W, H)
    drawWater(ctx, 'sf', v, '#000', '#06121a')
    drawLayer(ctx, 'sf', 'roads', v, { stroke: 'rgba(70,150,200,0.45)', width: 0.7, filter: ROAD_FILTERS.minor, filterKey: 'minor' })
    drawLayer(ctx, 'sf', 'roads', v, { stroke: 'rgba(140,210,255,0.85)', width: 1.4, filter: ROAD_FILTERS.major, filterKey: 'major' })
    drawLayer(ctx, 'sf', 'coast', v, { stroke: 'rgba(160,200,230,0.7)', width: 1.2 })
    drawLayer(ctx, 'sf', 'buildings', v, { fill: 'rgba(120,190,240,0.18)' })
  },
  /** WD2 33.4–37s：湾区地形（晕渲 + 主干道，对照 wd2 34–36s） */
  'bay-terrain'() {
    const R = geo('bay')
    const T = bayTerrain()
    const v: MapView = { ...viewAt(R, -122.25, 37.68, 0.0125), rot: (-15 * Math.PI) / 180 }
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, W, H)
    // 晕渲栅格（bay 区域坐标，与 bay 图层同一坐标系）
    drawRaster(ctx, T.hillshade, T.rect, v, 0.55)
    drawWater(ctx, 'bay', v, '#000')
    drawLayer(ctx, 'bay', 'roads', v, { stroke: 'rgba(255,255,255,0.75)', width: 1.1 })
    drawLayer(ctx, 'bay', 'coast', v, { stroke: 'rgba(255,255,255,0.5)', width: 1 })
  },
  /** WD1 3–11s：夜光地球（对照 wd1 5–9s） */
  'earth-night'() {
    const s = once('earth', () => {
      const scene = new THREE.Scene()
      const tex = earthTexture(earthComposite({ topo: 0.3, lights: 1.1, ocean: 10 }), 'composite')
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 160, 100), new THREE.MeshBasicMaterial({ map: tex }))
      scene.add(mesh)
      const cam = new THREE.PerspectiveCamera(30, W / H, 0.1, 20)
      return { scene, cam }
    })
    // 与 wd1 earth.ts lonLatVec 同一 UV 约定
    const lon = -98
    const lat = 52
    const phi = ((lon + 180) / 360) * Math.PI * 2
    const th = ((90 - lat) / 180) * Math.PI
    const dir = new THREE.Vector3(-Math.cos(phi) * Math.sin(th), Math.cos(th), Math.sin(phi) * Math.sin(th))
    s.cam.position.copy(dir.multiplyScalar(4))
    s.cam.up.set(0, 1, 0)
    s.cam.lookAt(0, 0, 0)
    s.cam.updateMatrixWorld()
    ctx.drawImage(three.render(s.scene, s.cam, 0x000000, 1), 0, 0)
  },
  /** WD2 90–94s：世界地图数据点（对照 wd2 91–93s） */
  'world-dots'() {
    const w = world('50m')
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, W, H)
    const P = equirect({ lon0: 10, lat0: 15, scale: 5.2 })
    const dots = landDots(w.land, 0.9, '50m')
    ctx.fillStyle = 'rgba(140,170,210,0.8)'
    for (let i = 0; i < dots.length; i += 2) {
      const [x, y] = P(dots[i], dots[i + 1])
      ctx.fillRect(x - 1.2, y - 1.2, 2.4, 2.4)
    }
  },
  /** WD2 26–31s：美国州界 + 城市网络（对照 wd2 28–29s） */
  'usa-states'() {
    const w = world('50m')
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, W, H)
    const P = mercator({ lon0: -97, lat0: 38.5, scale: 1900 })
    fillPolys(ctx, w.countries.filter((c) => c.iso === 'USA').flatMap((c) => c.polys), P, '#0b0f12')
    strokeRings(ctx, ringsOf(w.states.filter((s) => s.country === 'USA').flatMap((s) => s.polys)), P, 'rgba(160,190,200,0.45)', 1)
    fillPolys(ctx, w.lakes.filter((l) => (GREAT_LAKES as readonly string[]).includes(l.name)).flatMap((l) => l.polys), P, '#000')
    strokeRings(ctx, w.coast, P, 'rgba(220,230,235,0.6)', 1.2, false)
    ctx.fillStyle = '#4ff5e3'
    for (const [, iso, lon, lat, pop] of w.cities) {
      if (iso !== 'USA' || pop < 250000) continue
      const [x, y] = P(lon, lat)
      ctx.fillRect(x - 2, y - 2, 4, 4)
    }
  },
  /** 正交投影 + 矢量陆地（2D 地球替代方案） */
  'ortho-vector'() {
    const w = world('110m')
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, W, H)
    const o = { lon0: -95, lat0: 45, r: 420, cx: 960, cy: 540 }
    const P = orthographic(o)
    ctx.fillStyle = '#0c0c0c'
    ctx.beginPath()
    ctx.arc(960, 540, 420, 0, Math.PI * 2)
    ctx.fill()
    fillPolys(ctx, w.land, clampToLimb(P, 960, 540, 420), '#2a2a2a')
    strokeRings(ctx, w.coast, P, 'rgba(255,255,255,0.7)', 1.2, false)
  },
}

declare global {
  interface Window {
    __assets: { ready: Promise<void>; views: string[]; render(name: string): string }
  }
}
const bar = document.getElementById('bar')!
const ready = preloadAssets()
window.__assets = {
  ready,
  views: Object.keys(VIEWS),
  render(name) {
    ctx.save()
    ctx.clearRect(0, 0, W, H)
    VIEWS[name]()
    ctx.restore()
    bar.textContent = name
    return canvas.toDataURL('image/png')
  },
}
ready.then(() => {
  const v = new URLSearchParams(location.search).get('v') ?? 'chicago-clay-top'
  window.__assets.render(v)
  for (const k of Object.keys(VIEWS)) {
    const a = document.createElement('a')
    a.href = `?v=${k}`
    a.textContent = k
    a.style.marginRight = '10px'
    a.style.color = '#4ff5e3'
    bar.appendChild(a)
  }
})
