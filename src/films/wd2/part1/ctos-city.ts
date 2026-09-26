/**
 * 3.6–12.7s：ctOS 透视线框城市（3D）→ 俯拍城市地图 + 马赛克人脸档案卡 → 「with a few hundred」大字。
 * ctOS 标志单独成镜头（4.0–10.9 常驻右上角）。
 */
import * as THREE from 'three'
import type { Scene } from '../../../engine/types'
import { memo } from '../../../engine/three-host'
import { ease, lerp, seg } from '../../../engine/math'
import { wireCity } from '../../../three/city'
import { FONT, font, tracking } from '../../../fx/text'
import { WD2 } from '../../../theme'
import { drawCtosMap } from './citymap2d'
import { faceTex } from '../part2/common'
import { cached, ctosLogo, fbm, fr, h2, makeCanvas, wordReveal } from './lib'

// ───────────────────────── 城市街道地图纹理 ─────────────────────────

export const MAP_SIZE = 2048

/** 湖（左上角）判定：芝加哥湖岸线在这张图里是一条左下→右上的斜线 */
function lake(x: number, y: number) {
  return y < 760 - x * 0.3 + Math.sin(x / 90) * 18 + (h2(x >> 3, y >> 3, 77) - 0.5) * 6
}

interface StreetLine {
  x1: number
  y1: number
  x2: number
  y2: number
  a: number
  w: number
  teal?: boolean
}

/** 程序化街网（地图像素坐标）：不等距的横竖街道、少量亮干道、几条斜向大道与青色线路 */
export function streetNet(): StreetLine[] {
  return cached('wd2p1:streetnet', () => {
    const S = MAP_SIZE
    const out: StreetLine[] = []
    for (const axis of [0, 1]) {
      let k = 0
      let i = 0
      while (k < S) {
        k += 12 + h2(i, axis, 61) * 30
        i++
        const major = h2(i, axis, 62) < 0.1
        const from = h2(i, axis, 63) < 0.6 ? 0 : h2(i, axis, 64) * S * 0.7
        const to = h2(i, axis, 65) < 0.6 ? S : from + (0.2 + h2(i, axis, 66) * 0.8) * (S - from)
        const a = major ? 0.75 : 0.12 + h2(i, axis, 67) * 0.3
        const w = major ? 2.5 : 1
        if (axis === 0) out.push({ x1: k, y1: from, x2: k, y2: to, a, w })
        else out.push({ x1: from, y1: k, x2: to, y2: k, a, w })
      }
    }
    const diag: [number, number, number, number][] = [
      [0, 1500, 1300, 700],
      [300, 2048, 1100, 900],
      [900, 2048, 2048, 1300],
      [0, 1100, 2048, 1250],
    ]
    for (const [x1, y1, x2, y2] of diag) out.push({ x1, y1, x2, y2, a: 0.7, w: 2.5 })
    const teal: [number, number, number, number][] = [
      [0, 900, 2048, 780],
      [704, 0, 704, 2048],
      [1500, 300, 1100, 2048],
      [200, 1900, 1900, 1500],
    ]
    for (const [x1, y1, x2, y2] of teal) out.push({ x1, y1, x2, y2, a: 0.65, w: 2, teal: true })
    return out
  })
}

function strokeNet(ctx: CanvasRenderingContext2D, gain: number) {
  for (const l of streetNet()) {
    ctx.strokeStyle = l.teal ? `rgba(95,211,217,${Math.min(1, l.a * gain)})` : `rgba(225,230,230,${Math.min(1, l.a * gain)})`
    ctx.lineWidth = l.w
    ctx.beginPath()
    ctx.moveTo(l.x1, l.y1)
    ctx.lineTo(l.x2, l.y2)
    ctx.stroke()
  }
}

function eraseLake(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = '#000'
  ctx.beginPath()
  ctx.moveTo(0, 0)
  for (let x = 0; x <= MAP_SIZE; x += 8) ctx.lineTo(x, 760 - x * 0.3 + Math.sin(x / 90) * 18)
  ctx.lineTo(MAP_SIZE, 0)
  ctx.fill()
}

/**
 * ASSET 芝加哥街道地图（俯视）：黑底 + 斑驳的灰色建筑颗粒 + 不等距街网 + 亮点 + 少量青线/红框。
 * 俯拍镜头与 14–17s 的点阵地图都用它。替换真实素材：返回一张同尺寸的地图/卫星图 canvas 即可。
 */
