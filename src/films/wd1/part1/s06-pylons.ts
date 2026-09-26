import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Scene } from '../../../engine/types'
import { clamp, seg } from '../../../engine/math'
import { memo } from '../../../engine/three-host'
import { FONT, font, measure, tracking } from '../../../fx/text'
import { spline } from './util'
import { alignTrack, cameraTrack } from '../../../engine/camera-track'
import { renderWithPost } from '../../../three/post'
import { blendPose, cameraPose, poseToCamera, sampleTrackExt, smoothW } from './city-cam'

/**
 * 21.75–24.3  电塔阵列：俯视 → 压低视角沿塔列推进，圆环圈住一座塔，推到塔身特写；
 * 标签「_TRANSMISSION_CONTROL_ROOM」深灰渐变底等宽字。
 * V2（G4a）：21.75–23.72 相机用反求 wd1-pylons（good，0.66 px）。反求点云 = 各塔塔顶（主平面），
 * 正射拼图上塔阵是正方网格、间距 0.057 反求单位 → 尺度 30/0.057 ≈ 526；中央亮线那一列 x = 0.009、
 * 被圆环圈住的主角塔在 z = 0.18（末帧视线落点所在行）→ 平移到 (0, 塔顶 10.4, HERO_Z)。旋转 0（相机同样朝 -z 推进）。
 * 23.72 以后反求结束，按尾速外推并在 23.72–24.05 混合到原来的手调关键帧（推到桁架特写）。
 * 2D 的 contrast(1.2) 改由后期 tone.contrast 负责（不加颗粒：会弄脏纯黑背景）。
 * ASSET：电塔是程序化几何（远处用方块拼的简化塔 InstancedMesh，主角塔用线段桁架），换真实模型时替换 simplePylon()/heroPylon()。
 */

const SP = 30 // 塔间距
const HERO_Z = -60

function simplePylon() {
  const parts: THREE.BufferGeometry[] = []
  const box = (w: number, h: number, d: number, x: number, y: number, z = 0) => {
    const g = new THREE.BoxGeometry(w, h, d)
    g.translate(x, y, z)
    parts.push(g)
  }
  box(1.1, 10, 1.1, 0, 5)
  box(0.7, 1.2, 0.7, 0, 10.4)
  for (const [y, w] of [[7, 5], [8.3, 6.2], [9.5, 4.6]] as const) {
    box(w, 0.3, 0.5, 0, y)
    box(0.25, 0.8, 0.25, -w / 2 + 0.2, y - 0.5)
    box(0.25, 0.8, 0.25, w / 2 - 0.2, y - 0.5)
  }
  return mergeGeometries(parts)
}

