/**
 * 地球贴图加载器（NASA Black Marble 2016 夜光 / Blue Marble NG 地形测深 / GEBCO 高程灰度），
 * 全部是 4096×2048 等距圆柱投影：左边 = 经度 -180，上边 = 北纬 90，与 THREE.SphereGeometry 的 UV 一致
 * （wd1 part1 earth.ts 的 lonLatVec 约定可直接套用）。
 *
 * 用法：启动时 preloadAssets()（或 await loadEarth()）→ 镜头里同步调用 earthImage / earthTexture / earthComposite。
 */
import * as THREE from 'three'
import { loadImage } from './geo'

export type EarthMap = 'night' | 'blue' | 'topo'
const FILES: Record<EarthMap, string> = {
  /** NASA Black Marble 2016（夜间灯光，彩色） */
  night: 'black-marble-2016-4096.jpg',
  /** NASA Blue Marble NG 2004-12（地形 + 海底测深，彩色） */
  blue: 'blue-marble-topo-bathy-4096.jpg',
  /** NASA/GEBCO 高程（陆地灰度，海洋黑） */
  topo: 'topography-gray-4096.jpg',
}
const BASE = import.meta.env.BASE_URL + 'assets/earth/'
const images = new Map<EarthMap, HTMLImageElement>()
const pending = new Map<EarthMap, Promise<HTMLImageElement>>()

export function loadEarth(which: EarthMap[] = ['night', 'blue', 'topo']): Promise<HTMLImageElement[]> {
  return Promise.all(
    which.map((w) => {
      if (!pending.has(w))
        pending.set(
          w,
          loadImage(BASE + FILES[w]).then((im) => {
            images.set(w, im)
            return im
          }),
        )
      return pending.get(w)!
    }),
  )
}
export const hasEarth = (w: EarthMap) => images.has(w)
export function earthImage(w: EarthMap): HTMLImageElement {
  const im = images.get(w)
  if (!im) throw new Error(`地球贴图 ${w} 还没加载：先 await loadEarth()`)
  return im
}

const textures = new Map<string, THREE.Texture>()
/** three 贴图（按名字缓存；sRGB） */
export function earthTexture(w: EarthMap | HTMLCanvasElement, key?: string): THREE.Texture {
  const k = typeof w === 'string' ? w : (key ?? 'canvas')
  let t = textures.get(k)
  if (t) return t
  t = typeof w === 'string' ? new THREE.Texture(earthImage(w)) : new THREE.CanvasTexture(w)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  t.needsUpdate = true
  textures.set(k, t)
  return t
}

const comps = new Map<string, HTMLCanvasElement>()
/**
 * 合成灰度地球（WD1 开场「夜光 + 地形浮雕」风格）：
 *   out = ocean + topo·topoGain（陆地起伏） + blueGray·blueGain（Blue Marble 去色） + lights·lightGain（夜光，叠加）
 * 返回 w×h canvas（默认 4096×2048），结果按参数缓存。
 */
export function earthComposite(o: { topo?: number; blue?: number; lights?: number; ocean?: number; w?: number; h?: number; gamma?: number } = {}): HTMLCanvasElement {
  const key = JSON.stringify(o)
  const hit = comps.get(key)
  if (hit) return hit
  const W = o.w ?? 4096
  const H = o.h ?? 2048
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d', { willReadFrequently: true })!
  const layer = (m: EarthMap) => {
    g.clearRect(0, 0, W, H)
    g.drawImage(earthImage(m), 0, 0, W, H)
    return g.getImageData(0, 0, W, H).data
  }
  const topo = (o.topo ?? 0.35) > 0 ? layer('topo') : null
  const blue = (o.blue ?? 0) > 0 ? layer('blue') : null
  const night = layer('night')
  const out = g.createImageData(W, H)
  const d = out.data
  const ocean = o.ocean ?? 14
  const gm = o.gamma ?? 1
  for (let i = 0; i < d.length; i += 4) {
    let v = ocean
    if (topo) v += topo[i] * (o.topo ?? 0.35)
    if (blue) v += (0.3 * blue[i] + 0.59 * blue[i + 1] + 0.11 * blue[i + 2]) * (o.blue ?? 0)
    const L = 0.3 * night[i] + 0.59 * night[i + 1] + 0.11 * night[i + 2]
    v += L * (o.lights ?? 1)
    v = 255 * Math.pow(Math.min(255, v) / 255, gm)
    d[i] = d[i + 1] = d[i + 2] = v
    d[i + 3] = 255
  }
  g.putImageData(out, 0, 0)
  comps.set(key, c)
  return c
}

/** 经纬度 → 贴图像素（等距圆柱） */
export const earthUV = (lon: number, lat: number, W = 4096, H = 2048): [number, number] => [((lon + 180) / 360) * W, ((90 - lat) / 180) * H]
