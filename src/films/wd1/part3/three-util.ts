/**
 * part3 的 three.js 小工具：轨道相机、临时开启阴影渲染。
 */
import * as THREE from 'three'
import type { FrameCtx } from '../../../engine/types'
import { clamp, ease, lerp } from '../../../engine/math'

export interface Orbit {
  /** 目标点 */
  tx: number
  ty: number
  tz: number
  /** 距离 */
  d: number
  /** 方位角（度），决定俯拍时画面旋转 */
  az: number
  /** 仰角（度），90 = 正俯视 */
  el: number
  fov: number
  /** 镜头移轴（竖直方向，占画面高度的比例；负数 = 画面内容下移），可省略 */
  shift?: number
}

/** 关键帧插值（每段 inOutCubic），返回相机参数 */
export function orbitAt(t: number, keys: [number, Orbit][], easing: (x: number) => number = ease.inOutCubic): Orbit {
  if (t <= keys[0][0]) return keys[0][1]
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, a] = keys[i]
    const [t1, b] = keys[i + 1]
    if (t <= t1) {
      const p = easing(clamp((t - t0) / (t1 - t0)))
      const o = {} as Orbit
      for (const k of Object.keys({ ...a, ...b }) as (keyof Orbit)[]) o[k] = lerp(a[k] ?? 0, b[k] ?? 0, p)
      return o
    }
  }
  return keys[keys.length - 1][1]
}

export function applyOrbit(cam: THREE.PerspectiveCamera, o: Orbit) {
  const el = (Math.min(o.el, 89.5) * Math.PI) / 180
  const az = (o.az * Math.PI) / 180
  cam.fov = o.fov
  cam.position.set(o.tx + o.d * Math.cos(el) * Math.sin(az), o.ty + o.d * Math.sin(el), o.tz + o.d * Math.cos(el) * Math.cos(az))
  cam.up.set(0, 1, 0)
  cam.lookAt(o.tx, o.ty, o.tz)
  if (o.shift) cam.setViewOffset(1920, 1080, 0, o.shift * 1080, 1920, 1080)
  else cam.clearViewOffset()
  cam.updateProjectionMatrix()
}

/** 渲染一个需要阴影的场景：临时打开共享 renderer 的 shadowMap，渲染完恢复，避免影响其他镜头 */
export function renderShadowed(f: FrameCtx, scene: THREE.Scene, cam: THREE.Camera, clear = 0x000000, clearAlpha = 1) {
  const r = f.three.renderer
  const prev = r.shadowMap.enabled
  const prevType = r.shadowMap.type
  r.shadowMap.enabled = true
  r.shadowMap.type = THREE.PCFSoftShadowMap
  const out = f.three.render(scene, cam, clear, clearAlpha)
  r.shadowMap.enabled = prev
  r.shadowMap.type = prevType
  return out
}

/** 把世界坐标投影到 1920×1080 画布坐标 */
export function project(cam: THREE.Camera, x: number, y: number, z: number, W: number, H: number) {
  const v = new THREE.Vector3(x, y, z).project(cam)
  return { x: (v.x * 0.5 + 0.5) * W, y: (-v.y * 0.5 + 0.5) * H, behind: v.z > 1 }
}
