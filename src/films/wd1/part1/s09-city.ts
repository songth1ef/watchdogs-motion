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
import { blendPose, poseToCamera, projectTo, sampleTrackExt, smoothW, withFlatNormals, type Pose } from './city-cam'
import { spline } from './util'

/**
 * 33.3–34.6  透视点阵地面（中心几列连成亮线），随后画面压暗、横向撕裂。
 * 34.4–50.0  3D 灰色城市：34.4–38.2 暗色扫描线点云 + 故障飞越 → 38.2 低空飞越 → 39.2 退到远处看城市「板块」
 *            → 42.6 起抬高旋转成俯视斜角 → 46 起更陡的俯视，47.9 起青色线路。
 *
 * V2（G4a）：
 * - 城市：真实芝加哥 OSM（buildRealCity dark，West Loop 一带 ~3.1×2.2 km 的「板块」+ 板厚），
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
export const GRAY_RECT: [number, number, number, number] = [-1925, -2091, -55, 1409]
/**
 * c 段（43.23–48.3）：反求 → 世界。旋转 ≡ 45° (mod 90) 由拼图梯度方向定，使街网与 OSM 网格同向；
 * 尺度与平移：在 ±3 km、尺度 1600–4500、四个象限里扫描「模糊 Sobel 边缘」NCC 再坐标下降精修，
 * 最高也只有 0.16–0.21、没有明显峰——原片灰城与 OSM 对不上同一街区（FFT 轮廓配准同样无解）。
 * 取 4147 米/单位（原片陡俯视一屏 ~15 个小楼块，密度对上），位置放在 West Loop / Loop 西缘（楼块尺度 30–80 m、街区排满，与原片楼块粗细一致；高度 ×0.3）；
 * 试过 Loop（超高层在陡俯视时挡满画面）、Near West Side（楼稀、太大）、Lincoln Park（视野里有湖）、West Town（工业区空地多）、Wicker Park（住宅太碎）都更不像。
 * b、c 两段同步平移，衔接不变。
 */
export const GRAY_C_ALIGN = { scale: 4146.9, rotation: [0, 41.63, 0] as [number, number, number], offset: [-1000, 7.3, 300] as [number, number, number] }
/**
 * b 段（38.2–42.8）：c 段开头 43.23–44.1 是坏帧（误差 2–5 px、位置/朝向逐帧乱跳，缺口 42.8–43.7），不能用「同刻重合」衔接。
 * 改为 b 独立对齐：b 的点云就是远景里的城市板块 → 让点云质心落在板块中心（= c 段点云质心）、
 * 点云长轴 1.47 单位 ↔ 板块长边 3.5 km（尺度 2400）、旋转 98° 让 b 末帧朝向（-164°+98°）接近 c 首个好帧 44.2 的朝向（-66°），
 * 42.8–44.2 两段之间按 smoothstep 混合（见 grayPose）。板块 GRAY_RECT 按同一对齐由 b 点云范围定。
 */
export const GRAY_B_ALIGN = { scale: 2400, rotation: [0, 98, 0] as [number, number, number], offset: [-997.6, 0, 390.5] as [number, number, number] }

export const cityScene = () =>
  memo('wd1p1:city-v2', () => {
    const scene = new THREE.Scene()
    // 远景（39–43 s 看整块板块）原片很暗：黑色距离雾，近景俯视（< 2 km）不受影响
    scene.fog = new THREE.Fog(0x000000, 2200, 6500)
    const [x0, y0, x1, y1] = GRAY_RECT
    let mesh: THREE.Mesh | null = null
    if (hasGeo('chicago')) {
      // 楼面中灰；亮边交给后期 edge（只描楼顶轮廓、远处淡出），几何边线关掉，避免「每栋楼一圈白线」过密
      // 高度 ×0.3：原片灰城以中低层为主（38.2 低空飞越时相机离地仅 ~110 m），Loop 西缘的高层压下来
      const city = buildRealCity({ region: 'chicago', style: 'dark', rect: GRAY_RECT, color: 0x6a6a6a, jitter: 0.35, heightScale: 0.3, edges: false, ground: 0x1a1a1a, water: 0x080808, minArea: 40 })
      mesh = withFlatNormals(city.mesh)
      scene.add(city.group)
    }
    // 板块厚度（原片远景里能看到板块侧面）
    const slab = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 60, y1 - y0), new THREE.MeshLambertMaterial({ color: 0x1c1c1c }))
    slab.position.set((x0 + x1) / 2, -30.2, -(y0 + y1) / 2)
    scene.add(slab)
    scene.add(new THREE.AmbientLight(0xffffff, 0.6))
    const sun = new THREE.DirectionalLight(0xffffff, 1.8)
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
    const cam = new THREE.PerspectiveCamera(24, 1920 / 1080, 20, 12000)
    return { scene, cam, routes, mesh }
  })

