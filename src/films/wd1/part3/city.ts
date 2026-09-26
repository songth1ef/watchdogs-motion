/**
 * WD1 123.4s–139.3s：白色素模城市（一个连续 3D 镜头）。
 * 123.4 从舞台黑场里俯冲进城市（虚焦）→ 124.3 起近乎正俯拍、缓慢旋转平移，
 * 125.1 青底 "_MESSAGE_WAS_CLEAR" 斜向标签（贴着街道方向，随城市移动）→ 126.9 街区里升起像素字 "HACKED" →
 * 129.5 起相机抬起成斜俯视 → 133.4 压低成近地平视并一路拉远，露出城市其实放在一部手机屏幕上 →
 * 137.55 城市「熄灯」（发光消失、变暗）→ 139.3 黑场。
 * "TURN OUT THE LIGHTS." 与远处天际线在 lights.ts。
 *
 * ASSET：程序化楼块代替原片的芝加哥素模（替换 `buildCity()` 里的 InstancedMesh）；
 * 手机是黑色长方体 + 深灰屏幕（替换 `buildPhone()`）；桌面棋盘格地砖是 CanvasTexture（替换 `floorTexture()`）。
 */
import * as THREE from 'three'
import type { Scene } from '../../../engine/types'
import { clamp, ease, hash, lerp, seg } from '../../../engine/math'
import { memo } from '../../../engine/three-host'
import { blockLayout } from './layout'
import { FONT, typeOn } from '../../../fx/text'
import { WD1 } from '../../../theme'
import { applyOrbit, orbitAt, project, renderShadowed, type Orbit } from './three-util'

// HACKED 像素字（5×5）
const GLYPHS: Record<string, string[]> = {
  H: ['10001', '10001', '11111', '10001', '10001'],
  A: ['01110', '10001', '11111', '10001', '10001'],
  C: ['01111', '10000', '10000', '10000', '01111'],
  K: ['10001', '10010', '11100', '10010', '10001'],
  E: ['11111', '10000', '11110', '10000', '11111'],
  D: ['11110', '10001', '10001', '10001', '11110'],
}
const CELL = 2.9
/** HACKED 在世界里的左上角（沿 x 轴书写，z 向下为字的下方） */
const HX = -40
const HZ = 18
/** 城市规模：x 方向 30 个街区、z 方向 16 个，街区 14 + 街道 4 */
const NX = 30
const NZ = 16
const PITCH = 18
/** 手机机身厚度（城市地面 = 手机屏幕 = y 0） */
const PHONE_T = 26

/** ASSET：桌面棋盘格地砖 */
function floorTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 512
  const g = c.getContext('2d')!
  for (let y = 0; y < 4; y++)
    for (let x = 0; x < 4; x++) {
      g.fillStyle = (x + y) % 2 ? '#8a8a8a' : '#e8e8e8'
      g.fillRect(x * 128, y * 128, 128, 128)
    }
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(2, 2)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/** ASSET：手机（黑色机身 + 深灰屏幕） */
function buildPhone() {
  const g = new THREE.Group()
  const w = NX * PITCH + 90
  const d = NZ * PITCH + 70
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(w + 40, PHONE_T, d + 40),
    new THREE.MeshStandardMaterial({ color: 0x0c0c0c, roughness: 0.25, metalness: 0.4 }),
  )
  body.position.y = -PHONE_T / 2 - 0.05
  g.add(body)
  // 屏幕：纯黑（俯拍段它就是城市的「街道」，必须是纯黑）
  const screenMat = new THREE.MeshBasicMaterial({ color: 0x000000 })
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(w, d), screenMat)
  screen.rotation.x = -Math.PI / 2
  screen.receiveShadow = true
  g.add(screen)
  return { g }
}

