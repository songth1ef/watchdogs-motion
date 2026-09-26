import * as THREE from 'three'
import type { Scene } from '../../../engine/types'
import { hash, seg } from '../../../engine/math'
import { memo } from '../../../engine/three-host'
import { alignTrack, cameraTrack, type CameraTrack } from '../../../engine/camera-track'
import { buildRealCity } from '../../../three/real-city'
import { mergePost, presets, renderWithPost } from '../../../three/post'
import { geo, hasGeo } from '../../../assets/geo'
import { sliceGlitch } from '../../../fx/glitch'
import { WD1 } from '../../../theme'
import { blendPose, poseToCamera, projectTo, sampleTrackExt, smoothW, type Pose } from './city-cam'
import { spline } from './util'

/**
 * 33.3–34.6  透视点阵地面（中心几列连成亮线），随后画面压暗、横向撕裂。
 * 34.4–50.0  3D 灰色城市：34.4–38.2 暗色扫描线点云 + 故障飞越 → 38.2 低空飞越 → 39.2 退到远处看城市「板块」
 *            → 42.6 起抬高旋转成俯视斜角 → 46 起更陡的俯视，47.9 起青色线路。
 *
 * V2（G4a）：
 * - 城市：真实芝加哥 OSM（buildRealCity dark，Near West Side 一块 ~1.7 km 见方的「板块」+ 板厚），
 *   青色线路 = OSM 的 CTA 轨道（rail 图层）。原片灰色城市与 OSM 配准不出唯一解（见镜头表），
 *   只保证街网朝向、街区尺度与原片一致（由反求拼图的梯度方向/街区周期量出）。
 * - 相机：38.2–42.8 反求 wd1-gray-city-b，43.23–48.3 反求 wd1-gray-city-c（42.8–43.23 两段各自外推后混合），
 *   34.4–38.2 由 b 段首帧按初速倒推（暗场故障段），48.3–53.4 由 c 段末帧外推 + 按设施标签屏幕轨迹反解的
 *   加速度/转角（TAIL，见 fitTail 注释），part2 s50 继续用同一函数，50.0 无跳变。
 * - 后期：greyCityEdges（AO + 楼沿亮边 + 景深 + 高反差 + 颗粒）取代 2D 的 contrast(1.5)；亮边收稀、压暗。
 * ASSET：城市几何换成原片同款模型时只改 cityScene()。
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
/** 城市板块（本地米 [西, 南, 东, 北]，芝加哥原点 State & Madison）：b 段远景里板块的范围按原片正射图量出 */
export const GRAY_RECT: [number, number, number, number] = [-3100, -2650, -1350, -1000]
/**
 * c 段（43.23–48.3）：反求 → 世界。旋转 ≡ 45° (mod 90) 由拼图梯度方向定，使街网与 OSM 网格同向；
 * 尺度 ~2000 由街区周期（0.046 / 0.068 反求单位 ≈ 93 / 137 m）定；平移/旋转象限在 ±2 km 内扫描
 * 「模糊 Sobel 边缘」NCC，最高 0.16（无明显峰，原片灰城与 OSM 不是同一街区），取中低层为主的 Near West Side / Pilsen 北缘——
 * 原片楼高以中低层为主，Loop 的超高层会在陡俯视时挡满画面（试过，放弃）。
 */
export const GRAY_C_ALIGN = { scale: 2031.3, rotation: [0, 312.25, 0] as [number, number, number], offset: [-2000, 0, 2007.3] as [number, number, number] }
/**
 * b 段（38.2–42.8）：b 按尾速外推到 43.23，与 c 首帧（同刻）重合求对齐：只绕 Y 转、尺度按离地高度（908.5）。
 * 两段俯仰角一致（-21.41° / -21.45°），说明衔接可信；远景段的图像精修会把尺度拉到 728（-20%）、破坏衔接，没采用。
 */
export const GRAY_B_ALIGN = { scale: 908.5, rotation: [0, 292.66, 0] as [number, number, number], offset: [-2496.5, 0, 1933.5] as [number, number, number] }

