/**
 * WD1 123.4s–139.3s：白色素模城市（一个连续 3D 镜头）。
 * 123.4 从舞台黑场里俯冲进城市（虚焦）→ 124.3 起近乎正俯拍、缓慢旋转平移，
 * 125.1 青底 "_MESSAGE_WAS_CLEAR" 斜向标签（贴着街道方向，随城市移动）→ 126.9 街区里升起像素字 "HACKED" →
 * 129.5 起相机抬起成斜俯视 → 133.4 压低成近地平视并一路拉远，露出城市其实放在一部手机屏幕上 →
 * 137.55 城市「熄灯」（发光消失、变暗）→ 139.3 黑场。
 * "TURN OUT THE LIGHTS." 与远处天际线在 lights.ts。
 *
 * V2（G4a）：
 * - 城市换成真实芝加哥 OSM 建筑（buildRealCity，River North + 主河道 + Loop 北缘），位置/朝向由原片正射拼图与
 *   OSM 配准得到（见 layout.ts 的 CLAY_A_ALIGN 注释）。
 * - 相机：124.3–133.37 用反求 wd1-clay-city-a，133.4–138.97 用 wd1-clay-city-b（各自独立对齐，交界 133.25–133.5 混合）；
 *   123.4–124.3 俯冲段是手调，绕 a 段首帧的注视点做轨道运动并在 124.3 并入 a 段。
 * - 后期：renderShadowed + 2D blur/lighter 辉光 → post.ts 的 clayCity（阴影 + AO + 景深 + 辉光 + 颗粒），2D 近似已删。
 *
 * ASSET：手机是黑色长方体 + 黑屏（替换 `buildPhone()`）；桌面棋盘格地砖是 CanvasTexture（替换 `floorTexture()`）。
 */
import * as THREE from 'three'
import type { Scene } from '../../../engine/types'
import { clamp, ease, hash, lerp, seg } from '../../../engine/math'
import { memo } from '../../../engine/three-host'
import { alignTrack, cameraTrack } from '../../../engine/camera-track'
import { buildRealCity } from '../../../three/real-city'
import { mergePost, presets, renderWithPost } from '../../../three/post'
import { hasGeo } from '../../../assets/geo'
import { blockLayout, CLAY_A_ALIGN, CLAY_B_ALIGN, CLAY_RECT, HACKED_TRACK, PHONE_SCREEN, PHONE_T } from './layout'
import { FONT, typeOn } from '../../../fx/text'
import { WD1 } from '../../../theme'
import { alignPoint, blendPose, withFlatNormals, poseToCamera, projectTo, sampleTrackExt, smoothW, unprojectToPlane, type Pose } from '../part1/city-cam'

// HACKED 像素字（5×5）
const GLYPHS: Record<string, string[]> = {
  H: ['10001', '10001', '11111', '10001', '10001'],
  A: ['01110', '10001', '11111', '10001', '10001'],
  C: ['01111', '10000', '10000', '10000', '01111'],
  K: ['10001', '10010', '11100', '10010', '10001'],
  E: ['11111', '10000', '11110', '10000', '11111'],
  D: ['11110', '10001', '10001', '10001', '11110'],
}

/** ASSET：桌面棋盘格地砖（一格 ≈ 2.5 km，按 138.9 帧正射图量） */
function floorTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')!
  for (let y = 0; y < 2; y++)
    for (let x = 0; x < 2; x++) {
      g.fillStyle = (x + y) % 2 ? '#9a9a9a' : '#e8e8e8'
      g.fillRect(x * 128, y * 128, 128, 128)
    }
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(3.6, 3.6)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/** ASSET：手机（黑色机身 + 黑屏；屏幕 = 城市地面 y=0） */
function buildPhone() {
  const g = new THREE.Group()
  const [x0, z0, x1, z1] = PHONE_SCREEN
  const w = x1 - x0
  const d = z1 - z0
  const bezel = 170
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(w + bezel * 2, PHONE_T, d + bezel * 2),
    new THREE.MeshStandardMaterial({ color: 0x030303, roughness: 0.35, metalness: 0.3 }),
  )
  body.position.set((x0 + x1) / 2, -PHONE_T / 2 - 0.3, (z0 + z1) / 2)
  body.receiveShadow = true
  g.add(body)
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ color: 0x000000 }))
  screen.rotation.x = -Math.PI / 2
  screen.position.set((x0 + x1) / 2, -0.2, (z0 + z1) / 2)
  g.add(screen)
  return g
}

