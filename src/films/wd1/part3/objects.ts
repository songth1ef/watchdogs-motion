/**
 * WD1 98.2s–111s：ctOS 物件网络（原片 97.9–104.5 是同一个连续镜头）。
 * 98.2 从 part2 s96 交接：相机（针孔 D/H/yaw 换算成轨道相机）、ctOS 字标（同一画法与轨迹）、天幕竖直渐变、
 *   主平板四边与车的位置都与 s96 在 98.2 那一帧一致；其余平板与设备 98.2–98.7 淡入/弹出。
 * 98.2–104.5 低机位绕着地面上发光边的黑色平板转，上面散落卫星锅、卫星、汽车、飞机、ATM、全息人形；
 *   天幕 98.4–99.6 由竖直渐变过渡到斜向渐变，"ctOS" 字样 100.3 起淡出 →
 * 104.5–105.5 灯光熄灭、平板消失，相机升高 → 物件浮起重新排成一圈：汽车、笔记本、飞机、卫星锅、ATM，
 *   之间长出细线与小方点 → 108.2 左上角空心字 "Data is interconnected" 逐字打出，连线越来越多、
 *   带小字说明 → 108.8 起相机后拉，物件变暗，只剩网络与空心字 → 111 交给 NETWORK 镜头。
 *
 * ASSET：所有物件都是 three.js 基本几何体拼的替身（`buildObjects()` 里每个 make* 函数一个），
 * 换成真实模型时替换对应函数返回的 Object3D 即可；平板、天幕同理（`buildStage()`）。
 */
import * as THREE from 'three'
import type { Scene } from '../../../engine/types'
import { clamp, ease, lerp, rng, seg } from '../../../engine/math'
import { memo } from '../../../engine/three-host'
import { FONT } from '../../../fx/text'
import { keyed } from './network'
import { applyOrbit, orbitAt, project, type Orbit } from './three-util'
import { S } from './util'

/** part2 s96 展台坐标（米级小单位）→ 本镜头 three.js 单位的比例 */
const K = 36.7
const PLATE_T = 2.2
/** 平板（s96 展台坐标，x0,x1,z0,z1）：中间主平板与 s96 画的四边形重合，左右各一块 */
const PLATES: [number, number, number, number][] = [
  [-1.5, 1.5, -1.5, 2.5],
  [-4.85, -1.65, -1.5, 2.5],
  [1.65, 4.85, -1.5, 2.5],
  [-1.5, 1.5, -5.65, -1.65],
  [-4.85, -1.65, -5.65, -1.65],
  [1.65, 4.85, -5.65, -1.65],
]

const GREY = new THREE.MeshStandardMaterial({ color: 0xbdbdbd, roughness: 0.45, metalness: 0.2 })
const WIRE = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.55 })
const HOLO = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.25 })

