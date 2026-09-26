/**
 * 54.9–65.35s：X 光娃娃「toys study your children.」→ 镜头一路拉远 → 客厅线框逐件搭建 → 拉远看全景 → 向右摇到门口。
 * 娃娃和客厅在同一个 three.js 场景里，镜头连续运动（原片 56.2s 有一次跳切，这里同样处理）。
 *
 * ASSET：娃娃 = buildDoll()（球体/胶囊体 + 菲涅尔 X 光着色 + 内部线框零件），
 *        客厅 = buildRoom()（盒子边线拼的窗、电视、电视柜、扶手椅、茶几、门）。
 *        换真实模型：在这两个函数里改成 GLTFLoader 加载的网格，材质沿用 xray() / 线框材质即可。
 */
import * as THREE from 'three'
import type { FrameCtx, Scene } from '../../../engine/types'
import { memo } from '../../../engine/three-host'
import { clamp, ease, hash, lerp, rng, seg } from '../../../engine/math'
import { FONT, font, tracking } from '../../../fx/text'
import { blockType, fr, mono } from './common'
import { alignTrack, applyTrack, cameraTrack, type CameraTrack } from '../../../engine/camera-track'

// ---------------- 材质 ----------------
function xray(intensity = 1) {
  return new THREE.ShaderMaterial({
    uniforms: { uI: { value: intensity }, uA: { value: 1 } },
    vertexShader: `
      varying vec3 vN; varying vec3 vV;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position,1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform float uI; uniform float uA;
      varying vec3 vN; varying vec3 vV;
      void main(){
        float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
        float g = pow(f, 2.0) * 0.8 + pow(f, 7.0) * 0.9 + 0.075;
        gl_FragColor = vec4(vec3(0.92,0.95,1.0) * g * uI * uA, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  })
}
const lineMat = (color = 0xffffff, opacity = 0.8) =>
  new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false })

/** 盒子 12 条边写入 pos 数组 */
function boxEdges(pos: number[], x: number, y: number, z: number, w: number, h: number, d: number) {
  const x0 = x - w / 2, x1 = x + w / 2, y0 = y, y1 = y + h, z0 = z - d / 2, z1 = z + d / 2
  const e = (a: number[], b: number[]) => pos.push(...a, ...b)
  for (const yy of [y0, y1]) {
    e([x0, yy, z0], [x1, yy, z0]); e([x1, yy, z0], [x1, yy, z1]); e([x1, yy, z1], [x0, yy, z1]); e([x0, yy, z1], [x0, yy, z0])
  }
  e([x0, y0, z0], [x0, y1, z0]); e([x1, y0, z0], [x1, y1, z0]); e([x1, y0, z1], [x1, y1, z1]); e([x0, y0, z1], [x0, y1, z1])
}
function segs(pos: number[], mat: THREE.LineBasicMaterial) {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  return new THREE.LineSegments(g, mat)
}

// ---------------- 娃娃 ----------------
/** 娃娃局部坐标：坐姿，面朝 +z，头心 y=4.2、头半径 1 */
function buildDoll() {
  const g = new THREE.Group()
  const shell = xray(1)
  const add = (geo: THREE.BufferGeometry, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, shell)
    m.position.set(x, y, z)
    m.scale.set(sx, sy, sz)
    m.rotation.set(rx, 0, rz)
    g.add(m)
  }
  add(new THREE.SphereGeometry(1, 64, 48), 0, 4.2, 0, 1, 1.06, 0.95)
  add(new THREE.SphereGeometry(1, 24, 16), -0.97, 4.15, -0.05, 0.16, 0.3, 0.2)
  add(new THREE.SphereGeometry(1, 24, 16), 0.97, 4.15, -0.05, 0.16, 0.3, 0.2)
  add(new THREE.SphereGeometry(1, 24, 16), 0, 3.95, 0.92, 0.2, 0.16, 0.12) // 鼻
  add(new THREE.CylinderGeometry(0.42, 0.5, 0.45, 32), 0, 3.05, 0)
  add(new THREE.CapsuleGeometry(0.85, 1.1, 12, 32), 0, 1.85, 0, 1, 1, 0.78)
  add(new THREE.CapsuleGeometry(0.24, 1.1, 8, 16), -1.12, 2.0, 0.05, 1, 1, 1, 0, -0.22)
  add(new THREE.CapsuleGeometry(0.24, 1.1, 8, 16), 1.12, 2.0, 0.05, 1, 1, 1, 0, 0.22)
  add(new THREE.CapsuleGeometry(0.33, 1.0, 8, 16), -0.55, 0.4, 0.75, 1, 1, 1, Math.PI / 2, 0)
  add(new THREE.CapsuleGeometry(0.33, 1.0, 8, 16), 0.55, 0.4, 0.75, 1, 1, 1, Math.PI / 2, 0)
  add(new THREE.SphereGeometry(1, 24, 16), -0.62, 0.45, 1.65, 0.36, 0.42, 0.26)
  add(new THREE.SphereGeometry(1, 24, 16), 0.62, 0.45, 1.65, 0.36, 0.42, 0.26)
  // 颈部齿轮圈
  const gear: number[] = []
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2
    const r1 = 0.55
    const r2 = 0.62
    gear.push(Math.cos(a) * r1, 2.85, Math.sin(a) * r1, Math.cos(a) * r2, 2.85, Math.sin(a) * r2)
  }
  // 内部机械：脸部面板、镜头眼、胸口电路板、导线
  const inner: number[] = []
  boxEdges(inner, 0.15, 3.95, 0.25, 1.15, 0.85, 0.55)
  boxEdges(inner, -0.1, 4.8, 0.1, 0.5, 0.35, 0.4)
  boxEdges(inner, 0, 1.2, 0.5, 0.45, 1.2, 0.06)
  for (let i = 0; i < 7; i++) boxEdges(inner, (hash(i) - 0.5) * 0.3, 1.3 + i * 0.14, 0.55, 0.12, 0.08, 0.05)
  boxEdges(inner, 0.62, 4.1, 0.55, 0.25, 0.25, 0.25)
  const eyes: THREE.Vector3[] = []
  for (const sx of [-0.36, 0.36]) {
    const c = new THREE.Vector3(sx, 4.28, 0.78)
    eyes.push(c)
    for (let k = 0; k < 2; k++) {
      const r = k ? 0.22 : 0.14
      for (let i = 0; i < 24; i++) {
        const a0 = (i / 24) * Math.PI * 2
        const a1 = ((i + 1) / 24) * Math.PI * 2
        inner.push(c.x + Math.cos(a0) * r, c.y + Math.sin(a0) * r, c.z + k * 0.05, c.x + Math.cos(a1) * r, c.y + Math.sin(a1) * r, c.z + k * 0.05)
      }
    }
  }
  const wires = new THREE.Group()
  const R = rng(58)
  for (let i = 0; i < 9; i++) {
    const pts = [
      new THREE.Vector3(R.range(-0.4, 0.4), R.range(3.6, 4.6), R.range(-0.2, 0.4)),
      new THREE.Vector3(R.range(-0.3, 0.3), 3.0, R.range(-0.1, 0.3)),
      new THREE.Vector3(R.range(-0.5, 0.5), R.range(1.6, 2.4), R.range(0.1, 0.5)),
      new THREE.Vector3(R.range(-0.4, 0.4), R.range(0.8, 1.2), 0.5),
    ]
    const c = new THREE.CatmullRomCurve3(pts)
    wires.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(c.getPoints(30)), lineMat(0xffffff, 0.55)))
  }
  // 从胸口垂到地面的导线
  const cable = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.3, 1.8, 0.6),
    new THREE.Vector3(-1.0, 2.3, 0.8),
    new THREE.Vector3(-1.6, 1.0, 1.4),
    new THREE.Vector3(-2.6, 0.0, 3.0),
    new THREE.Vector3(-4, -1.0, 6),
  ])
  wires.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(cable.getPoints(60)), lineMat(0xffffff, 0.7)))
  g.add(segs(gear, lineMat(0xffffff, 0.7)))
  g.add(segs(inner, lineMat(0xffffff, 0.85)))
  g.add(wires)
  return { group: g, shell, eyes }
}

// ---------------- 客厅 ----------------
/**
 * V2 客厅：在「房间坐标」里搭（单位≈房间米制的 1/…，只保证与反求一致）：后墙 z=0、地面 y=0、x 向右。
 * 房间坐标由反求 wd2-room-b 的 3D 点求得：取落在后墙窗台/墙面上的 31 个点做 PCA 拟合出墙面（残差 0.029），
 * 法线为 +z、相机 up 在墙面内的投影为 +y；尺度 ×3.9、地面按 64.5s 桌腿落地点与右墙门脚反推。
 * 家具位置/尺寸：用对齐后的反求相机把原片 62.97 / 63.0 / 64.5 帧的角点反投影到墙面或地面得到。
 * 线稿密度：原片家具是很密的三角网（扶手椅的布面褶皱、窗格、护墙板），这里每个面都细分成网格再加对角线，
 * 墙面加护墙板竖线、腰线、挂镜线，窗户是 2×4 窗格 + 窗洞进深 + 上方一排高窗。
 * 整个房间组放进 V1 场景坐标：V1 = 3·房间 + (−1.17, 0, −6.05)（与娃娃/前一镜头的相机路径共用一个世界）。
 */
interface RoomPart {
  obj: THREE.Object3D
  mat: THREE.LineBasicMaterial
  t0: number
  flash?: THREE.Mesh
  /** 闪入灰面的最大不透明度 */
  flashA?: number
}
const ROOM_S = 3
const ROOM_OFF = new THREE.Vector3(-1.17, 0, -6.05)
/** 房间坐标 → V1 世界坐标 */
const R2W = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).multiplyScalar(ROOM_S).add(ROOM_OFF)

/** 细分网格面：原点 o、两条边向量 u/v，nu×nv 格 + 一组对角线（jit = 顶点抖动，让网格像扫描出来的三角网） */
function gridFace(pos: number[], o: number[], u: number[], v: number[], nu: number, nv: number, R: ReturnType<typeof rng>, jit = 0, diag = true) {
  const P = (i: number, j: number) => {
    const e = i > 0 && i < nu && j > 0 && j < nv ? jit : 0
    return [0, 1, 2].map((k) => o[k] + (u[k] * i) / nu + (v[k] * j) / nv + (e ? R.range(-e, e) : 0))
  }
  const G: number[][][] = []
  for (let i = 0; i <= nu; i++) {
    G.push([])
    for (let j = 0; j <= nv; j++) G[i].push(P(i, j))
  }
  for (let i = 0; i <= nu; i++)
    for (let j = 0; j <= nv; j++) {
      if (i < nu) pos.push(...G[i][j], ...G[i + 1][j])
      if (j < nv) pos.push(...G[i][j], ...G[i][j + 1])
      if (diag && i < nu && j < nv) pos.push(...((i + j) % 2 ? [...G[i][j], ...G[i + 1][j + 1]] : [...G[i + 1][j], ...G[i][j + 1]]))
    }
}
/** 细分的盒子（6 面网格） */
function gridBox(pos: number[], x: number, y: number, z: number, w: number, h: number, d: number, n: number, R: ReturnType<typeof rng>, jit = 0) {
  const x0 = x - w / 2, y0 = y, z0 = z - d / 2
  const nu = (a: number) => Math.max(1, Math.round(a * n))
  gridFace(pos, [x0, y0, z0 + d], [w, 0, 0], [0, h, 0], nu(w), nu(h), R, jit) // 前
  gridFace(pos, [x0, y0, z0], [w, 0, 0], [0, h, 0], nu(w), nu(h), R, jit, false) // 后
  gridFace(pos, [x0, y0 + h, z0], [w, 0, 0], [0, 0, d], nu(w), nu(d), R, jit) // 顶
  gridFace(pos, [x0, y0, z0], [0, 0, d], [0, h, 0], nu(d), nu(h), R, jit) // 左
  gridFace(pos, [x0 + w, y0, z0], [0, 0, d], [0, h, 0], nu(d), nu(h), R, jit) // 右
}
/** 在局部坐标里生成、再绕 y 旋转 rot 并平移到 (x, z) */
function place(out: number[], local: number[], x: number, z: number, rot: number, y = 0) {
  const c = Math.cos(rot), s = Math.sin(rot)
  for (let i = 0; i < local.length; i += 3) out.push(x + local[i] * c + local[i + 2] * s, local[i + 1] + y, z - local[i] * s + local[i + 2] * c)
}
/** 俱乐部扶手椅（原片那种方正、布面有菱形绗缝的沙发椅）：局部坐标面朝 +z，宽 0.95、深 0.9、高 0.8 */
function clubChair(R: ReturnType<typeof rng>) {
  const p: number[] = []
  gridBox(p, 0, 0.12, 0.02, 0.95, 0.24, 0.86, 6, R, 0.012) // 座基
  gridBox(p, 0, 0.36, 0.06, 0.66, 0.1, 0.7, 9, R, 0.015) // 坐垫
  gridBox(p, 0, 0.12, -0.36, 0.95, 0.68, 0.18, 8, R, 0.012) // 靠背
  gridBox(p, -0.4, 0.12, 0.04, 0.15, 0.44, 0.82, 7, R, 0.01) // 扶手
  gridBox(p, 0.4, 0.12, 0.04, 0.15, 0.44, 0.82, 7, R, 0.01)
  for (const [lx, lz] of [[-0.42, -0.38], [0.42, -0.38], [-0.42, 0.4], [0.42, 0.4]]) p.push(lx, 0, lz, lx * 0.97, 0.12, lz * 0.97)
  return p
}
/** 2×4 窗格窗户 + 窗洞进深（贴后墙，z = 0） */
function windowFrame(p: number[], x0: number, x1: number, y0: number, y1: number, cols = 2, rows = 4, depth = 0.1) {
  for (const z of [0, -depth]) {
    p.push(x0, y0, z, x1, y0, z, x1, y0, z, x1, y1, z, x1, y1, z, x0, y1, z, x0, y1, z, x0, y0, z)
  }
  for (const [x, y] of [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]) p.push(x, y, 0, x, y, -depth)
  const inset = 0.03
  for (let i = 1; i < cols; i++) {
    const x = x0 + ((x1 - x0) * i) / cols
    p.push(x - 0.012, y0, -depth, x - 0.012, y1, -depth, x + 0.012, y0, -depth, x + 0.012, y1, -depth)
  }
  for (let j = 1; j < rows; j++) {
    const y = y0 + ((y1 - y0) * j) / rows
    p.push(x0, y, -depth, x1, y, -depth)
  }
  // 内框
  p.push(x0 + inset, y0 + inset, -depth, x1 - inset, y0 + inset, -depth, x1 - inset, y0 + inset, -depth, x1 - inset, y1 - inset, -depth)
  p.push(x1 - inset, y1 - inset, -depth, x0 + inset, y1 - inset, -depth, x0 + inset, y1 - inset, -depth, x0 + inset, y0 + inset, -depth)
  // 窗台
  p.push(x0 - 0.05, y0, 0.06, x1 + 0.05, y0, 0.06, x0 - 0.05, y0 - 0.03, 0.06, x1 + 0.05, y0 - 0.03, 0.06)
}

function buildRoom() {
  const parts: RoomPart[] = []
  const scene = new THREE.Group()
  scene.scale.setScalar(ROOM_S)
  scene.position.copy(ROOM_OFF)
  const R = rng(611)
  const addPart = (pos: number[], t0: number, opacity = 0.85, flashBox?: [number, number, number, number, number, number], flashA?: number) => {
    const mat = lineMat(0xffffff, opacity)
    const obj = segs(pos, mat)
    scene.add(obj)
    let flash: THREE.Mesh | undefined
    if (flashBox) {
      const [x, y, z, w, h, d] = flashBox
      flash = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }))
      flash.position.set(x, y + h / 2, z)
      scene.add(flash)
    }
    parts.push({ obj, mat, t0, flash, flashA })
  }
  // 电视柜（最先出现，带白色实体闪光）：三层开放式柜 + 柜里的游戏机/功放
  const stand: number[] = []
  const SX = 0.47, SW = 1.15, SD = 0.42, SZ = 0.3, SY = 0.3
  for (const y of [0.1, 0.34, 0.6]) gridBox(stand, SX, y + SY, SZ, SW, 0.03, SD, 6, R)
  for (const lx of [-SW / 2 + 0.02, 0, SW / 2 - 0.02]) for (const lz of [-SD / 2 + 0.02, SD / 2 - 0.02]) stand.push(SX + lx, SY, SZ + lz, SX + lx, 0.63 + SY, SZ + lz)
  gridBox(stand, SX - 0.24, 0.37 + SY, SZ, 0.34, 0.1, 0.3, 14, R) // 功放
  gridBox(stand, SX + 0.26, 0.37 + SY, SZ, 0.32, 0.08, 0.28, 14, R) // 游戏机
  gridBox(stand, SX - 0.1, 0.13 + SY, SZ, 0.4, 0.07, 0.3, 12, R)
  gridBox(stand, SX + 0.1, 0.63 + SY, SZ - 0.02, 0.5, 0.03, 0.2, 10, R) // 电视底座
  addPart(stand, 60.1, 0.95, [SX, SY, SZ, SW, 0.63, SD])
  // 电视
  const tv: number[] = []
  gridBox(tv, 0.41, 0.96, 0.16, 1.0, 0.5, 0.04, 3, R)
  tv.push(0.41, 0.93, 0.16, 0.41, 0.96, 0.16)
  addPart(tv, 60.45, 0.95, [0.41, 0.96, 0.16, 1.0, 0.5, 0.04], 0.25)
  // 后墙：窗（2×4 窗格 + 进深）、上方高窗、护墙板竖线、腰线/挂镜线/踢脚线；左右墙；右墙双开门
  const wall: number[] = []
  const WX0 = -2.4, WX1 = 3.05, CEIL = 2.75
  /** 反求 3D 点里扶手椅腿、电视柜底、64.5s 长桌腿都落在比墙面推算地面高约 0.3 的平面上（反求深度并非处处一致），家具按它放 */
  const LIFT = 0.4
  const WY0 = 0.9, WY1 = 1.75
  for (const [x0, x1] of [[-1.74, -1.18], [-1.05, -0.52], [1.36, 1.86], [2.0, 2.5]]) {
    windowFrame(wall, x0, x1, WY0, WY1)
    windowFrame(wall, x0, x1, WY1 + 0.1, WY1 + 0.45, 2, 1, 0.06)
  }
  for (const y of [0, 0.08, 0.8, 0.84, 2.14, 2.17, CEIL]) wall.push(WX0, y, 0, WX1, y, 0)
  for (let x = WX0; x <= WX1 + 1e-6; x += 0.3) wall.push(x, 0.08, 0.004, x, 0.8, 0.004)
  wall.push(WX0, 0, 0, WX0, CEIL, 0, WX1, 0, 0, WX1, CEIL, 0)
  for (const x of [WX0, WX1]) {
    for (const y of [0, 0.8, 2.15, CEIL]) wall.push(x, y, 0, x, y, 7)
  }
  // 左墙：书柜/窗（竖向格子）
  for (let i = 0; i <= 6; i++) wall.push(WX0 + 0.004, 0.2 + i * 0.36, 1.2, WX0 + 0.004, 0.2 + i * 0.36, 2.6)
  for (const z of [1.2, 1.9, 2.6]) wall.push(WX0 + 0.004, 0.2, z, WX0 + 0.004, 2.36, z)
  // 右墙双开门 + 门框
  const door = (z0: number, z1: number) => {
    const x = WX1 - 0.004
    wall.push(x, 0, z0, x, 2.1, z0, x, 2.1, z0, x, 2.1, z1, x, 2.1, z1, x, 0, z1)
    const zm = (z0 + z1) / 2
    wall.push(x, 0, zm, x, 2.1, zm)
    for (const [a, b] of [[z0, zm], [zm, z1]]) {
      const ia = a + 0.1 * Math.sign(b - a), ib = b - 0.1 * Math.sign(b - a)
      for (const [y0, y1] of [[0.2, 0.9], [1.05, 1.95]]) wall.push(x, y0, ia, x, y0, ib, x, y0, ib, x, y1, ib, x, y1, ib, x, y1, ia, x, y1, ia, x, y0, ia)
    }
  }
  door(2.3, 3.5)
  addPart(wall, 60.55, 0.62, [0.3, 0, -0.02, 5.4, 2.75, 0.02], 0.04)
  // 试过给墙面加暗灰底色（原片平均亮度 20–27）：SSIM 反而下降（线条之间的平坦灰被当成结构差异），保持纯黑
  // 扶手椅：左右各一 + 后方两把（64s 拉远后可见）
  const chairs: number[] = []
  place(chairs, clubChair(R), -1.5, 0.75, 0.55, LIFT)
  place(chairs, clubChair(R), 2.4, 0.75, -0.6, LIFT)
  place(chairs, clubChair(R), -1.15, 2.6, 1.1, LIFT)
  place(chairs, clubChair(R), 2.1, 2.7, -1.2, LIFT)
  addPart(chairs, 60.75, 0.5)
  // 脚凳、茶几（长桌，64s 拉远时在画面正中）、边桌与台灯
  const misc: number[] = []
  gridBox(misc, 1.42, 0.08 + LIFT, 0.95, 0.6, 0.36, 0.45, 12, R, 0.01)
  for (const [lx, lz] of [[-0.27, -0.2], [0.27, -0.2], [-0.27, 0.2], [0.27, 0.2]]) misc.push(1.42 + lx, LIFT, 0.95 + lz, 1.42 + lx, 0.08 + LIFT, 0.95 + lz)
  const TX = 0.63, TZ = 5.35, TW = 0.9, TD = 0.55, TH = 0.4 + LIFT
  gridBox(misc, TX, TH - 0.05, TZ, TW, 0.05, TD, 16, R, 0.004)
  gridBox(misc, TX, TH - 0.16, TZ, TW - 0.08, 0.1, TD - 0.08, 10, R)
  for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const x = TX + (lx * (TW - 0.08)) / 2, z = TZ + (lz * (TD - 0.08)) / 2
    gridBox(misc, x, LIFT, z, 0.05, TH - 0.05 - LIFT, 0.05, 20, R)
  }
  // 桌上的遥控器/平板
  gridBox(misc, TX - 0.3, TH, TZ + 0.05, 0.36, 0.015, 0.22, 12, R)
  gridBox(misc, TX + 0.25, TH, TZ - 0.05, 0.2, 0.02, 0.05, 8, R)
  gridBox(misc, 2.6, LIFT, 1.8, 0.4, 0.55, 0.4, 8, R) // 边桌
  gridBox(misc, 2.6, 0.55 + LIFT, 1.8, 0.12, 0.3, 0.12, 8, R) // 台灯
  addPart(misc, 61.1, 0.8)
  // 扫描三角网：房间里穿插的长细斜线（原片满屏的淡斜线）
  const tri: number[] = []
  for (let i = 0; i < 90; i++) tri.push(R.range(WX0, WX1), R.range(0, CEIL), R.range(0, 4), R.range(WX0, WX1), R.range(0, CEIL), R.range(0, 4))
  addPart(tri, 60.9, 0.0)
  return { group: scene, parts }
}

// ---------------- 点云墙 + 青色地面线 ----------------
function buildCloud() {
  const pos: number[] = []
  const R = rng(57)
  // 娃娃身后两片弧形点云墙：一排排水平点线
  for (let row = 0; row < 40; row++) {
    const y = row * 0.07
    for (let i = 0; i < 160; i++) {
      if (R.chance(0.35)) continue
      const a = -1.2 + (i / 160) * 2.4
      const r = 2.2 + Math.sin(a * 3 + row * 0.1) * 0.08
      pos.push(Math.sin(a) * r * 1.6, y + R.range(-0.01, 0.01), -Math.cos(a) * r * 0.9 - 0.4)
    }
  }
  // 沙发轮廓点云
  for (let i = 0; i < 2600; i++) {
    const x = R.range(-1.4, 1.8)
    const z = R.range(-0.6, 0.6)
    const y = 0.25 + Math.max(0, 0.35 - Math.abs(z) * 0.3) + (x > 1.3 ? 0.3 : 0)
    pos.push(x, y + R.range(-0.02, 0.02), z)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0.7, depthWrite: false })
  const cyan: THREE.Line[] = []
  const cmat = lineMat(0x3fb6c4, 0.9)
  for (let k = 0; k < 4; k++) {
    const pts: THREE.Vector3[] = []
    let x = -3
    let z = 1.5 + k * 0.25
    for (let i = 0; i < 14; i++) {
      pts.push(new THREE.Vector3(x, 0.02 + (i % 2) * 0.04, z))
      x += R.range(0.3, 0.7)
      z += R.range(-0.4, 0.4)
    }
    cyan.push(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), cmat))
  }
  return { points: new THREE.Points(g, mat), mat, cyan, cmat }
}

// ---------------- 场景组装 ----------------
/** 娃娃坐在左扶手椅坐垫上（房间坐标 (−1.4, 0.46, 1.0) → V1 世界；镜头 A/B 的机位都相对娃娃，挪娃娃不改变 54.9–59.4 的构图） */
const DOLL_POS = new THREE.Vector3(-1.45 * 3 - 1.17, 0.76 * 3, 0.8 * 3 - 6.05)
const DOLL_S = 0.3
function home() {
  return memo('wd2p2-home', () => {
    const scene = new THREE.Scene()
    const doll = buildDoll()
    doll.group.position.copy(DOLL_POS)
    doll.group.scale.setScalar(DOLL_S)
    doll.group.rotation.y = 0.5
    scene.add(doll.group)
    const cloud = buildCloud()
    const cg = new THREE.Group()
    cg.add(cloud.points, ...cloud.cyan)
    cg.position.copy(DOLL_POS).add(new THREE.Vector3(0, -0.5, 0))
    cg.rotation.y = 0.5
    scene.add(cg)
    const room = buildRoom()
    scene.add(room.group)
    const camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.02, 200)
    return { scene, camera, doll, cloud, room }
  })
}

/** 世界坐标：娃娃局部点 → 世界 */
function dollWorld(x: number, y: number, z: number) {
  const v = new THREE.Vector3(x, y, z).multiplyScalar(DOLL_S)
  v.applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.5)
  return v.add(DOLL_POS)
}

type Key = [number, number[], number[]] // 时间, 机位, 目标
function camPath(keys: Key[], t: number) {
  let i = 0
  while (i < keys.length - 2 && t > keys[i + 1][0]) i++
  const [t0, p0, a0] = keys[i]
  const [t1, p1, a1] = keys[i + 1]
  const u = ease.inOutCubic(clamp((t - t0) / (t1 - t0)))
  return {
    pos: new THREE.Vector3(lerp(p0[0], p1[0], u), lerp(p0[1], p1[1], u), lerp(p0[2], p1[2], u)),
    at: new THREE.Vector3(lerp(a0[0], a1[0], u), lerp(a0[1], a1[1], u), lerp(a0[2], a1[2], u)),
  }
}

function toArr(v: THREE.Vector3) {
  return [v.x, v.y, v.z]
}
let keysCache: { a: Key[]; b: Key[] } | null = null
function keys() {
  if (keysCache) return keysCache
  // 娃娃局部坐标下的机位 / 目标（娃娃面朝 +z，头心 (0,4.2,0)、头半径 1）
  const L = (x: number, y: number, z: number) => toArr(dollWorld(x, y, z))
  // 镜头 A（56.2 前）：从娃娃右前方斜看，头占画面左半、头顶出画
  const a: Key[] = [
    [54.9, L(-2.25, 4.35, 3.8), L(0.95, 4.1, 0.45)],
    [56.25, L(-2.5, 4.3, 4.3), L(1.0, 4.0, 0.45)],
  ]
  // 镜头 B（56.2 后）：接近正面，一路拉远 → 右移看电视柜 → 拉远全景 → 摇到门
  const b: Key[] = [
    [56.2, L(-0.8, 4.1, 3.6), L(0.85, 3.85, 0)],
    [57.0, L(-0.6, 3.7, 6.2), L(0.9, 3.0, 0)],
    [57.8, L(-0.3, 3.3, 9.2), L(0.3, 2.4, 0)],
    [58.6, L(0, 3.3, 12.5), L(0.2, 2.5, 0)],
    [59.4, L(1.5, 4.5, 19), L(3.5, 2.2, 0)],
  ]
  keysCache = { a, b }
  return keysCache
}

/**
 * 反求相机 wd2-room-b（61.30–64.61，good 0.77px）对齐到场景：先转到房间坐标（墙面 PCA，见 buildRoom 注释），再 ×3 + 偏移进 V1 世界。
 * 合成一步：scale = 3.9 × 3，旋转 = 墙面基（行 = x/y/z 轴）的四元数，offset = 3·(−3.9·R·c + 地面) + (−1.17, 0, −6.05)。
 */
let roomTrack: CameraTrack | null = null
function roomTrackAligned() {
  return (roomTrack ??= alignTrack(cameraTrack('wd2-room-b'), {
    scale: 3.9 * ROOM_S,
    rotation: new THREE.Quaternion(0.3748018586832255, 0.12562819831707558, -0.011589425996250112, 0.9184807062319177),
    offset: [-0.2807532598141091 * ROOM_S - 1.17, 1.05 * ROOM_S, 0.19068865935289725 * ROOM_S - 6.05],
  }))
}
const _tq = new THREE.Quaternion()
const _tp = new THREE.Vector3()
const _tmp = new THREE.PerspectiveCamera()
/**
 * 机位：< 59.4 用 V1 的娃娃相对关键帧；59.4–61.3 从娃娃远景插值到反求轨迹首帧（原片这段是闪入段，解不出，手调衔接）；
 * 61.3–64.61 直接用反求轨迹；64.61–65.35 在轨迹末帧基础上向右摇 38° 并右移（原片摇到右墙的门）。
 */
function placeRoomCam(cam: THREE.PerspectiveCamera, t: number, k: { a: Key[]; b: Key[] }) {
  const trk = roomTrackAligned()
  cam.fov = 38
  if (t < 59.4) {
    const cp = t < 56.2 ? camPath(k.a, t) : camPath(k.b, t)
    cam.position.copy(cp.pos)
    cam.lookAt(cp.at)
  } else if (t < trk.start) {
    // 原片 60.0 已是远景：娃娃缩在左上，镜头对着电视柜方向；用「轨迹首帧后退 1.4、左移 0.8、左转 12°」作为 59.8 的机位
    const cp = camPath(k.b, 59.4)
    _tmp.position.copy(cp.pos)
    _tmp.lookAt(cp.at)
    applyTrack(cam, trk, trk.start)
    _tp.copy(cam.position)
    _tq.copy(cam.quaternion)
    const pre = cam.clone()
    pre.position.add(new THREE.Vector3(-0.8, 0.1, 1.4).multiplyScalar(ROOM_S))
    pre.rotateY((12 * Math.PI) / 180)
    const u1 = ease.inOutCubic(seg(t, 59.4, 59.8))
    const u2 = ease.inOutCubic(seg(t, 59.8, trk.start))
    cam.position.copy(_tmp.position).lerp(pre.position, u1).lerp(_tp, u2)
    cam.quaternion.copy(_tmp.quaternion).slerp(pre.quaternion, u1).slerp(_tq, u2)
    cam.fov = lerp(38, trk.fov[0], u1)
  } else {
    applyTrack(cam, trk, t)
    if (t > trk.end) {
      const u = ease.inOutCubic(seg(t, trk.end, 65.35))
      cam.position.x += 0.9 * ROOM_S * u
      cam.rotateY((-38 * Math.PI * u) / 180)
    }
  }
  cam.updateProjectionMatrix()
  cam.updateMatrixWorld()
}

function project(v: THREE.Vector3, camera: THREE.Camera, W: number, H: number) {
  const p = v.clone().project(camera)
  return { x: (p.x * 0.5 + 0.5) * W, y: (-p.y * 0.5 + 0.5) * H, behind: p.z > 1 }
}

function render3d(f: FrameCtx) {
  const { ctx, t, W, H } = f
  const h = home()
  const k = keys()
  placeRoomCam(h.camera, t, k)
  // 娃娃亮度：拉远后变暗一些，客厅出来后渐隐
  h.doll.shell.uniforms.uA.value = t < 59 ? 1 : lerp(1, 0.55, seg(t, 59, 61))
  // 点云与青线：57.3 出现，60.5 后淡出
  const cloudA = seg(t, 57.3, 57.9) * (1 - seg(t, 60.4, 61.2))
  h.cloud.mat.opacity = 0.75 * cloudA
  h.cloud.cmat.opacity = 0.9 * seg(t, 57.8, 58.4) * (1 - seg(t, 60.6, 61.4))
  // 客厅部件依次出现（前 0.12s 闪烁）
  for (const p of h.room.parts) {
    const a = seg(t, p.t0, p.t0 + 0.35)
    const flick = t < p.t0 + 0.2 && t > p.t0 ? (hash(fr(t) + p.t0 * 100) > 0.4 ? 1 : 0.2) : 1
    p.mat.opacity = (p.mat.userData.base ?? (p.mat.userData.base = p.mat.opacity)) * a * flick
    p.obj.visible = a > 0
    if (p.flash) {
      const m = p.flash.material as THREE.MeshBasicMaterial
      // 原片闪入是半透明灰面（不是纯白），持续约 0.5s
      m.opacity = (p.flashA ?? 0.42) * seg(t, p.t0, p.t0 + 0.08) * (1 - seg(t, p.t0 + 0.3, p.t0 + 0.7))
      p.flash.visible = m.opacity > 0.01
    }
  }
  const img = f.three.render(h.scene, h.camera)
  ctx.drawImage(img, 0, 0, W, H)
  // 客厅段线条在原片里粗而亮：错位 1px 叠加一次模拟 2px 线宽
  if (t > 59.8) {
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = 0.8
    ctx.drawImage(img, 1, 1, W, H)
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
  }
  return h
}

// ---------------- 2D 叠层 ----------------
const LINE1 = 'toys study'
const LINE2 = 'your children.'

/** 打字 / 删字节奏（原片逐词出现，白块光标在末尾） */
function typed(t: number) {
  // 可见字符数（两行合计）
  const total = LINE1.length + LINE2.length
  const ups: [number, number][] = [
    [54.9, 0],
    [55.0, 4],
    [55.35, 4],
    [55.8, 10],
    [56.0, 10],
    [56.35, total],
    [56.95, total],
    [57.55, 4],
    [57.72, 4],
    [57.8, 0],
  ]
  for (let i = 0; i < ups.length - 1; i++) {
    const [t0, n0] = ups[i]
    const [t1, n1] = ups[i + 1]
    if (t >= t0 && t < t1) return lerp(n0, n1, (t - t0) / (t1 - t0))
  }
  return 0
}

function drawToyText(ctx: CanvasRenderingContext2D, t: number) {
  const n = typed(t)
  if (n <= 0) return
  // 只在打字/删字进行中显示白块光标
  const moving = Math.abs(typed(t - 0.04) - n) > 0.01
  font(ctx, 86, 600, FONT.sans)
  tracking(ctx, -2.5)
  const x = 1182
  blockType(ctx, LINE1, Math.min(n, LINE1.length), x, 400, 86, moving && n <= LINE1.length + 0.5)
  if (n > LINE1.length) blockType(ctx, LINE2, n - LINE1.length, x, 492, 86, moving)
  tracking(ctx, 0)
}

/** 背景细网格线（原片特写段可见的竖线/横线 + 刻度） */
function hairGrid(ctx: CanvasRenderingContext2D, a: number) {
  if (a <= 0) return
  ctx.strokeStyle = `rgba(255,255,255,${0.14 * a})`
  ctx.lineWidth = 1.2
  ctx.beginPath()
  for (const x of [270, 1200]) (ctx.moveTo(x, 0), ctx.lineTo(x, 1080))
  for (const y of [40, 975]) (ctx.moveTo(0, y), ctx.lineTo(1920, y))
  ctx.stroke()
  ctx.fillStyle = `rgba(255,255,255,${0.3 * a})`
  for (let i = 0; i < 40; i++) ctx.fillRect(i * 48, 38, 2, 5)
}

function renderToy(f: FrameCtx) {
  const { ctx, t, W, H } = f
  hairGrid(ctx, 1 - seg(t, 57.2, 57.8))
  const h = render3d(f)
  // 56.1–57.1 眼睛发光
  const glow = seg(t, 56.05, 56.25) * (1 - seg(t, 57.0, 57.6))
  if (glow > 0) {
    for (const e of h.doll.eyes) {
      const p = project(dollWorld(e.x, e.y, e.z), h.camera, W, H)
      const dist = h.camera.position.distanceTo(dollWorld(e.x, e.y, e.z))
      const r = 60 / dist
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r)
      g.addColorStop(0, `rgba(255,255,255,${0.95 * glow})`)
      g.addColorStop(0.3, `rgba(255,220,220,${0.6 * glow})`)
      g.addColorStop(1, 'rgba(255,120,120,0)')
      ctx.globalCompositeOperation = 'lighter'
      ctx.fillStyle = g
      ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2)
      ctx.globalCompositeOperation = 'source-over'
    }
  }
  drawToyText(ctx, t)
  // PLAY HABITS 标签：挂在娃娃左上方的 3D 锚点
  const la = seg(t, 57.55, 57.8) * (1 - seg(t, 59.6, 59.9))
  if (la > 0) {
    const p = project(dollWorld(-3.4, 6.2, 0), h.camera, W, H)
    ctx.globalAlpha = la
    font(ctx, 22, 700, FONT.sans)
    tracking(ctx, -0.5)
    ctx.fillStyle = '#f2f2f2'
    ctx.fillText('PLAY HABITS', p.x, p.y)
    tracking(ctx, 0)
    mono(ctx, '58%', p.x + 185, p.y + 50, 13)
    mono(ctx, '42%', p.x + 185, p.y + 108, 13)
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'
    ctx.beginPath()
    ctx.arc(p.x + 128, p.y + 48, 12, 0, Math.PI * 2)
    ctx.moveTo(p.x + 110, p.y + 110)
    ctx.lineTo(p.x + 120, p.y + 64)
    ctx.lineTo(p.x + 136, p.y + 64)
    ctx.lineTo(p.x + 146, p.y + 110)
    ctx.stroke()
    for (let i = 0; i < 5; i++) ctx.fillRect(p.x + 10, p.y + 60 + i * 26, 60, 2)
    ctx.globalAlpha = 1
  }
}

/** 客厅段的 HUD：坐标数字、小窗口、REMOTE 标签 */
function roomHud(ctx: CanvasRenderingContext2D, t: number, camera: THREE.Camera, W: number, H: number) {
  const a = seg(t, 59.4, 59.7) * (1 - seg(t, 64.2, 64.8))
  if (a <= 0) return
  const R = rng(640)
  ctx.globalAlpha = a
  for (let i = 0; i < 26; i++) {
    const wp = R2W(R.range(-2.2, 3), R.range(0.3, 2.4), R.range(0, 2.5))
    const p = project(wp, camera, W, H)
    const on = seg(t, 59.4 + R.next() * 1.8, 59.6 + R.next() * 1.8)
    if (p.behind || on <= 0) continue
    const kind = R.int(0, 3)
    if (kind === 0) mono(ctx, `Δ-${R.int(10000, 29999)}  ${R.int(10000, 99999)}`, p.x, p.y, 15, 'rgba(255,255,255,0.8)')
    else if (kind === 1) {
      ctx.fillStyle = 'rgba(255,255,255,0.75)'
      ctx.fillRect(p.x, p.y, 14, 8)
      mono(ctx, `${R.int(100, 999)}.${R.int(10, 99)}  ${R.int(1000, 9999)}`, p.x + 22, p.y + 8, 12, 'rgba(255,255,255,0.7)')
    } else if (kind === 2) {
      ctx.fillStyle = 'rgba(10,10,10,0.9)'
      ctx.fillRect(p.x, p.y, 120, 70)
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'
      ctx.strokeRect(p.x + 0.5, p.y + 0.5, 120, 70)
      for (let j = 0; j < 4; j++) {
        ctx.fillStyle = 'rgba(255,255,255,0.5)'
        ctx.fillRect(p.x + 8, p.y + 12 + j * 14, 40 + hash(i * 9 + j) * 60, 2)
      }
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.8)'
      ctx.fillRect(p.x, p.y, 30, 30)
      ctx.fillStyle = '#222'
      ctx.fillRect(p.x + 7, p.y + 5, 16, 20)
    }
  }
  const rp = project(R2W(0.25, 0.3, 0.55), camera, W, H)
  if (!rp.behind) {
    font(ctx, 16, 700, FONT.sans)
    ctx.fillStyle = '#f2f2f2'
    ctx.fillText('REMOTE', rp.x, rp.y)
  }
  ctx.globalAlpha = 1
}

function renderRoom(f: FrameCtx) {
  const { ctx, t, W, H } = f
  const h = render3d(f)
  roomHud(ctx, t, h.camera, W, H)
  // 64.0 起右侧门边飘起的白色颗粒
  const pa = seg(t, 63.7, 64.1) * (1 - seg(t, 64.9, 65.3))
  if (pa > 0) {
    const R = rng(64)
    ctx.fillStyle = `rgba(255,255,255,${0.7 * pa})`
    for (let i = 0; i < 700; i++) {
      const x = 1450 + R.range(-120, 380) - (t - 63.7) * 260
      const y = R.range(80, 1080) - (t - 63.7) * R.range(20, 80)
      const s = R.chance(0.1) ? 3 : 1.6
      ctx.fillRect(x, y, s, s)
    }
  }
}

export const homeScenes: Scene[] = [
  {
    id: 'wd2-054-toys',
    start: 54.9,
    end: 59.3,
    note: 'X 光娃娃特写 + "toys study / your children." 白块光标打字；56.2 跳切正面，拉远露出点云墙与 PLAY HABITS 标签',
    render: renderToy,
  },
  {
    id: 'wd2-059-room',
    start: 59.3,
    end: 65.35,
    note: '娃娃移到画面左侧，电视柜白色实体闪现后客厅线框逐件搭建，镜头拉远看全景，最后向右摇到门口',
    render: renderRoom,
  },
]