/** HACKED 像素：在 a 段反求坐标里量出的字底边，经同一对齐变换搬到世界；每格一栋小楼 */
function hackedCells() {
  const bl = new THREE.Vector3(...HACKED_TRACK.bl)
  const br = new THREE.Vector3(...HACKED_TRACK.br)
  const dir = br.clone().sub(bl)
  // 字的「上方」：拼图里垂直于底边、指向 -z 一侧
  const up = new THREE.Vector3(dir.z, 0, -dir.x).normalize().multiplyScalar(dir.length() / 35)
  const along = dir.clone().divideScalar(35)
  const W0 = alignPoint(bl, CLAY_A_ALIGN).setY(0)
  const cellA = alignPoint(along, { ...CLAY_A_ALIGN, offset: [0, 0, 0] })
  const cellU = alignPoint(up, { ...CLAY_A_ALIGN, offset: [0, 0, 0] })
  const cell = cellA.length()
  const cells: { x: number; z: number; h: number; d: number }[] = []
  'HACKED'.split('').forEach((ch, li) => {
    GLYPHS[ch].forEach((row, j) =>
      row.split('').forEach((b, i) => {
        if (b !== '1') return
        const n = li * 100 + j * 10 + i
        // 行 j=0 是字的顶行：离底边 4.5 格
        const p = W0.clone().addScaledVector(cellA, li * 6 + i + 0.5).addScaledVector(cellU, 4.5 - j)
        cells.push({ x: p.x, z: p.z, h: cell * (1.2 + hash(n) * 2.2), d: hash(n + 77) })
      }),
    )
  })
  // 字所占的平行四边形（外扩 1.5 格）：这里的原有建筑拆掉，给字腾出黑色空地（原片如此）
  const inside = (x: number, z: number) => {
    const q = new THREE.Vector3(x - W0.x, 0, z - W0.z)
    const a = q.dot(cellA) / (cell * cell)
    const u = q.dot(cellU) / (cell * cell)
    return a > -1.5 && a < 36.5 && u > -1.5 && u < 6.5
  }
  const yaw = Math.atan2(-cellA.z, cellA.x)
  return { cells, cell, inside, yaw }
}

/** 把落在 inside(x,z) 里的楼顶点压到地下（墙/屋顶顶点 y → -50） */
function carve(mesh: THREE.Mesh, inside: (x: number, z: number) => boolean) {
  const p = mesh.geometry.getAttribute('position') as THREE.BufferAttribute
  for (let i = 0; i < p.count; i++) if (inside(p.getX(i), p.getZ(i))) p.setY(i, -50)
  p.needsUpdate = true
}

