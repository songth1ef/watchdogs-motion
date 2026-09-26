/**
 * WD1 98.2s–111s：ctOS 物件网络（原片 97.9–104.5 是同一个连续镜头）。
 *
 * V2 精修（逐 0.5s 对照原片手调；反求 wd1-ctos-objects-a 失败，见 docs/camera-solve.md）：
 * - 天幕：原片是屏幕空间固定的斜向线性渐变（左上纯黑 → 右下地平线附近 ≈146 灰），实测 98.8–104 逐帧不变；
 *   V1 的渐变方向/亮度都不对（上方大片亮灰）。98.2 仍与 s96 的竖直渐变一致，98.2–98.6 过渡。
 * - 展台：原片不是 2×3 平板，而是「十字」：一条纵向长板（= s96 主平板，向相机方向延伸）压在一条横向宽板上；
 *   顶面黑、顶面描边细白线，朝相机的侧面是「白色亮边 + 下方灰色侧面」。
 * - 相机：98.2 严格接 s96 的针孔相机，随后快速后拉、压低并绕十字中心转（原片 99–104 机位更低更近，平板更大）。
 * - 物件：换成外部模型（NASA 3D Resources 公有领域 / Poly Haven CC0，见 models.ts 与 assets/LICENSES.md）：
 *   卫星天线 = NASA DSN 34m 天线（格栅线框）、卫星 = NASA TDRS、飞机 = NASA Global Hawk、人形 = NASA Robonaut 2（半透明全息）、
 *   汽车 = Poly Haven covered_car、笔记本 = Poly Haven classic_laptop；ATM 仍是程序化。
 * - 后期：three/post 的 stageDOF（景深 + 辉光 + 颗粒），98.2 交接时光圈为 0（与 s96 的清晰线框一致）。
 * - 104.5 熄灯后原片几乎全黑（平均亮度 2–5），物件只剩暗灰实体与细线；V1 太亮，已整体压暗。
 *
 * 时间线：98.2 从 part2 s96 交接 → 低机位绕十字展台转，天线/卫星/ATM/人形/飞机散落在展台上，"ctOS" 100.3 起淡出 →
 * 104.5–105.4 熄灯、展台消失，物件浮起重新排成一圈（汽车、笔记本、飞机、天线+卫星、ATM）→ 105.8 起长出细线与小方点 →
 * 108.5 左上空心字 "Data is interconnected" 逐字打出 → 108.8 起相机后拉、物件变暗 → 111 交给 NETWORK 镜头。
 */
import * as THREE from 'three'
import type { Scene } from '../../../engine/types'
import { clamp, ease, lerp, rng, seg } from '../../../engine/math'
import { memo } from '../../../engine/three-host'
import { FONT } from '../../../fx/text'
import { mergePost, presets, renderWithPost } from '../../../three/post'
import { modelEdges, modelGeo, type ModelName } from './models'
import { S } from './util'

/** part2 s96 展台坐标（米级小单位）→ 本镜头 three.js 单位的比例 */
const K = 36.7
/** 平板厚度（s96 单位） */
const PLATE_T = 0.16
/** 十字展台（s96 坐标 x0,x1,z0,z1）：A = 纵向长板（远端 z=-1.5 与 s96 主平板一致），B = 横向宽板 */
const PLATES: [number, number, number, number][] = [
  [-1.5, 1.5, -1.5, 8.45],
  [-4.95, 4.95, 1.95, 5.0],
]
/** s96 在 98.2 画的主平板四边与 z=-0.6 横线（交接帧专用，98.2–98.35 淡出） */
const S96_PLATE: [number, number][] = [[-1.5, -1.5], [1.5, -1.5], [1.5, 2.5], [-1.5, 2.5]]

// ---------- 材质 ----------
const SOLID = new THREE.MeshStandardMaterial({ color: 0xe6e6e6, emissive: 0x505050, roughness: 0.3, metalness: 0.05, transparent: true })
const SOLID_FLAT = new THREE.MeshStandardMaterial({ color: 0xcfcfcf, roughness: 0.4, metalness: 0.25, flatShading: true, transparent: true })
const LINES = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, depthWrite: false })
const GHOST = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, depthWrite: false })
const HOLO_LINES = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.05, depthWrite: false })
const POINTS = new THREE.PointsMaterial({ color: 0xffffff, size: 1.2, sizeAttenuation: false, transparent: true, opacity: 0.045, depthWrite: false })
const HOLO = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.08, depthWrite: false, blending: THREE.AdditiveBlending })

