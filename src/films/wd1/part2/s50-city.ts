/**
 * 50.0–53.3  承接 part1：俯拍 3D 城市 + 设施小标签 + 右侧 "centralized control" 列表。
 * 51.0 起城市由灰色素模交叉淡变为青色半透明方块；52.0 起列表逐行（自上而下错开）从左侧擦除；
 * 52.4 起城市从左上向右下溶解，露出黑底接 "COMPUTER"。
 * ASSET：城市与 part1 共用（part1/s09-city.ts 的 cityScene()），换真实模型只改那一处。
 */
import * as THREE from 'three'
import type { Scene } from '../../../engine/types'
import { memo } from '../../../engine/three-host'
import { cityScene, placeCam } from '../part1/s09-city'
import { tag } from '../../../fx/text'
import { WD1 } from '../../../theme'
import { clamp, ease, eraseHead, eraseTail, ref, setFont, span } from './common'

const LABELS: [string, number, number][] = [
  ['TRAFFIC LIGHTS', 500, 86],
  ['NUCLEAR PLANT', 866, 148],
  ['CAMERAS', 400, 264],
  ['DOOR LOCK', 60, 310],
  ['SECURITY SYSTEM', 238, 550],
  ['BRIDGE CTRL', 432, 664],
  ['WATER SUPPLY', 812, 660],
]

/**
 * 与 part1 共用同一座城市和相机（part1/s09-city.ts 的 cityScene / placeCam，关键帧已延续到 53.4），
 * 保证 50.0s 处画面连续。这里只在渲染前后临时改材质颜色做「灰 → 青」，渲染完恢复，不影响 part1。
 */
function sharedCity() {
  const c = cityScene()
  return memo('wd1p2-city-shared', () => {
    let mat: THREE.MeshLambertMaterial | null = null
    let wireMat: THREE.LineBasicMaterial | null = null
    c.scene.traverse((o) => {
      if (o instanceof THREE.InstancedMesh) mat = o.material as THREE.MeshLambertMaterial
      if (o instanceof THREE.LineSegments) wireMat = o.material as THREE.LineBasicMaterial
    })
    // 标签锚点：按 50.0s 时的屏幕位置反投影到楼顶高度的平面
    placeCam(c.cam, 50)
    const ray = new THREE.Raycaster()
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -3)
    const anchors = LABELS.map(([, x, y]) => {
      ray.setFromCamera(new THREE.Vector2((x / 1280) * 2 - 1, -(y / 720) * 2 + 1), c.cam)
      const hit = new THREE.Vector3()
      ray.ray.intersectPlane(plane, hit)
      return hit
    })
    return { ...c, mat: mat!, wireMat: wireMat!, anchors }
  })
}

const LIST = ['subway lines', 'traffic lights', 'surveillance', 'electricity grids']
const RIGHT = 1152

