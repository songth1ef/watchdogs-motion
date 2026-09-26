/**
 * WD2 3.6–8.75s：ctOS 透视线框城市（V2，替换 ctos-city.ts 里的程序化 ctosGrid）。
 *
 * - 城市：真实芝加哥（src/three/real-city.ts，OSM 建筑 wire 样式 + 贴地道路线）。原片街网比 V1 暗、细，
 *   远处 Loop 天际线是一团青白色线框/点云雾：建筑边线压到很低的不透明度，靠密度叠出雾感，再加 wireGlow 辉光。
 * - 相机：4.35–6.29 用反求 wd2-ctos-grid-a（good，0.98px；焦距约束不住，按 35mm 初值 = vfov 32.3°）。
 *   反求坐标里相机朝 Blender +y（= three −z = 正北）、高 0.53、以约 1 单位/秒后退；对齐 = ×SCALE（米/单位）+ 平移到
 *   Halsted 街以东、Loop 西南方（Loop 天际线落在画面右前方，与原片一致）。
 *   3.6–4.35（卫星图淡出过渡，解不出）与 6.29–8.75（抬升到正俯视，满屏细线网格跳格，解不出）手调衔接。
 * - 后期：three/post 的 wireGlow（先把街网压暗，再加辉光/色差/颗粒；见 docs/post.md 的结论）。
 * - 2D 叠加（ROUTE 标签、青色节点、红色折角框、从 ctOS 标志牵出的细线）沿用 V1 的画法，锚点改到城市坐标。
 */
import * as THREE from 'three'
import type { Scene } from '../../../engine/types'
import { memo } from '../../../engine/three-host'
import { ease, lerp, seg } from '../../../engine/math'
import { alignTrack, applyTrack, cameraTrack, type CameraTrack } from '../../../engine/camera-track'
import { buildGeoLines, buildRealCity } from '../../../three/real-city'
import { mergePost, presets, renderWithPost } from '../../../three/post'
import { geo, hasGeo, polyCenter, roadRank } from '../../../assets/geo'
import { FONT, font, tracking } from '../../../fx/text'
import { WD2 } from '../../../theme'

/** 反求单位 → 米 */
const SCALE = 340
/** 反求首帧相机落在城市里的位置（米，three 坐标：x 东、z 南；原点 = State & Madison） */
const START: [number, number] = [-1500, 3400]
/** 首帧机高（米）与俯仰修正（度） */
const H0 = 180
const PITCH_FIX = 10
/** 风格化街网的不透明度 */
const GRID_A = 0.2

interface Grid3D {
  scene: THREE.Scene
  cam: THREE.PerspectiveCamera
  track: CameraTrack
}

