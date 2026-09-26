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
interface RoomPart {
  obj: THREE.Object3D
  mat: THREE.LineBasicMaterial
  t0: number
  flash?: THREE.Mesh
}
function buildRoom() {
  const parts: RoomPart[] = []
  const scene = new THREE.Group()
  const addPart = (pos: number[], t0: number, opacity = 0.85, flashBox?: [number, number, number, number, number, number]) => {
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
    parts.push({ obj, mat, t0, flash })
  }
  // 电视柜（最先出现，带白色实体闪光）
  const stand: number[] = []
  boxEdges(stand, 0, 0, -5.2, 4.2, 0.9, 1.1)
  boxEdges(stand, -1.2, 0.2, -4.7, 1.2, 0.3, 0.1)
  boxEdges(stand, 1.2, 0.2, -4.7, 1.2, 0.3, 0.1)
  boxEdges(stand, 0, 0.95, -5.1, 1.3, 0.15, 0.8) // 游戏机
  addPart(stand, 60.0, 0.95, [0, 0, -5.2, 4.2, 0.9, 1.1])
  // 电视
  const tv: number[] = []
  boxEdges(tv, 0, 1.6, -5.9, 3.0, 1.7, 0.12)
  boxEdges(tv, 0, 1.2, -5.8, 0.6, 0.4, 0.3)
  addPart(tv, 60.35, 0.95, [0, 1.6, -5.9, 3.0, 1.7, 0.12])
  // 后墙与窗
  const wall: number[] = []
  boxEdges(wall, 0, 0, -1, 20, 6.5, 10.2)
  for (const wx of [-7, -3.8, 3.8, 7]) {
    boxEdges(wall, wx, 2.0, -6.05, 2.4, 3.0, 0.1)
    for (let i = 1; i < 3; i++) wall.push(wx - 1.2, 2.0 + i, -6.0, wx + 1.2, 2.0 + i, -6.0)
    wall.push(wx, 2.0, -6.0, wx, 5.0, -6.0)
  }
  // 右墙的门
  boxEdges(wall, 9.95, 0, -2.2, 0.1, 4.2, 2.6)
  wall.push(9.9, 0, -2.2, 9.9, 4.2, -2.2)
  for (const dz of [-3.1, -1.3]) boxEdges(wall, 9.9, 0.4, dz, 0.05, 1.6, 0.8), boxEdges(wall, 9.9, 2.3, dz, 0.05, 1.5, 0.8)
  // 左墙窗
  for (const wz of [-3, 1.5]) boxEdges(wall, -9.95, 1.8, wz, 0.1, 3.0, 2.6)
  addPart(wall, 60.6, 0.7)
  // 扶手椅（左、右）+ 沙发
  const chairs: number[] = []
  const chair = (x: number, z: number, rot: number) => {
    const p: number[] = []
    boxEdges(p, 0, 0.35, 0, 1.8, 0.5, 1.7)
    boxEdges(p, 0, 0.85, -0.7, 1.8, 1.2, 0.3)
    boxEdges(p, -0.85, 0.85, 0, 0.25, 0.5, 1.7)
    boxEdges(p, 0.85, 0.85, 0, 0.25, 0.5, 1.7)
    for (const [lx, lz] of [[-0.8, -0.75], [0.8, -0.75], [-0.8, 0.75], [0.8, 0.75]]) p.push(lx, 0, lz, lx, 0.35, lz)
    // 布面褶皱：几条斜线
    for (let i = 0; i < 6; i++) p.push(-0.8, 0.85, 0.8 - i * 0.3, 0.8, 0.85, 0.6 - i * 0.3)
    const c = Math.cos(rot), s = Math.sin(rot)
    for (let i = 0; i < p.length; i += 3) {
      const px = p[i], pz = p[i + 2]
      chairs.push(x + px * c + pz * s, p[i + 1], z - px * s + pz * c)
    }
  }
  chair(-4.8, -2.8, 0.5)
  chair(5.2, -2.6, -0.5)
  chair(-8.2, 0.5, 1.2)
  chair(8.4, 0.8, -1.3)
  addPart(chairs, 60.8, 0.85)
  // 茶几 + 地毯 + 天花板灯
  const misc: number[] = []
  boxEdges(misc, 0, 0, 3.2, 4.2, 0.9, 1.8)
  boxEdges(misc, 0, 0.9, 3.2, 4.4, 0.08, 2.0)
  boxEdges(misc, 0, 0.01, -1.5, 8, 0.02, 5)
  for (const lx of [-3.5, 3.5]) boxEdges(misc, lx, 6.3, -3, 1.2, 0.08, 1.2)
  addPart(misc, 61.1, 0.8)
  // 扫描三角网：在房间内随机连长线（原片那种穿插的细斜线）
  const tri: number[] = []
  const R = rng(61)
  for (let i = 0; i < 70; i++) {
    tri.push(R.range(-10, 10), R.range(0, 6.5), R.range(-6, 4), R.range(-10, 10), R.range(0, 6.5), R.range(-6, 4))
  }
  addPart(tri, 60.9, 0.22)
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
const DOLL_POS = new THREE.Vector3(-4.8, 0.85, -2.8)
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
    [60.4, [-3.2, 1.9, 3.2], [-1.0, 0.9, -4.5]],
    [61.3, [-0.5, 1.6, 1.4], [0, 1.2, -5.5]],
    [63.2, [0, 1.9, 6.8], [0, 1.5, -5.5]],
    [64.5, [0.3, 2.1, 8.8], [1.5, 1.7, -5.5]],
    [65.35, [2.0, 2.2, 9.2], [9.0, 1.4, -2.0]],
  ]
  keysCache = { a, b }
  return keysCache
}

function project(v: THREE.Vector3, camera: THREE.Camera, W: number, H: number) {
  const p = v.clone().project(camera)
  return { x: (p.x * 0.5 + 0.5) * W, y: (-p.y * 0.5 + 0.5) * H, behind: p.z > 1 }
}

function render3d(f: FrameCtx) {
  const { ctx, t, W, H } = f
  const h = home()
  const k = keys()
  const cp = t < 56.2 ? camPath(k.a, t) : camPath(k.b, t)
  h.camera.position.copy(cp.pos)
  h.camera.lookAt(cp.at)
  h.camera.updateMatrixWorld()
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
      m.opacity = 0.8 * seg(t, p.t0, p.t0 + 0.08) * (1 - seg(t, p.t0 + 0.12, p.t0 + 0.45))
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
    const wp = new THREE.Vector3(R.range(-9, 9), R.range(0.5, 6), R.range(-6, 2))
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
  const rp = project(new THREE.Vector3(-1.2, 0.6, -4.6), camera, W, H)
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
