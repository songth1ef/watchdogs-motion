/**
 * ASSET：DedSec 手绘插画的程序化近似（骷髅、手、眼球、假牙、云、死神、OK 手势、尖叫男人、DedSec 圆标、公章）。
 * 原片是手绘漫画 + 半调网点，无法还原原画；这里用 Canvas 路径画风格化剪影，再用 fx/image.ts 的 halftone 做网点质感。
 *
 * 替换为真实插画：每个 `xxxSprite()` 只需返回一张 CanvasImageSource（尺寸由参数给出、透明底），
 * 把函数体换成「加载 PNG → 画进 sprite 画布」即可，调用方不用改。
 * sprite 按 key 缓存，只在第一次用到时绘制。
 */
import { rng } from '../../../engine/math'
import { halftone } from '../../../fx/image'
import { FONT } from '../../../fx/text'

const cache = new Map<string, HTMLCanvasElement>()

function mk(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = Math.ceil(w)
  c.height = Math.ceil(h)
  return c
}

export function sprite(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void) {
  const k = `${key}|${w}|${h}`
  let c = cache.get(k)
  if (!c) {
    c = mk(w, h)
    draw(c.getContext('2d', { willReadFrequently: true })!, w, h)
    cache.set(k, c)
  }
  return c
}

/**
 * 半调阴影：在 path 区域内按灰度 shade（0 亮 → 1 暗）打黑点。
 * shadeFn 在一张灰度临时画布上画出明暗，网点按其亮度生成。
 */
function halftoneShade(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  clip: (g: CanvasRenderingContext2D) => void,
  shadeFn: (s: CanvasRenderingContext2D) => void,
  cell = 7,
  color = '#000',
  invert = false,
) {
  const tmp = mk(w, h)
  const s = tmp.getContext('2d', { willReadFrequently: true })!
  s.fillStyle = '#fff'
  s.fillRect(0, 0, w, h)
  shadeFn(s)
  g.save()
  clip(g)
  g.clip()
  halftone(g, tmp, { x: 0, y: 0, w, h, cell, color, invert })
  g.restore()
}

// ------------------------------------------------------------------ 骷髅（带眼罩）