/** 主角塔：四腿收分桁架 + X 斜撑 + 三层横担 */
function heroPylon() {
  const pos: number[] = []
  const L = (a: number[], b: number[]) => pos.push(...a, ...b)
  const H = 10.5
  const half = (y: number) => 1.5 - (y / H) * 1.0
  const lv = 12
  for (let i = 0; i < lv; i++) {
    const y0 = (i / lv) * H
    const y1 = ((i + 1) / lv) * H
    const a = half(y0)
    const b = half(y1)
    const c0 = [[-a, -a], [a, -a], [a, a], [-a, a]]
    const c1 = [[-b, -b], [b, -b], [b, b], [-b, b]]
    for (let k = 0; k < 4; k++) {
      const n = (k + 1) % 4
      L([c0[k][0], y0, c0[k][1]], [c1[k][0], y1, c1[k][1]])
      L([c1[k][0], y1, c1[k][1]], [c1[n][0], y1, c1[n][1]])
      L([c0[k][0], y0, c0[k][1]], [c1[n][0], y1, c1[n][1]])
      L([c0[n][0], y0, c0[n][1]], [c1[k][0], y1, c1[k][1]])
    }
  }
  for (const [y, w] of [[7, 2.6], [8.3, 3.2], [9.5, 2.4]] as const) {
    for (const s of [-1, 1]) {
      const x0 = s * half(y)
      const x1 = s * w
      L([x0, y, -0.4], [x1, y, -0.15])
      L([x0, y, 0.4], [x1, y, 0.15])
      L([x0, y - 0.6, -0.4], [x1, y, -0.15])
      L([x0, y - 0.6, 0.4], [x1, y, 0.15])
      for (let q = 0; q < 4; q++) {
        const xa = x0 + ((x1 - x0) * q) / 4
        const xb = x0 + ((x1 - x0) * (q + 1)) / 4
        L([xa, y, -0.4 + 0.25 * (q / 4)], [xb, y - 0.4 * (1 - q / 4), 0.3])
      }
      L([x1, y, 0], [x1, y - 0.8, 0])
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  return g
}

/** 桁架感贴图：深灰底 + X 斜撑 */
function latticeTex() {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  g.fillStyle = '#5a5a5a'
  g.fillRect(0, 0, 64, 64)
  g.strokeStyle = '#e8e8e8'
  g.lineWidth = 5
  g.strokeRect(0, 0, 64, 64)
  g.lineWidth = 3
  g.beginPath()
  g.moveTo(0, 0)
  g.lineTo(64, 64)
  g.moveTo(64, 0)
  g.lineTo(0, 64)
  g.stroke()
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

const scene3d = () =>
  memo('wd1p1:pylons', () => {
    const scene = new THREE.Scene()
    scene.fog = new THREE.Fog(0x000000, 150, 1100)
    const geo = simplePylon()
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, map: latticeTex() })
    const cols = 41
    const rows = 50
    const mesh = new THREE.InstancedMesh(geo, mat, cols * rows)
    const m = new THREE.Matrix4()
    let k = 0
    for (let i = 0; i < cols; i++)
      for (let j = 0; j < rows; j++) {
        const x = (i - 20) * SP
        const z = 90 - j * SP
        if (x === 0 && z === HERO_Z) m.makeScale(0, 0, 0)
        else m.makeTranslation(x, 0, z)
        mesh.setMatrixAt(k++, m)
      }
    scene.add(mesh)
    const hero = new THREE.LineSegments(heroPylon(), new THREE.LineBasicMaterial({ color: 0xf0f0f0 }))
    hero.position.set(0, 0, HERO_Z)
    scene.add(hero)
    // 中央一列地面亮线
    const lg = new THREE.BufferGeometry()
    lg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.05, 100, 0, 0.05, -1500], 3))
    scene.add(new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0xffffff })))
    const cam = new THREE.PerspectiveCamera(40, 1920 / 1080, 0.1, 3000)
    return { scene, cam }
  })

/** 反求 → 场景：X' = 526·X + (−4.7, 10.4, −154.7) */
const PYLON_ALIGN = { scale: 526, rotation: [0, 0, 0] as [number, number, number], offset: [-4.7, 10.4, HERO_Z - 526 * 0.18] as [number, number, number] }
const pylonTrack = () => memo('wd1p1:pylon-track', () => alignTrack(cameraTrack('wd1-pylons'), PYLON_ALIGN))