function buildCity() {
  const scene = new THREE.Scene()
  const hk = hackedCells()
  let cityMat: THREE.MeshStandardMaterial
  if (hasGeo('chicago')) {
    const city = buildRealCity({ region: 'chicago', style: 'clay', rect: CLAY_RECT, jitter: 0.08, ground: 0x000000, water: 0x161616, minArea: 60 })
    carve(city.mesh!, hk.inside)
    withFlatNormals(city.mesh) // 给后期的法线/AO Pass 用（buildRealCity 不输出法线）
    city.mesh!.castShadow = true
    city.mesh!.receiveShadow = true
    scene.add(city.group)
    cityMat = city.mesh!.material as THREE.MeshStandardMaterial
  } else {
    // 资产缺失时回退到程序化楼块（V1 布局，尺度放大到米）
    const k = 12
    const blds = blockLayout(1403, 30, 16, 14, 4, { maxH: 34 })
    const geo = new THREE.BoxGeometry(1, 1, 1)
    geo.translate(0, 0.5, 0)
    cityMat = new THREE.MeshStandardMaterial({ color: 0xe6e6e6, roughness: 0.95 })
    const mesh = new THREE.InstancedMesh(geo, cityMat, blds.length)
    const m = new THREE.Matrix4()
    blds.forEach((b, i) => {
      m.makeScale(b.w * k, b.h * k, b.d * k)
      m.setPosition(b.x * k - 200, b.y0 * k, b.z * k - 900)
      mesh.setMatrixAt(i, m)
    })
    mesh.castShadow = mesh.receiveShadow = true
    scene.add(mesh)
  }
  cityMat.emissive = new THREE.Color(0xffffff)
  cityMat.emissiveIntensity = 0

  const geo = new THREE.BoxGeometry(1, 1, 1)
  geo.translate(0, 0.5, 0)
  const hackMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.9, flatShading: true, emissive: 0xffffff, emissiveIntensity: 0 })
  const hack = new THREE.InstancedMesh(geo, hackMat, hk.cells.length)
  hack.castShadow = true
  hack.receiveShadow = true
  scene.add(hack)

  scene.add(buildPhone())
  const floorMat = new THREE.MeshStandardMaterial({ map: floorTexture(), roughness: 0.6, color: 0x000000 })
  // 桌面只铺手机周围 ~18 km：再远就是透明背景，露出 lights.ts 画的天际线（原片桌面远处全黑）
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(18000, 18000), floorMat)
  floor.rotation.x = -Math.PI / 2
  floor.position.set((PHONE_SCREEN[0] + PHONE_SCREEN[2]) / 2, -PHONE_T, (PHONE_SCREEN[1] + PHONE_SCREEN[3]) / 2)
  scene.add(floor)

  const hemi = new THREE.HemisphereLight(0xffffff, 0x1a1a1a, 1.45)
  scene.add(hemi)
  const sun = new THREE.DirectionalLight(0xffffff, 1.7)
  const cx = (CLAY_RECT[0] + CLAY_RECT[2]) / 2
  const cz = -(CLAY_RECT[1] + CLAY_RECT[3]) / 2
  sun.position.set(cx - 1200, 2600, cz + 900)
  sun.target.position.set(cx, 0, cz)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  const sc = sun.shadow.camera as THREE.OrthographicCamera
  sc.left = -3200
  sc.right = 3200
  sc.top = 3200
  sc.bottom = -3200
  sc.near = 100
  sc.far = 8000
  sun.shadow.bias = -0.0005
  sun.shadow.normalBias = 3
  sun.shadow.radius = 4
  scene.add(sun)
  scene.add(sun.target)
  // 熄灯后只有手机周围的桌面被照亮（原片 138–139：桌面地砖只在手机附近可见，远处全黑）
  const spot = new THREE.SpotLight(0xffffff, 0, 0, Math.PI / 5, 1, 0)
  const [px0, pz0, px1, pz1] = PHONE_SCREEN
  spot.position.set((px0 + px1) / 2 + 3000, 16000, (pz0 + pz1) / 2 + 2000)
  spot.target.position.set((px0 + px1) / 2, -PHONE_T, (pz0 + pz1) / 2 + 1500)
  scene.add(spot)
  scene.add(spot.target)

  const cam = new THREE.PerspectiveCamera(30, 1920 / 1080, 5, 60000)
  return { scene, cam, hack, hackMat, hk, mat: cityMat, floorMat, hemi, sun, spot }
}

// ───────────────────────── 相机 ─────────────────────────
const tracks = () =>
  memo('p3-clay-tracks', () => ({
    a: alignTrack(cameraTrack('wd1-clay-city-a'), CLAY_A_ALIGN),
    b: alignTrack(cameraTrack('wd1-clay-city-b'), CLAY_B_ALIGN),
  }))

const newPose = (): Pose => ({ pos: new THREE.Vector3(), quat: new THREE.Quaternion(), fov: 30 })
const _pa = newPose()
const _pb = newPose()