/** 眼罩骷髅；jaw 0..1 张嘴程度 */
export function skullSprite(w = 420, jaw = 0.3) {
  const j = Math.round(jaw * 10) / 10
  return sprite(`skull-${j}`, w, w * 1.35, (g, W, H) => {
    const cx = W / 2
    const u = W / 420
    g.lineJoin = 'round'
    // 头盖骨
    const cranium = (p: CanvasRenderingContext2D) => {
      p.beginPath()
      p.ellipse(cx, 190 * u, 190 * u, 180 * u, 0, Math.PI * 0.92, Math.PI * 2.08)
      p.lineTo(cx + 150 * u, 330 * u)
      p.lineTo(cx + 120 * u, 360 * u)
      p.lineTo(cx - 120 * u, 360 * u)
      p.lineTo(cx - 150 * u, 330 * u)
      p.closePath()
    }
    const jy = 360 * u + j * 70 * u
    const jawPath = (p: CanvasRenderingContext2D) => {
      p.beginPath()
      p.moveTo(cx - 135 * u, jy - 20 * u)
      p.lineTo(cx + 135 * u, jy - 20 * u)
      p.lineTo(cx + 120 * u, jy + 110 * u)
      p.quadraticCurveTo(cx, jy + 175 * u, cx - 120 * u, jy + 110 * u)
      p.closePath()
    }
    // 口腔（张嘴时的黑色）
    g.fillStyle = '#000'
    g.fillRect(cx - 120 * u, 340 * u, 240 * u, jy - 330 * u + 20 * u)
    g.fillStyle = '#f4f4f0'
    jawPath(g)
    g.fill()
    halftoneShade(g, W, H, jawPath, (s) => {
      const gr = s.createLinearGradient(0, jy, 0, jy + 170 * u)
      gr.addColorStop(0, '#fff')
      gr.addColorStop(1, '#333')
      s.fillStyle = gr
      s.fillRect(0, jy, W, 200 * u)
    }, 6 * u)
    // 下排牙
    g.fillStyle = '#f4f4f0'
    g.strokeStyle = '#000'
    g.lineWidth = 4 * u
    for (let i = 0; i < 8; i++) {
      const x = cx - 100 * u + i * 25 * u
      g.fillRect(x, jy - 22 * u, 22 * u, 34 * u)
      g.strokeRect(x, jy - 22 * u, 22 * u, 34 * u)
    }
    g.fillStyle = '#f4f4f0'
    cranium(g)
    g.fill()
    halftoneShade(g, W, H, cranium, (s) => {
      const gr = s.createLinearGradient(0, 250 * u, 0, 370 * u)
      gr.addColorStop(0, '#fff')
      gr.addColorStop(1, '#555')
      s.fillStyle = gr
      s.fillRect(0, 250 * u, W, 130 * u)
    }, 6 * u)
    // 上排牙
    for (let i = 0; i < 8; i++) {
      const x = cx - 100 * u + i * 25 * u
      g.fillStyle = '#f4f4f0'
      g.fillRect(x, 330 * u, 22 * u, 40 * u)
      g.strokeRect(x, 330 * u, 22 * u, 40 * u)
    }
    // 眼窝（左）与眼罩（右）
    g.fillStyle = '#000'
    g.beginPath()
    g.ellipse(cx - 75 * u, 210 * u, 58 * u, 52 * u, 0.1, 0, Math.PI * 2)
    g.fill()
    g.beginPath()
    g.ellipse(cx + 80 * u, 205 * u, 72 * u, 62 * u, -0.1, 0, Math.PI * 2)
    g.fill()
    // 眼罩系带
    g.lineWidth = 16 * u
    g.beginPath()
    g.moveTo(cx - 150 * u, 60 * u)
    g.lineTo(cx + 60 * u, 160 * u)
    g.moveTo(cx + 140 * u, 170 * u)
    g.lineTo(cx + 190 * u, 150 * u)
    g.stroke()
    // 鼻孔（倒心形）
    g.beginPath()
    g.moveTo(cx, 255 * u)
    g.quadraticCurveTo(cx - 30 * u, 300 * u, cx - 10 * u, 312 * u)
    g.lineTo(cx, 302 * u)
    g.lineTo(cx + 10 * u, 312 * u)
    g.quadraticCurveTo(cx + 30 * u, 300 * u, cx, 255 * u)
    g.fill()
    // 轮廓
    g.lineWidth = 3 * u
    cranium(g)
    g.stroke()
  })
}

// ------------------------------------------------------------------ 手

/** 张开的爪状手（手背朝前，手指向上弯）；flip 左右镜像 */
export function handSprite(w = 420, flip = false, reach = true) {
  return sprite(`hand-${flip}-${reach}`, w, w, (g, W, H) => {
    const u = W / 420
    if (flip) {
      g.translate(W, 0)
      g.scale(-1, 1)
    }
    const shape = (p: CanvasRenderingContext2D) => {
      p.beginPath()
      // 手掌
      p.moveTo(110 * u, 400 * u)
      p.quadraticCurveTo(60 * u, 280 * u, 90 * u, 200 * u)
      p.lineTo(330 * u, 190 * u)
      p.quadraticCurveTo(360 * u, 300 * u, 300 * u, 400 * u)
      p.closePath()
      // 手指：四指 + 拇指
      const fingers = reach
        ? [
            [95, 205, 60, 60, 26],
            [160, 195, 150, 25, 26],
            [225, 195, 240, 30, 25],
            [290, 200, 330, 70, 23],
            [320, 290, 405, 230, 24],
          ]
        : [
            [100, 205, 90, 20, 26],
            [160, 195, 160, 0, 26],
            [225, 195, 235, 5, 25],
            [290, 200, 310, 40, 23],
            [320, 290, 400, 250, 24],
          ]
      for (const [x0, y0, x1, y1, r] of fingers) {
        const a = Math.atan2(y1 - y0, x1 - x0)
        const nx = Math.cos(a + Math.PI / 2) * r * u
        const ny = Math.sin(a + Math.PI / 2) * r * u
        p.moveTo(x0 * u + nx, y0 * u + ny)
        p.lineTo(x1 * u + nx, y1 * u + ny)
        p.arc(x1 * u, y1 * u, r * u, a + Math.PI / 2, a - Math.PI / 2, true)
        p.lineTo(x0 * u - nx, y0 * u - ny)
        p.closePath()
      }
    }
    g.fillStyle = '#e9e9e6'
    shape(g)
    g.fill('nonzero')
    halftoneShade(g, W, H, shape, (s) => {
      const gr = s.createLinearGradient(0, 0, 0, H)
      gr.addColorStop(0, '#666')
      gr.addColorStop(0.45, '#ddd')
      gr.addColorStop(1, '#fff')
      s.fillStyle = gr
      s.fillRect(0, 0, W, H)
    }, 6 * u, '#222')
    g.strokeStyle = '#111'
    g.lineWidth = 3 * u
    shape(g)
    g.stroke()
    // 指节纹
    g.lineWidth = 2 * u
    g.beginPath()
    for (const [x, y] of [
      [130, 150],
      [190, 120],
      [250, 125],
      [300, 150],
    ]) {
      g.moveTo((x - 12) * u, y * u)
      g.quadraticCurveTo(x * u, (y + 8) * u, (x + 12) * u, y * u)
    }
    g.stroke()
  })
}

