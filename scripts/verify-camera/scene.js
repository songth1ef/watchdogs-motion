// 临时验证场景（由 scripts/verify-camera.mjs 在无头 Chromium 里经 Vite 动态 import）：
// 只走 src/engine/camera-track.ts 的公开 API（loadTrack → applyTrack → projectTrackPoints），
// 这样 Z-up→Y-up 转换、插值、fov 都被端到端验证到。不属于任何镜头，不进构建。
import * as THREE from 'three'
import { loadTrack, applyTrack, projectTrackPoints } from '/src/engine/camera-track.ts'

const W = 1920
const H = 1080
let renderer
const cache = new Map()

function build(json) {
  const track = loadTrack(json, { allowPoor: true })
  const scene = new THREE.Scene()
  // 地面网格：--orient floor 已把点云主平面放到 y=0；网格尺寸按点云范围取
  const box = new THREE.Box3().setFromPoints(track.points)
  const size = box.getSize(new THREE.Vector3())
  const span = Math.max(size.x, size.z) * 3 || 10
  const grid = new THREE.GridHelper(span, 40, 0xff3070, 0x30e0ff)
  grid.material.transparent = true
  grid.material.opacity = 0.85
  scene.add(grid)
  // 每个稳定点立一根到地面的竖线（看高度是否合理）
  const pos = []
  for (const p of track.points) pos.push(p.x, 0, p.z, p.x, p.y, p.z)
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  scene.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xffe040, transparent: true, opacity: 0.6 })))
  const cam = new THREE.PerspectiveCamera(40, W / H, span * 0.001, span * 50)
  return { track, scene, cam }
}

export async function renderTrackFrame(json, t) {
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
    renderer.setPixelRatio(1)
    renderer.setSize(W, H, false)
  }
  let s = cache.get(json.name)
  if (!s) cache.set(json.name, (s = build(json)))
  applyTrack(s.cam, s.track, t)
  renderer.setClearColor(0x000000, 0)
  renderer.render(s.scene, s.cam)
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d')
  ctx.drawImage(renderer.domElement, 0, 0)
  // 反求 3D 点的投影：画绿色十字，应当钉在原片的角点上
  ctx.strokeStyle = '#40ff60'
  ctx.lineWidth = 3
  for (const p of projectTrackPoints(s.cam, s.track, W, H)) {
    if (p.behind) continue
    ctx.beginPath()
    ctx.moveTo(p.x - 10, p.y)
    ctx.lineTo(p.x + 10, p.y)
    ctx.moveTo(p.x, p.y - 10)
    ctx.lineTo(p.x, p.y + 10)
    ctx.stroke()
  }
  ctx.fillStyle = '#ffffff'
  ctx.font = '28px monospace'
  ctx.fillText(`${json.name}  t=${t.toFixed(2)}  fov=${s.cam.fov.toFixed(1)}`, 24, 44)
  return c.toDataURL('image/png')
}
