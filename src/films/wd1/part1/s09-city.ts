import * as THREE from 'three'
import type { Scene } from '../../../engine/types'
import { clamp, ease, hash, seg } from '../../../engine/math'
import { memo } from '../../../engine/three-host'
import { cityLayout } from '../../../three/city'
import { sliceGlitch } from '../../../fx/glitch'
import { WD1 } from '../../../theme'
import { spline } from './util'

/**
 * 33.3–34.6  透视点阵地面（中心几列连成亮线），随后画面压暗、横向撕裂。
 * 34.4–50.0  3D 灰色城市：34.4–38.2 暗色扫描线点云 + 故障飞越 → 38.2 低空飞越 → 39.2 退到远处看城市「板块」
 *            → 42.6 起抬高旋转成俯视斜角 → 46 起更陡的俯视，47.9 起青色线路。
 * ASSET：城市用 three/city.ts 的 cityLayout() 程序化布局（剔除河道）+ 自建实例网格与边线，换真实城市模型时替换 cityScene() 里的网格。
 */

// ---------- 点阵地面（2D 透视投影） ----------
function dotFloor(ctx: CanvasRenderingContext2D, horizon: number, travel: number, a: number) {
  const camH = 520
  for (let zi = 0; zi < 160; zi++) {
    const z = 0.9 + zi * 0.2 - ((travel * 0.2) % 0.2)
    const y = horizon + camH / z
    if (y > 1100) continue
    const rr = Math.max(0.9, 13 / z)
    for (let xi = -60; xi <= 60; xi++) {
      const x = 960 + (xi * 150) / z
      if (x < -20 || x > 1940) continue
      const center = Math.abs(xi) <= 2
      ctx.fillStyle = `rgba(255,255,255,${a * (center ? 0.9 : 0.5) * Math.min(1, 2.5 / z)})`
      ctx.beginPath()
      ctx.arc(x, y, rr, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  // 中心亮线
  ctx.strokeStyle = `rgba(255,255,255,${0.85 * a})`
  ctx.lineWidth = 2
  ctx.beginPath()
  const zb = camH / Math.max(1, 1080 - horizon)
  for (const xi of [-2, -1, 1, 2]) {
    ctx.moveTo(960, horizon)
    ctx.lineTo(960 + (xi * 150) / zb, 1080)
  }
  ctx.stroke()
}

export const floor: Scene = {
  id: 'wd1-033-floor',
  start: 33.3,
  end: 34.7,
  note: '透视点阵地面向前推进，中心几列成亮线；34.3 起压暗并横向撕裂',
  render({ ctx, t }) {
    const a = seg(t, 33.3, 33.45) * (1 - seg(t, 34.35, 34.7))
    const horizon = spline(t, [[33.3, 470], [33.45, 575], [34.3, 575], [34.6, 360]])
    dotFloor(ctx, horizon, (t - 33.3) * 2.2, a)
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, 1920, horizon - 2)
    if (t > 34.2) sliceGlitch(ctx, { amount: seg(t, 34.2, 34.6), seed: Math.floor(t * 30), maxShift: 120, slices: 26 })
  },
}

// ---------- 3D 城市 ----------
export const cityScene = () =>
  memo('wd1p1:city', () => {
    const scene = new THREE.Scene()
    const o = { seed: 77, blocks: 26, blockSize: 10, street: 3, lotsPerBlock: 3, maxHeight: 11, downtown: 0.35 }
    // 用 three/city.ts 的布局，但剔除河道上的楼，自己建网格与边线
    const riverX = (z: number) => 28 - Math.sin(z / 40) * 18
    const blds = cityLayout(o)
      .map((b, i) => {
        // 打散：部分楼合并成大体量、高度拉开层次
        const big = hash(i * 13 + 5) < 0.18 ? 1.7 : 1
        return { ...b, w: b.w * big, d: b.d * big, h: b.h * (0.45 + 1.4 * hash(i * 7 + 3) ** 2) * (big > 1 ? 0.7 : 1) }
      })
      .filter((b) => Math.abs(b.x - riverX(b.z)) > 5 + b.w / 2)
    const geo = new THREE.BoxGeometry(1, 1, 1)
    geo.translate(0, 0.5, 0)
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0x8a8a8a }), blds.length)
    const m4 = new THREE.Matrix4()
    blds.forEach((b, i) => {
      m4.makeScale(b.w, b.h, b.d)
      m4.setPosition(b.x, 0, b.z)
      mesh.setMatrixAt(i, m4)
    })
    scene.add(mesh)
    const pos: number[] = []
    for (const k of blds) {
      const x0 = k.x - k.w / 2
      const x1 = k.x + k.w / 2
      const z0 = k.z - k.d / 2
      const z1 = k.z + k.d / 2
      const h = k.h
      pos.push(x0, h, z0, x1, h, z0, x1, h, z0, x1, h, z1, x1, h, z1, x0, h, z1, x0, h, z1, x0, h, z0)
      pos.push(x0, 0, z0, x0, h, z0, x1, 0, z0, x1, h, z0, x1, 0, z1, x1, h, z1, x0, 0, z1, x0, h, z1)
    }
    const eg = new THREE.BufferGeometry()
    eg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    scene.add(new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 })))
    // 城市底板
    const span = 26 * 13
    const plate = new THREE.Mesh(new THREE.BoxGeometry(span + 8, 3, span + 8), new THREE.MeshBasicMaterial({ color: 0x161616 }))
    plate.position.y = -1.5
    scene.add(plate)
    // 一条弯曲的河（暗带）
    const river = new THREE.Mesh(new THREE.PlaneGeometry(8, span + 8, 1, 40), new THREE.MeshBasicMaterial({ color: 0x0a0a0a }))
    river.rotation.x = -Math.PI / 2
    river.position.set(28, 0.05, 0)
    const p = river.geometry.attributes.position
    for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) + Math.sin(p.getY(i) / 40) * 18)
    scene.add(river)
    scene.add(new THREE.AmbientLight(0xffffff, 0.25))
    const sun = new THREE.DirectionalLight(0xffffff, 1.6)
    sun.position.set(-30, 300, 20)
    scene.add(sun)
    const rim = new THREE.DirectionalLight(0xffffff, 0.35)
    rim.position.set(160, 40, -120)
    scene.add(rim)
    // 青色线路（沿街道的折线）：只存点，2D 投影后画（WebGL 线宽固定 1px 太细）
    const routes: THREE.Vector3[][] = []
    for (let i = 0; i < 9; i++) {
      const pts: THREE.Vector3[] = []
      let x = (Math.floor(hash(i * 5 + 1) * 20) - 10) * 13 - 1.5
      let z = -170
      pts.push(new THREE.Vector3(x, 0.4, z))
      for (let k = 0; k < 6; k++) {
        z += 30 + hash(i * 17 + k) * 40
        pts.push(new THREE.Vector3(x, 0.4, z))
        x += (hash(i * 23 + k) > 0.5 ? 1 : -1) * 13 * Math.ceil(hash(i * 29 + k) * 4)
        pts.push(new THREE.Vector3(x, 0.4, z))
      }
      routes.push(pts)
    }
    const cam = new THREE.PerspectiveCamera(42, 1920 / 1080, 0.5, 3000)
    return { scene, cam, routes, span }
  })