export const cityScene = () =>
  memo('wd1p1:city-v2', () => {
    const scene = new THREE.Scene()
    const [x0, y0, x1, y1] = GRAY_RECT
    let mesh: THREE.Mesh | null = null
    if (hasGeo('chicago')) {
      // 楼面中灰；亮边交给后期 edge（只描楼顶轮廓、远处淡出），几何边线关掉，避免「每栋楼一圈白线」过密
      const city = buildRealCity({ region: 'chicago', style: 'dark', rect: GRAY_RECT, color: 0x6a6a6a, jitter: 0.35, edges: false, ground: 0x0b0b0b, water: 0x050505, minArea: 40 })
      mesh = city.mesh
      scene.add(city.group)
    }
    // 板块厚度（原片远景里能看到板块侧面）
    const slab = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 60, y1 - y0), new THREE.MeshLambertMaterial({ color: 0x1c1c1c }))
    slab.position.set((x0 + x1) / 2, -30.2, -(y0 + y1) / 2)
    scene.add(slab)
    scene.add(new THREE.AmbientLight(0xffffff, 0.35))
    const sun = new THREE.DirectionalLight(0xffffff, 1.5)
    sun.position.set(-600, 2400, 300)
    scene.add(sun)
    const rim = new THREE.DirectionalLight(0xffffff, 0.4)
    rim.position.set(1500, 400, -1200)
    scene.add(rim)
    // 青色线路：OSM 的 CTA 轨道 + 铁路（只存点，2D 投影后画，WebGL 线宽固定 1px 太细）
    const routes: THREE.Vector3[][] = []
    const R = hasGeo('chicago') ? geo('chicago').layers.rail : undefined
    const pad = 1500
    if (R)
      for (let i = 0; i < R.count; i++) {
        const cls = R.props.cls ? R.props.cls[i] : 0
        if (cls & 0x40) continue // 隧道段不画
        const pts: THREE.Vector3[] = []
        for (let k = R.lineStart[i]; k < R.lineStart[i + 1]; k++) {
          const x = R.xy[2 * k]
          const y = R.xy[2 * k + 1]
          if (x < x0 - pad || x > x1 + pad || y < y0 - pad || y > y1 + pad) {
            if (pts.length > 1) routes.push(pts.splice(0))
            else pts.length = 0
            continue
          }
          pts.push(new THREE.Vector3(x, 1, -y))
        }
        if (pts.length > 1) routes.push(pts)
      }
    const cam = new THREE.PerspectiveCamera(24, 1920 / 1080, 2, 40000)
    return { scene, cam, routes, mesh }
  })

// ---------- 相机 ----------
const grayTracks = () =>
  memo('wd1p1:gray-tracks', () => ({
    b: alignTrack(cameraTrack('wd1-gray-city-b'), GRAY_B_ALIGN),
    c: alignTrack(cameraTrack('wd1-gray-city-c'), GRAY_C_ALIGN),
  }))

/**
 * 48.3 以后（反求解不出：青色线路和标签盖满画面）的相机参数：以 c 段末帧为起点，
 * 位置 = P0 + v·dt + ½a·dt²（v = c 段末速度 × kv），朝向 = 绕世界 Y 转 yaw(dt)、绕相机右轴转 pitch(dt)，
 * fov 线性变化。参数由 48.55–51.5 七个设施标签的屏幕轨迹（参考帧量出）联合反解：
 * 标签锚点（地面上的 3D 点）与相机参数一起最小化重投影误差（tmp 工具 fitTail，未入库）。
 */
export interface Tail {
  kv: number
  a: [number, number, number]
  yaw: [number, number]
  pitch: [number, number]
  fov: number
  /** 50 s 起的额外后拉（s50 城市转青、拉远成圆盘）：沿视线反方向，米/秒²（二次） */
  pull: number
}
export const TAIL: Tail = { kv: 1, a: [0, 0, 0], yaw: [0, 0], pitch: [0, 0], fov: 0, pull: 0 }

const newPose = (): Pose => ({ pos: new THREE.Vector3(), quat: new THREE.Quaternion(), fov: 24 })

export function tailPose(t: number, P: Tail = TAIL, out: Pose = newPose()): Pose {
  const { c } = grayTracks()
  const n = c.times.length
  const t0 = c.end
  const dt = t - t0
  const p0 = sampleTrackExt(c, t0, 0, newPose())
  const v = c.pos[n - 1].clone().sub(c.pos[n - 4]).divideScalar(c.times[n - 1] - c.times[n - 4])
  out.pos.copy(p0.pos).addScaledVector(v, P.kv * dt).add(new THREE.Vector3(...P.a).multiplyScalar(0.5 * dt * dt))
  const yaw = P.yaw[0] * dt + P.yaw[1] * dt * dt
  const pitch = P.pitch[0] * dt + P.pitch[1] * dt * dt
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(p0.quat)
  const q = new THREE.Quaternion()
    .setFromAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(yaw))
    .multiply(new THREE.Quaternion().setFromAxisAngle(right, THREE.MathUtils.degToRad(pitch)))
  out.quat.copy(q).multiply(p0.quat)
  out.fov = p0.fov + P.fov * dt
  const d50 = Math.max(0, t - 50)
  if (d50 > 0 && P.pull) out.pos.addScaledVector(new THREE.Vector3(0, 0, 1).applyQuaternion(out.quat), P.pull * d50 * d50)
  return out
}

