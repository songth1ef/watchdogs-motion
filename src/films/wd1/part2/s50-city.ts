/**
 * 50.0–53.3  承接 part1：俯拍 3D 城市 + 设施小标签 + 右侧 "centralized control" 列表。
 * 51.0 起城市由灰色交叉淡变为青色方块；52.0 起列表逐行（自上而下错开）从左侧擦除；
 * 52.4 起城市从左上向右下溶解，露出黑底接 "COMPUTER"。
 *
 * V2（G4a）：城市、相机、后期全部与 part1 s09-city 共用（真实芝加哥 OSM + grayPose：c 段反求末帧外推 +
 * 按标签轨迹反解的 TAIL/TAIL2），50.0 处与 part1 同一函数、同一时刻 → 无跳变。
 * 设施标签改为地面锚点投影（part1/tags.ts，与 s10 control 同一套锚点与残差修正）。
 * ASSET：城市与 part1 共用（part1/s09-city.ts 的 cityScene()），换真实模型只改那一处。
 */
import * as THREE from 'three'
import type { Scene } from '../../../engine/types'
import { cityScene, drawRoutes, grayPost, placeCam } from '../part1/s09-city'
import { TAG_KEYS, tagScreen } from '../part1/tags'
import { renderWithPost } from '../../../three/post'
import { tag } from '../../../fx/text'
import { WD1 } from '../../../theme'
import { clamp, ease, eraseHead, eraseTail, ref, setFont, span } from './common'

const LIST = ['subway lines', 'traffic lights', 'surveillance', 'electricity grids']
const RIGHT = 1152
const CYAN = new THREE.Color(0x1aa89a)
const CYAN_EMISSIVE = new THREE.Color(0x0b4a44)

export const s50City: Scene = {
  id: 'wd1-050-city-ctos-list',
  start: 50,
  end: 53.4,
  note: '承接 part1 的城市俯拍：灰→青、列表擦除、城市溶解',
  render({ ctx, t, three, W, H }) {
    const c = cityScene()
    placeCam(c.cam, t)
    // 灰 → 青（临时改共享材质，渲染后恢复，不影响 part1）
    const k = span(t, 50.85, 51.45, ease.inOutCubic)
    const mat = c.mesh?.material as THREE.MeshLambertMaterial | undefined
    const baseColor = mat?.color.clone()
    const baseEm = mat?.emissive.clone()
    if (mat) {
      mat.color.lerp(CYAN, k)
      mat.emissive.set(0x000000).lerp(CYAN_EMISSIVE, k)
    }
    const img = renderWithPost(
      three,
      c.scene,
      c.cam,
      grayPost(t, {
        clear: 0x000000,
        clearAlpha: 1,
        // 转青后楼沿亮边也带青色（原片 51.5：青色楼块 + 浅青描边）
        edge: { color: k > 0.5 ? 0x9ffff0 : 0xffffff },
      }),
    )
    if (mat && baseColor && baseEm) {
      mat.color.copy(baseColor)
      mat.emissive.copy(baseEm)
    }

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
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    drawRoutes(ctx, c.cam, c.routes, 1 - k)
    // 小标签：地面锚点按同一相机投影（与 s10 同一套，50.0 处连续）。52.3 以后文字消失只剩白条
    TAG_KEYS.forEach((gk, i) => {
      const p = tagScreen(i, t, c.cam)
      if (p.behind) return
      const shrink = 1 - span(t, 51.0, 52.6) * 0.3
      const size = 26 * shrink
      if (t < 52.3) tag(ctx, { text: gk.text, x: p.x, y: p.y + 36 * shrink, size, pointer: true })
      else {
        ctx.fillStyle = '#fff'
        ctx.fillRect(p.x, p.y + 36 * shrink - 4, gk.text.length * size * 0.55 * 1.5, 4)
      }
    })
    ctx.restore()

    ref(ctx)
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