// ---------- 物件替身（ASSET） ----------
function makeLaptop() {
  const g = new THREE.Group()
  const base = new THREE.Mesh(new THREE.BoxGeometry(16, 0.8, 11), GREY)
  g.add(base)
  const lid = new THREE.Mesh(new THREE.BoxGeometry(16, 11, 0.5), GREY)
  lid.position.set(0, 5.4, -5.6)
  lid.rotation.x = -0.25
  g.add(lid)
  return g
}
function makeCar() {
  const g = new THREE.Group()
  // 车身：横躺的胶囊压扁 + 驾驶舱
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(2.2, 12, 6, 16), GREY)
  body.rotation.z = Math.PI / 2
  body.scale.set(1, 1, 1.7)
  g.add(body)
  const cabin = new THREE.Mesh(new THREE.CapsuleGeometry(1.8, 5, 6, 12), GREY)
  cabin.rotation.z = Math.PI / 2
  cabin.scale.set(1, 1, 1.6)
  cabin.position.set(-1, 1.8, 0)
  g.add(cabin)
  return g
}
function makePlane() {
  const g = new THREE.Group()
  const f = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.5, 18, 12), GREY)
  f.rotation.z = Math.PI / 2
  g.add(f)
  const w = new THREE.Mesh(new THREE.BoxGeometry(4, 0.3, 17), GREY)
  g.add(w)
  const tail = new THREE.Mesh(new THREE.BoxGeometry(2, 0.3, 6), GREY)
  tail.position.x = -8
  g.add(tail)
  const fin = new THREE.Mesh(new THREE.BoxGeometry(2, 3, 0.3), GREY)
  fin.position.set(-8, 1.5, 0)
  g.add(fin)
  return g
}
function makeDish() {
  const g = new THREE.Group()
  const dish = new THREE.Mesh(new THREE.SphereGeometry(7, 16, 8, 0, Math.PI * 2, 0, 0.9), WIRE)
  dish.rotation.x = -Math.PI / 2 - 0.5
  g.add(dish)
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 7), GREY)
  stick.position.y = -3
  g.add(stick)
  return g
}
function makeSatellite() {
  const g = new THREE.Group()
  g.add(new THREE.Mesh(new THREE.BoxGeometry(2.5, 2.5, 2.5), GREY))
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(8, 0.2, 2.6), GREY)
    p.position.x = s * 5.5
    g.add(p)
  }
  g.rotation.z = -0.5
  return g
}
function makeATM() {
  const g = new THREE.Group()
  const body = new THREE.Mesh(new THREE.BoxGeometry(7, 15, 5), WIRE)
  g.add(body)
  const inner = new THREE.Mesh(new THREE.BoxGeometry(5, 6, 3), GREY)
  inner.position.set(0, 1, 0.5)
  g.add(inner)
  // 顶部 "ATM" 字牌
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
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(6, 2.2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c) }))
  sign.position.set(0, 6.4, 2.6)
  g.add(sign)
  return g
}
function makeHolo() {
  // 半透明全息人形 / 机器人（原片里是虚焦的线框角色）
  const g = new THREE.Group()
  const b = new THREE.Mesh(new THREE.CylinderGeometry(2, 1.6, 9, 8, 3), HOLO)
  g.add(b)
  const h = new THREE.Mesh(new THREE.SphereGeometry(1.8, 8, 6), HOLO)
  h.position.y = 6.5
  g.add(h)
  return g
}

interface Obj {
  o: THREE.Object3D
  /** 地面段位置 */
  a: [number, number, number]
  /** 地面段缩放 */
  sa: number
  /** 浮起后的位置 */
  b: [number, number, number]
  /** 出现时间 */
  show: number
  /** 消失时间（全息人形在熄灯时消失） */
  hide?: number
}

function buildScene() {
  const scene = new THREE.Scene()
  scene.add(new THREE.HemisphereLight(0xffffff, 0x222222, 1.4))
  const key = new THREE.DirectionalLight(0xffffff, 1.4)
  key.position.set(60, 120, 80)
  scene.add(key)

  // 地面：黑色镜面
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.4 })
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), floorMat)
  floor.rotation.x = -Math.PI / 2
  scene.add(floor)

  // 平板：三块并排（中间那块 = part2 s96 展台的主平板），侧面白色发光、顶面黑；顶面描边在 2D 里画（线宽可控）
  const plates = new THREE.Group()
  const side = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true })
  // 非主平板的亮边：98.2 交接时 s96 只画了主平板，其余平板 98.2–98.6 淡入，避免交接帧多出线条
  const sideB = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true })
  const topMat = new THREE.MeshStandardMaterial({ color: 0x030303, roughness: 0.3, transparent: true })
  for (const [x0, x1, z0, z1] of PLATES) {
    const sd = x0 === -1.5 && z0 === -1.5 ? side : sideB
    const geo = new THREE.BoxGeometry((x1 - x0) * K, PLATE_T, (z1 - z0) * K)
    // 只有朝 ±z 的侧面发白光（原片平板的前沿是亮条，左右侧面只是细线）
    const m = new THREE.Mesh(geo, [topMat, topMat, topMat, topMat, sd, sd])
    m.position.set(((x0 + x1) / 2) * K, PLATE_T / 2, ((z0 + z1) / 2) * K)
    plates.add(m)
  }
  scene.add(plates)

  // a = 展台上的位置（part2 展台坐标 × K），sa = 展台上的缩放；b = 浮起后的位置（缩放 1）
  const objs: Obj[] = [
    { o: makeDish(), a: [-0.5 * K, 26, -0.3 * K], sa: 3.4, b: [30, 24, -4], show: 98.4 },
    { o: makeSatellite(), a: [0.8 * K, 34, 0.2 * K], sa: 2.4, b: [39, 28, -8], show: 98.4 },
    { o: makeHolo(), a: [-1.6 * K, 24, -2.8 * K], sa: 3.6, b: [-10, 40, -40], show: 98.4, hide: 105.2 },
    { o: makeCar(), a: [0.1 * K, 5, -1.2 * K], sa: 1.1, b: [-32, 20, 2], show: 0 },
    { o: makePlane(), a: [-2.2 * K, 8, 0.5 * K], sa: 2.4, b: [0, 30, -6], show: 98.4 },
    { o: makeHolo(), a: [2.4 * K, 24, -2.2 * K], sa: 3.6, b: [60, 45, -40], show: 98.4, hide: 105.2 },
    { o: makeATM(), a: [-2.6 * K, 20, 1.3 * K], sa: 2.4, b: [8, 2, 14], show: 98.4 },
    { o: makeLaptop(), a: [4, 8, 4], sa: 1, b: [0, 18, 0], show: 105.2 },
  ]
  for (const k of objs) scene.add(k.o)

  // 网络：物件锚点 + 随机点之间的细线（按 delay 依次长出）
  const R = rng(8080)
  const nodes: THREE.Vector3[] = objs.map((k) => new THREE.Vector3(...k.b))
  for (let i = 0; i < 26; i++) nodes.push(new THREE.Vector3(R.range(-120, 120), R.range(-20, 90), R.range(-90, 60)))
  const edges: { a: number; b: number; d: number }[] = []
  // 先连物件之间（早），再连远处（晚）
  const early = [
    [3, 7],
    [7, 0],
    [7, 6],
    [4, 7],
    [0, 6],
  ]
  early.forEach(([a, b], i) => edges.push({ a, b, d: i * 0.05 }))
  for (let i = 0; i < 42; i++) edges.push({ a: R.int(0, nodes.length - 1), b: R.int(0, nodes.length - 1), d: 0.25 + R.next() * 0.75 })
  const pos = new Float32Array(edges.length * 6)
  const lineGeo = new THREE.BufferGeometry()
  lineGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  const netMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 })
  const net = new THREE.LineSegments(lineGeo, netMat)
  scene.add(net)

  const cam = new THREE.PerspectiveCamera(40, 1920 / 1080, 0.5, 8000)
  return { scene, cam, objs, plates, side, sideB, topMat, nodes, edges, pos, lineGeo, netMat, floorMat }
}

