import type { Scene } from '../../../engine/types'
import { clamp, ease, seg } from '../../../engine/math'
import { WD1 } from '../../../theme'
import { FONT, font, measure, tag, tracking } from '../../../fx/text'
import { hatchRect } from '../../../fx/image'
import { spline } from './util'

/**
 * 城市上方的 2D 文字层：
 * 40.0–43.2  「centralOperatingSystem」斜纹白底打字 → 42.0 起 c/T/O/S 四个字母依次弹出、底块下滑出画
 * 42.0–47.0  字母收拢成「ctOS」并放大，46.75 起向左滑出
 * 46.55–50   「centralized control」右对齐打字 + 青底白字清单 + 等宽设施小标签
 */

export const centralOS: Scene = {
  id: 'wd1-040-centralos',
  start: 40.0,
  end: 43.25,
  note: 'centralOperatingSystem 斜纹白底打字，42.55s 起整块向下滑出画',
  render({ ctx, t }) {
    const text = 'centralOperatingSystem'
    const n = t < 40.2 ? Math.floor(15 * seg(t, 40.05, 40.2)) : Math.min(text.length, 15 + Math.floor((t - 40.15) * 20))
    // V2：原片 43.0 时底块已滑到 y≈860，比 V1 快
    const dy = 1000 * ease.inQuad(seg(t, 42.45, 43.1))
    const x = 259
    const size = 128
    const base = 212 + dy
    font(ctx, size, 400, FONT.sans)
    tracking(ctx, -size * 0.045)
    const shownW = measure(ctx, text.slice(0, n))
    const fullW = measure(ctx, text) + 14
    const bw = n >= text.length ? fullW : Math.min(fullW, Math.max(46, shownW + (n > 0 ? 280 : 46)))
    const top = 103 + dy
    ctx.fillStyle = '#fff'
    ctx.fillRect(x, top, bw, 132)
    hatchRect(ctx, x, top, bw, 132, 16, 'rgba(0,0,0,0.16)', 1.2)
    ctx.fillStyle = '#000'
    ctx.fillText(text.slice(0, n), x + 4, base)
    tracking(ctx, 0)
  },
}

/** ctOS：c、T 是小号大写，O、S 大号 */
export const ctos: Scene = {
  id: 'wd1-042-ctos',
  start: 42.0,
  end: 47.0,
  note: 'c T O S 依次弹出（分散），42.95s 收拢成 ctOS 并随城市推近放大，46.75s 向左滑出',
  render({ ctx, t }) {
    // V2：按 43.5/44.5/46.0 参考帧量字宽，整体比 V1 大约 12%
    const S = spline(t, [[42.0, 130], [42.95, 132], [43.6, 150], [44.5, 282], [46.2, 295], [47.0, 300]])
    // V2：原片 c/T 小型大写约为 O 高的 0.62，字重偏 500
    const small = S * 0.62
    const gather = ease.inOutCubic(seg(t, 42.85, 43.4))
    // V2：原片 46.8 已只剩 "OS" 露在左缘，滑出提前到 46.55
    const out = -1100 * seg(t, 46.55, 46.95) ** 1.5
    const base = 355
    const x0 = 262 + out
    // 分散布局（42.2–42.9 参考帧）与收拢布局
    const spread = [293, 432, 677, 1183]
    const packed = [x0, x0 + 0.39 * S, x0 + 0.76 * S, x0 + 1.55 * S]
    const letters = ['C', 'T', 'O', 'S']
    const t0 = [42.0, 42.2, 42.3, 42.45]
    ctx.fillStyle = 'rgba(235,235,235,0.93)'
    letters.forEach((ch, i) => {
      const a = seg(t, t0[i], t0[i] + 0.08)
      if (a <= 0) return
      const sz = i < 2 ? (gather > 0 ? small : 70) : gather > 0 ? S : 130
      const x = spread[i] + (packed[i] - spread[i]) * gather
      ctx.globalAlpha = a
      font(ctx, sz, 500, FONT.sans)
      tracking(ctx, -sz * 0.04)
      ctx.fillText(ch, x, base)
    })
    ctx.globalAlpha = 1
    tracking(ctx, 0)
  },
}