/** 俯冲段（123.4–124.3，反求解不出）：绕 a 段首帧视线与主平面的交点做轨道运动，124.3 并入 a 段 */
function divePose(t: number, out: Pose): Pose {
  const { a } = tracks()
  // 以 a 段首帧按速度/角速度往回外推的姿态为基准（124.3 处 u→0 且导数为 0 → 速度连续）
  const p0 = sampleTrackExt(a, t, 0.9, newPose())
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(p0.quat)
  const pivot = p0.pos.clone().addScaledVector(fwd, (p0.pos.y - CLAY_A_ALIGN.offset[1]) / Math.max(0.2, -fwd.y))
  // u：1 = 123.55（最斜、最远），0 = 124.3
  const u = (1 - seg(t, 123.55, a.start)) ** 1.5
  const off = p0.pos.clone().sub(pivot)
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(p0.quat).setY(0).normalize()
  // 仰角放平 50°、方位转 -25°、距离 ×1.35
  const q = new THREE.Quaternion()
    .setFromAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(-25 * u))
    .multiply(new THREE.Quaternion().setFromAxisAngle(right, THREE.MathUtils.degToRad(-50 * u)))
  const dir = off.clone().normalize().applyQuaternion(q)
  out.pos.copy(pivot).addScaledVector(dir, off.length() * (1 + 0.35 * u))
  out.quat.copy(q).multiply(p0.quat)
  out.fov = p0.fov
  return out
}

/** t 时刻的相机姿态 */
export function clayPose(t: number, out: Pose = newPose()): Pose {
  const { a, b } = tracks()
  if (t < a.start) return divePose(t, out)
  // a → b 交界：a 末帧 133.367、b 首帧 133.4，两侧各外推、在 133.1–133.7 混合（vfov 30.3° → 33.1° 也在这里过渡）
  if (t < 133.1) return sampleTrackExt(a, t, 0.4, out)
  if (t > 133.7) return sampleTrackExt(b, t, 0.5, out)
  sampleTrackExt(a, t, 0.4, _pa)
  sampleTrackExt(b, t, 0.4, _pb)
  return blendPose(_pa, _pb, smoothW(t, 133.1, 133.7), out)
}

/** 城市发光强度（手机段城市像屏幕里的光一样发白发亮；137.55 熄灯） */
const glowAt = (t: number) => seg(t, 133.6, 135.5) * (1 - seg(t, 137.5, 137.75))

/** _MESSAGE_WAS_CLEAR 标签的两个世界锚点：按原片 125.5 帧的屏幕位置（底块左下、右端）反投影到主平面 */
const msgAnchors = () =>
  memo('p3-msg-anchors', () => {
    const cam = new THREE.PerspectiveCamera(30, 1920 / 1080, 5, 60000)
    poseToCamera(cam, clayPose(125.5))
    const h = CLAY_A_ALIGN.offset[1]
    return { a: unprojectToPlane(cam, 745 * 1.5, 690 * 1.5, h)!, b: unprojectToPlane(cam, 1145 * 1.5, 553 * 1.5, h)! }
  })