// ------------------------------------------------------------------ 眼球

export function eyeballSprite(w = 200, look = 0) {
  return sprite(`eye-${look}`, w * 1.6, w, (g, W, H) => {
    const r = H / 2 - 4
    const cx = W - r - 4
    const cy = H / 2
    // 视神经尾巴
    g.strokeStyle = '#111'
    g.lineWidth = r * 0.12
    g.beginPath()
    g.moveTo(cx - r * 0.8, cy + r * 0.3)
    g.bezierCurveTo(cx - r * 1.3, cy + r * 0.9, cx - r * 1.5, cy - r * 0.2, 4, cy + r * 0.4)
    g.stroke()
    const ball = (p: CanvasRenderingContext2D) => {
      p.beginPath()
      p.arc(cx, cy, r, 0, Math.PI * 2)
    }
    g.fillStyle = '#f6f6f2'
    ball(g)
    g.fill()
    halftoneShade(g, W, H, ball, (s) => {
      const gr = s.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.2, cx, cy, r * 1.05)
      gr.addColorStop(0, '#fff')
      gr.addColorStop(0.6, '#eee')
      gr.addColorStop(1, '#444')
      s.fillStyle = gr
      s.fillRect(0, 0, W, H)
    }, Math.max(4, r / 14))
    const ix = cx + r * (0.35 + look * 0.3)
    g.strokeStyle = '#111'
    g.lineWidth = r * 0.05
    g.beginPath()
    g.ellipse(ix, cy - r * 0.05, r * 0.3, r * 0.42, 0, 0, Math.PI * 2)
    g.stroke()
    g.fillStyle = '#111'
    g.beginPath()
    g.ellipse(ix + r * 0.04, cy - r * 0.05, r * 0.12, r * 0.2, 0, 0, Math.PI * 2)
    g.fill()
    g.lineWidth = r * 0.04
    ball(g)
    g.stroke()
  })
}

// ------------------------------------------------------------------ 假牙（带一对眼睛的咬牙）

export function teethSprite(w = 300, open = 0.5) {
  const o = Math.round(open * 4) / 4
  return sprite(`teeth-${o}`, w, w * 0.9, (g, W) => {
    const u = W / 300
    g.lineJoin = 'round'
    g.strokeStyle = '#111'
    g.lineWidth = 4 * u
    const gap = 30 * u + o * 60 * u
    // 口腔
    g.fillStyle = '#111'
    g.beginPath()
    g.ellipse(150 * u, 140 * u + gap / 2, 120 * u, gap / 2 + 20 * u, 0, 0, Math.PI * 2)
    g.fill()
    const row = (y: number, dir: number) => {
      g.fillStyle = '#f7f7f3'
      g.beginPath()
      g.moveTo(20 * u, y)
      g.quadraticCurveTo(150 * u, y - dir * 60 * u, 280 * u, y)
      g.lineTo(280 * u, y + dir * 30 * u)
      g.quadraticCurveTo(150 * u, y - dir * 25 * u, 20 * u, y + dir * 30 * u)
      g.closePath()
      g.fill()
      g.stroke()
      for (let i = 0; i < 9; i++) {
        const x = 35 * u + i * 26 * u
        const yy = y + dir * 30 * u - dir * Math.sin((i / 8) * Math.PI) * 30 * u
        g.fillStyle = '#f7f7f3'
        g.fillRect(x, dir > 0 ? yy : yy - 30 * u, 24 * u, 30 * u)
        g.strokeRect(x, dir > 0 ? yy : yy - 30 * u, 24 * u, 30 * u)
      }
    }
    row(110 * u, 1)
    row(180 * u + gap, -1)
    // 眼睛
    for (const [x, y] of [
      [110, 55],
      [175, 45],
    ]) {
      g.fillStyle = '#fff'
      g.beginPath()
      g.arc(x * u, y * u, 30 * u, 0, Math.PI * 2)
      g.fill()
      g.stroke()
      g.fillStyle = '#111'
      g.beginPath()
      g.arc((x + 8) * u, (y + 4) * u, 11 * u, 0, Math.PI * 2)
      g.fill()
    }
  })
}