/**
 * 98.2–100：与 part2 s96 的展台相机严格对齐。s96 用针孔投影 x = 640 + 900·X/d、y = 380 + 900·H/d（1280 坐标），
 * 相机高 H、距原点 D、绕 y 轴偏转 yaw；换算成这里的轨道相机：d = D·K、ty = H·K、az = yaw、el = 0、
 * 垂直 fov = 2·atan(360/900) = 43.6°、地平线在 380/720 → 移轴 shift = -20/720。这一段线性插值（保持 s96 交接时的速度）。
 */
const FOV = 43.6
const SH = -20 / 720
const KEYS_A: [number, Orbit][] = [
  [98.2, { tx: 0, ty: 1.2 * 36.7, tz: 0, d: 5.25 * 36.7, az: 0, el: 0, fov: FOV, shift: SH }],
  [98.8, { tx: 0, ty: 1.25 * 36.7, tz: 0, d: 6.4 * 36.7, az: 6.9, el: 0, fov: FOV, shift: SH }],
  [99.4, { tx: 0, ty: 1.3 * 36.7, tz: 0, d: 7.1 * 36.7, az: 20, el: 0, fov: FOV, shift: SH }],
  [100.0, { tx: 0, ty: 1.3 * 36.7, tz: 0, d: 7.7 * 36.7, az: 28.6, el: 0, fov: FOV, shift: SH }],
]
/** 100 起继续绕转（az 一直增加，浮起后的关键帧 +360° 保持同向），104.5 熄灯时升高 */
const KEYS_B: [number, Orbit][] = [
  [100.0, { tx: 0, ty: 1.3 * 36.7, tz: 0, d: 7.7 * 36.7, az: 28.6, el: 0, fov: FOV, shift: SH }],
  [101.0, { tx: 0, ty: 44, tz: 0, d: 250, az: 42, el: 0.5, fov: FOV, shift: SH }],
  [102.5, { tx: 0, ty: 40, tz: 0, d: 215, az: 68, el: 1.5, fov: FOV, shift: -0.08 }],
  [103.8, { tx: 0, ty: 34, tz: 0, d: 195, az: 98, el: 4, fov: FOV, shift: -0.14 }],
  [104.5, { tx: 0, ty: 20, tz: 0, d: 230, az: 125, el: 18, fov: 42, shift: 0 }],
  [105.3, { tx: 0, ty: 12, tz: 0, d: 150, az: 400, el: 30, fov: 40, shift: 0 }],
  [106.2, { tx: 0, ty: 20, tz: 0, d: 88, az: 365, el: 22, fov: 40, shift: 0 }],
  [108.2, { tx: 0, ty: 20, tz: 0, d: 85, az: 348, el: 16, fov: 40, shift: 0 }],
  [110.0, { tx: 0, ty: 20, tz: 0, d: 150, az: 335, el: 22, fov: 40, shift: 0 }],
  [111.0, { tx: 0, ty: 20, tz: 0, d: 190, az: 330, el: 24, fov: 40, shift: 0 }],
]