/** 把模型放进一个 Group：size = 最长边（three 单位） */
function model(name: ModelName, size: number, look: 'solid' | 'flat' | 'lattice' | 'holo' | 'points') {
  const g = new THREE.Group()
  const inner = new THREE.Group()
  inner.scale.setScalar(size)
  g.add(inner)
  if (look === 'solid') inner.add(new THREE.Mesh(modelGeo(name), SOLID))
  else if (look === 'flat') inner.add(new THREE.Mesh(modelGeo(name, true), SOLID_FLAT))
  else if (look === 'lattice') {
    inner.add(new THREE.Mesh(modelGeo(name), GHOST))
    inner.add(new THREE.LineSegments(modelEdges(name, 12), LINES))
  } else if (look === 'holo') {
    inner.add(new THREE.Mesh(modelGeo(name), HOLO))
    inner.add(new THREE.LineSegments(modelEdges(name, 20), HOLO_LINES))
  } else {
    // 原片里的人形是虚焦的点云全息（烟雾状），用顶点点云 + 极淡的特征边
    inner.add(new THREE.Points(modelGeo(name), POINTS))
    inner.add(new THREE.LineSegments(modelEdges(name, 35), HOLO_LINES))
  }
  return g
}

// ---------- ATM（程序化：线框机身 + 屏幕 + 键盘 + 顶部字牌） ----------
function makeATM() {
  const g = new THREE.Group()
  const pos: number[] = []
  const box = (x: number, y: number, z: number, w: number, h: number, d: number) => {
    const x0 = x - w / 2, x1 = x + w / 2, y0 = y, y1 = y + h, z0 = z - d / 2, z1 = z + d / 2
    const e = (a: number[], b: number[]) => pos.push(...a, ...b)
    for (const yy of [y0, y1]) {
      e([x0, yy, z0], [x1, yy, z0]); e([x1, yy, z0], [x1, yy, z1]); e([x1, yy, z1], [x0, yy, z1]); e([x0, yy, z1], [x0, yy, z0])
    }
    e([x0, y0, z0], [x0, y1, z0]); e([x1, y0, z0], [x1, y1, z0]); e([x1, y0, z1], [x1, y1, z1]); e([x0, y0, z1], [x0, y1, z1])
  }
  box(0, 0, 0, 7, 9, 5) // 下柜
  box(0, 9, -0.6, 7, 6, 3.8) // 上部
  box(0, 15, -0.8, 7.4, 2.2, 3.2) // 字牌
  box(0, 10.5, 1.3, 4.6, 3.4, 0.3) // 屏幕
  box(0, 7.4, 2.2, 4, 0.4, 1.2) // 键盘台
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) box(-1.2 + j * 1.2, 7.8, 1.5 + i * 0.3, 0.8, 0.15, 0.2)
  for (let i = 0; i < 6; i++) pos.push(-3.5, 1 + i * 1.3, 2.5, 3.5, 1 + i * 1.3, 2.5)
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.add(new THREE.LineSegments(geo, LINES))
  const inner = new THREE.Mesh(new THREE.BoxGeometry(4.4, 3.2, 0.2), SOLID)
  inner.position.set(0, 12.2, 1.3)
  g.add(inner)
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 48
  const x = c.getContext('2d')!
  x.fillStyle = '#222'
  x.fillRect(0, 0, 128, 48)
  x.fillStyle = '#fff'
  x.font = `700 36px ${FONT.sans}`
  x.textAlign = 'center'
  x.fillText('ATM', 64, 38)
  const signMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true })
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(6.6, 2), signMat)
  sign.position.set(0, 16.1, 0.85)
  g.add(sign)
  g.userData.sign = signMat
  return g
}