export const pylons: Scene = {
  id: 'wd1-022-pylons',
  start: 21.75,
  end: 24.3,
  note: '电塔阵列：俯视转压低视角沿中央塔列推进，圆环圈住主角塔并推到桁架特写；_TRANSMISSION_CONTROL_ROOM 标签',
  render({ ctx, t, three }) {
    const { scene, cam } = scene3d()
    // 相机：反求轨迹（21.75–23.72）→ 23.72–24.05 混合到手调关键帧（推到桁架特写，相对主角塔）
    const trk = pylonTrack()
    if (t <= trk.end) poseToCamera(cam, sampleTrackExt(trk, t, 0))
    else {
      const K = (keys: [number, number][]) => spline(t, keys)
      const px = K([[23.8, 0], [24.1, -2], [24.3, -2.5]])
      const py = K([[23.2, 32], [23.8, 15], [24.1, 10], [24.3, 9.5]])
      const pz = HERO_Z + K([[23.2, 175], [23.8, 26], [24.1, 7], [24.3, 4]])
      const lx0 = K([[23.8, 0], [24.1, 1], [24.3, 1.2]])
      const ly0 = K([[23.2, 11], [23.8, 5], [24.1, 9], [24.3, 9.3]])
      const lz = HERO_Z + K([[23.2, 80], [23.8, 0], [24.3, 0]])
      cam.position.set(px, py, pz)
      cam.up.set(0, 1, 0)
      cam.fov = 40
      cam.lookAt(lx0, ly0, lz)
      cam.updateProjectionMatrix()
      const manual = cameraPose(cam)
      poseToCamera(cam, blendPose(sampleTrackExt(trk, t, 0.3), manual, smoothW(t, trk.end, 24.05)))
    }
    const gl = renderWithPost(three, scene, cam, { time: t, clear: 0x000000, clearAlpha: 0, tone: { contrast: 1.25, exposure: 0.6 } })
    ctx.save()
    ctx.globalAlpha = seg(t, 21.75, 21.95) * (1 - seg(t, 24.15, 24.25))
    ctx.drawImage(gl, 0, 0)
    ctx.restore()

    // 圆环：投影主角塔中心
    const ringA = seg(t, 23.05, 23.2) * (1 - seg(t, 23.95, 24.0))
    if (ringA > 0) {
      const c = new THREE.Vector3(0, 5.5, HERO_Z).project(cam)
      const top = new THREE.Vector3(0, 11, HERO_Z).project(cam)
      const x = (c.x * 0.5 + 0.5) * 1920
      const y = (-c.y * 0.5 + 0.5) * 1080
      const r = Math.abs(top.y - c.y) * 540 * 1.25
      ctx.strokeStyle = `rgba(255,255,255,${0.9 * ringA})`
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.stroke()
    }

    // 标签：_TRANSMISSION_CONTROL_ROOM（屏幕空间缓慢移动）
    const text = '_TRANSMISSION_CONTROL_ROOM'
    const n = Math.max(0, Math.min(text.length, Math.floor((t - 21.62) * 30)))
    const erase = seg(t, 24.02, 24.3)
    if (n > 0 && erase < 1) {
      const lx = spline(t, [[21.75, 912], [22.6, 912], [23.2, 1008], [23.8, 1109], [24.1, 1433], [24.3, 1500]])
      const ly = spline(t, [[21.75, 588], [22.6, 588], [23.2, 650], [23.8, 795], [24.1, 972], [24.3, 990]])
      const size = spline(t, [[21.75, 38], [22.6, 38], [23.2, 32], [23.8, 34], [24.1, 36]])
      font(ctx, size, 400, FONT.plex)
      tracking(ctx, size * 0.08)
      const shown = text.slice(0, n)
      const fullW = measure(ctx, text) + size * 1.2
      const bw = Math.max(measure(ctx, shown) + size * 0.8, fullW * clamp((t - 21.62) / 0.35))
      const top = ly - size * 0.62
      const h = size * 1.24
      const g = ctx.createLinearGradient(lx, 0, lx + bw, 0)
      g.addColorStop(0, 'rgba(120,120,120,0.85)')
      g.addColorStop(0.6, 'rgba(80,80,80,0.75)')
      g.addColorStop(1, 'rgba(60,60,60,0.55)')
      ctx.save()
      ctx.beginPath()
      ctx.rect(lx, top - 20, bw * (1 - erase), h + 40)
      ctx.clip()
      ctx.fillStyle = g
      ctx.fillRect(lx, top, bw, h)
      ctx.fillStyle = '#f0f0f0'
      ctx.textBaseline = 'middle'
      ctx.fillText(shown, lx + size * 0.35, ly + 1)
      ctx.textBaseline = 'alphabetic'
      // 左上角发光短横（接 ME? 的光标）
      if (t < 22.9) {
        ctx.shadowColor = '#fff'
        ctx.shadowBlur = 10
        ctx.fillStyle = '#fff'
        ctx.fillRect(lx, top - 8, size * 0.5, 4)
        ctx.fillRect(lx, top + h + 4, size * 0.5, 4)
      }
      ctx.restore()
      tracking(ctx, 0)
    }
  },
}
