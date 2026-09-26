// 临时无头演示（不注册进 films）：同一时刻「裸渲染」与「加后期」各出一帧。
// 做法：给镜头传一个代理 ThreeHost，它的 render() 改走 renderWithPost —— 镜头文件一行不改。
import * as THREE from 'three'
import { films } from '../../src/films'
import type { Film, FrameCtx } from '../../src/engine/types'
import { ThreeHost } from '../../src/engine/three-host'
import { clamp, seg } from '../../src/engine/math'
import { cityScene, placeCam } from '../../src/films/wd1/part1/s09-city'
import { glSync, lastPostStats, mergePost, presets, renderWithPost, type PostOpts } from '../../src/three/post'

const W = 1920
const H = 1080
const three = new ThreeHost(W, H)
void three.renderer

function postHost(opts: PostOpts, t: number, profile: boolean): ThreeHost {
  const h = Object.create(three) as ThreeHost
  h.render = (scene: THREE.Scene, cam: THREE.Camera, clear = 0x000000, clearAlpha = 0) =>
    renderWithPost(three, scene, cam, mergePost(opts, { time: t, clear, clearAlpha, profile, fps: films.wd1.fps }))
  return h
}

/**
 * 「接入后」的镜头替身：与 docs/post.md 里给的 diff 一致（镜头文件本身不改）。
 * 只替换 3D 那一层的画法，其余 2D 图层照旧由原镜头画。
 */
type Replace = (f: FrameCtx, opts: PostOpts) => void
const REPLACE: Record<string, Replace> = {
  // s09-city：去掉 2D 的 contrast(1.5)，3D 走后期（t ≥ 38.2 的亮场部分；暗场故障段不在演示范围内）
  'wd1-034-city': (f, opts) => {
    const { scene, cam } = cityScene()
    placeCam(cam, f.t)
    const gl = renderWithPost(three, scene, cam, mergePost(opts, { time: f.t }))
    f.ctx.globalAlpha = seg(f.t, 34.4, 34.9)
    f.ctx.drawImage(gl, 0, 0)
  },
}

function drawShot(film: Film, t: number, host: ThreeHost, opts?: PostOpts) {
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d')!
  ctx.fillStyle = film.background
  ctx.fillRect(0, 0, W, H)
  for (const s of film.scenes) {
    if (t < s.start || t >= s.end) continue
    const dur = s.end - s.start
    ctx.save()
    const f: FrameCtx = { ctx, W, H, t, lt: t - s.start, p: clamp((t - s.start) / dur), dur, three: host, film }
    const rep = opts && REPLACE[s.id]
    if (rep) rep(f, opts)
    else s.render(f)
    ctx.restore()
  }
  return c
}

export function renderCase(filmId: Film['id'], t: number, preset: keyof typeof presets, over: PostOpts = {}) {
  const film = films[filmId]
  const gl = three.renderer.getContext() as WebGL2RenderingContext
  const opts = mergePost(presets[preset] as PostOpts, over)
  // 预热（建管线、编译 shader）
  drawShot(film, t, postHost(opts, t, false), opts)
  glSync(gl)
  let t0 = performance.now()
  const bare = drawShot(film, t, three)
  glSync(gl)
  const bareMs = performance.now() - t0
  t0 = performance.now()
  const post = drawShot(film, t, postHost(opts, t, false), opts)
  glSync(gl)
  const postMs = performance.now() - t0
  // 逐 Pass 计时（单独一遍）
  drawShot(film, t, postHost(opts, t, true), mergePost(opts, { profile: true }))
  return {
    bare: bare.toDataURL('image/png'),
    post: post.toDataURL('image/png'),
    bareMs,
    postMs,
    stats: lastPostStats(),
  }
}

/** 纯 3D 基准：同一场景 1920×1080，逐项打开效果，测每个 Pass 的耗时 */
export function benchPasses(filmId: Film["id"], t: number, preset: keyof typeof presets, over: PostOpts = {}) {
  const film = films[filmId]
  const opts = mergePost(presets[preset] as PostOpts, over)
  const runs: Record<string, number>[] = []
  for (let i = 0; i < 3; i++) {
    drawShot(film, t, postHost(opts, t, true), mergePost(opts, { profile: true }))
    runs.push(lastPostStats())
  }
  const out: Record<string, number> = {}
  for (const k of Object.keys(runs[2])) out[k] = Math.round(((runs[1][k] ?? 0) + (runs[2][k] ?? 0)) / 2)
  return out
}

/**
 * 散景验证用的合成场景（仅演示）：远处一排发光窗点（模拟 3D 化后的天际线），近处一块灰色地台。
 * 左 = 裸渲染，右 = skylineBokeh 预设（焦点在近处地台）。
 */
export function bokehTest() {
  const scene = new THREE.Scene()
  const g = new THREE.BoxGeometry(1, 1, 1)
  const win = new THREE.MeshBasicMaterial({ color: 0xffffff })
  let k = 0
  for (let b = 0; b < 40; b++) {
    const x = -300 + b * 15 + Math.sin(b * 7.1) * 4
    const h = 30 + Math.abs(Math.sin(b * 3.7)) * 120
    for (let y = 4; y < h; y += 6)
      for (let i = 0; i < 3; i++) {
        if (Math.sin(k++ * 12.9898) * 43758.5453 % 1 > 0.35) continue
        const m = new THREE.Mesh(g, win)
        m.scale.set(1.6, 1.6, 1.6)
        m.position.set(x + i * 3.5, y, -900)
        scene.add(m)
      }
  }
  const plate = new THREE.Mesh(new THREE.BoxGeometry(160, 8, 60), new THREE.MeshStandardMaterial({ color: 0xdddddd }))
  plate.position.set(0, -20, -140)
  scene.add(plate, new THREE.HemisphereLight(0xffffff, 0x222222, 2))
  const cam = new THREE.PerspectiveCamera(36, W / H, 1, 3000)
  cam.position.set(0, 20, 0)
  cam.lookAt(0, 20, -500)
  cam.updateMatrixWorld()
  const out = document.createElement('canvas')
  out.width = W
  out.height = H
  const ctx = out.getContext('2d')!
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, W, H)
  ctx.drawImage(three.render(scene, cam), 0, 0, W, H, 0, 0, W / 2, H / 2)
  ctx.drawImage(renderWithPost(three, scene, cam, mergePost(presets.skylineBokeh as PostOpts, { shadows: false, dof: { focus: 140 } })), 0, 0, W, H, W / 2, 0, W / 2, H / 2)
  // 下半：同一帧右半放大（看光斑形状）
  ctx.drawImage(three.renderer.domElement, W * 0.3, H * 0.2, W * 0.4, H * 0.4, 0, H / 2, W, H / 2)
  return out.toDataURL('image/png')
}

/** 只出裸渲染（检查后期是否污染 renderer 状态用） */
export function bareOnly(filmId: Film['id'], t: number) {
  return drawShot(films[filmId], t, three).toDataURL('image/png')
}

;(window as unknown as { __post: unknown }).__post = { renderCase, benchPasses, bokehTest, bareOnly }