export const city: Scene = {
  id: 'wd1-123-clay-city',
  start: 123.4,
  end: 139.3,
  note: '素模城市俯拍旋转；_MESSAGE_WAS_CLEAR 标签；HACKED 像素楼；抬起拉远成斜俯视 → 拉远露出手机 → 熄灯',
  render(f) {
    const { ctx, W, H, t } = f
    const c = memo('p3-city-v2', buildCity)
    // HACKED 升起：126.9–127.6，每个像素错开一点
    const m = new THREE.Matrix4()
    const rot = new THREE.Matrix4().makeRotationY(c.hk.yaw)
    const s = c.hk.cell * 0.92
    c.hk.cells.forEach((k, i) => {
      // 升起 126.9–127.7；130.2 起（已出画）缩回地面，后面斜俯视/手机段看不到它
      const p = ease.outCubic(seg(t, 126.9 + k.d * 0.4, 127.3 + k.d * 0.4)) * (1 - seg(t, 130.2 + k.d * 0.3, 130.8 + k.d * 0.3))
      m.makeScale(s, Math.max(0.01, k.h * p), s).premultiply(rot)
      // 未升起时藏到地面以下，避免零高度方块和地面 z-fighting
      m.setPosition(k.x, p > 0 ? 0 : -50, k.z)
      c.hack.setMatrixAt(i, m)
    })
    c.hack.instanceMatrix.needsUpdate = true

    // 灯光：手机段城市发光；熄灯后城市变暗、桌面被照亮
    const glow = glowAt(t)
    const out = seg(t, 137.5, 137.8)
    for (const mat of [c.mat, c.hackMat]) {
      mat.emissiveIntensity = 0.35 * glow
      mat.color.setScalar(lerp(0.95, 0.22, out))
    }
    c.floorMat.color.setScalar(lerp(0.002, 0.3, out))
    c.spot.intensity = 2.2 * out
    c.hemi.intensity = lerp(1.25, 0.2, out)
    c.sun.intensity = lerp(1.35, 0.15, out)

    poseToCamera(c.cam, clayPose(t))
    const phone = t >= 133.4
    // 焦距：画面对焦点（俯拍段画面中心、手机段画面下部的城市）视线与城市平面的交点距离。
    // 不用 {uv} 自动对焦：HACKED 等高出主平面的物体扫过对焦点时焦点会跳，且近景「以聚代散」会在白楼周围晕出光环
    const fp = unprojectToPlane(c.cam, W / 2, H * (phone ? 0.8 : 0.55), phone ? 0 : CLAY_A_ALIGN.offset[1], W, H)
    const focus = fp ? fp.distanceTo(c.cam.position) : 1500
    const img = renderWithPost(
      f.three,
      c.scene,
      c.cam,
      mergePost(presets.clayCity, {
        time: t,
        clear: 0x000000,
        clearAlpha: phone ? 0 : 1, // 手机段背景透明：天际线（lights.ts）在城市之前画
        ao: { intensity: 0.6, radius: 14, thickness: 6, samples: 8, resolution: 0.35 },
        // 颗粒会弄脏原片纯黑的街道/背景（score 的 SSIM 对黑场噪声极敏感），不加
        grain: false,
        // 性能：SwiftShader 下 131 s 斜俯视一帧 3.1 s，MSAA 4→2、阴影贴图 4096→2048 后回到 3 s 以内
        msaa: 2,
        tone: { contrast: 1.1, exposure: (tt) => 0.95 + 0.05 * glowAt(tt) },
        dof: {
          // 手机段画面中心是天际线/字（透明、无深度），焦点取画面下部的城市
          focus,
          // 俯冲段虚焦（123.6 → 124.4 收拢）；斜俯视段远处移轴虚化；137.6 焦点拉到远处天际线 → 城市虚掉
          aperture: (tt) => 22 + 70 * (1 - seg(tt, 123.6, 124.4)) + 10 * seg(tt, 129.5, 132) - 18 * seg(tt, 133.3, 134) + 40 * seg(tt, 137.6, 138.0),
          maxBlur: 40,
        },
        // 阈值按「曝光前」线性亮度：白楼顶 ≈ 1.0，只让手机段 emissive 抬亮的部分发光
        bloom: { threshold: (tt) => 1.1 - 0.2 * glowAt(tt), strength: (tt) => 0.08 + 0.12 * glowAt(tt), radius: 0.2 },
      }),
    )
    ctx.save()
    ctx.globalAlpha = seg(t, 123.5, 123.75) * (1 - seg(t, 139.0, 139.3))
    ctx.drawImage(img, 0, 0, W, H)
    ctx.restore()

    // _MESSAGE_WAS_CLEAR：锚在城市主平面上，方向沿街道（随新相机重新投影）
    if (t >= 125.1 && t < 127.4) {
      const A = msgAnchors()
      const a = projectTo(c.cam, A.a, W, H)
      const b = projectTo(c.cam, A.b, W, H)
      const ang = Math.atan2(b.y - a.y, b.x - a.x)
      const size = 44
      ctx.save()
      ctx.translate(a.x, a.y)
      ctx.rotate(ang)
      ctx.font = `400 ${size}px ${FONT.mono}`
      ctx.letterSpacing = `${size * 0.08}px`
      const text = '_MESSAGE_WAS_CLEAR'
      const full = ctx.measureText(text).width
      const bw = (full + size * 0.9) * ease.outExpo(seg(t, 125.1, 125.35))
      ctx.fillStyle = WD1.cyan
      ctx.fillRect(0, -size * 1.05, bw, size * 1.3)
      ctx.fillStyle = '#000'
      ctx.textBaseline = 'alphabetic'
      ctx.fillText(typeOn(text, clamp((t - 125.15) / 1.0)), size * 0.4, -size * 0.1)
      ctx.restore()
    }
  },
}