// ---------- 平板侧面贴图：顶部白色亮边 + 下方灰色侧面 ----------
function sideTexture() {
  const c = document.createElement('canvas')
  c.width = 4
  c.height = 64
  const x = c.getContext('2d')!
  const g = x.createLinearGradient(0, 0, 0, 64)
  g.addColorStop(0, '#ffffff')
  g.addColorStop(0.22, '#f4f4f4')
  g.addColorStop(0.27, '#5a5a5a')
  g.addColorStop(1, '#262626')
  x.fillStyle = g
  x.fillRect(0, 0, 4, 64)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

interface Obj {
  o: THREE.Object3D
  /** 展台段位置（three 单位） */
  a: [number, number, number]
  /** 展台段绕 y 旋转（弧度） */
  ra: number
  /** 浮起后的位置 */
  b: [number, number, number]
  rb: number
  /** 浮起后的缩放倍数（相对展台段） */
  sb: number
  /** 出现时间 */
  show: number
  /** 消失时间（全息人形在熄灯时消失） */
  hide?: number
}

function buildScene() {
  const scene = new THREE.Scene()
  const hemi = new THREE.HemisphereLight(0xffffff, 0x202020, 1.3)
  scene.add(hemi)
  const key = new THREE.DirectionalLight(0xffffff, 1.6)
  key.position.set(120, 160, 60)
  scene.add(key)

  // 地面：黑
  const floor = new THREE.Mesh(new THREE.CircleGeometry(48 * K, 96), new THREE.MeshBasicMaterial({ color: 0x000000 }))
  floor.rotation.x = -Math.PI / 2
  floor.position.set(CX * K, -0.05, CZ * K)
  scene.add(floor)

  // 十字展台：顶面黑、四个侧面 = 白边 + 灰色侧面
  const plates = new THREE.Group()
  const sideMat = new THREE.MeshBasicMaterial({ map: sideTexture(), transparent: true })
  const topMat = new THREE.MeshBasicMaterial({ color: 0x020202, transparent: true })
  for (const [x0, x1, z0, z1] of PLATES) {
    const geo = new THREE.BoxGeometry((x1 - x0) * K, PLATE_T * K, (z1 - z0) * K)
    // BoxGeometry 面顺序：+x -x +y -y +z -z
    const m = new THREE.Mesh(geo, [sideMat, sideMat, topMat, topMat, sideMat, sideMat])
    m.position.set(((x0 + x1) / 2) * K, (PLATE_T * K) / 2, ((z0 + z1) / 2) * K)
    plates.add(m)
  }
  // 两块板重叠处：B 的顶面略低，避免 z-fighting
  plates.children[1].position.y -= 0.02
  scene.add(plates)

  // a = 展台上的位置（three 单位），b = 浮起后的位置
  const P = (x: number, y: number, z: number): [number, number, number] => [x * K, y * K, z * K]
  const dish = model('dish', 0.8 * K, 'lattice')
  // 模型碟面朝天：前倾 + 左倾，碟口朝向相机左上（原片 99s）
  dish.children[0].rotation.set(0.55, 0, -0.6)
  const sat = model('satellite', 1.1 * K, 'flat')
  sat.children[0].rotation.set(0, 0, -0.55)
  // 汽车：原片从车尾看是宽而扁的轿跑（s96 交接帧里也是扁的剪影），covered_car 偏高 → 竖向压 0.75
  const car = model('car', 1.3 * K, 'solid')
  car.children[0].scale.y *= 0.75
  const atm = new THREE.Group()
  const atmInner = makeATM()
  atmInner.scale.setScalar(2.45)
  atm.add(atmInner)
  atm.userData.sign = atmInner.userData.sign
  // 位置：用反算出的相机把原片里物件的落地点反投影到展台平面（99.0–104 多帧取中），见 docs/shots/wd1-part3.md
  const objs: Obj[] = [
    { o: dish, a: P(-0.5, 0.3, 5.6), ra: 0.2, b: [34, 18, -10], rb: 0.9, sb: 0.8, show: 98.35 },
    { o: sat, a: P(0.4, 0.32, 4.1), ra: -0.3, b: [44, 22, -12], rb: -0.3, sb: 0.5, show: 98.35 },
    { o: model('robot', 0.75 * K, 'points'), a: P(0.9, 0.16, 4.9), ra: 0.2, b: [-10, 40, -40], rb: 0, sb: 1, show: 98.4, hide: 98.4 },
    { o: car, a: P(-0.2, 0.16, -1.2), ra: 0.1, b: [-40, 2, 4], rb: -1.2, sb: 0.42, show: 0 },
    { o: model('plane', 1.5 * K, 'solid'), a: P(3.0, 0.3, 3.0), ra: 1.4, b: [-4, 24, -14], rb: -0.4, sb: 0.4, show: 101.7 },
    { o: model('robot', 0.9 * K, 'points'), a: P(-2.9, 0.16, 2.9), ra: -0.5, b: [60, 45, -40], rb: 0, sb: 1, show: 98.4, hide: 105.2 },
    { o: atm, a: P(-3.9, 0.16, 1.8), ra: Math.PI - 0.3, b: [22, -26, 14], rb: -0.4, sb: 0.55, show: 0 },
    { o: model('laptop', 0.4 * K, 'solid'), a: [0, 6, 0], ra: 0, b: [0, 10, 0], rb: 0.35, sb: 1, show: 105.2 },
  ]
  for (const k of objs) scene.add(k.o)

  // 网络：物件锚点 + 随机点之间的细线（按 delay 依次长出）
  const R = rng(8080)
  const nodes: THREE.Vector3[] = objs.map((k) => new THREE.Vector3(...k.b).add(new THREE.Vector3(0, 4, 0)))
  for (let i = 0; i < 26; i++) nodes.push(new THREE.Vector3(R.range(-110, 110), R.range(-12, 32), R.range(-60, 40)))
  const edges: { a: number; b: number; d: number }[] = []
  const early = [
    [3, 7],
    [7, 0],
    [7, 6],
    [4, 7],
    [0, 6],
    [1, 0],
  ]
  early.forEach(([a, b], i) => edges.push({ a, b, d: i * 0.05 }))
  for (let i = 0; i < 42; i++) edges.push({ a: R.int(0, nodes.length - 1), b: R.int(0, nodes.length - 1), d: 0.25 + R.next() * 0.75 })
  const pos = new Float32Array(edges.length * 6)
  const lineGeo = new THREE.BufferGeometry()
  lineGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  const netMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 })
  const net = new THREE.LineSegments(lineGeo, netMat)
  scene.add(net)

  // 天幕：离屏 canvas → 场景背景
  const skyCanvas = document.createElement('canvas')
  skyCanvas.width = 960
  skyCanvas.height = 540
  const skyCtx = skyCanvas.getContext('2d')!
  const skyTex = new THREE.CanvasTexture(skyCanvas)
  skyTex.colorSpace = THREE.SRGBColorSpace
  scene.background = skyTex

  const cam = new THREE.PerspectiveCamera(40, 1920 / 1080, 0.5, 12000)
  return { scene, cam, skyCtx, skyTex, objs, plates, sideMat, topMat, nodes, edges, pos, lineGeo, netMat, hemi, key }
}