// ------------------------------------------------------------------ 云（黑色半调积雨云）

export function cloudSprite(w = 600, seed = 1) {
  return sprite(`cloud-${seed}`, w, w * 0.8, (g, W, H) => {
    const R = rng(seed * 77 + 5)
    const circles: [number, number, number][] = []
    for (let i = 0; i < 14; i++) circles.push([R.range(0.2, 0.8) * W, R.range(0.25, 0.75) * H, R.range(0.12, 0.24) * W])
    const shape = (p: CanvasRenderingContext2D) => {
      p.beginPath()
      for (const [x, y, r] of circles) {
        p.moveTo(x + r, y)
        p.arc(x, y, r, 0, Math.PI * 2)
      }
    }
    // 白色描边（原片云朵外缘一圈白色细线）
    g.strokeStyle = '#f2f2f2'
    g.lineWidth = 8
    shape(g)
    g.stroke()
    g.fillStyle = '#0b0b0b'
    shape(g)
    g.fill()
    halftoneShade(g, W, H, shape, (s) => {
      s.fillStyle = '#000'
      s.fillRect(0, 0, W, H)
      const gr = s.createLinearGradient(W, H, W * 0.4, H * 0.3)
      gr.addColorStop(0, '#bbb')
      gr.addColorStop(1, '#000')
      s.fillStyle = gr
      s.fillRect(0, 0, W, H)
    }, 6, '#f0f0f0', true)
  })
}

// ------------------------------------------------------------------ 死神

export function reaperSprite(w = 900) {
  return sprite('reaper', w, w * 0.9, (g, W, H) => {
    const u = W / 900
    g.lineJoin = 'round'
    // 镰刀柄
    g.strokeStyle = '#111'
    g.lineWidth = 16 * u
    g.beginPath()
    g.moveTo(40 * u, 760 * u)
    g.lineTo(760 * u, 180 * u)
    g.stroke()
    g.strokeStyle = '#f2f2f2'
    g.lineWidth = 8 * u
    g.stroke()
    // 镰刀刃
    g.fillStyle = '#0a0a0a'
    g.beginPath()
    g.moveTo(740 * u, 190 * u)
    g.quadraticCurveTo(600 * u, 40 * u, 300 * u, 80 * u)
    g.quadraticCurveTo(560 * u, 90 * u, 700 * u, 230 * u)
    g.closePath()
    g.fill()
    // 斗篷
    const robe = (p: CanvasRenderingContext2D) => {
      p.beginPath()
      p.moveTo(400 * u, 260 * u)
      p.quadraticCurveTo(520 * u, 180 * u, 620 * u, 280 * u)
      p.lineTo(700 * u, 520 * u)
      p.quadraticCurveTo(760 * u, 700 * u, 720 * u, 810 * u)
      p.lineTo(330 * u, 810 * u)
      p.quadraticCurveTo(300 * u, 600 * u, 340 * u, 430 * u)
      p.closePath()
    }
    g.fillStyle = '#f3f3ef'
    robe(g)
    g.fill()
    halftoneShade(g, W, H, robe, (s) => {
      const gr = s.createLinearGradient(0, 200 * u, 0, 650 * u)
      gr.addColorStop(0, '#111')
      gr.addColorStop(0.55, '#aaa')
      gr.addColorStop(1, '#fff')
      s.fillStyle = gr
      s.fillRect(0, 0, W, H)
    }, 7 * u)
    g.strokeStyle = '#111'
    g.lineWidth = 4 * u
    robe(g)
    g.stroke()
    // 兜帽（纯黑）
    g.fillStyle = '#050505'
    g.beginPath()
    g.moveTo(360 * u, 330 * u)
    g.quadraticCurveTo(380 * u, 120 * u, 520 * u, 110 * u)
    g.quadraticCurveTo(620 * u, 130 * u, 600 * u, 330 * u)
    g.quadraticCurveTo(480 * u, 380 * u, 360 * u, 330 * u)
    g.fill()
    // 褶皱线
    g.beginPath()
    for (const x of [420, 500, 580, 640]) {
      g.moveTo(x * u, 420 * u)
      g.quadraticCurveTo((x + 20) * u, 620 * u, (x - 10) * u, 800 * u)
    }
    g.stroke()
    // 骨手握柄
    g.fillStyle = '#f3f3ef'
    for (const [x, y] of [
      [230, 590],
      [560, 330],
    ]) {
      g.beginPath()
      g.ellipse(x * u, y * u, 40 * u, 26 * u, -0.7, 0, Math.PI * 2)
      g.fill()
      g.stroke()
    }
  })
}