/** 相机：注视点 (tx,0,tz)、距离 d、仰角 el、方位 az（度） */
export function cityCamera(t: number) {
  const K = (k: [number, number][]) => spline(t, k)
  const el = K([[34.4, 3], [36.0, 5], [38.2, 7], [39.2, 8], [42.4, 8], [42.9, 16], [43.6, 26], [44.5, 33], [46.2, 58], [48.0, 55], [50, 52], [51.5, 56], [53.4, 68]])
  const d = K([[34.4, 40], [36.0, 60], [38.2, 90], [38.6, 150], [39.2, 235], [42.4, 228], [42.9, 300], [43.6, 290], [44.5, 250], [46.2, 115], [48.0, 105], [50, 96], [51.5, 108], [53.4, 210]])
  const az = K([[34.4, 0], [39.2, 0], [42.4, 3], [42.9, 22], [43.6, 38], [44.5, 42], [46.2, 28], [48.0, 18], [50, 8], [53.4, -14]])
  const tz = K([[34.4, 120], [36.0, 60], [38.2, 0], [39.2, 40], [42.4, 40], [44.5, 10], [46.2, 0], [50, -20], [53.4, -60]])
  const tx = K([[34.4, 0], [42.4, 0], [44.5, -10], [46.2, 0], [50, 10], [53.4, -30]])
  return { el, d, az, tx, tz }
}