// ---------- 相机 ----------
/** 十字中心（s96 单位）：相机 99s 起绕它转 */
const CX = 0
const CZ = 3.475
/**
 * 关键帧：[t, 方位角 az°（0 = 在十字 +z 一侧）, 水平半径 r, 高度 h, 偏航偏移 dyaw°（0 = 正对十字中心的方位）,
 *          俯仰 pitch°（负 = 低头）, 垂直 fov, 移轴]，长度单位为 s96 展台单位（×K 后是 three 单位）。
 * 98.2 = s96 的针孔相机：高 1.2、距原点 5.25（= 十字中心 +1.775）、yaw 0、f=900（1280 坐标）→ fov 43.6°、地平线 380/720 → 移轴 -20/720。
 * 98.3 / 99.0 由原片平板边线的像高反算（地平线、A 板两侧线的消失点、B 板前后沿）：机高 ≈1.27，98.3 距 A 远沿 7.8、99.0 距 10.9，
 * 即 0.7s 内后拉 3.1，同时移轴归零（地平线 570 → 540）。之后逐 0.5s 对照原片调。
 */
type CamKey = [number, number, number, number, number, number, number, number]
const FOV = 43.6
const SH = -20 / 720
const CAM: CamKey[] = [
  [98.2, 0, 1.775, 1.2, 0, 0, FOV, SH],
  [98.3, 0, 2.825, 1.4, 0, -1, FOV, SH],
  // 99.0–104.0：在原片帧上手工标出平板角点/边线的像素位置，用 Nelder–Mead 反算相机 5 参数（fov 固定 43.6），残差 3–50px（1920 坐标）
  [99.0, 0.8, 5.89, 1.44, -0.1, -0.3, FOV, 0],
  [99.5, 2.47, 6.97, 1.36, -0.09, -0.19, FOV, 0],
  [100.0, 5.5, 7.7, 1.22, 0.3, 0.4, FOV, 0],
  [100.5, 9.87, 8.28, 1.08, 0.75, 1.0, FOV, 0],
  [101.0, 17.2, 8.68, 1.19, 0.56, -0.9, FOV, 0],
  [101.5, 29.4, 9.06, 1.16, 0.03, -0.83, FOV, 0],
  [102.0, 53.3, 8.61, 1.11, -0.2, -2.17, FOV, 0],
  [102.5, 82, 8.0, 0.9, -1.8, -4.0, FOV, 0],
  [103.0, 112.5, 7.69, 0.79, 1.81, -3.82, FOV, 0],
  [103.5, 142.3, 7.67, 0.94, -0.37, -5.14, FOV, 0],
  [104.0, 170.5, 9.17, 1.9, 0.26, -10.6, FOV, 0],
  // 104.3 起：熄灯、升高俯视（之后交给 CLUSTER 物件群相机）
  [104.6, 195, 9.8, 4.6, 0, -24, FOV, 0],
  [105.4, 215, 10.5, 6.5, 0, -32, FOV, 0],
]