/** 右对齐打字：文字右缘固定，逐字向左长 */
function rightType(ctx: CanvasRenderingContext2D, text: string, n: number, right: number, base: number, size: number, box?: { top: number; h: number }) {
  if (n <= 0) return
  font(ctx, size, 400, FONT.sans)
  tracking(ctx, -size * 0.035)
  const shown = text.slice(0, n)
  const w = measure(ctx, shown)
  if (box) {
    const bw = w + size * 0.3
    ctx.fillStyle = WD1.cyan
    ctx.fillRect(right - bw, box.top, bw, box.h)
  }
  ctx.fillStyle = '#fff'
  ctx.fillText(shown, right - w - (box ? size * 0.12 : 0), base)
  tracking(ctx, 0)
}

// 设施标签的屏幕轨迹（从 48.7/49.2/49.6/50.0 参考帧量出的左上角），[时刻, x, y]
const TAGS: { text: string; t0: number; keys: [number, number, number][] }[] = [
  { text: 'TRAFFIC LIGHTS', t0: 48.55, keys: [[48.55, 570, 520], [48.7, 571, 456], [49.2, 569, 281], [49.6, 648, 168], [50, 751, 91]] },
  { text: 'CAMERAS', t0: 48.6, keys: [[48.6, 890, 830], [48.7, 828, 761], [49.2, 614, 602], [49.6, 576, 463], [50, 600, 355]] },
  { text: 'NUCLEAR PLANT', t0: 48.75, keys: [[48.75, 1075, 225], [49.2, 1154, 211], [49.6, 1224, 197], [50, 1298, 185]] },
  { text: 'WATER SUPPLY', t0: 48.8, keys: [[48.8, 1830, 936], [49.2, 1598, 960], [49.6, 1368, 984], [50, 1214, 950]] },
  { text: 'DOOR LOCK', t0: 48.95, keys: [[48.95, 145, 1040], [49.2, 108, 876], [49.6, 48, 614], [50, 91, 434]] },
  { text: 'SECURITY SYSTEM', t0: 49.15, keys: [[49.15, 548, 1144], [49.6, 446, 955], [50, 355, 787]] },
  { text: 'BRIDGE CTRL', t0: 49.45, keys: [[49.45, 700, 1085], [50, 648, 960]] },
]

export const control: Scene = {
  id: 'wd1-046-control',
  start: 46.55,
  end: 50,
  note: 'centralized control 右对齐打字；47.95 起青底白字 subway lines / traffic lights / surveillance；48.55 起等宽设施标签依次弹出并随镜头漂移',
  render({ ctx, t }) {
    const R = 1728
    const title = 'centralized control'
    const nT = t < 46.8 ? Math.floor(11 * seg(t, 46.55, 46.8)) : Math.min(title.length, 11 + Math.floor((t - 46.8) * 11))
    rightType(ctx, title, nT, R, 413, 66)
    const items: [string, number, number][] = [
      ['subway lines', 47.95, 425],
      ['traffic lights', 48.75, 509],
      ['surveillance', 49.38, 593],
    ]
    for (const [txt, t0, top] of items) {
      if (t < t0) continue
      const n = Math.max(1, Math.min(txt.length, Math.floor((t - t0) * 34)))
      rightType(ctx, txt, n, R, top + 58, 64, { top, h: 79 })
    }
    for (const g of TAGS) {
      if (t < g.t0) continue
      const x = spline(t, g.keys.map(([k, v]) => [k, v] as [number, number]))
      const y = spline(t, g.keys.map(([k, , v]) => [k, v] as [number, number]))
      tag(ctx, { text: g.text, x, y: y + 36, size: 26, p: clamp((t - g.t0) / 0.5), pointer: true })
    }
  },
}
