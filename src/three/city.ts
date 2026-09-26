import * as THREE from 'three'
import { rng } from '../engine/math'

export interface CityOpts {
  seed: number
  /** 街区数量（每个方向） */
  blocks?: number
  /** 街区边长（世界单位） */
  blockSize?: number
  street?: number
  /** 每个街区拆几栋楼（每边） */
  lotsPerBlock?: number
  maxHeight?: number
  /** 中心越高（CBD 效果）；0 = 均匀 */
  downtown?: number
}

export interface Building {
  x: number
  z: number
  w: number
  d: number
  h: number
}

/** 程序化生成楼块布局（纯数据，材质由调用方决定） */
export function cityLayout(o: CityOpts): Building[] {
  const R = rng(o.seed)
  const n = o.blocks ?? 14
  const bs = o.blockSize ?? 10
  const st = o.street ?? 3
  const lots = o.lotsPerBlock ?? 3
  const maxH = o.maxHeight ?? 30
  const dt = o.downtown ?? 1
  const out: Building[] = []
  const span = n * (bs + st)
  for (let bx = 0; bx < n; bx++)
    for (let bz = 0; bz < n; bz++) {
      const x0 = bx * (bs + st) - span / 2
      const z0 = bz * (bs + st) - span / 2
      const cx = (bx + 0.5) / n - 0.5
      const cz = (bz + 0.5) / n - 0.5
      const center = Math.exp(-(cx * cx + cz * cz) * 12)
      const lot = bs / lots
      for (let i = 0; i < lots; i++)
        for (let j = 0; j < lots; j++) {
          if (R.chance(0.12)) continue
          const inset = R.range(0.3, 0.8)
          const w = lot - inset * 2
          const d = lot - inset * 2
          const base = R.range(1.5, 6)
          const tall = R.chance(0.08 + center * 0.4 * dt) ? R.range(0.4, 1) * maxH * (0.4 + center * dt) : 0
          out.push({ x: x0 + i * lot + lot / 2, z: z0 + j * lot + lot / 2, w, d, h: Math.max(base, tall) })
        }
    }
  return out
}

/** WD1 素模城市：白色哑光方块 + 柔和阴影（用 InstancedMesh，数千栋也流畅） */
export function clayCity(o: CityOpts & { color?: number }) {
  const b = cityLayout(o)
  const geo = new THREE.BoxGeometry(1, 1, 1)
  geo.translate(0, 0.5, 0)
  const mat = new THREE.MeshStandardMaterial({ color: o.color ?? 0xf2f2f2, roughness: 0.9, metalness: 0 })
  const mesh = new THREE.InstancedMesh(geo, mat, b.length)
  const m = new THREE.Matrix4()
  b.forEach((k, i) => {
    m.makeScale(k.w, k.h, k.d)
    m.setPosition(k.x, 0, k.z)
    mesh.setMatrixAt(i, m)
  })
  mesh.castShadow = true
  mesh.receiveShadow = true
  return { mesh, buildings: b }
}

/** WD2 线框城市：只有楼块边线（LineSegments 合并成一个几何体） */
export function wireCity(o: CityOpts & { color?: number; opacity?: number }) {
  const b = cityLayout(o)
  const pos: number[] = []
  const e = (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number) => pos.push(x1, y1, z1, x2, y2, z2)
  for (const k of b) {
    const x0 = k.x - k.w / 2
    const x1 = k.x + k.w / 2
    const z0 = k.z - k.d / 2
    const z1 = k.z + k.d / 2
    const h = k.h
    for (const y of [0, h]) {
      e(x0, y, z0, x1, y, z0)
      e(x1, y, z0, x1, y, z1)
      e(x1, y, z1, x0, y, z1)
      e(x0, y, z1, x0, y, z0)
    }
    e(x0, 0, z0, x0, h, z0)
    e(x1, 0, z0, x1, h, z0)
    e(x1, 0, z1, x1, h, z1)
    e(x0, 0, z1, x0, h, z1)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  const mat = new THREE.LineBasicMaterial({ color: o.color ?? 0xffffff, transparent: true, opacity: o.opacity ?? 0.6 })
  return { lines: new THREE.LineSegments(geo, mat), buildings: b }
}
