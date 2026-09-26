/**
 * WD2 part2（43–94s）共用小工具：程序化人脸、数据小卡片、ctOS 档案面板、打字高亮、HUD 小字。
 * 这些都是本段内部实现；可上提到共享库的见 docs/shots/wd2-part2.md 末尾。
 */
import { clamp, hash, rng } from '../../../engine/math'
import { FONT, font, tracking } from '../../../fx/text'
import { WD2 } from '../../../theme'

/** 自有的画布缓存（不走 fx/canvas 的池，避免和别的镜头抢同名 key） */
const canvases = new Map<string, HTMLCanvasElement>()
export function cachedCanvas(key: string, w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) {
  let c = canvases.get(key)
  if (!c) {
    c = document.createElement('canvas')
    c.width = w
    c.height = h
    draw(c.getContext('2d')!)
    canvases.set(key, c)
  }
  return c
}

/** 帧号（原片 59.94fps，逐帧跳变按 60 算） */
export const fr = (t: number, fps = 60) => Math.floor(t * fps)

/**
 * ASSET 程序化证件照：浅灰底 + 深色头发 + 灰脸 + 深色肩膀。
 * res 是像素分辨率（马赛克格数），画出来天然就是马赛克。
 * 换真实素材：把这个函数改成从图片 drawImage 到 res×res 的小画布即可。
 */
export function faceTex(seed: number, res: number, forceDark = false) {
  return cachedCanvas(`face:${seed}:${res}:${forceDark}`, res, res, (c) => {
    const big = document.createElement('canvas')
    big.width = big.height = 128
    const g = big.getContext('2d')!
    const R = rng(seed * 7919 + 13)
    const darkBg = R.chance(0.25) || forceDark
    const bg = forceDark ? 0.03 : darkBg ? R.range(0.1, 0.3) : R.range(0.75, 0.92)
    const skin = R.range(0.6, 0.85)
    const hair = R.range(0.05, 0.4)
    const shirt = R.chance(0.6) ? R.range(0.05, 0.25) : R.range(0.6, 0.85)
    const gy = (v: number) => {
      const n = Math.round(clamp(v) * 255)
      return `rgb(${n},${n},${n})`
    }
    const bgGrad = g.createLinearGradient(0, 0, 128, 128)
    bgGrad.addColorStop(0, gy(bg + 0.06))
    bgGrad.addColorStop(1, gy(bg - 0.08))
    g.fillStyle = bgGrad
    g.fillRect(0, 0, 128, 128)
    const cx = 64 + R.range(-6, 6)
    // 深色底证件照（82–86s 大人脸）：头像放大占满画面
    if (forceDark) {
      g.translate(64, 60)
      g.scale(1.12, 1.12)
      g.translate(-64, -56)
    }
    const hw = R.range(26, 32)
    // 肩膀（深色外套两侧 + 浅色衬衫中间）
    g.fillStyle = gy(shirt)
    g.beginPath()
    g.moveTo(cx - 80, 128)
    g.quadraticCurveTo(cx - 62, 96, cx - 22, 94)
    g.lineTo(cx + 22, 94)
    g.quadraticCurveTo(cx + 62, 96, cx + 80, 128)
    g.fill()
    g.fillStyle = gy(0.85)
    g.beginPath()
    g.moveTo(cx - 16, 128)
    g.lineTo(cx - 12, 96)
    g.lineTo(cx + 12, 96)
    g.lineTo(cx + 16, 128)
    g.fill()
    // 脖子
    g.fillStyle = gy(skin - 0.15)
    g.fillRect(cx - 12, 78, 24, 18)
    // 头发：比脸大一圈的深色椭圆，只露出顶部和两侧
    g.fillStyle = gy(hair)
    g.beginPath()
    g.ellipse(cx, 50, hw + 5, R.range(36, 42), 0, 0, Math.PI * 2)
    g.fill()
    // 脸：带左右明暗
    const fg = g.createLinearGradient(cx - hw, 0, cx + hw, 0)
    fg.addColorStop(0, gy(skin - 0.12))
    fg.addColorStop(0.45, gy(skin + 0.08))
    fg.addColorStop(1, gy(skin - 0.2))
    g.fillStyle = fg
    g.beginPath()
    g.ellipse(cx, 60, hw, 33, 0, 0, Math.PI * 2)
    g.fill()
    // 眉眼、鼻影、嘴
    g.filter = 'blur(2px)'
    g.fillStyle = gy(skin - 0.38)
    g.beginPath()
    g.ellipse(cx - 11, 54, 7, 3.5, 0, 0, Math.PI * 2)
    g.ellipse(cx + 11, 54, 7, 3.5, 0, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = gy(skin - 0.15)
    g.fillRect(cx - 2, 58, 7, 14)
    g.fillStyle = gy(skin - 0.22)
    g.fillRect(cx - 8, 78, 16, 3)
    g.filter = 'none'
    g.setTransform(1, 0, 0, 1, 0, 0)
    // 颗粒噪声（让马赛克块灰度有自然起伏）
    const img = g.getImageData(0, 0, 128, 128)
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (hash(seed * 131 + i) - 0.5) * 26
      img.data[i] += n
      img.data[i + 1] += n
      img.data[i + 2] += n
    }
    g.putImageData(img, 0, 0)
    c.imageSmoothingEnabled = true
    c.drawImage(big, 0, 0, res, res)
  })
}