const _p1 = newPose()
const _p2 = newPose()

/** t 时刻的相机姿态（34.4–53.4） */
export function grayPose(t: number, out: Pose = newPose()): Pose {
  const { b, c } = grayTracks()
  if (t < b.start) return sampleTrackExt(b, t, 4, out) // 暗场故障段：b 段首帧按初速倒推
  if (t <= b.end) return sampleTrackExt(b, t, 0, out)
  if (t < c.start) {
    // 42.8–43.23：两段之间没有反求帧，各自外推后按 smoothstep 混合
    sampleTrackExt(b, t, 0.5, _p1)
    sampleTrackExt(c, t, 0.5, _p2)
    return blendPose(_p1, _p2, smoothW(t, b.end, c.start), out)
  }
  if (t <= c.end) return sampleTrackExt(c, t, 0, out)
  return tailPose(t, TAIL, out)
}

/** 50–53.4 由 part2 的 s50-city 继续使用同一城市与相机，保证 50s 无跳变 */
export function placeCam(cam: THREE.PerspectiveCamera, t: number) {
  return poseToCamera(cam, grayPose(t))
}

/** 把城市世界坐标投影到画面（给标签用） */
export function projectCity(t: number, p: THREE.Vector3Like) {
  const { cam } = cityScene()
  placeCam(cam, t)
  const r = projectTo(cam, p)
  return { x: r.x, y: r.y, vis: !r.behind }
}

/** 灰色城市的后期参数（s50 复用；亮边比预设稀、暗） */
export const grayPost = (t: number, over: Parameters<typeof mergePost>[1] = {}) =>
  mergePost(
    mergePost(presets.greyCityEdges, {
      time: t,
      ao: { radius: 12, thickness: 5 },
      // V1 评估：亮边过密、整体偏亮 → 强度降、只描楼顶、远处更早淡出，楼面压得更暗
      edge: { intensity: 0.5, thickness: 1, normalThreshold: 0.3, depthThreshold: 0.06, roofBias: 0.95, faceGain: 0.45, fadeNear: 500, fadeFar: 1800 },
      dof: { focus: { uv: [0.5, 0.6] }, aperture: 10, maxBlur: 24, nearScale: 1.8 },
      bloom: { threshold: 0.8, strength: 0.35, radius: 0.25 },
      tone: { contrast: 1.35, black: 0.04, exposure: 0.8 },
    }),
    over,
  )

/** 青色线路 */
export function drawRoutes(ctx: CanvasRenderingContext2D, cam: THREE.Camera, routes: THREE.Vector3[][], alpha: number) {
  if (alpha <= 0) return
  ctx.save()
  ctx.strokeStyle = WD1.cyanDeep
  ctx.globalAlpha = alpha
  ctx.lineWidth = 2.2
  const v = new THREE.Vector3()
  for (const r of routes) {
    ctx.beginPath()
    let started = false
    for (const p of r) {
      v.copy(p).project(cam)
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
  ctx.restore()
}

export type { CameraTrack }

export const city: Scene = {
  id: 'wd1-034-city',
  start: 34.4,
  end: 50,
  note: '3D 灰色城市：暗色扫描线故障飞越 → 低空飞越 → 远景城市板块 → 抬高旋转成俯视 → 陡俯视 + 青色线路',
  render({ ctx, t, three }) {
    const { scene, cam, routes } = cityScene()
    placeCam(cam, t)
    const dark = t < 38.2
    const gl = renderWithPost(three, scene, cam, grayPost(t, { clear: 0x000000, clearAlpha: 1, dof: { aperture: dark ? 4 : 10 } }))
    ctx.save()
    // 暗场段：整体压暗 + 逐帧闪烁（2D 故障效果，不是后期近似）
    const bright = dark ? 0.18 + 0.5 * seg(t, 37.0, 38.2) : 1
    const flick = dark && hash(Math.floor(t * 30) * 7) < 0.25 ? 0.5 : 1
    if (bright * flick < 1) ctx.filter = `brightness(${bright * flick})`
    ctx.globalAlpha = seg(t, 34.4, 34.9)
    ctx.drawImage(gl, 0, 0)
    ctx.restore()
    drawRoutes(ctx, cam, routes, seg(t, 47.85, 48.3))
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
  },
}