// ---------- 相机 ----------
const grayTracks = () =>
  memo('wd1p1:gray-tracks', () => ({
    b: alignTrack(cameraTrack('wd1-gray-city-b'), GRAY_B_ALIGN),
    c: alignTrack(cameraTrack('wd1-gray-city-c'), GRAY_C_ALIGN),
  }))

/**
 * 48.3 以后（反求解不出：青色线路和标签盖满画面）的相机，分两段、C¹ 连续：
 * - TAIL（48.3–50）：以 c 段末帧为起点，位置 = P0 + kv·v·dt + ½a·dt²（v = c 段末速度），
 *   朝向 = 绕世界 Y 转 yaw(dt)、绕相机右轴转 pitch(dt)（度，一次 + 二次项），fov 线性。
 * - TAIL2（50–53.4，part2 s50）：在 TAIL 的外推上再叠二次项（加速度 / 转角 / fov），50.0 处位置、速度、朝向都连续。
 * 参数由设施标签的屏幕轨迹反解：48.55–50 七个标签共 32 个观测（s10 从参考帧量出的左上角）联合求 TAIL 与 7 个地面锚点，
 * RMS 45 px（1920 宽）；TAIL2 固定锚点、用 51.5 参考帧再量的 7 个位置求（tmp 工具 fitTail，未入库）。
 */
export interface Tail {
  kv: number
  a: [number, number, number]
  yaw: [number, number]
  pitch: [number, number]
  fov: number
}
export interface Tail2 {
  a: [number, number, number]
  yaw: number
  pitch: number
  fov: number
}
export const TAIL: Tail = { kv: 0.6109, a: [-26.5625, 51.5625, 109.375], yaw: [26.5625, 1.4297], pitch: [-8.2813, 4.5], fov: -2.6563 }
export const TAIL2: Tail2 = { a: [-78.125, 92.188, 378.125], yaw: -5, pitch: 0, fov: 0.906 }
/** 设施标签的地面锚点（世界坐标，米；与 TAIL 一起反解）。s10 control 与 s50 共用 */
export const TAG_ANCHORS: Record<string, [number, number, number]> = {
  'TRAFFIC LIGHTS': [-1210.6, 10, 72.6],
  CAMERAS: [-1401.3, 10, 29.4],
  'NUCLEAR PLANT': [-1288.2, 10, 306.8],
  'WATER SUPPLY': [-1706.1, 10, 241.1],
  'DOOR LOCK': [-1420.7, 10, -183.9],
  'SECURITY SYSTEM': [-1605.6, 10, -66.9],
  'BRIDGE CTRL': [-1679.1, 10, 22.2],
}

const newPose = (): Pose => ({ pos: new THREE.Vector3(), quat: new THREE.Quaternion(), fov: 24 })

export function tailPose(t: number, P: Tail = TAIL, P2: Tail2 = TAIL2, out: Pose = newPose()): Pose {
  const { c } = grayTracks()
  const n = c.times.length
  const t0 = c.end
  const p0 = sampleTrackExt(c, t0, 0, newPose())
  const v = c.pos[n - 1].clone().sub(c.pos[n - 4]).divideScalar(c.times[n - 1] - c.times[n - 4])
  // 第一段在 [t0, 50]；50 以后按第一段在 50 处的值与一阶导数线性延续，再叠第二段的二次项（C¹ 连续）
  const T1 = 50
  const dt = Math.min(t, T1) - t0
  const d = Math.max(0, t - T1)
  const a = new THREE.Vector3(...P.a)
  out.pos.copy(p0.pos).addScaledVector(v, P.kv * dt).addScaledVector(a, 0.5 * dt * dt)
  if (d > 0) {
    const vel = v.clone().multiplyScalar(P.kv).addScaledVector(a, dt)
    out.pos.addScaledVector(vel, d).add(new THREE.Vector3(...P2.a).multiplyScalar(0.5 * d * d))
  }
  const yaw = P.yaw[0] * dt + P.yaw[1] * dt * dt + (P.yaw[0] + 2 * P.yaw[1] * dt) * d + P2.yaw * d * d
  const pitch = P.pitch[0] * dt + P.pitch[1] * dt * dt + (P.pitch[0] + 2 * P.pitch[1] * dt) * d + P2.pitch * d * d
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(p0.quat)
  const q = new THREE.Quaternion()
    .setFromAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(yaw))
    .multiply(new THREE.Quaternion().setFromAxisAngle(right, THREE.MathUtils.degToRad(pitch)))
  out.quat.copy(q).multiply(p0.quat)
  out.fov = p0.fov + P.fov * (dt + d) + P2.fov * d * d
  return out
}