/** 50–53.4 由 part2 的 s50-city 继续使用同一城市与相机（关键帧已延续到 53.4），保证 50s 无跳变 */
export function placeCam(cam: THREE.PerspectiveCamera, t: number) {
  const c = cityCamera(t)
  const el = (c.el * Math.PI) / 180
  const az = (c.az * Math.PI) / 180
  cam.position.set(c.tx + c.d * Math.cos(el) * Math.sin(az), 2 + c.d * Math.sin(el), c.tz + c.d * Math.cos(el) * Math.cos(az))
  cam.up.set(0, 1, 0)
  cam.lookAt(c.tx, 0, c.tz)
  cam.updateMatrixWorld()
}

/** 把城市世界坐标投影到画面（给标签用） */
export function projectCity(t: number, x: number, y: number, z: number) {
  const { cam } = cityScene()
  placeCam(cam, t)
  const v = new THREE.Vector3(x, y, z).project(cam)
  return { x: (v.x * 0.5 + 0.5) * 1920, y: (-v.y * 0.5 + 0.5) * 1080, vis: v.z < 1 }
}

export const city: Scene = {
  id: 'wd1-034-city',
  start: 34.4,
  end: 50,
  note: '3D 灰色城市：暗色扫描线故障飞越 → 低空飞越 → 远景城市板块 → 抬高旋转成俯视 → 陡俯视 + 青色线路',
  render({ ctx, t, three }) {
    const { scene, cam, routes } = cityScene()
    placeCam(cam, t)
    const gl = three.render(scene, cam)

    const dark = t < 38.2
    ctx.save()
    const bright = dark ? 0.18 + 0.5 * seg(t, 37.0, 38.2) : 1
    const flick = dark && hash(Math.floor(t * 30) * 7) < 0.25 ? 0.5 : 1
    ctx.filter = `contrast(1.5) brightness(${bright * flick})`
    ctx.globalAlpha = seg(t, 34.4, 34.9)
    ctx.drawImage(gl, 0, 0)
    ctx.restore()
    const ra = seg(t, 47.85, 48.3)
    if (ra > 0) {
      ctx.strokeStyle = WD1.cyanDeep
      ctx.globalAlpha = ra
      ctx.lineWidth = 2.2
      for (const r of routes) {
        ctx.beginPath()
        let started = false
        for (const p of r) {
          const v = p.clone().project(cam)
          if (v.z > 1) {
            started = false
            continue
          }
          const x = (v.x * 0.5 + 0.5) * 1920
          const y = (-v.y * 0.5 + 0.5) * 1080
          if (started) ctx.lineTo(x, y)
          else ctx.moveTo(x, y)
          started = true
        }
        ctx.stroke()
      }
      ctx.globalAlpha = 1
    }
    if (dark) {
      // 扫描线「点云」质感：每 4px 抹掉 2px
      ctx.fillStyle = 'rgba(0,0,0,0.85)'
      for (let y = 0; y < 1080; y += 4) ctx.fillRect(0, y, 1920, 2)
      const f = Math.floor(t * 30)
      if (hash(f * 3 + 1) < 0.45) sliceGlitch(ctx, { amount: 0.4 + 0.6 * hash(f), seed: f, maxShift: 160, slices: 30 })
      // 偶尔闪回点阵地面切片
      if ((t > 36.1 && t < 36.3) || (t > 36.75 && t < 36.95)) {
        ctx.save()
        ctx.beginPath()
        ctx.rect(0, t < 36.5 ? 0 : 640, 1920, 260)
        ctx.clip()
        dotFloor(ctx, t < 36.5 ? 20 : 690, t, 0.8)
        ctx.restore()
      }
    } else if (t < 39.2) {
      // 低空飞越时仍有少量横向撕裂
      const f = Math.floor(t * 30)
      if (hash(f * 5 + 2) < 0.3) sliceGlitch(ctx, { amount: 0.3, seed: f, maxShift: 60, slices: 20 })
    }
    void clamp
    void ease
  },
}