export function cityMapTexture() {
  return cached('wd2p1:citymap', () => {
    const S = MAP_SIZE
    const { canvas, ctx } = makeCanvas(S, S)
    const img = ctx.createImageData(S, S)
    const d = img.data
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const i = (y * S + x) * 4
        let v = 3
        if (!lake(x, y)) {
          // 建筑密度按大尺度噪声起伏：有的街区很亮很密，有的几乎全黑
          const zone = h2(x >> 6, y >> 6, 11)
          const dens = fbm(x / 300, y / 300, 12, 3) * (0.5 + zone * 0.7)
          const b = h2((x / 3) | 0, (y / 3) | 0, 3)
          if (b < dens - 0.18) v = 18 + h2(x >> 3, y >> 3, 5) * 100 * dens
          else v = 3 + b * 5
        }
        d[i] = d[i + 1] = d[i + 2] = v
        d[i + 3] = 255
      }
    ctx.putImageData(img, 0, 0)
    strokeNet(ctx, 0.9)
    for (let k = 0; k < 2200; k++) {
      const x = h2(k, 1, 8) * S
      const y = h2(k, 2, 8) * S
      if (lake(x, y)) continue
      const s = h2(k, 3, 8) < 0.08 ? 5 : 2.5
      ctx.fillStyle = `rgba(255,255,255,${0.45 + h2(k, 4, 8) * 0.55})`
      ctx.fillRect(x - s / 2, y - s / 2, s, s)
    }
    ctx.strokeStyle = 'rgba(224,36,43,0.9)'
    ctx.lineWidth = 2
    for (let k = 0; k < 50; k++) {
      const x = 200 + h2(k, 5, 8) * 1700
      const y = 300 + h2(k, 6, 8) * 1700
      if (lake(x, y)) continue
      ctx.beginPath()
      ctx.moveTo(x, y + 6)
      ctx.lineTo(x, y)
      ctx.lineTo(x + 14, y)
      ctx.lineTo(x + 14, y + 14)
      ctx.lineTo(x + 6, y + 14)
      ctx.stroke()
    }
    eraseLake(ctx)
    return canvas
  })
}

/** 3D 镜头的地面：只有街网与亮点（透明底），建筑用点云另画 */
function groundTexture() {
  return cached('wd2p1:ground', () => {
    const { canvas, ctx } = makeCanvas(MAP_SIZE, MAP_SIZE)
    strokeNet(ctx, 1.6)
    for (let k = 0; k < 3000; k++) {
      ctx.fillStyle = `rgba(255,255,255,${0.4 + h2(k, 4, 9) * 0.6})`
      ctx.fillRect(h2(k, 1, 9) * MAP_SIZE, h2(k, 2, 9) * MAP_SIZE, 3, 3)
    }
    return canvas
  })
}

// ───────────────────────── 3D 透视网格城市 ─────────────────────────

interface Grid3D {
  scene: THREE.Scene
  cam: THREE.PerspectiveCamera
}