function buildGrid(): Grid3D {
  const scene = new THREE.Scene()
  scene.fog = new THREE.Fog(0x000000, 1500, 9000)
  if (hasGeo('chicago')) {
    // 建筑：wire 样式；低矮小房子只保留屋顶轮廓的淡线（原片近处地面是细碎的点状颗粒）
    const city = buildRealCity({
      region: 'chicago',
      style: 'wire',
      // 原片远处只有右前方的 Loop 天际线是一团雾，左侧地平线是暗的：建筑线框只取 Loop 周边
      radius: 2300,
      minHeight: 10,
      edgeColor: 0x9fe6ea,
      edgeOpacity: 0.07,
      roads: false,
    })
    scene.add(city.group)
    const R = geo('chicago')
    const roads = R.layers.roads
    if (roads) {
      // 小街：暗灰细线；主干道：亮一些（原片街网是灰白细线，比 V1 暗）
      const minor = buildGeoLines(roads, { color: 0xb8c4c6, opacity: 0.32, filter: (c) => roadRank(c) >= 4, y: 0.2 })
      const major = buildGeoLines(roads, { color: 0xdfe8ea, opacity: 0.6, filter: (c) => roadRank(c) <= 3, y: 0.3 })
      scene.add(minor, major)
    }
    // 原片地面是很密、很规整的街网（风格化）：在真实道路之外叠一层按芝加哥街区尺度（东西 100m、南北 200m）的淡网格
    const gp: number[] = []
    for (let x = -6000; x <= 4000; x += 100) gp.push(x, 0.1, -6000, x, 0.1, 6000)
    for (let z = -6000; z <= 6000; z += 200) gp.push(-6000, 0.1, z, 4000, 0.1, z)
    const gg = new THREE.BufferGeometry()
    gg.setAttribute('position', new THREE.Float32BufferAttribute(gp, 3))
    scene.add(new THREE.LineSegments(gg, new THREE.LineBasicMaterial({ color: 0xb8c4c6, transparent: true, opacity: GRID_A })))
    const rail = R.layers.rail
    if (rail) scene.add(buildGeoLines(rail, { color: 0x5fd3d9, opacity: 0.12, y: 0.4 }))
    // 原片近处地面满是细碎的亮点（低矮房屋的点云）：每栋建筑在外环顶点上撒点，高度随机到楼高
    const B = R.layers.buildings
    if (B) {
      const pts: number[] = []
      const [ox, oy] = [0, 0]
      for (let i = 0; i < B.count; i++) {
        const [cx, cy] = polyCenter(B, i)
        // 只撒机位附近（航线两侧）与 Loop 周边的点，避免整条地平线被点云叠成亮带
        const nearCam = Math.hypot(cx - START[0], -cy - (START[1] - 1500)) < 2600
        if (!nearCam && Math.hypot(cx, cy) > 2300) continue
        const h = B.props.h[i] / 10
        const k = Math.min(6, 1 + Math.floor(h / 12))
        for (let j = 0; j < k; j++) {
          const r1 = hash01(i * 7 + j)
          const r2 = hash01(i * 13 + j * 3 + 1)
          pts.push(cx - ox + (r1 - 0.5) * 18, h * hash01(i * 31 + j), -(cy - oy) + (r2 - 0.5) * 18)
        }
      }
      const pg = new THREE.BufferGeometry()
      pg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
      scene.add(new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xc8f0f2, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.45, depthWrite: false })))
    }
  }
  const cam = new THREE.PerspectiveCamera(32.3, 16 / 9, 2, 12000)
  // 反求：原始坐标里首帧相机在 (0.059, 0.528, 1.883)（three），朝 −z；缩放后平移到 START
  // 反求的地面对齐平面（RANSAC 主平面，混进了天际线的点）相对真实地面前倾：原片 4.4–6.2 地平线在 y≈340–380，
  // 反求相机俯角 12° 会把地平线放到 y≈140；整体绕 X 轴抬 PITCH_FIX 度后再缩放平移
  const raw = cameraTrack('wd2-ctos-grid-a')
  const rot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), (PITCH_FIX * Math.PI) / 180)
  const p0 = raw.pos[0].clone().applyQuaternion(rot).multiplyScalar(SCALE)
  const track = alignTrack(raw, { scale: SCALE, rotation: rot, offset: [START[0] - p0.x, H0 - p0.y, START[1] - p0.z] })
  return { scene, cam, track }
}

const hash01 = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

const _q0 = new THREE.Quaternion()
const _e = new THREE.Euler(0, 0, 0, 'YXZ')
/**
 * 相机。3.6–4.0：高空斜俯视湖岸街网（原片卫星图淡出后的过渡）；4.0–4.35 俯冲到反求首帧；
 * 4.35–6.29 反求；6.29–8.75 抬升 + 右转 + 低头到正俯视（手调，对照原片 6.8 / 7.2 / 7.6 / 8.0）。
 */