/** 画马赛克头像（关闭平滑放大） */
export function drawFace(ctx: CanvasRenderingContext2D, seed: number, res: number, x: number, y: number, w: number, h: number) {
  const tex = faceTex(seed, res)
  const prev = ctx.imageSmoothingEnabled
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(tex, x, y, w, h)
  ctx.imageSmoothingEnabled = prev
}

/**
 * 人脸档案卡：白边相框 + 马赛克头像 + 横穿眼部的白色遮挡条（原片 48–54s）。
 * 以卡片中心为原点绘制，size 为边长。
 */
export function faceCard(ctx: CanvasRenderingContext2D, seed: number, size: number, res = 12, band = true) {
  const b = size * 0.035
  ctx.fillStyle = '#eeeeea'
  ctx.fillRect(-size / 2, -size / 2, size, size)
  drawFace(ctx, seed, res, -size / 2 + b, -size / 2 + b, size - 2 * b, size - 2 * b)
  if (band) {
    ctx.fillStyle = 'rgba(245,245,240,0.93)'
    ctx.fillRect(-size / 2 + b, -size * 0.12, size - 2 * b, size * 0.1)
  }
}

/** HUD 等宽小字 */
export function mono(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size = 12, color = 'rgba(255,255,255,0.8)', track = 1) {
  font(ctx, size, 400, FONT.mono)
  tracking(ctx, track)
  ctx.fillStyle = color
  ctx.fillText(text, x, y)
  tracking(ctx, 0)
}

/**
 * 数据小卡片（街区地图、数据宇宙里满屏漂浮的那种 UI 碎片）：
 * 几种样式随机：横条列表、心形+条、头像+条、柱状图、灰块。以 (x,y) 为左上角，w 为宽度。
 */