/** ASSET：地面 = 街道地图贴图，远处 = 程序化线框 + 点云天际线（换真实芝加哥模型替换 buildGrid 即可） */
function buildGrid(): Grid3D {
  const scene = new THREE.Scene()
  scene.fog = new THREE.Fog(0x000000, 120, 900)
  const tex = new THREE.CanvasTexture(groundTexture())
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  // 地图 1px = 0.5 世界单位 → 小街间距约 10 单位
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(MAP_SIZE * 0.5, MAP_SIZE * 0.5),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 1, depthWrite: false }),
  )
  ground.rotation.x = -Math.PI / 2
  scene.add(ground)
  // 贴地低矮建筑：满地的细碎点云
  const low: number[] = []
  for (let i = 0; i < 16000; i++) {
    const r = h2(i, 3, 41)
    low.push(-500 + h2(i, 1, 41) * 1000, r * r * 6, -600 + h2(i, 2, 41) * 950)
  }
  const lg = new THREE.BufferGeometry()
  lg.setAttribute('position', new THREE.Float32BufferAttribute(low, 3))
  scene.add(new THREE.Points(lg, new THREE.PointsMaterial({ color: 0x8fd8de, size: 1.3, sizeAttenuation: false, transparent: true, opacity: 0.45 })))
  // 远处天际线：线框 + 点云
  const opts = { seed: 31, blocks: 16, blockSize: 14, street: 5, lotsPerBlock: 2, maxHeight: 90, downtown: 1.6 }
  const { lines, buildings } = wireCity({ ...opts, color: 0x5fd3d9, opacity: 0.22 })
  const city = new THREE.Group()
  city.add(lines)
  const pts: number[] = []
  let k = 0
  for (const b of buildings) {
    const n = Math.min(60, Math.round(b.h * 1.2))
    for (let i = 0; i < n; i++, k++) {
      const face = h2(k, 1, 31)
      const u = h2(k, 2, 31) - 0.5
      const y = h2(k, 3, 31) * b.h
      const x = face < 0.5 ? b.x + u * b.w : b.x + (face < 0.75 ? -0.5 : 0.5) * b.w
      const z = face < 0.5 ? b.z + (face < 0.25 ? -0.5 : 0.5) * b.d : b.z + u * b.d
      pts.push(x, y, z)
    }
  }
  const pg = new THREE.BufferGeometry()
  pg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
  city.add(new THREE.Points(pg, new THREE.PointsMaterial({ color: 0x9fe6ea, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.55 })))
  city.position.set(80, 0, -430)
  city.scale.set(3.2, 0.55, 1.2)
  scene.add(city)
  const cam = new THREE.PerspectiveCamera(46, 16 / 9, 1, 3000)
  return { scene, cam }
}

/** 相机：3.8–7.4 低空向前滑行，7.4–8.7 抬高并俯仰到正俯视 */
function gridCam(cam: THREE.PerspectiveCamera, t: number) {
  const fly = seg(t, 3.6, 8.7)
  const tilt = ease.inOutCubic(seg(t, 7.3, 8.7))
  const z = lerp(330, 120, fly)
  const y = lerp(lerp(22, 30, fly), 460, ease.inQuad(tilt))
  const level = lerp(-9, -1.5, ease.inOutCubic(seg(t, 3.8, 5.6)))
  const pitch = lerp(THREE.MathUtils.degToRad(level), -Math.PI / 2 + 0.001, tilt)
  const yaw = lerp(0.04, -0.12, tilt)
  cam.position.set(-24, y, z)
  cam.rotation.set(0, 0, 0)
  cam.rotation.order = 'YXZ'
  cam.rotation.y = yaw
  cam.rotation.x = pitch
  cam.updateMatrixWorld()
  cam.updateProjectionMatrix()
}

const v3 = new THREE.Vector3()
function project(cam: THREE.Camera, x: number, y: number, z: number) {
  v3.set(x, y, z).project(cam)
  return { x: (v3.x * 0.5 + 0.5) * 1920, y: (-v3.y * 0.5 + 0.5) * 1080, vis: v3.z < 1 && v3.z > -1 }
}

/** 3D 空间里的 ROUTE 标签（白底小框 + 黑色方块 + 等宽字），锚点在地面，标签悬空 */
const ROUTES: [string, number, number, number][] = [
  ['ROUTE 19L', -40, 150, 4.3],
  ['ROUTE 77H', 10, 100, 4.6],
  ['ROUTE 07F', -20, 60, 5.2],
  ['ROUTE 29G', -30, 200, 6.1],
  ['ROUTE 77H', 60, 180, 6.4],
  ['ROUTE 77H', 110, 150, 6.8],
]
/** 地面青色节点 */
const NODES: [number, number, number][] = [
  [-24, 60, 4.2],
  [50, 200, 4.8],
  [10, 190, 5.4],
  [-30, 215, 6.0],
  [90, 230, 6.3],
]
/** 地面红色折角框 */
const REDS: [number, number, number, number, number][] = [
  [-60, 230, 40, 30, 4.8],
  [30, 225, 60, 25, 5.2],
  [-10, 110, 16, 16, 5.0],
]

function routeTag(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, p: number) {
  const size = 13
  font(ctx, size, 400, FONT.mono)
  tracking(ctx, 1.5)
  const w = ctx.measureText(text).width + 26
  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  ctx.fillRect(x, y - 9, 12, 12)
  ctx.fillStyle = '#000'
  ctx.fillRect(x + 3, y - 6, 6, 6)
  ctx.fillStyle = `rgba(230,240,240,${0.85 * p})`
  ctx.fillText(text.slice(0, Math.ceil(text.length * p)), x + 16, y + 2)
  tracking(ctx, 0)
  return w
}

