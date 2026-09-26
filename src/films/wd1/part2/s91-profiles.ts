/**
 * 91.1–94.5  白底：散开的白块汇成一块白格面板铺满 → 白色 3D 人头侧像由远推近（穿过头部）
 * → "Citizen Profiles" 青底标题 + 条码柱 + 档案字段（A. Pearce）逐项打出，镜头缓推 → 94.1 推向 Status 一栏。
 * ASSET：drawHead() 是手写侧脸剪影 + 渐变 + 扫描线的近似，换成真实白模渲染图替换该函数即可。
 */
import type { Scene } from '../../../engine/types'
import { rng } from '../../../engine/math'
import { WD1 } from '../../../theme'
import { FONT, ease, ref, setFont, span, track, typed } from './common'

const HEAD: [number, number][] = [
  [-0.42, -0.1], [-0.4, -0.3], [-0.25, -0.46], [0, -0.5], [0.2, -0.45], [0.33, -0.3], [0.36, -0.12], [0.34, -0.08],
  [0.43, 0.05], [0.35, 0.1], [0.37, 0.18], [0.34, 0.22], [0.35, 0.3], [0.25, 0.37], [0.1, 0.37], [0.06, 0.52],
  [-0.26, 0.52], [-0.2, 0.26], [-0.38, 0.1],
]