export function dataCard(ctx: CanvasRenderingContext2D, seed: number, x: number, y: number, w: number, alpha = 1) {
  const R = rng(seed * 104729 + 7)
  const kind = R.int(0, 5)
  const h = w * R.range(0.45, 0.8)
  ctx.globalAlpha = alpha
  const white = 'rgba(240,240,240,0.95)'
  const grey = 'rgba(150,150,150,0.8)'
  if (kind === 0) {
    // 列表：白色标题条 + 几条灰线
    ctx.fillStyle = white
    ctx.fillRect(x, y, w, h * 0.16)
    ctx.fillStyle = grey
    const rows = R.int(3, 6)
    for (let i = 0; i < rows; i++) ctx.fillRect(x, y + h * (0.3 + i * 0.13), w * R.range(0.3, 0.95), Math.max(1, h * 0.05))
  } else if (kind === 1) {
    // 心形图标 + 白条（原片的「医疗/约会」卡）
    const s = h * 0.5
    ctx.fillStyle = white
    ctx.fillRect(x, y, s, s)
    ctx.fillStyle = '#111'
    heart(ctx, x + s / 2, y + s * 0.55, s * 0.32)
    ctx.fillStyle = white
    for (let i = 0; i < 3; i++) ctx.fillRect(x + s * 1.2, y + i * s * 0.36, w - s * 1.2, s * 0.2)
  } else if (kind === 2) {
    // 头像 + 两行
    const s = h * 0.7
    drawFace(ctx, R.int(1, 60), 8, x, y, s, s)
    ctx.strokeStyle = white
    ctx.lineWidth = 1
    ctx.strokeRect(x + 0.5, y + 0.5, s, s)
    ctx.fillStyle = grey
    ctx.fillRect(x + s * 1.2, y + s * 0.2, w - s * 1.3, 2)
    ctx.fillRect(x + s * 1.2, y + s * 0.5, (w - s * 1.3) * 0.6, 2)
  } else if (kind === 3) {
    // 柱状图
    ctx.fillStyle = white
    ctx.fillRect(x, y, w, Math.max(1.5, h * 0.06))
    const n = R.int(6, 12)
    for (let i = 0; i < n; i++) {
      const bh = h * R.range(0.15, 0.7)
      ctx.fillRect(x + (i * w) / n, y + h - bh, (w / n) * 0.55, bh)
    }
  } else if (kind === 4) {
    // 半透明灰块（文本框）
    ctx.fillStyle = 'rgba(120,120,120,0.55)'
    ctx.fillRect(x, y, w, h * 0.6)
    ctx.fillStyle = white
    ctx.fillRect(x + w * 0.08, y + h * 0.18, w * 0.5, Math.max(1, h * 0.06))
  } else {
    // 细框 + 圆点
    ctx.strokeStyle = grey
    ctx.lineWidth = 1
    ctx.strokeRect(x + 0.5, y + 0.5, w, h * 0.7)
    ctx.fillStyle = white
    ctx.beginPath()
    ctx.arc(x + w * 0.8, y + h * 0.35, h * 0.15, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillRect(x + w * 0.1, y + h * 0.3, w * 0.45, Math.max(1, h * 0.06))
  }
  ctx.globalAlpha = 1
  return h
}

/** 心形（中心 x,y，半宽 r） */
export function heart(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x, y + r)
  ctx.bezierCurveTo(x - r * 1.6, y - r * 0.2, x - r * 0.7, y - r * 1.4, x, y - r * 0.45)
  ctx.bezierCurveTo(x + r * 0.7, y - r * 1.4, x + r * 1.6, y - r * 0.2, x, y + r)
  ctx.fill()
}

/**
 * ctOS 档案面板（原片 49–54s 人脸卡右侧那块黑底竖条）。以左上角为原点，stage 0..1 控制信息逐层出现：
 * 0 ctOS 标志+红条 → 0.35 青条 → 0.55 白条+柱状图 → 0.75 心碎图标+表格 → 1 医疗记录。
 */