/**
 * 物件浮起后的相机（three 单位）：绕物件群中心 (0, 12, 0) 从 +z 方向看，[t, 方位°, 仰角°, 距离, fov]。
 * 原片 105.5–108 构图：左汽车、中笔记本、上飞机、右天线+卫星、右下 ATM；108.8 起后拉。
 */
const CLUSTER: [number, number, number, number, number][] = [
  [104.8, 30, 32, 150, 40],
  [105.6, 14, 20, 125, 40],
  [106.5, 6, 16, 118, 40],
  [108.2, -4, 13, 112, 40],
  [109.2, -9, 15, 130, 40],
  [110.0, -13, 18, 150, 40],
  [111.0, -17, 20, 190, 40],
]

/** 非均匀 Catmull-Rom（Hermite）插值，保证过关键帧时速度连续 */
function camAt(t: number): number[] {
  const n = CAM.length
  if (t <= CAM[0][0]) return CAM[0].slice(1)
  if (t >= CAM[n - 1][0]) return CAM[n - 1].slice(1)
  let i = 0
  while (i < n - 2 && t > CAM[i + 1][0]) i++
  const k0 = CAM[Math.max(0, i - 1)]
  const k1 = CAM[i]
  const k2 = CAM[i + 1]
  const k3 = CAM[Math.min(n - 1, i + 2)]
  const u = (t - k1[0]) / (k2[0] - k1[0])
  const out: number[] = []
  for (let c = 1; c < k1.length; c++) {
    const m1 = ((k2[c] - k0[c]) / (k2[0] - k0[0] || 1)) * (k2[0] - k1[0])
    const m2 = ((k3[c] - k1[c]) / (k3[0] - k1[0] || 1)) * (k2[0] - k1[0])
    const u2 = u * u
    const u3 = u2 * u
    out.push((2 * u3 - 3 * u2 + 1) * k1[c] + (u3 - 2 * u2 + u) * m1 + (-2 * u3 + 3 * u2) * k2[c] + (u3 - u2) * m2)
  }
  return out
}

const D2R = Math.PI / 180
const _q1 = new THREE.Quaternion()
const _m1 = new THREE.Matrix4()
const _c1 = new THREE.Vector3(0, 12, 0)
const _up = new THREE.Vector3(0, 1, 0)
const _p1 = new THREE.Vector3()
function placeCam(cam: THREE.PerspectiveCamera, t: number) {
  const [az, r, h, dyaw, pitch, fov0, sh] = camAt(t)
  cam.position.set((CX + r * Math.sin(az * D2R)) * K, h * K, (CZ + r * Math.cos(az * D2R)) * K)
  cam.rotation.order = 'YXZ'
  cam.rotation.set(pitch * D2R, (az + dyaw) * D2R, 0)
  let fov = fov0
  // 104.8–105.6 从展台相机过渡到物件群相机（位置线性、朝向 slerp）
  const w = ease.inOutCubic(seg(t, 104.8, 105.6))
  if (w > 0) {
    const [a, el, d, f2] = keyed(t, CLUSTER, ease.inOutCubic)
    _p1.set(d * Math.cos(el * D2R) * Math.sin(a * D2R), 12 + d * Math.sin(el * D2R), d * Math.cos(el * D2R) * Math.cos(a * D2R))
    // 相机朝向：-z 指向物件群中心（Matrix4.lookAt 与相机约定一致）
    _q1.setFromRotationMatrix(_m1.lookAt(_p1, _c1, _up))
    cam.position.lerp(_p1, w)
    cam.quaternion.slerp(_q1, w)
    fov = lerp(fov0, f2, w)
  }
  cam.fov = fov
  if (Math.abs(sh) > 1e-4) cam.setViewOffset(1920, 1080, 0, sh * 1080, 1920, 1080)
  else cam.clearViewOffset()
  cam.updateProjectionMatrix()
  cam.updateMatrixWorld()
}

