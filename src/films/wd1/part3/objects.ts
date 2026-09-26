/**
 * WD1 100s–111s：ctOS 物件网络（接 part2 91.3s 起的同一个连续镜头）。
 * 100–104.5 低机位绕着地面上四块发光边的黑色平板转，上面散落卫星锅、卫星、汽车、飞机、全息人形；
 *   远处是由暗到亮的灰色天幕，"ctOS" 字样 100.3 起淡出 →
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

  // 四块平板：侧面白色发光、顶面黑、顶面边缘细灰线
  const plates = new THREE.Group()
  const side = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true })
  const topMat = new THREE.MeshStandardMaterial({ color: 0x030303, roughness: 0.3, transparent: true })
  const lineMat = new THREE.LineBasicMaterial({ color: 0x9a9a9a, transparent: true })
  const P = 110
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const geo = new THREE.BoxGeometry(P, 1.6, P)
      const m = new THREE.Mesh(geo, [side, side, topMat, topMat, side, side])
      m.position.set(sx * (P / 2 + 3), 3, sz * (P / 2 + 3))
      plates.add(m)
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo), lineMat)
      e.position.copy(m.position)
      plates.add(e)
    }
  scene.add(plates)

  const objs: Obj[] = [
    { o: makeDish(), a: [-14, 9, 6], b: [30, 24, -4], show: 0 },
    { o: makeSatellite(), a: [-2, 13, -2], b: [39, 28, -8], show: 0 },
    { o: makeHolo(), a: [-32, 9, -26], b: [-10, 40, -40], show: 0, hide: 105.2 },
    { o: makeCar(), a: [28, 7, 18], b: [-32, 20, 2], show: 0 },
    { o: makePlane(), a: [-36, 7, 22], b: [0, 30, -6], show: 0 },
    { o: makeHolo(), a: [40, 9, -20], b: [60, 45, -40], show: 0, hide: 105.2 },
    { o: makeATM(), a: [36, 12, 34], b: [8, 2, 14], show: 104.4 },
    { o: makeLaptop(), a: [4, 8, 4], b: [0, 18, 0], show: 105.2 },
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
  return { scene, cam, objs, plates, side, topMat, lineMat, nodes, edges, pos, lineGeo, netMat, floorMat }
}

const KEYS: [number, Orbit][] = [
  [100.0, { tx: 0, ty: 8, tz: 0, d: 95, az: -40, el: 6, fov: 40, shift: -0.12 }],
  [102.0, { tx: 0, ty: 8, tz: 0, d: 95, az: -8, el: 6, fov: 40, shift: -0.12 }],
  [103.5, { tx: 0, ty: 8, tz: 0, d: 95, az: 28, el: 7, fov: 40, shift: -0.12 }],
  [104.5, { tx: 0, ty: 8, tz: 0, d: 140, az: 50, el: 20, fov: 40, shift: 0 }],
  [105.3, { tx: 0, ty: 12, tz: 0, d: 150, az: 40, el: 30, fov: 40, shift: 0 }],
  [106.2, { tx: 0, ty: 20, tz: 0, d: 88, az: 5, el: 22, fov: 40, shift: 0 }],
  [108.2, { tx: 0, ty: 20, tz: 0, d: 85, az: -12, el: 16, fov: 40, shift: 0 }],
  [110.0, { tx: 0, ty: 20, tz: 0, d: 150, az: -25, el: 22, fov: 40, shift: 0 }],
  [111.0, { tx: 0, ty: 20, tz: 0, d: 190, az: -30, el: 24, fov: 40, shift: 0 }],
]

export const objects: Scene = {
  id: 'wd1-100-ctos-objects',
  start: 100,
  end: 111.0,
  note: 'ctOS 物件：低机位绕平板 → 熄灯浮起 → 连线成网 → Data is interconnected → 拉远',
  render(f) {
    const { ctx, W, H, t } = f
    const c = memo('p3-objects', buildScene)
    const lightsOff = seg(t, 104.5, 105.4)
    // 天幕：左上黑 → 右侧近地平线浅灰（屏幕空间渐变）
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, W, H)
    if (lightsOff < 1) {
      const g = ctx.createLinearGradient(0, 0, W * 0.85, H * 0.55)
      g.addColorStop(0, '#000')
      g.addColorStop(1, '#a6a6a6')
      ctx.globalAlpha = 1 - lightsOff
      ctx.fillStyle = g
      ctx.fillRect(0, 0, W, H)
      ctx.globalAlpha = 1
    }
    // 平板随熄灯消失
    const plateA = 1 - 0.6 * seg(t, 104.2, 104.6) - 0.4 * seg(t, 105.0, 105.8)
    c.plates.visible = plateA > 0.01
    c.side.opacity = plateA
    c.topMat.opacity = plateA
    c.lineMat.opacity = plateA
    // 物件：地面 → 浮起
    const fly = ease.inOutCubic(seg(t, 104.6, 106.0))
    const dim = 1 - 0.85 * seg(t, 109.0, 110.3)
    GREY.color.setScalar(0.74 * dim)
    WIRE.opacity = 0.55 * dim
    for (const k of c.objs) {
      k.o.visible = t >= k.show && t < (k.hide ?? 1e9)
      k.o.position.set(lerp(k.a[0], k.b[0], fly), lerp(k.a[1], k.b[1], fly), lerp(k.a[2], k.b[2], fly))
      // 地面段物件比浮起后小（原片低机位时物件离得远、又被虚焦）
      const sc = lerp(0.6, 1, fly)
      k.o.scale.setScalar(sc * (k.show > 0 ? ease.outBack(seg(t, k.show, k.show + 0.4)) : 1))
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

    const o = orbitAt(t, KEYS)
    applyOrbit(c.cam, o)
    const img = f.three.render(c.scene, c.cam, 0x000000, 0)
    ctx.save()
    // 低机位段景深虚化
    const blur = 1.6 * (1 - seg(t, 104.5, 105.5)) + 0.6
    ctx.filter = `blur(${blur}px)`
    ctx.drawImage(img, 0, 0, W, H)
    ctx.restore()

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

    // "ctOS" 字样（上一段留下来的），100.3–100.75 淡出
    const ca = 1 - seg(t, 100.3, 100.75)
    if (ca > 0) {
      const tp = project(c.cam, -2, 34, -4, W, H)
      ctx.fillStyle = `rgba(235,235,235,${ca})`
      ctx.font = `500 66px ${FONT.sans}`
      ctx.fillText('CT', tp.x - 105, tp.y)
      ctx.font = `500 100px ${FONT.sans}`
      ctx.fillText('OS', tp.x - 18, tp.y)
    }

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