function gridCam(g: Grid3D, t: number) {
  const { cam, track } = g
  if (t >= track.start && t <= track.end) {
    applyTrack(cam, track, t)
    return
  }
  if (t < track.start) {
    // 反求首帧之前：3.6–3.9 高空斜俯视（−60°、高 1200m，原片湖岸街网），3.9–4.05 快速降到 −21°、高 320m，再缓降到反求首帧
    applyTrack(cam, track, track.start)
    _q0.copy(cam.quaternion)
    const back = (track.start - t) * 1.0 * SCALE
    cam.position.z -= back
    const k1 = ease.inOutCubic(seg(t, 3.88, 4.05))
    const k2 = ease.inOutCubic(seg(t, 4.05, track.start))
    const hi = lerp(lerp(1200, 320, k1), 0, k2)
    cam.position.y += hi
    cam.position.x += lerp(lerp(700, 250, k1), 0, k2)
    _e.setFromQuaternion(_q0, 'YXZ')
    const pitch0 = _e.x
    _e.x = lerp(lerp(-1.05, -0.36, k1), pitch0, k2)
    _e.y += lerp(lerp(0.5, 0.15, k1), 0, k2)
    cam.quaternion.setFromEuler(_e)
    cam.fov = lerp(40, 32.3, seg(t, 3.9, track.start))
    cam.updateProjectionMatrix()
    cam.updateMatrixWorld()
    return
  }
  // 反求末帧之后：抬升、右转、低头
  applyTrack(cam, track, track.end)
  const dt = t - track.end
  const rise = ease.inQuad(seg(t, 7.1, 8.75))
  cam.position.z += dt * 1.0 * SCALE
  cam.position.y += rise * 1400
  cam.position.x += rise * 300
  _e.setFromQuaternion(cam.quaternion, 'YXZ')
  _e.x = lerp(_e.x, -Math.PI / 2 + 0.05, ease.inCubic(seg(t, 7.3, 9.0)))
  _e.y = _e.y - 0.6 * ease.inOutCubic(seg(t, 6.9, 8.5))
  cam.quaternion.setFromEuler(_e)
  cam.updateMatrixWorld()
}

const v3 = new THREE.Vector3()
function project(cam: THREE.Camera, x: number, y: number, z: number) {
  v3.set(x, y, z).project(cam)
  return { x: (v3.x * 0.5 + 0.5) * 1920, y: (-v3.y * 0.5 + 0.5) * 1080, vis: v3.z < 1 && v3.z > -1 }
}

/** 3D 空间里的 ROUTE 标签（米，相对反求首帧机位 START 的偏移：dx 东、dz 南），锚点在地面，标签悬空 */
const ROUTES: [string, number, number, number][] = [
  ['ROUTE 19L', -260, -1500, 4.3],
  ['ROUTE 77H', 60, -1200, 4.6],
  ['ROUTE 07F', -120, -800, 5.2],
  ['ROUTE 29G', -200, -1900, 6.1],
  ['ROUTE 77H', 380, -1700, 6.4],
  ['ROUTE 77H', 700, -1500, 6.8],
]
/** 地面青色节点 */
const NODES: [number, number, number][] = [
  [-150, -800, 4.2],
  [320, -1950, 4.8],
  [60, -1850, 5.4],
  [-200, -2100, 6.0],
  [580, -2250, 6.3],
]
/** 地面红色折角框 [dx, dz, w, d, t] */
const REDS: [number, number, number, number, number][] = [
  [-380, -2250, 260, 200, 4.8],
  [200, -2200, 380, 160, 5.2],
  [-60, -1100, 110, 110, 5.0],
]

function routeTag(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, p: number) {
  font(ctx, 13, 400, FONT.mono)
  tracking(ctx, 1.5)
  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  ctx.fillRect(x, y - 9, 12, 12)
  ctx.fillStyle = '#000'
  ctx.fillRect(x + 3, y - 6, 6, 6)
  ctx.fillStyle = `rgba(230,240,240,${0.85 * p})`
  ctx.fillText(text.slice(0, Math.ceil(text.length * p)), x + 16, y + 2)
  tracking(ctx, 0)
}