// ---------- 2D 投影（线段按近裁剪面裁掉，避免机位贴近时线条消失或翻转） ----------
const _a = new THREE.Vector3()
const _b = new THREE.Vector3()
function projectSeg(cam: THREE.PerspectiveCamera, A: THREE.Vector3, B: THREE.Vector3, W: number, H: number) {
  _a.copy(A).applyMatrix4(cam.matrixWorldInverse)
  _b.copy(B).applyMatrix4(cam.matrixWorldInverse)
  const near = -cam.near * 2
  if (_a.z > near && _b.z > near) return null
  if (_a.z > near) _a.lerp(_b, (_a.z - near) / (_a.z - _b.z))
  else if (_b.z > near) _b.lerp(_a, (_b.z - near) / (_b.z - _a.z))
  _a.applyMatrix4(cam.projectionMatrix)
  _b.applyMatrix4(cam.projectionMatrix)
  return [(_a.x * 0.5 + 0.5) * W, (-_a.y * 0.5 + 0.5) * H, (_b.x * 0.5 + 0.5) * W, (-_b.y * 0.5 + 0.5) * H]
}
function project(cam: THREE.Camera, x: number, y: number, z: number, W: number, H: number) {
  const v = new THREE.Vector3(x, y, z).project(cam)
  return { x: (v.x * 0.5 + 0.5) * W, y: (-v.y * 0.5 + 0.5) * H, behind: v.z > 1 }
}

/** 关键帧插值：keys = [[t, v0, v1, ...], ...] */
function keyed(t: number, keys: number[][], easing = ease.inOutCubic): number[] {
  if (t <= keys[0][0]) return keys[0].slice(1)
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i]
    const b = keys[i + 1]
    if (t <= b[0]) {
      const p = easing(clamp((t - a[0]) / (b[0] - a[0])))
      return a.slice(1).map((v, j) => lerp(v, b[j + 1], p))
    }
  }
  return keys[keys.length - 1].slice(1)
}