// ------------------------------------------------------------------ OK 手势剪影

export function okHandSprite(w = 200) {
  return sprite('okhand', w, w * 1.3, (g, W) => {
    const u = W / 200
    g.fillStyle = '#080808'
    g.strokeStyle = '#080808'
    g.lineCap = 'round'
    g.lineWidth = 34 * u
    g.beginPath()
    g.arc(70 * u, 150 * u, 38 * u, 0, Math.PI * 2)
    g.stroke()
    g.beginPath()
    g.moveTo(110 * u, 140 * u)
    g.lineTo(150 * u, 30 * u)
    g.moveTo(125 * u, 160 * u)
    g.lineTo(185 * u, 60 * u)
    g.moveTo(130 * u, 190 * u)
    g.lineTo(190 * u, 120 * u)
    g.stroke()
    g.beginPath()
    g.ellipse(115 * u, 200 * u, 55 * u, 45 * u, 0.4, 0, Math.PI * 2)
    g.fill()
    g.lineWidth = 50 * u
    g.beginPath()
    g.moveTo(110 * u, 220 * u)
    g.lineTo(80 * u, 250 * u)
    g.stroke()
  })
}

// ------------------------------------------------------------------ 尖叫男人（戴眼镜）

export function screamerSprite(w = 400) {
  return sprite('screamer', w, w * 1.25, (g, W) => {
    const u = W / 400
    g.lineJoin = 'round'
    g.strokeStyle = '#111'
    g.lineWidth = 4 * u
    const head = (p: CanvasRenderingContext2D) => {
      p.beginPath()
      p.ellipse(200 * u, 250 * u, 140 * u, 185 * u, -0.15, 0, Math.PI * 2)
    }
    g.fillStyle = '#f2f2ee'
    head(g)
    g.fill()
    halftoneShade(g, W, W * 1.25, head, (s) => {
      const gr = s.createLinearGradient(40 * u, 0, 360 * u, 0)
      gr.addColorStop(0, '#fff')
      gr.addColorStop(1, '#555')
      s.fillStyle = gr
      s.fillRect(0, 0, W, W * 1.25)
    }, 6 * u)
    head(g)
    g.stroke()
    // 头发（向后甩的线）
    g.beginPath()
    for (let i = 0; i < 12; i++) {
      const x = 90 * u + i * 20 * u
      g.moveTo(x, 110 * u)
      g.quadraticCurveTo(x + 60 * u, 40 * u, x + 140 * u, 30 * u + i * 4 * u)
    }
    g.stroke()
    // 眼镜
    g.lineWidth = 7 * u
    g.strokeRect(95 * u, 190 * u, 80 * u, 55 * u)
    g.strokeRect(210 * u, 185 * u, 80 * u, 55 * u)
    g.beginPath()
    g.moveTo(175 * u, 210 * u)
    g.lineTo(210 * u, 208 * u)
    g.stroke()
    g.fillStyle = '#111'
    g.beginPath()
    g.arc(140 * u, 220 * u, 9 * u, 0, Math.PI * 2)
    g.arc(255 * u, 215 * u, 9 * u, 0, Math.PI * 2)
    g.fill()
    // 张开的嘴
    g.beginPath()
    g.moveTo(140 * u, 330 * u)
    g.quadraticCurveTo(200 * u, 300 * u, 260 * u, 325 * u)
    g.quadraticCurveTo(250 * u, 390 * u, 200 * u, 395 * u)
    g.quadraticCurveTo(150 * u, 390 * u, 140 * u, 330 * u)
    g.fill()
    g.fillStyle = '#fff'
    g.fillRect(160 * u, 322 * u, 80 * u, 12 * u)
    // 眉头
    g.lineWidth = 6 * u
    g.beginPath()
    g.moveTo(100 * u, 175 * u)
    g.lineTo(175 * u, 190 * u)
    g.moveTo(215 * u, 180 * u)
    g.lineTo(285 * u, 160 * u)
    g.stroke()
  })
}