export function ctosPanel(ctx: CanvasRenderingContext2D, w: number, h: number, stage: number, frame: number) {
  ctx.fillStyle = 'rgba(8,8,8,0.92)'
  ctx.fillRect(0, 0, w, h)
  ctx.strokeStyle = 'rgba(220,220,220,0.7)'
  ctx.lineWidth = 1.2
  ctx.strokeRect(0, 0, w, h)
  const u = w / 100
  // ctOS 标志：白底黑字
  ctx.fillStyle = '#f2f2f2'
  ctx.fillRect(0, 0, 32 * u, 13 * u)
  font(ctx, 11 * u, 500, FONT.sans)
  tracking(ctx, -0.3 * u)
  ctx.fillStyle = '#111'
  ctx.fillText('ctOS', 2 * u, 10.8 * u)
  tracking(ctx, 0)
  const bar = (y: number, color: string, text: string, textColor = '#111') => {
    ctx.fillStyle = color
    ctx.fillRect(1 * u, y, 98 * u, 6.5 * u)
    mono(ctx, text, 3 * u, y + 5.2 * u, 5 * u, textColor, 0.4 * u)
  }
  bar(13.5 * u, WD2.red, 'POLITICAL DONATIONS', 'rgba(60,0,0,0.9)')
  if (stage < 0.35) {
    // 早期：红色小字行
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = 'rgba(200,30,30,0.6)'
      ctx.fillRect(8 * u, 30 * u + i * 9 * u, 60 * u, 1.5 * u)
    }
    return
  }
  bar(21 * u, WD2.teal, 'UTILITY RECORDS')
  if (stage < 0.55) {
    ctx.fillStyle = 'rgba(63,182,196,0.55)'
    for (let i = 0; i < 6; i++) ctx.fillRect(10 * u, 36 * u + i * 5 * u, (40 + hash(i + 3) * 45) * u, 1.2 * u)
    ctx.fillRect(6 * u, 36 * u, 3 * u, 4 * u)
    return
  }
  bar(28.5 * u, '#f0f0f0', 'SOCIAL MEDIA HISTORY')
  // 柱状图
  mono(ctx, 'STATUS UPDATES', 6 * u, 41 * u, 3 * u, 'rgba(255,255,255,0.6)', 0.2 * u)
  for (let i = 0; i < 9; i++) {
    const bh = (6 + hash(i * 17 + 1) * 10) * u
    ctx.fillStyle = 'rgba(160,160,160,0.9)'
    ctx.fillRect(10 * u + i * 9.5 * u, 58 * u - 14 * u, 3 * u, 14 * u)
    ctx.fillStyle = '#f2f2f2'
    ctx.fillRect(10 * u + i * 9.5 * u + 3.2 * u, 58 * u - bh, 3 * u, bh)
  }
  if (stage < 0.75) {
    for (let i = 0; i < 4; i++) {
      ctx.strokeStyle = 'rgba(200,200,200,0.35)'
      ctx.strokeRect(10 * u, 68 * u + i * 8 * u, 80 * u, 5 * u)
    }
    return
  }
  // 心碎图标 + 表格
  ctx.fillStyle = '#f2f2f2'
  ctx.fillRect(4 * u, 64 * u, 18 * u, 18 * u)
  ctx.fillStyle = '#111'
  heart(ctx, 13 * u, 74 * u, 5.5 * u)
  ctx.strokeStyle = '#f2f2f2'
  ctx.lineWidth = 1.2 * u
  ctx.beginPath()
  ctx.moveTo(13 * u, 67 * u)
  ctx.lineTo(11.5 * u, 72 * u)
  ctx.lineTo(14.5 * u, 75 * u)
  ctx.lineTo(12.5 * u, 80 * u)
  ctx.stroke()
  ctx.fillStyle = '#f2f2f2'
  for (let i = 0; i < 4; i++) ctx.fillRect(26 * u, 65 * u + i * 4.5 * u, 70 * u, 2.2 * u)
  mono(ctx, 'INSURANCE', 4 * u, 90 * u, 3.4 * u, 'rgba(255,255,255,0.8)', 0.2 * u)
  ctx.strokeStyle = 'rgba(200,200,200,0.4)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(4 * u, 92 * u)
  ctx.lineTo(96 * u, 92 * u)
  ctx.stroke()
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = 'rgba(200,200,200,0.45)'
    ctx.fillRect(8 * u, 98 * u + i * 6 * u, 30 * u, 1.2 * u)
    ctx.fillRect(50 * u, 98 * u + i * 6 * u, 20 * u + hash(i + frame * 0) * 20 * u, 1.2 * u)
  }
  if (stage >= 1 && h > 140 * u) {
    ctx.fillStyle = '#f2f2f2'
    ctx.fillRect(4 * u, 140 * u, 92 * u, 5 * u)
    mono(ctx, 'MEDICAL RECORDS', 6 * u, 144 * u, 3.6 * u, '#111', 0.2 * u)
  }
}

/**
 * 原片的「白块光标打字」：已打出的字白色，最新几个字被一块白底盖住、字是黑色，
 * 删字时同理从末尾倒退。n 为当前可见字符数（可为小数，取整）。
 */
export function blockType(ctx: CanvasRenderingContext2D, text: string, n: number, x: number, y: number, size: number, cursor = true, blockChars = 2) {
  const k = Math.max(0, Math.min(text.length, Math.round(n)))
  if (k <= 0) return
  const shown = text.slice(0, k)
  ctx.fillStyle = WD2.fg
  ctx.fillText(shown, x, y)
  if (cursor) {
    const head = text.slice(0, Math.max(0, k - blockChars))
    const x0 = x + ctx.measureText(head).width
    const x1 = x + ctx.measureText(shown).width
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(x0, y - size * 0.78, Math.max(size * 0.3, x1 - x0), size * 0.92)
    ctx.save()
    ctx.beginPath()
    ctx.rect(x0, y - size * 0.78, x1 - x0, size * 0.92)
    ctx.clip()
    ctx.fillStyle = '#000'
    ctx.fillText(shown, x, y)
    ctx.restore()
  }
}

/** 暗角 */
export function vignette(ctx: CanvasRenderingContext2D, W: number, H: number, strength = 0.6, color = '0,0,0') {
  const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 1.05)
  g.addColorStop(0, `rgba(${color},0)`)
  g.addColorStop(1, `rgba(${color},${strength})`)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
}