function buildCity() {
  const scene = new THREE.Scene()
  // 楼块：避开 HACKED 字的区域；东北角一片高楼（原片的 Loop）
  const hackW = 6 * 6 * CELL
  const hackH = 5 * CELL
  const all = blockLayout(1403, NX, NZ, 14, 4, {
    maxH: 34,
    tallAt: (x, z) => 0.03 + 0.35 * Math.exp(-(((x - 120) / 110) ** 2 + ((z + 70) / 70) ** 2)),
  })
  const blds = all.filter((b) => !(b.x > HX - 3 && b.x < HX + hackW + 3 && b.z > HZ - 3 && b.z < HZ + hackH + 3))
  const geo = new THREE.BoxGeometry(1, 1, 1)
  geo.translate(0, 0.5, 0)
  const mat = new THREE.MeshStandardMaterial({ color: 0xe6e6e6, roughness: 0.95, metalness: 0, emissive: 0xffffff, emissiveIntensity: 0 })
  const mesh = new THREE.InstancedMesh(geo, mat, blds.length)
  const m = new THREE.Matrix4()
  blds.forEach((k, i) => {
    m.makeScale(k.w, k.h, k.d)
    m.setPosition(k.x, k.y0, k.z)
    mesh.setMatrixAt(i, m)
  })
  mesh.castShadow = true
  mesh.receiveShadow = true
  scene.add(mesh)

  // HACKED：每个像素一栋小楼，高度随机
  const cells: { x: number; z: number; h: number; d: number }[] = []
  'HACKED'.split('').forEach((ch, li) => {
    GLYPHS[ch].forEach((row, j) =>
      row.split('').forEach((b, i) => {
        if (b !== '1') return
        const n = li * 100 + j * 10 + i
        cells.push({ x: HX + (li * 6 + i) * CELL + CELL / 2, z: HZ + j * CELL + CELL / 2, h: 2 + hash(n) * 4, d: hash(n + 77) })
      }),
    )
  })
  const hack = new THREE.InstancedMesh(geo, mat, cells.length)
  hack.castShadow = true
  hack.receiveShadow = true
  scene.add(hack)

  const phone = buildPhone()
  scene.add(phone.g)

  const floorMat = new THREE.MeshStandardMaterial({ map: floorTexture(), roughness: 0.6, color: 0x000000 })
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(1800, 1800), floorMat)
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -PHONE_T
  scene.add(floor)

  const hemi = new THREE.HemisphereLight(0xffffff, 0x1a1a1a, 1.45)
  scene.add(hemi)
  const sun = new THREE.DirectionalLight(0xffffff, 1.7)
  sun.position.set(-120, 220, 90)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  const sc = sun.shadow.camera as THREE.OrthographicCamera
  sc.left = -320
  sc.right = 320
  sc.top = 320
  sc.bottom = -320
  sc.near = 10
  sc.far = 700
  sun.shadow.bias = -0.002
  sun.shadow.normalBias = 0.4
  sun.shadow.radius = 4
  scene.add(sun)
  scene.add(sun.target)

  const cam = new THREE.PerspectiveCamera(50, 1920 / 1080, 1, 12000)
  return { scene, cam, hack, cells, mat, floorMat, hemi, sun }
}

/** 相机关键帧（时间 → 轨道参数）。俯拍段 az 控制画面里街道的倾斜角。 */
const KEYS: [number, Orbit][] = [
  [123.4, { tx: -60, ty: 0, tz: -40, d: 110, az: 60, el: 40, fov: 40 }],
  [124.3, { tx: -20, ty: 0, tz: -15, d: 105, az: 28, el: 84, fov: 38 }],
  [127.5, { tx: -10, ty: 0, tz: 22, d: 115, az: 22, el: 86, fov: 38 }],
  [129.8, { tx: 5, ty: 0, tz: 50, d: 130, az: 30, el: 76, fov: 38 }],
  [131.8, { tx: 20, ty: 0, tz: 45, d: 115, az: 38, el: 45, fov: 38 }],
  [133.4, { tx: 20, ty: 0, tz: 10, d: 280, az: 18, el: 18, fov: 36, shift: -0.2 }],
  [134.5, { tx: 10, ty: 0, tz: 0, d: 400, az: 7, el: 15, fov: 36, shift: -0.25 }],
  [136.5, { tx: 10, ty: 0, tz: 0, d: 540, az: 5, el: 11, fov: 36, shift: -0.26 }],
  [138.3, { tx: 0, ty: -10, tz: 0, d: 660, az: 4, el: 9, fov: 36, shift: -0.2 }],
  [139.3, { tx: 0, ty: -10, tz: 0, d: 700, az: 4, el: 9, fov: 36, shift: -0.2 }],
]