const _p1 = newPose()
const _p2 = newPose()
/** c 段从这里起可信（之前误差 2–5 px、逐帧乱跳） */
const C_GOOD = 44.2
/** 去掉 C_GOOD 之前坏帧的 c 段（外推从好帧开始算速度） */
const cGood = () =>
  memo('wd1p1:gray-c-good', () => {
    const c = grayTracks().c
    const i = c.times.findIndex((x) => x >= C_GOOD - 1e-6)
    const cut = <T,>(a: T[]) => a.slice(i)
    return { ...c, times: cut(c.times), pos: cut(c.pos), quat: cut(c.quat), fov: cut(c.fov), err: cut(c.err), start: c.times[i] }
  })

/** t 时刻的相机姿态（34.4–53.4） */
export function grayPose(t: number, out: Pose = newPose()): Pose {
  const { b, c } = grayTracks()
  if (t < b.start) {
    // 暗场故障段：b 段首帧按初速倒推（最多 1 s，再往前停住）；b 开头在爬升，倒推高度会钻到地下 → 高度保持首帧
    sampleTrackExt(b, t, 1, out)
    out.pos.y = Math.max(out.pos.y, b.pos[0].y)
    return out
  }
  if (t <= b.end) return sampleTrackExt(b, t, 0, out)
  if (t < C_GOOD) {
    // 42.8–44.2：b 末帧之后没有反求帧、c 开头是坏帧 → b 外推（≤0.3 s）与 c 首个好帧（夹紧）按 smoothstep 混合
    // c 从 44.2 的好帧按其速度/角速度往回外推（c 在这里本就在快速旋转，外推让 44.2 处速度连续）
    sampleTrackExt(b, t, 0.3, _p1)
    sampleTrackExt(cGood(), t, 0.6, _p2)
    return blendPose(_p1, _p2, smoothW(t, b.end, C_GOOD), out)
  }
  // 48.3 衔接：c 末帧外推与 TAIL 在 48.15–48.45 混合，消除速度折角（TAIL 的 kv < 1）
  if (t <= 48.15) return sampleTrackExt(c, t, 0, out)
  if (t < 48.45) {
    sampleTrackExt(c, t, 0.2, _p1)
    tailPose(t, TAIL, TAIL2, _p2)
    return blendPose(_p1, _p2, smoothW(t, 48.15, 48.45), out)
  }
  return tailPose(t, TAIL, TAIL2, out)
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
      ao: { intensity: 0.6, radius: 25, thickness: 10 },
      // V1 评估：亮边过密、整体偏亮 → 强度降、只描楼顶、远处更早淡出，楼面压得更暗
      edge: { intensity: 0.55, thickness: 1, normalThreshold: 0.3, depthThreshold: 0.04, roofBias: 0.9, faceGain: 0.6, fadeNear: 2600, fadeFar: 7000 },
      dof: { focus: { uv: [0.5, 0.6] }, aperture: 4, maxBlur: 10, nearScale: 1.8 },
      bloom: { threshold: 0.8, strength: 0.35, radius: 0.25 },
      tone: { contrast: 1.25, black: 0.04, exposure: 0.85 },
      // 颗粒会把原片纯黑的背景弄脏（SSIM 在黑场上对噪声极敏感，实测远景段 SSIM 0.6 → 0.3），不加
      grain: false,
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
    const gl = renderWithPost(three, scene, cam, grayPost(t, { clear: 0x000000, clearAlpha: 1, dof: { aperture: dark ? 2 : 4 } }))
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
