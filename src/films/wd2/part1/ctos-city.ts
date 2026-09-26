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
import { pixelate } from '../../../fx/image'
import { WD2 } from '../../../theme'
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
  const tex = cityMapTexture()
  const c = mapCam(t)
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.translate(960, 540)
  ctx.rotate(c.rot)
  ctx.scale(c.s, c.s)
  ctx.translate(-c.x, -c.y)
  ctx.drawImage(tex, 0, 0)
  ctx.restore()
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

/** ASSET 程序化人脸（灰度，低分辨率后再马赛克）。替换：返回一张真实证件照 canvas */
function faceCanvas() {
  return cached('wd2p1:face', () => {
    const { canvas, ctx } = makeCanvas(160, 170)
    ctx.fillStyle = '#e8e8e6'
    ctx.fillRect(0, 0, 160, 170)
    // 肩膀/衣服
    ctx.fillStyle = '#2a2a2a'
    ctx.beginPath()
    ctx.ellipse(80, 185, 78, 52, 0, 0, Math.PI * 2)
    ctx.fill()
    // 脖子
    ctx.fillStyle = '#6a6a6a'
    ctx.fillRect(64, 110, 32, 30)
    // 脸
    ctx.fillStyle = '#8a8a8a'
    ctx.beginPath()
    ctx.ellipse(80, 80, 34, 44, 0, 0, Math.PI * 2)
    ctx.fill()
    // 头发
    ctx.fillStyle = '#1c1c1c'
    ctx.beginPath()
    ctx.ellipse(80, 50, 38, 24, 0, Math.PI, Math.PI * 2)
    ctx.fill()
    ctx.fillRect(42, 44, 76, 12)
    // 眼、嘴、胡子
    ctx.fillStyle = '#262626'
    ctx.fillRect(60, 74, 14, 6)
    ctx.fillRect(87, 74, 14, 6)
    ctx.fillRect(68, 106, 24, 5)
    ctx.fillStyle = '#4a4a4a'
    ctx.fillRect(58, 100, 44, 20)
    return canvas
  })
}

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

function drawDossier(ctx: CanvasRenderingContext2D, t: number) {
  const x = 70
  const y = 70
  const w = 310
  ctx.save()
  // 照片框
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'
  ctx.lineWidth = 1.5
  ctx.strokeRect(x - 6, y - 6, w + 12, w + 12)
  pixelate(ctx, faceCanvas(), x, y, w, w, 19)
  // 扫描红线（8.7s 起）
  if (t > 8.65) {
    ctx.fillStyle = WD2.red
    ctx.fillRect(x - 4, y + 100, w + 8, 4)
  }
  // 字段栏：上方一行小标签 + 下方描边小框
  font(ctx, 10, 400, FONT.mono)
  tracking(ctx, 3)
  for (let i = 0; i < DOSSIER_ROWS.length; i++) {
    const ry = y + 350 + i * 56
    if (t < 8.45 + i * 0.03) continue
    ctx.strokeStyle = 'rgba(255,255,255,0.45)'
    ctx.strokeRect(x, ry, w, i === 7 ? 70 : 26)
    ctx.fillStyle = 'rgba(255,255,255,0.45)'
    ctx.fillText('LAST    FIRST    MI', x + 4, ry - 8)
    ctx.fillStyle = 'rgba(255,255,255,0.8)'
    ctx.fillText(DOSSIER_ROWS[i], x + 10, ry + 17)
  }
  tracking(ctx, 0)
  // 指纹 + 右侧小表格
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'
  ctx.strokeRect(x - 6, 856, 172, 184)
  fingerprint(ctx, x + 4, 866, 150, 164)
  for (let i = 0; i < 4; i++) {
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'
    ctx.strokeRect(x + 180, 876 + i * 42, 130, 24)
  }
  ctx.restore()
}

export const dossier: Scene = {
  id: 'wd2-008.4-dossier',
  start: 8.38,
  end: 9.4,
  note: 'ASSET 左侧马赛克人脸档案卡（程序化人脸/指纹），8.4 硬切出现，9.0 起碎成若干错位碎片后消失',
  render({ ctx, t }) {
    const f = fr(t)
    if (t < 9.15) {
      // 档案卡所在的左栏是纯黑底（地图被挡住）
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, 455, 1080)
      drawDossier(ctx, t)
      return
    }
    // 碎裂：把档案卡切成随机矩形块，逐帧跳到不同位置
    const k = seg(t, 9.15, 9.4)
    const src = cached('wd2p1:dossier-snap', () => makeCanvas(420, 1080))
    src.ctx.clearRect(0, 0, 420, 1080)
    drawDossier(src.ctx, 9.0)
    const n = 14
    for (let i = 0; i < n; i++) {
      if (h2(i, f, 5) < k * 0.9) continue
      const sx = h2(i, 1, 6) * 320
      const sy = h2(i, 2, 6) * 1000
      const sw = 40 + h2(i, 3, 6) * 160
      const sh = 20 + h2(i, 4, 6) * 120
      const dx = sx + (h2(i, f >> 1, 7) - 0.3) * 900 * k
      const dy = sy + (h2(i, f >> 1, 8) - 0.5) * 300 * k
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