export const ctosGrid: Scene = {
  id: 'wd2-003.6-ctos-grid',
  start: 3.6,
  end: 8.75,
  note: 'ASSET 透视线框城市：街道地图贴地 + 远处青色点云天际线，相机低空前滑，7.3s 起抬升俯仰到正俯视；ROUTE 标签/青色节点/红框为 2D 投影叠加',
  render(f) {
    const { ctx, t, three } = f
    const g = memo('wd2p1:grid3d', buildGrid)
    gridCam(g.cam, t)
    const img = three.render(g.scene, g.cam)
    const fadeIn = seg(t, 3.6, 4.1)
    const fadeOut = 1 - seg(t, 8.35, 8.75)
    ctx.save()
    ctx.globalAlpha = fadeIn * fadeOut
    ctx.drawImage(img, 0, 0, 1920, 1080)
    const over = 1 - seg(t, 7.4, 7.9)
    if (over > 0) {
      ctx.globalAlpha = fadeIn * over
      // 贴地的青色主干道（原片左侧那条亮青竖线）
      // 屏幕上近乎竖直，底端随相机前进缓慢右移
      const hz = project(g.cam, 0, 0, -3000).y
      const ax = lerp(560, 600, seg(t, 3.8, 7.4))
      const grad = ctx.createLinearGradient(0, hz, 0, 1080)
      grad.addColorStop(0, 'rgba(95,211,217,0.2)')
      grad.addColorStop(0.4, 'rgba(95,211,217,0.95)')
      ctx.strokeStyle = grad
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.moveTo(ax + 6, hz)
      ctx.lineTo(ax - 14, 1080)
      ctx.stroke()
      // 红色折角框
      ctx.strokeStyle = WD2.red
      ctx.lineWidth = 3
      for (const [x, z, w, d, at] of REDS) {
        if (t < at) continue
        const q = seg(t, at, at + 0.3)
        const pts = [project(g.cam, x, 0.3, z), project(g.cam, x + w * q, 0.3, z), project(g.cam, x + w * q, 0.3, z - d), project(g.cam, x, 0.3, z - d)]
        if (!pts.every((p) => p.vis)) continue
        ctx.beginPath()
        ctx.moveTo(pts[0].x, pts[0].y)
        for (const p of pts) ctx.lineTo(p.x, p.y)
        ctx.closePath()
        ctx.stroke()
      }
      // 青色节点：实心点 + 贴地椭圆环
      for (const [x, z, at] of NODES) {
        if (t < at) continue
        const p = project(g.cam, x, 0.3, z)
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
      for (const [text, x, z, at] of ROUTES) {
        if (t < at) continue
        const base = project(g.cam, x, 0, z)
        const top = project(g.cam, x, 14, z)
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
        const p = project(g.cam, 40, 0, 190)
        const q = project(g.cam, -60, 0, 120)
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

// ───────────────────────── ctOS 标志 ─────────────────────────

export const ctosBadge: Scene = {
  id: 'wd2-004.0-ctos-logo',
  start: 4.0,
  end: 10.95,
  note: '右上角 ctOS 标志：4.0–4.9 逐块打出，10.8 起闪烁消失',
  render({ ctx, t }) {
    const f = fr(t)
    if (t > 10.75 && f % 2 === 0) return
    ctosLogo(ctx, 1578, 80, 118, seg(t, 4.0, 4.95), f, { data: true })
  },
}

// ───────────────────────── 俯拍城市地图 ─────────────────────────

/** 俯拍地图的相机：地图坐标 → 屏幕（缓慢平移 + 微旋转）。14s 以后 hack.ts 继续用它 */
export function mapCam(t: number) {
  const k = seg(t, 8.3, 17.6)
  return {
    x: lerp(1000, 1130, k),
    y: lerp(800, 1180, k),
    s: lerp(1.25, 1.45, ease.inOutCubic(k)),
    rot: lerp(-0.1, -0.05, k),
  }
}

export function drawCityMap(ctx: CanvasRenderingContext2D, t: number, alpha = 1) {
  // V2：换成按原片 10.6s 标定的 ctOS 地图（citymap2d.ts）；旧 cityMapTexture 仍供 bay.ts 使用
  drawCtosMap(ctx, t, alpha)
}

export const cityTopDown: Scene = {
  id: 'wd2-008.3-city-map',
  start: 8.3,
  end: 14.3,
  note: 'ASSET 俯拍芝加哥街道地图（程序化），左上是湖；缓慢平移推近。12.4 起被代码窗覆盖',
  render({ ctx, t }) {
    drawCityMap(ctx, t, seg(t, 8.3, 8.7))
  },
}

// ───────────────────────── 马赛克人脸档案卡 ─────────────────────────

/** ASSET 程序化指纹（同心椭圆纹） */
function fingerprint(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.save()
  ctx.fillStyle = '#e9e9e6'
  ctx.fillRect(x, y, w, h)
  ctx.beginPath()
  ctx.ellipse(x + w / 2, y + h / 2, w * 0.3, h * 0.4, 0, 0, Math.PI * 2)
  ctx.clip()
  ctx.strokeStyle = '#3a2c3a'
  ctx.lineWidth = 1.6
  for (let r = 3; r < w * 0.45; r += 4) {
    ctx.beginPath()
    ctx.ellipse(x + w / 2 + Math.sin(r) * 2, y + h * 0.55, r * 0.8, r * 1.1, 0.1, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.restore()
}

const DOSSIER_ROWS = ['NAME       DUNCAN', 'DOB        09 14 81', 'OCCUPATION  NETWORK ADMIN', 'SSN     4478-8804-2267-226', 'STATUS            NORTH', 'HEIGHT 6 0     EYES BLUE', 'AFFILIATION', 'FINGER']

/**
 * 档案卡逐帧状态（原片 30fps，8.35 + i/30 逐帧核对）。每个字符一帧：
 * 大写字母 = 人像（不同人）+ 红扫描线，小写 = 无红线，'~' = 该帧人像上有红/黑错位横条，
 * '#' = 大方块马赛克，'0' = 照片框空黑，'*' = 碎片故障帧，'.' = 无档案卡。
 */
const DOS_SEQ = '.AAAbccddCC**EEf~g~g##H*II****0JK0LL##'
const DOS_FACE: Record<string, number> = { a: 11, b: 23, c: 37, d: 45, e: 41, f: 53, g: 59, h: 67, i: 71, j: 83, k: 89, l: 97 }
type DosState = { face: number; red: number; block?: boolean; empty?: boolean; glitch?: boolean; band?: boolean }
function dosState(t: number): DosState | null {
  const i = Math.floor((t - 8.35) * 30 + 1e-6)
  const c = DOS_SEQ[i] ?? '.'
  if (c === '.') return null
  // 向前找最近的人像字母，决定 '~' '#' 等帧用哪张脸
  let k = i
  while (k > 0 && !/[a-z]/i.test(DOS_SEQ[k])) k--
  const face = DOS_FACE[DOS_SEQ[k].toLowerCase()] ?? 11
  if (c === '*') return { face, red: 0, glitch: true }
  if (c === '#') return { face, red: 1, block: true }
  if (c === '0') return { face, red: 0, empty: true }
  if (c === '~') return { face, red: 1, band: true }
  return { face, red: c === c.toUpperCase() ? 1 : 0 }
}

function drawDossier(ctx: CanvasRenderingContext2D, t: number, st: DosState) {
  const x = 78
  const y = 76
  const w = 298
  ctx.save()
  // 照片框
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'
  ctx.lineWidth = 1.5
  ctx.strokeRect(x - 6, y - 6, w + 12, w + 12)
  if (!st.empty) {
    // ASSET 程序化证件照（part2 的 faceTex，不同 seed = 不同人），原片每 0.1s 换一个人
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(faceTex(st.face, st.block ? 4 : 18), x, y, w, w)
    ctx.imageSmoothingEnabled = true
    ctx.fillStyle = 'rgba(0,0,0,0.12)'
    ctx.fillRect(x, y, w, w)
  }
  // 红扫描线
  if (st.red > 0) {
    ctx.fillStyle = WD2.red
    ctx.fillRect(x - 4, y + w * 0.38, (w + 8) * st.red, 7)
  }
  // 错位横条帧：照片里一条黑带 + 右移的红条
  if (st.band) {
    ctx.fillStyle = '#000'
    ctx.fillRect(x, y + w * 0.3, w, 16)
    ctx.fillStyle = WD2.red
    ctx.fillRect(x + w * 0.4, y + w * 0.42, w * 0.7, 6)
  }
  // 字段栏：上方一行小标签 + 下方描边小框
  font(ctx, 10, 400, FONT.mono)
  tracking(ctx, 3)
  for (let i = 0; i < DOSSIER_ROWS.length; i++) {
    const ry = y + 340 + i * 58
    if (t < 8.45 + i * 0.03) continue
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'
    ctx.strokeRect(x, ry, w, i === 7 ? 70 : 26)
    ctx.fillStyle = 'rgba(255,255,255,0.4)'
    ctx.fillText('LAST    FIRST    MI', x + 4, ry - 8)
    ctx.fillStyle = 'rgba(255,255,255,0.75)'
    ctx.fillText(DOSSIER_ROWS[i], x + 10, ry + 17)
  }
  tracking(ctx, 0)
  // 指纹 + 右侧小表格
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'
  ctx.strokeRect(x - 6, 870, 160, 150)
  fingerprint(ctx, x + 4, 880, 140, 130)
  for (let i = 0; i < 4; i++) {
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'
    ctx.strokeRect(x + 170, 890 + i * 34, 128, 22)
  }
  ctx.restore()
}

export const dossier: Scene = {
  id: 'wd2-008.4-dossier',
  start: 8.38,
  end: 9.6,
  note: 'V2：左侧马赛克人脸档案卡，按原片 30fps 逐帧序列换脸（多数带红扫描线），夹杂碎片故障帧、大方块马赛克帧、照片空黑帧，9.58 消失',
  render({ ctx, t }) {
    const f = fr(t)
    const st = dosState(t)
    if (!st) return
    if (!st.glitch) {
      // 档案卡所在的左栏是纯黑底（地图被挡住）
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, 480, 1080)
      drawDossier(ctx, t, st)
      return
    }
    // 碎片故障帧：左栏大半露出地图，档案卡切成随机矩形块散到全屏
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 380, 480, 700)
    const src = cached('wd2p1:dossier-snap', () => makeCanvas(480, 1080))
    src.ctx.fillStyle = '#000'
    src.ctx.fillRect(0, 0, 480, 1080)
    drawDossier(src.ctx, 9.0, { face: st.face, red: 0 })
    for (let i = 0; i < 16; i++) {
      const sx = h2(i, 1, 6) * 380
      const sy = h2(i, 2, 6) * 1000
      const sw = 40 + h2(i, 3, 6) * 180
      const sh = 20 + h2(i, 4, 6) * 110
      const dx = h2(i, f >> 2, 7) * 1800
      const dy = h2(i, f >> 2, 8) * 1000
      ctx.drawImage(src.canvas, sx, sy, sw, sh, dx, dy, sw, sh)
    }
  },
}

// ───────────────────────── with a few hundred ─────────────────────────

/** 大字单词：出现时刻、位置（基线）以及 12.2s 以后散开的目标位置 */
const WORDS: { text: string; at: number; x: number; y: number; y1: number; y2: number }[] = [
  { text: 'with', at: 11.15, x: 570, y: 556, y1: 556, y2: 556 },
  { text: 'a', at: 11.3, x: 760, y: 556, y1: 556, y2: 556 },
  { text: 'few', at: 11.4, x: 836, y: 574, y1: 560, y2: 240 },
  { text: 'hundred', at: 11.62, x: 1004, y: 630, y1: 592, y2: 556 },
]

export const fewHundred: Scene = {
  id: 'wd2-011.1-with-a-few-hundred',
  start: 11.1,
  end: 13.0,
  note: '白字大词 "with a few hundred" 逐词白块擦出（错落排布），12.1 起 few 上移、hundred 归位到同一行，12.5 后被代码窗吞没',
  render({ ctx, t }) {
    const settle = ease.inOutCubic(seg(t, 11.85, 12.05))
    const move = ease.inOutCubic(seg(t, 12.1, 12.3))
    for (const w of WORDS) {
      if (t < w.at) continue
      let y = lerp(lerp(w.y, w.y1, settle), w.y2, move)
      // 12.4 起 "with" 跳到画面顶部、"few" 被代码窗盖住
      if (w.text === 'with' && t > 12.4) y = 118
      if (w.text === 'few' && t > 12.42) continue
      if (t > 12.7 && h2(w.at * 10, fr(t), 3) < 0.5) continue
      wordReveal(ctx, w.text, w.x, y, 78, seg(t, w.at, w.at + 0.35))
    }
  },
}