/** ctOS 字标（与 part2 s96 同一画法；1280 坐标，局部总宽 580、基线 0、O 中心 (35,-100)） */
function drawCtos(ctx: CanvasRenderingContext2D, t: number) {
  const [lw, lx, ly] = keyed(
    t,
    [
      [98.2, 580, 610, 440],
      [98.5, 327, 625, 387],
      [99.0, 233, 630, 360],
      [99.4, 210, 631, 350],
      [100.0, 190, 632, 345],
      [100.75, 180, 632, 340],
    ],
    ease.linear,
  )
  const k = lw / 580
  ctx.save()
  ctx.scale(S, S)
  ctx.translate(lx, ly)
  ctx.scale(k, k)
  ctx.globalAlpha = 1 - seg(t, 100.3, 100.75)
  // 99 起原片字标轻微虚焦（景深在 3D 后期里，2D 字用模糊近似）
  const blur = (1.0 * seg(t, 98.5, 99.3)) / k
  if (blur > 0.2) ctx.filter = `blur(${blur.toFixed(1)}px)`
  ctx.font = `500 168px ${FONT.sans}`
  ctx.letterSpacing = `${(168 * -0.02).toFixed(2)}px`
  ctx.fillStyle = '#fff'
  ctx.fillText('CT', -292, 0)
  ctx.font = `500 270px ${FONT.sans}`
  ctx.fillText('S', 132, 0)
  // O：外椭圆减内孔（evenodd），内孔 98.3–98.6 由白变透明——透出后面的天幕（s96 用黑色盖，这里天幕是灰的，涂黑不对）
  const holeWhite = 1 - seg(t, 98.3, 98.6)
  ctx.beginPath()
  ctx.ellipse(35, -100, 95, 100, 0, 0, Math.PI * 2)
  ctx.ellipse(35, -100, 60, 76, 0, 0, Math.PI * 2)
  ctx.fill('evenodd')
  if (holeWhite > 0) {
    ctx.globalAlpha *= holeWhite
    ctx.beginPath()
    ctx.ellipse(35, -100, 60, 76, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

/**
 * 天幕。98.2 = s96 的竖直渐变（#0e0e0e → #8a8a8a，地平线 380/720 以下黑）；
 * 98.2–98.6 过渡到原片实测的屏幕空间斜向线性渐变：L = 64 + 0.052·(x−1860) + 0.194·(y−45)（1920 坐标，下限 0），
 * 由 99.5 / 101.5 / 103.5 三帧 16×12 亮度网格拟合（三帧一致，说明是 2D 背景层，不随相机动）。
 * 画在离屏 canvas 上作为 three 场景背景（scene.background），这样景深会把地平线一起柔化，地面也不会因为虚化而透出天幕。
 */
function drawSky(ctx: CanvasRenderingContext2D, t: number, W: number, H: number, fade: number) {
  ctx.globalAlpha = 1
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, W, H)
  if (fade <= 0) return
  const hy = (380 / 720) * H
  const mix = ease.inOutCubic(seg(t, 98.2, 98.6))
  if (mix < 1) {
    const v = ctx.createLinearGradient(0, 0, 0, hy)
    v.addColorStop(0, '#0e0e0e')
    v.addColorStop(1, '#8a8a8a')
    ctx.globalAlpha = fade * (1 - mix)
    ctx.fillStyle = v
    ctx.fillRect(0, 0, W, hy)
  }
  if (mix > 0) {
    // 梯度方向 (0.052, 0.194)/px；L=0 在 (53,199)，L=180 在 (285,1063)（按画布尺寸缩放）
    const sx = W / 1920
    const sy = H / 1080
    const g = ctx.createLinearGradient(53 * sx, 199 * sy, 285 * sx, 1063 * sy)
    g.addColorStop(0, 'rgb(0,0,0)')
    g.addColorStop(1, 'rgb(180,180,180)')
    ctx.globalAlpha = fade * mix
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)
  }
  ctx.globalAlpha = 1
}

export const objects: Scene = {
  id: 'wd1-098-ctos-objects',
  start: 98.2,
  end: 111.0,
  note: 'ctOS 物件：98.2 接 part2 展台 → 低机位绕十字展台 → 熄灯浮起 → 连线成网 → Data is interconnected → 拉远',
  render(f) {
    const { ctx, W, H, t } = f
    const c = memo('p3-objects-v2', buildScene)
    const lightsOff = seg(t, 104.3, 105.2)
    drawSky(c.skyCtx, t, c.skyCtx.canvas.width, c.skyCtx.canvas.height, 1 - lightsOff)
    c.skyTex.needsUpdate = true

    // 展台随熄灯消失
    const plateA = 1 - 0.55 * seg(t, 104.2, 104.7) - 0.45 * seg(t, 104.9, 105.6)
    c.plates.visible = plateA > 0.01
    c.sideMat.opacity = plateA
    c.topMat.opacity = plateA
    // 物件：展台 → 浮起；熄灯后整体压暗（原片 105–111 平均亮度只有 2–5）
    const fly = ease.inOutCubic(seg(t, 104.6, 106.0))
    const night = seg(t, 104.4, 105.4)
    const dim = (1 - 0.72 * night) * (1 - 0.7 * seg(t, 109.0, 110.3))
    SOLID.color.setScalar(0.86 * dim)
    SOLID.emissive.setScalar((0x50 / 255) * dim * (1 - 0.6 * night))
    SOLID_FLAT.color.setScalar(0.82 * dim)
    LINES.opacity = 0.45 * (1 - 0.3 * night) * dim
    GHOST.opacity = 0.12 * dim
    c.hemi.intensity = 1.3 * (1 - 0.5 * night)
    for (const k of c.objs) {
      k.o.visible = t >= k.show && t < (k.hide ?? 1e9)
      const drive = k === c.objs[3] ? ease.inOutCubic(seg(t, 101.3, 104.0)) : 0
      const ax = k.a[0] + drive * (-0.2 * K)
      const az = k.a[2] + drive * (2.5 * K)
      k.o.position.set(lerp(ax, k.b[0], fly), lerp(k.a[1], k.b[1], fly), lerp(az, k.b[2], fly))
      k.o.rotation.y = lerp(k.ra, k.rb, fly)
      const pop = k.show > 0 ? ease.outBack(seg(t, k.show, k.show + 0.3)) : 1
      k.o.scale.setScalar(Math.max(0.001, lerp(1, k.sb, fly) * pop))
      const sign = k.o.userData.sign as THREE.MeshBasicMaterial | undefined
      if (sign) sign.opacity = dim
    }
    // 网络连线生长（105.8 起）
    const np = seg(t, 105.8, 110.8)
    c.edges.forEach((e, i) => {
      const q = clamp((np - e.d * 0.7) / 0.3)
      const A = c.nodes[e.a]
      const B = c.nodes[e.b]
      c.pos.set([A.x, A.y, A.z, lerp(A.x, B.x, q), lerp(A.y, B.y, q), lerp(A.z, B.z, q)], i * 6)
    })
    c.lineGeo.attributes.position.needsUpdate = true
    c.netMat.opacity = 0.22 * seg(t, 105.8, 106.2)

    placeCam(c.cam, t)
    // 景深：98.2 交接时光圈 0（与 s96 的清晰线框一致），98.4 起打开；熄灯后收小
    const img = renderWithPost(
      f.three,
      c.scene,
      c.cam,
      mergePost(presets.stageDOF, {
        time: t,
        clear: 0x000000,
        clearAlpha: 1,
        dof: {
          // 原片前景（近处平板亮边、天线）清晰，远处物件与地平线虚：焦点放在相机前方约 5 个展台单位
          focus: 5.5 * K,
          nearScale: 0.4,
          aperture: (tt: number) => 9 * seg(tt, 98.2, 98.9) * (1 - 0.6 * seg(tt, 104.5, 105.5)),
        },
        bloom: { threshold: 0.97, strength: 0.15 * (1 - 0.6 * night), radius: 0.3 },
        vignette: 0,
        // 颗粒会显著拉低 SSIM（逐像素噪声），原片这段颗粒很弱：关掉
        grain: false,
      }),
    )
    ctx.drawImage(img, 0, 0, W, H)

    // 展台顶面描边（投影后在 2D 画，线宽可控；与 s96 主平板同样 1.6px@1280）
    if (plateA > 0.01) {
      const line = (x0: number, z0: number, x1: number, z1: number, w: number, a: number, y = PLATE_T * K + 0.05) => {
        const s = projectSeg(c.cam, new THREE.Vector3(x0 * K, y, z0 * K), new THREE.Vector3(x1 * K, y, z1 * K), W, H)
        if (!s) return
        ctx.strokeStyle = `rgba(255,255,255,${a})`
        ctx.lineWidth = w * S
        ctx.beginPath()
        ctx.moveTo(s[0], s[1])
        ctx.lineTo(s[2], s[3])
        ctx.stroke()
      }
      const newA = seg(t, 98.2, 98.35)
      for (const [x0, x1, z0, z1] of PLATES) {
        const a = 0.85 * plateA * newA
        line(x0, z0, x1, z0, 1.3, a)
        line(x1, z0, x1, z1, 1.3, a)
        line(x1, z1, x0, z1, 1.3, a)
        line(x0, z1, x0, z0, 1.3, a)
      }
      // 交接帧：s96 画的主平板与 z=-0.6 横线
      if (newA < 1) {
        const a = 1 - newA
        for (let i = 0; i < 4; i++) {
          const [x0, z0] = S96_PLATE[i]
          const [x1, z1] = S96_PLATE[(i + 1) % 4]
          line(x0, z0, x1, z1, 1.6, 0.9 * a, 0)
        }
        line(-4.5, -0.6, 4.5, -0.6, 1, 0.5 * a, 0)
      }
    }

    // 节点小方点 + 旁边的极小说明字（2D）
    if (np > 0) {
      const R = rng(99)
      const na = 1 - 0.5 * seg(t, 109.5, 110.8)
      c.nodes.forEach((n, i) => {
        const p = project(c.cam, n.x, n.y, n.z, W, H)
        if (p.behind) return
        const a = seg(np, (i / c.nodes.length) * 0.8, (i / c.nodes.length) * 0.8 + 0.1) * na
        if (a <= 0) return
        ctx.fillStyle = `rgba(255,255,255,${0.85 * a})`
        ctx.fillRect(p.x - 2.5, p.y - 2.5, 5, 5)
        if (i >= 8 && R.chance(0.6)) {
          ctx.fillStyle = `rgba(200,200,200,${0.45 * a})`
          for (let k = 0; k < 3; k++) ctx.fillRect(p.x + 12, p.y - 6 + k * 6, R.range(24, 50), 2)
        }
      })
    }

    // ctOS 字标（接 s96），100.3–100.75 淡出
    if (t < 100.75) drawCtos(ctx, t)

    // "Data is interconnected" 空心字：108.5 起逐字打出，随后缩小后退
    if (t >= 108.5) {
      // 原片比 V1 晚约 0.3s 开始打字、打得更慢（逐 0.5s 对照）
      const [lx, b1, cap] = keyed(t, [
        [108.5, 47, 149, 118],
        [109.0, 60, 170, 105],
        [109.5, 100, 190, 85],
        [110.3, 250, 350, 57],
        [110.9, 294, 384, 60],
      ])
      const l1 = 'Data is'
      const l2 = 'interconnected'
      const n = Math.floor(seg(t, 108.5, 109.9) * (l1.length + l2.length))
      ctx.save()
      ctx.font = `400 ${(cap * S) / 0.72}px ${FONT.sans}`
      ctx.letterSpacing = `${-cap * S * 0.02}px`
      ctx.strokeStyle = `rgba(190,190,190,${0.8 - 0.35 * seg(t, 109.5, 110.8)})`
      ctx.lineWidth = 1.6
      ctx.strokeText(l1.slice(0, n), lx * S, b1 * S)
      ctx.strokeText(l2.slice(0, Math.max(0, n - l1.length)), lx * S, (b1 + cap * 1.25) * S)
      ctx.restore()
    }
  },
}