/** ctOS 字标（与 part2 s96 同一画法；1280 坐标，局部总宽 580、基线 0、O 中心 (35,-100)） */
function drawCtos(ctx: CanvasRenderingContext2D, t: number) {
  const [lw, lx, ly] = keyed(
    t,
    [
      [98.2, 580, 610, 440],
      [98.8, 256, 628, 370],
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
  ctx.font = `500 168px ${FONT.sans}`
  ctx.letterSpacing = `${(168 * -0.02).toFixed(2)}px`
  ctx.fillStyle = '#fff'
  ctx.fillText('CT', -292, 0)
  ctx.font = `500 270px ${FONT.sans}`
  ctx.fillText('S', 132, 0)
  ctx.beginPath()
  ctx.ellipse(35, -100, 95, 100, 0, 0, Math.PI * 2)
  ctx.fill()
  // 内孔：98.3–98.6 由白变成透明（与 s96 一样用黑色按透明度盖）
  const holeWhite = 1 - seg(t, 98.3, 98.6)
  if (holeWhite < 1) {
    ctx.beginPath()
    ctx.ellipse(35, -100, 60, 76, 0, 0, Math.PI * 2)
    ctx.fillStyle = '#000'
    ctx.globalAlpha *= 1 - holeWhite
    ctx.fill()
  }
  ctx.restore()
}

export const objects: Scene = {
  id: 'wd1-098-ctos-objects',
  start: 98.2,
  end: 111.0,
  note: 'ctOS 物件：98.2 接 part2 展台 → 低机位绕平板 → 熄灯浮起 → 连线成网 → Data is interconnected → 拉远',
  render(f) {
    const { ctx, W, H, t } = f
    const c = memo('p3-objects', buildScene)
    const lightsOff = seg(t, 104.5, 105.4)
    // 天幕：98.2 时与 s96 一致（竖直渐变 #0e0e0e → #8a8a8a，地平线 380/720 以下纯黑），
    // 98.4–99.6 过渡到原片 100s 之后的斜向渐变（左上黑 → 右侧浅灰）
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, W, H)
    if (lightsOff < 1) {
      const hy = (380 / 720) * H
      const mix = seg(t, 98.4, 99.6)
      const v = ctx.createLinearGradient(0, 0, 0, hy)
      v.addColorStop(0, '#0e0e0e')
      v.addColorStop(1, '#8a8a8a')
      const g = ctx.createLinearGradient(0, 0, W * 0.85, H * 0.55)
      g.addColorStop(0, '#000')
      g.addColorStop(1, '#a6a6a6')
      ctx.globalAlpha = (1 - lightsOff) * (1 - mix)
      ctx.fillStyle = v
      ctx.fillRect(0, 0, W, hy)
      ctx.globalAlpha = (1 - lightsOff) * mix
      ctx.fillStyle = g
      ctx.fillRect(0, 0, W, H)
      ctx.globalAlpha = 1
    }
    // 平板随熄灯消失
    const plateA = 1 - 0.6 * seg(t, 104.2, 104.6) - 0.4 * seg(t, 105.0, 105.8)
    c.plates.visible = plateA > 0.01
    c.side.opacity = plateA
    const others = seg(t, 98.2, 98.6)
    c.sideB.opacity = plateA * others
    c.topMat.opacity = plateA
    // 物件：地面 → 浮起
    const fly = ease.inOutCubic(seg(t, 104.6, 106.0))
    const dim = 1 - 0.85 * seg(t, 109.0, 110.3)
    GREY.color.setScalar(0.74 * dim)
    WIRE.opacity = 0.55 * dim
    for (const k of c.objs) {
      k.o.visible = t >= k.show && t < (k.hide ?? 1e9)
      k.o.position.set(lerp(k.a[0], k.b[0], fly), lerp(k.a[1], k.b[1], fly), lerp(k.a[2], k.b[2], fly))
      // 地面段物件比浮起后小（原片低机位时物件离得远、又被虚焦）
      const sc = lerp(k.sa, 1, fly)
      k.o.scale.setScalar(Math.max(0.001, sc * (k.show > 0 ? ease.outBack(seg(t, k.show, k.show + 0.3)) : 1)))
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
    c.netMat.opacity = 0.5 * seg(t, 105.8, 106.2)

    const o = t < 100 ? orbitAt(t, KEYS_A, ease.linear) : orbitAt(t, KEYS_B)
    applyOrbit(c.cam, o)
    const img = f.three.render(c.scene, c.cam, 0x000000, 0)
    ctx.save()
    // 低机位段景深虚化（98.2 交接时为 0，与 s96 的清晰线框一致）
    const blur = (1.6 * (1 - seg(t, 104.5, 105.5)) + 0.6) * seg(t, 98.2, 99.0)
    ctx.filter = `blur(${blur}px)`
    ctx.drawImage(img, 0, 0, W, H)
    ctx.restore()

    // 展台顶面描边（s96 的主平板四边 + z=-0.6 横线），投影后在 2D 画，线宽与 s96 相同
    if (plateA > 0.01) {
      const P = (x: number, z: number) => project(c.cam, x * K, PLATE_T, z * K, W, H)
      const poly = (pts: [number, number][], w: number, a: number, close = true) => {
        const q = pts.map(([x, z]) => P(x, z))
        if (q.some((p) => p.behind)) return
        ctx.strokeStyle = `rgba(255,255,255,${a * plateA})`
        ctx.lineWidth = w * S
        ctx.beginPath()
        q.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
        if (close) ctx.closePath()
        ctx.stroke()
      }
      for (const [x0, x1, z0, z1] of PLATES) {
        const main = x0 === -1.5 && z0 === -1.5
        poly([[x0, z0], [x1, z0], [x1, z1], [x0, z1]], 1.6, main ? 0.9 : 0.6 * others)
      }
      poly([[-4.5, -0.6], [4.5, -0.6]], 1, 0.5, false)
    }

    // 节点小方点 + 旁边的极小说明字（2D）
    if (np > 0) {
      const R = rng(99)
      c.nodes.forEach((n, i) => {
        const p = project(c.cam, n.x, n.y, n.z, W, H)
        if (p.behind) return
        const a = seg(np, (i / c.nodes.length) * 0.8, (i / c.nodes.length) * 0.8 + 0.1)
        if (a <= 0) return
        ctx.fillStyle = `rgba(255,255,255,${0.9 * a})`
        ctx.fillRect(p.x - 3, p.y - 3, 6, 6)
        if (i >= 8 && R.chance(0.6)) {
          ctx.fillStyle = `rgba(200,200,200,${0.5 * a})`
          for (let k = 0; k < 3; k++) ctx.fillRect(p.x + 12, p.y - 6 + k * 6, R.range(24, 50), 2)
        }
      })
    }

    // ctOS 字标（接 s96），100.3–100.75 淡出
    if (t < 100.75) drawCtos(ctx, t)

    // "Data is interconnected" 空心字：108.2 起逐字打出，随后缩小后退
    if (t >= 108.2) {
      const [lx, b1, cap] = keyed(t, [
        [108.2, 47, 149, 118],
        [108.5, 47, 149, 115],
        [109.0, 70, 250, 90],
        [109.5, 100, 338, 77],
        [110.3, 250, 350, 57],
        [110.9, 294, 384, 60],
      ])
      const l1 = 'Data is'
      const l2 = 'interconnected'
      const n = Math.floor(seg(t, 108.2, 109.4) * (l1.length + l2.length))
      ctx.save()
      ctx.font = `400 ${(cap * S) / 0.72}px ${FONT.sans}`
      ctx.letterSpacing = `${-cap * S * 0.02}px`
      ctx.strokeStyle = `rgba(190,190,190,${0.85 - 0.35 * seg(t, 109.5, 110.8)})`
      ctx.lineWidth = 1.6
      ctx.strokeText(l1.slice(0, n), lx * S, b1 * S)
      ctx.strokeText(l2.slice(0, Math.max(0, n - l1.length)), lx * S, (b1 + cap * 1.25) * S)
      ctx.restore()
    }
  },
}