/** 城市发光强度（手机段城市像屏幕里的光一样发白发亮；137.55 熄灯） */
const glowAt = (t: number) => seg(t, 133.6, 135.5) * (1 - seg(t, 137.5, 137.75))

export const city: Scene = {
  id: 'wd1-123-clay-city',
  start: 123.4,
  end: 139.3,
  note: '素模城市俯拍旋转；_MESSAGE_WAS_CLEAR 标签；HACKED 像素楼；抬起拉远成斜俯视 → 拉远露出手机 → 熄灯',
  render(f) {
    const { ctx, W, H, t } = f
    const c = memo('p3-city', buildCity)
    // HACKED 升起：126.9–127.6，每个像素错开一点
    const m = new THREE.Matrix4()
    c.cells.forEach((k, i) => {
      const p = ease.outCubic(seg(t, 126.9 + k.d * 0.4, 127.3 + k.d * 0.4))
      m.makeScale(CELL * 0.92, Math.max(0.01, k.h * p), CELL * 0.92)
      // 未升起时藏到地面以下，避免零高度方块和地面 z-fighting
      m.setPosition(k.x, p > 0 ? 0 : -5, k.z)
      c.hack.setMatrixAt(i, m)
    })
    c.hack.instanceMatrix.needsUpdate = true

    // 灯光：手机段城市发光；熄灯后城市变暗、桌面被照亮
    const glow = glowAt(t)
    const out = seg(t, 137.5, 137.8)
    c.mat.emissiveIntensity = 0.2 * glow
    c.mat.color.setScalar(lerp(0.9, 0.22, out))
    c.floorMat.color.setScalar(lerp(0.02, 0.55, out) * seg(t, 133.2, 134))
    c.hemi.intensity = lerp(1.45, 0.9, out)
    c.sun.intensity = lerp(1.7, 1.2, out)

    const o = orbitAt(t, KEYS)
    applyOrbit(c.cam, o)
    const img = renderShadowed(f, c.scene, c.cam, 0x000000, t < 133.4 ? 1 : 0)
    // 俯冲段虚焦；手机段整体轻微景深虚化
    const blur = 6 * (1 - seg(t, 123.5, 124.4)) + 1.2 * seg(t, 133.4, 134.5) + 4 * seg(t, 137.6, 138.0)
    ctx.save()
    if (blur > 0.2) ctx.filter = `blur(${blur}px)`
    ctx.globalAlpha = seg(t, 123.5, 123.8) * (1 - seg(t, 139.0, 139.3))
    ctx.drawImage(img, 0, 0, W, H)
    // 发光：同一帧大半径模糊后叠加（近似原片的 bloom）
    if (glow > 0.01) {
      ctx.globalCompositeOperation = 'lighter'
      ctx.globalAlpha *= 0.3 * glow
      ctx.filter = 'blur(14px)'
      ctx.drawImage(img, 0, 0, W, H)
    }
    ctx.restore()

    // _MESSAGE_WAS_CLEAR：锚在世界坐标里，方向沿 x 轴街道
    if (t >= 125.1 && t < 127.4) {
      const a = project(c.cam, -6, 0.5, 24, W, H)
      const b = project(c.cam, 4, 0.5, 24, W, H)
      const ang = Math.atan2(b.y - a.y, b.x - a.x)
      const size = 48
      ctx.save()
      ctx.translate(a.x, a.y)
      ctx.rotate(ang)
      ctx.font = `400 ${size}px ${FONT.mono}`
      ctx.letterSpacing = `${size * 0.08}px`
      const text = '_MESSAGE_WAS_CLEAR'
      const full = ctx.measureText(text).width
      const bw = (full + size * 0.9) * ease.outExpo(seg(t, 125.1, 125.35))
      ctx.fillStyle = WD1.cyan
      ctx.fillRect(0, -size * 0.95, bw, size * 1.3)
      ctx.fillStyle = '#000'
      ctx.textBaseline = 'alphabetic'
      ctx.fillText(typeOn(text, clamp((t - 125.15) / 1.0)), size * 0.4, 0)
      ctx.restore()
    }
  },
}