export const s50City: Scene = {
  id: 'wd1-050-city-ctos-list',
  start: 50,
  end: 53.4,
  note: '承接 part1 的城市俯拍：灰→青、列表擦除、城市溶解',
  render({ ctx, t, three, W, H }) {
    const c = sharedCity()
    placeCam(c.cam, t)
    // 灰 → 青（临时改共享材质，渲染后恢复）
    const k = span(t, 50.85, 51.45, ease.inOutCubic)
    const baseColor = c.mat.color.clone()
    const baseEm = c.mat.emissive.clone()
    const baseWire = c.wireMat.color.clone()
    const baseOp = c.wireMat.opacity
    c.mat.color.lerp(new THREE.Color(0x1aa89a), k)
    c.mat.emissive.set(0x000000).lerp(new THREE.Color(0x0b4a44), k)
    c.wireMat.color.lerp(new THREE.Color(0x6ff5e6), k)
    c.wireMat.opacity = baseOp + 0.1 * k
    const img = three.render(c.scene, c.cam)
    c.mat.color.copy(baseColor)
    c.mat.emissive.copy(baseEm)
    c.wireMat.color.copy(baseWire)
    c.wireMat.opacity = baseOp

    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.drawImage(img, 0, 0, W, H)
    // 青色阶段外圈暗角（原片城市逐渐收成一个圆盘）
    const vr = 1.25 - k * 0.2 - span(t, 51.6, 53, ease.inOutCubic) * 0.35
    const g = ctx.createRadialGradient(W * 0.55, H * 0.5, H * 0.35 * vr, W * 0.55, H * 0.5, H * 0.95 * vr)
    g.addColorStop(0, 'rgba(0,0,0,0)')
    g.addColorStop(1, `rgba(0,0,0,${0.35 + 0.6 * k})`)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)
    ctx.restore()

    // 青色线路（part1 47.85s 起出现），城市转青后淡出
    ctx.save()
    ctx.strokeStyle = WD1.cyanDeep
    ctx.globalAlpha = 1 - k
    ctx.lineWidth = 2.2
    for (const r of c.routes) {
      ctx.beginPath()
      let started = false
      for (const p of r) {
        const v = p.clone().project(c.cam)
        if (v.z > 1) {
          started = false
          continue
        }
        const x = (v.x * 0.5 + 0.5) * W
        const y = (-v.y * 0.5 + 0.5) * H
        if (started) ctx.lineTo(x, y)
        else ctx.moveTo(x, y)
        started = true
      }
      ctx.stroke()
    }
    ctx.restore()

    ref(ctx)
    // 小标签：跟随 3D 锚点。52.3 以后文字消失只剩白条
    const v = new THREE.Vector3()
    LABELS.forEach(([text], i) => {
      v.copy(c.anchors[i]).project(c.cam)
      const x = (v.x * 0.5 + 0.5) * 1280
      const y = (-v.y * 0.5 + 0.5) * 720
      const shrink = 1 - span(t, 51.0, 52.6) * 0.3
      const size = 19 * shrink
      if (t < 52.3) tag(ctx, { text, x, y, size, pointer: true })
      else {
        ctx.fillStyle = '#fff'
        ctx.fillRect(x, y - 3, text.length * size * 0.55, 3)
      }
    })

    // 右侧列表
    const lineY = [320, 373, 428, 484]
    const drawRow = (text: string, baseY: number, boxed: boolean, p: number, typeP: number) => {
      setFont(ctx, 45, 500, undefined, -0.02)
      const full = ctx.measureText(text).width
      if (!boxed) {
        // 无底块行：从头部擦除，右对齐
        const shown = eraseHead(text, p)
        ctx.fillStyle = '#fff'
        ctx.fillText(shown, RIGHT - 6 - ctx.measureText(shown).width, baseY)
        return
      }
      // 青底行：底块右端固定、从左往右收窄；文字贴着底块左缘，从尾部被截掉
      const bw = (full + 20) * (1 - clamp(p)) * clamp(typeP * 3)
      if (bw <= 0.5) return
      const bx = RIGHT - bw
      ctx.fillStyle = WD1.cyan
      ctx.fillRect(bx, baseY - 39, bw, 52)
      ctx.save()
      ctx.beginPath()
      ctx.rect(bx, baseY - 39, bw, 52)
      ctx.clip()
      ctx.fillStyle = '#000'
      ctx.fillText(eraseTail(text, p * 1.15).slice(0, Math.round(text.length * typeP)), bx + 14, baseY)
      ctx.restore()
    }
    drawRow('centralized control', 272, false, span(t, 51.8, 52.3), 1)
    LIST.forEach((s, i) => {
      const typeP = i < 3 ? 1 : span(t, 50.65, 51.2)
      drawRow(s, lineY[i], true, span(t, 51.88 + i * 0.15, 52.28 + i * 0.15), typeP)
    })

    // 52.4 起城市从左上溶解（黑色斜向擦除）
    const d = span(t, 52.7, 53.4, ease.inOutCubic)
    if (d > 0) {
      ctx.save()
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      const x0 = -W * 0.4 + d * W * 2.2
      const gr = ctx.createLinearGradient(x0 - 700, 0, x0, H * 0.6)
      gr.addColorStop(0, 'rgba(0,0,0,1)')
      gr.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = gr
      ctx.fillRect(0, 0, W, H)
      ctx.restore()
    }
  },
}
