/**
 * 设备台（objects.ts）用的外部模型：Blender 预处理成精简网格 JSON（models/convert.py），构建期内联、运行时同步可取。
 * 每个 JSON：{ v: 顶点（three 坐标，水平居中、底面 y=0、最长边 = 1）, i: 三角形索引 }。
 * 来源与许可（NASA 3D Resources = 美国公有领域；Poly Haven = CC0）见 assets/LICENSES.md「3D 模型」一节。
 */
import * as THREE from 'three'
import car from './models/car.json'
import dish from './models/dish.json'
import laptop from './models/laptop.json'
import plane from './models/plane.json'
import robot from './models/robot.json'
import satellite from './models/satellite.json'

interface MeshJson {
  v: number[]
  i: number[]
}

export const MODELS = { car, dish, laptop, plane, robot, satellite } as Record<string, MeshJson>
export type ModelName = 'car' | 'dish' | 'laptop' | 'plane' | 'robot' | 'satellite'

const cache = new Map<string, THREE.BufferGeometry>()
/** 模型几何（缓存；flat = 拆成非索引三角形，面法线，硬边机械件用） */
export function modelGeo(name: ModelName, flat = false): THREE.BufferGeometry {
  const key = name + (flat ? ':flat' : '')
  let g = cache.get(key)
  if (!g) {
    const j = MODELS[name]
    g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(j.v, 3))
    g.setIndex(j.i)
    if (flat) g = g.toNonIndexed()
    g.computeVertexNormals()
    cache.set(key, g)
  }
  return g
}

/** 模型的特征边（相邻面夹角大于 angle 度） */
export function modelEdges(name: ModelName, angle = 30): THREE.BufferGeometry {
  const key = `${name}:edges:${angle}`
  let g = cache.get(key)
  if (!g) {
    g = new THREE.EdgesGeometry(modelGeo(name), angle)
    cache.set(key, g)
  }
  return g
}