// ------------------------------------------------------------------ DedSec 圆标（圆环 + 两道折线）

export function drawDedsecCircle(g: CanvasRenderingContext2D, x: number, y: number, r: number, lw = 10, color = '#0a0a0a') {
  g.save()
  g.strokeStyle = color
  g.lineWidth = lw
  g.lineJoin = 'miter'
  g.beginPath()
  g.arc(x, y, r, 0, Math.PI * 2)
  g.stroke()
  g.beginPath()
  g.moveTo(x - r * 0.72, y - r * 0.05)
  g.lineTo(x - r * 0.1, y - r * 0.1)
  g.lineTo(x - r * 0.45, y + r * 0.55)
  g.lineTo(x + r * 0.1, y + r * 0.1)
  g.moveTo(x + r * 0.05, y - r * 0.95)
  g.lineTo(x + r * 0.05, y - r * 0.2)
  g.lineTo(x + r * 0.72, y - r * 0.2)
  g.lineTo(x + r * 0.2, y - r * 0.75)
  g.stroke()
  g.restore()
}

// ------------------------------------------------------------------ 公章（原片为美国国防部徽章的扫描件）

export function sealSprite(w = 700) {
  return sprite('seal', w, w, (g, W) => {
    const c = W / 2
    g.fillStyle = '#0c0c0c'
    g.beginPath()
    g.arc(c, c, c - 4, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = '#e9e9e6'
    g.beginPath()
    g.arc(c, c, c * 0.66, 0, Math.PI * 2)
    g.fill()
    // 环形文字
    g.fillStyle = '#e9e9e6'
    g.font = `700 ${W * 0.085}px ${FONT.sans}`
    g.textAlign = 'center'
    const text = 'DEPARTMENT OF DEFENSE'
    const span = Math.PI * 1.1
    for (let i = 0; i < text.length; i++) {
      const a = -Math.PI / 2 - span / 2 + (i / (text.length - 1)) * span
      g.save()
      g.translate(c + Math.cos(a) * c * 0.8, c + Math.sin(a) * c * 0.8)
      g.rotate(a + Math.PI / 2)
      g.fillText(text[i], 0, W * 0.03)
      g.restore()
    }
    // 中心：放射线 + 鹰形块
    g.strokeStyle = '#111'
    g.lineWidth = 3
    g.beginPath()
    for (let i = 0; i < 24; i++) {
      const a = -Math.PI + (i / 23) * Math.PI
      g.moveTo(c, c)
      g.lineTo(c + Math.cos(a) * c * 0.6, c + Math.sin(a) * c * 0.6)
    }
    g.stroke()
    g.fillStyle = '#111'
    g.beginPath()
    g.ellipse(c, c + c * 0.12, c * 0.18, c * 0.28, 0, 0, Math.PI * 2)
    g.fill()
    g.beginPath()
    g.moveTo(c - c * 0.5, c - c * 0.05)
    g.quadraticCurveTo(c - c * 0.25, c - c * 0.2, c, c + c * 0.05)
    g.quadraticCurveTo(c + c * 0.25, c - c * 0.2, c + c * 0.5, c - c * 0.05)
    g.lineTo(c + c * 0.35, c + c * 0.2)
    g.lineTo(c - c * 0.35, c + c * 0.2)
    g.fill()
  })
}