/** ASSET：白模侧脸 */
function drawHead(ctx: CanvasRenderingContext2D, cx: number, cy: number, h: number, alpha: number) {
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.beginPath()
  HEAD.forEach(([x, y], i) => (i ? ctx.lineTo(cx + x * h, cy + y * h) : ctx.moveTo(cx + x * h, cy + y * h)))
  ctx.closePath()
  const g = ctx.createRadialGradient(cx + 0.1 * h, cy - 0.1 * h, h * 0.05, cx, cy, h * 0.6)
  g.addColorStop(0, '#fbfbfb')
  g.addColorStop(0.7, '#e6e6e6')
  g.addColorStop(1, '#bdbdbd')
  ctx.fillStyle = g
  ctx.fill()
  ctx.strokeStyle = 'rgba(80,80,80,0.18)'
  ctx.lineWidth = 1.2
  ctx.stroke()
  ctx.clip()
  // 扫描线质感 + 耳朵、眼窝的浅阴影
  ctx.fillStyle = 'rgba(0,0,0,0.035)'
  for (let y = cy - h * 0.5; y < cy + h * 0.55; y += 3) ctx.fillRect(cx - h * 0.5, y, h, 1)
  ctx.strokeStyle = 'rgba(90,90,90,0.3)'
  ctx.beginPath()
  ctx.ellipse(cx - 0.06 * h, cy + 0.02 * h, 0.05 * h, 0.09 * h, 0, 0, Math.PI * 2)
  ctx.stroke()
  ctx.fillStyle = 'rgba(0,0,0,0.08)'
  ctx.beginPath()
  ctx.ellipse(cx + 0.27 * h, cy - 0.06 * h, 0.05 * h, 0.03 * h, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

const BARS = (() => {
  const R = rng(9100)
  return Array.from({ length: 6 }, () => {
    const lines: [number, number, number][] = []
    let y = 0
    while (y < 240) {
      const h = R.range(1, 5)
      lines.push([y, h, R.int(20, 170)])
      y += h + R.range(1, 4)
    }
    return lines
  })
})()

const FIELDS: [string, number, string[]][] = [
  ['FILE NO.:', 254, ['O6B-3212-431KZ']],
  ['Name:', 270, ['A. Pearce']],
  ['Birthdate:', 286, ['May 2, 1974']],
  ['Status:', 322, ['Bench warrant for immediate arrest,', 'Computer fraud, Weapons, Grand Larceny']],
  ['Place of Birth:', 406, ['Belfast, Northern Ireland']],
  ['Citizenship:', 424, ['American']],
  ['Criminal Record:', 458, ['Cook County Correctional - 11 months', 'Has resisted arrest and fired on police.']],
  ['CAUTION:', 492, ['Known vigilante. Consider armed', 'and extremely dangerous.']],
]

/** 档案卡（坐标 = 93.9s 画面，缩放 1） */
export function drawProfile(ctx: CanvasRenderingContext2D, t: number) {
  // 标题
  setFont(ctx, 64, 500, FONT.sans, -0.03)
  const title = 'Citizen Profiles'
  const n = typed(title, t, 92.55, 30).n
  const tw = ctx.measureText(title.slice(0, n)).width
  ctx.fillStyle = WD1.cyan
  ctx.fillRect(132, 184, Math.min(416, tw + 8) * span(t, 92.5, 92.6), 60)
  ctx.fillStyle = '#000'
  ctx.fillText(title.slice(0, n), 134, 236)
  // 条码柱：从左往右依次长出（阶梯状），4、5 列染青
  BARS.forEach((lines, c) => {
    const x = 132 + c * 70
    const hmax = 240 * span(t, 92.6 + c * 0.08, 93.1 + c * 0.1, ease.outCubic)
    for (const [y, h, v] of lines) {
      if (y > hmax) break
      ctx.fillStyle = (c === 3 || c === 4) && t > 93.2 + (v % 7) * 0.03 ? `rgb(${v * 0.3},${Math.min(255, v + 90)},${Math.min(255, v + 80)})` : `rgb(${v},${v},${v})`
      ctx.fillRect(x, 244 + y, 58, h)
    }
  })
  // 字段
  ctx.font = `400 12px ${FONT.mono}`
  ctx.letterSpacing = '0.5px'
  FIELDS.forEach(([label, y, vals], i) => {
    const t0 = 93.0 + i * 0.1
    if (t < t0) return
    ctx.fillStyle = '#222'
    ctx.fillText(label, 564, y)
    vals.forEach((v, k) => {
      const tv = t0 + 0.1 + k * 0.12
      if (t < tv) return
      const m = typed(v, t, tv, 70).n
      const w = ctx.measureText(v).width
      ctx.fillStyle = WD1.cyan
      ctx.fillRect(724, y + k * 16 - 11, (w + 6) * span(t, tv, tv + 0.1), 14)
      ctx.fillStyle = '#123'
      ctx.fillText(v.slice(0, m), 727, y + k * 16)
    })
  })
  ctx.letterSpacing = '0px'
}

/** 档案卡镜头：锚点 A=(564,322)（Status 字段）映射到屏幕 (ox,oy)，缩放 s */
export function profileCam(t: number) {
  return {
    s: track(t, [
      [92.5, 0.55],
      [93.0, 0.6],
      [93.5, 0.8],
      [93.9, 1.0],
      [94.1, 1.4],
      [94.3, 2.2],
      [94.5, 3.2],
      [94.72, 4.6],
    ]),
    ox: track(t, [
      [92.5, 569],
      [93.0, 569],
      [93.5, 586],
      [93.9, 564],
      [94.1, 530],
      [94.3, 478],
      [94.5, 440],
      [94.72, 400],
    ]),
    oy: track(t, [
      [92.5, 327],
      [93.0, 327],
      [93.5, 330],
      [93.9, 322],
      [94.1, 305],
      [94.3, 290],
      [94.5, 300],
      [94.72, 310],
    ]),
  }
}

export const s91Profiles: Scene = {
  id: 'wd1-091-citizen-profiles',
  start: 91.1,
  end: 94.72,
  note: '白格面板 → 白模人头推近 → Citizen Profiles 档案卡',
  render({ ctx, t }) {
    ref(ctx)
    // 91.1–91.45：黑底上一块白格面板向四周扩展到铺满
    const pw = track(t, [
      [91.1, 330],
      [91.3, 332],
      [91.45, 1400],
    ])
    if (t < 91.45) {
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, 1280, 720)
      ctx.fillStyle = '#fff'
      ctx.fillRect(698 - pw / 2, 266 - (pw - 330) * 0.3, pw, 720)
      ctx.fillStyle = '#000'
      for (let k = 1; k < 4; k++) ctx.fillRect(698 - pw / 2 + (pw * k) / 4, 266, 1, 720)
      ctx.fillRect(698 - pw / 2, 400, pw, 1)
    } else {
      ctx.fillStyle = '#fcfcfc'
      ctx.fillRect(0, 0, 1280, 720)
    }
    // 人头：91.45 起由中上方推近，92.8 后穿过淡出
    if (t > 91.4) {
      const h = track(t, [
        [91.45, 330],
        [91.9, 450],
        [92.4, 680],
        [93.0, 1500],
      ])
      const hx = track(t, [
        [91.45, 650],
        [91.9, 620],
        [92.4, 570],
        [93.0, 560],
      ])
      const hy = track(t, [
        [91.45, 280],
        [91.9, 300],
        [92.4, 360],
        [93.0, 420],
      ])
      drawHead(ctx, hx, hy, h, span(t, 91.5, 91.75) * (1 - span(t, 92.5, 92.95)))
    }
    if (t > 92.45) {
      const c = profileCam(t)
      ctx.save()
      ctx.translate(c.ox, c.oy)
      ctx.scale(c.s, c.s)
      ctx.translate(-564, -322)
      drawProfile(ctx, t)
      ctx.restore()
    }
  },
}