export const ctosGrid: Scene = {
  id: 'wd2-003.6-ctos-grid',
  start: 3.6,
  end: 8.75,
  note: '真实芝加哥线框城市（OSM 建筑 wire + 道路）；4.35–6.29 反求相机 wd2-ctos-grid-a，前后手调衔接；wireGlow 后期；ROUTE 标签/青色节点/红框为 2D 投影叠加',
  render(f) {
    const { ctx, t, three } = f
    const g = memo('wd2p1:grid3d-v2', buildGrid)
    gridCam(g, t)
    const img = renderWithPost(
      three,
      g.scene,
      g.cam,
      mergePost(presets.wireGlow, {
        time: t,
        fps: 60,
        clear: 0x000000,
        clearAlpha: 1,
        dof: { focus: { uv: [0.5, 0.7] }, aperture: 6, maxBlur: 10 },
        bloom: { threshold: 0.55, strength: 0.3, radius: 0.35 },
        tone: { contrast: 1.05, exposure: 0.55 },
        grain: false,
        vignette: 0.25,
      }),
    )
    const fadeIn = ease.inQuad(seg(t, 3.85, 4.4))
    const fadeOut = 1 - seg(t, 8.35, 8.75)
    ctx.save()
    ctx.globalAlpha = fadeIn * fadeOut * 0.6
    ctx.drawImage(img, 0, 0, 1920, 1080)
    const over = 1 - seg(t, 7.4, 7.9)
    if (over > 0 && t > 4.0) {
      ctx.globalAlpha = fadeIn * over
      const X = (dx: number) => START[0] + dx
      const Z = (dz: number) => START[1] + dz
      // 贴地的青色主干道：画面左侧那条亮青竖线（沿相机航向、在机位左侧 90m 的一条街）
      const a = project(g.cam, X(-40), 0.5, Z(400))
      const b = project(g.cam, X(-40), 0.5, Z(-6000))
      if (a.vis || b.vis) {
        const grad = ctx.createLinearGradient(0, b.y, 0, 1080)
        grad.addColorStop(0, 'rgba(95,211,217,0.15)')
        grad.addColorStop(0.4, 'rgba(95,211,217,0.9)')
        ctx.strokeStyle = grad
        ctx.lineWidth = 4
        ctx.beginPath()
        ctx.moveTo(b.x, b.y)
        ctx.lineTo(a.x, a.y)
        ctx.stroke()
      }
      // 红色折角框
      ctx.strokeStyle = WD2.red
      ctx.lineWidth = 3
      for (const [dx, dz, w, d, at] of REDS) {
        if (t < at) continue
        const q = seg(t, at, at + 0.3)
        const pts = [project(g.cam, X(dx), 1, Z(dz)), project(g.cam, X(dx + w * q), 1, Z(dz)), project(g.cam, X(dx + w * q), 1, Z(dz - d)), project(g.cam, X(dx), 1, Z(dz - d))]
        if (!pts.every((p) => p.vis)) continue
        ctx.beginPath()
        ctx.moveTo(pts[0].x, pts[0].y)
        for (const p of pts) ctx.lineTo(p.x, p.y)
        ctx.closePath()
        ctx.stroke()
      }
      // 青色节点：实心点 + 贴地椭圆环
      for (const [dx, dz, at] of NODES) {
        if (t < at) continue
        const p = project(g.cam, X(dx), 1, Z(dz))
        if (!p.vis) continue
        const r = 7 * ease.outBack(seg(t, at, at + 0.25))
        ctx.fillStyle = WD2.tealLine
        ctx.beginPath()
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = 'rgba(95,211,217,0.7)'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.ellipse(p.x, p.y, r * 3.2, r * 1.1, 0, 0, Math.PI * 2)
        ctx.stroke()
      }
      // 悬空标签 + 竖线
      for (const [text, dx, dz, at] of ROUTES) {
        if (t < at) continue
        const base = project(g.cam, X(dx), 0, Z(dz))
        const top = project(g.cam, X(dx), 70, Z(dz))
        if (!base.vis || top.y < 0 || top.y > 1080) continue
        ctx.strokeStyle = 'rgba(255,255,255,0.5)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(base.x, base.y)
        ctx.lineTo(top.x, top.y)
        ctx.stroke()
        routeTag(ctx, top.x, top.y, text, seg(t, at, at + 0.4))
      }
      // 从 ctOS 标志牵出的细线
      if (t > 4.8) {
        const p = project(g.cam, X(300), 0, Z(-1900))
        const q = project(g.cam, X(-450), 0, Z(-1200))
        ctx.strokeStyle = 'rgba(255,255,255,0.35)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(1562, 232)
        ctx.lineTo(p.x, p.y)
        ctx.moveTo(1562, 232)
        ctx.lineTo(q.x, q.y)
        ctx.stroke()
      }
    }
    ctx.restore()
  },
}
