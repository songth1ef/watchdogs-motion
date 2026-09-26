/**
 * V2：8.3–18.4s 俯拍芝加哥 ctOS 地图（2D）。
 *
 * 对照原片 10.6s（1080p）重画：黑底 + 6px 灰色马赛克街区块（有亮区/暗区/空地）+ 轴向街道线（白/青/少量黄）
 * + 大量长直的白色网络连线与节点小圆 + 红色方框 + 左上黑色湖面（湖岸从左 y≈340 斜升到右上 x≈1480）。
 * 纹理坐标 = 「9.7s 时刻的屏幕坐标 + PAD」，相机只做绕焦点的缩放（原片 9.7→17.5 持续推近），
 * 这样构图可以直接按原片屏幕位置标定。
 *
 * 旧的 cityMapTexture()（ctos-city.ts）仍被 bay.ts 的 64 billion 切片使用，未改动。
 * ASSET：换真实素材 = 返回一张同尺寸的地图 canvas。
 */
import { lerp, seg, ease } from '../../../engine/math'
import { cached, fbm, h2, makeCanvas } from './lib'

export const PAD = 420
export const TW = 1920 + PAD * 2
export const TH = 1080 + PAD * 2

/** 湖岸（9.7s 屏幕坐标）：返回 x 处湖岸的 y，y 以上是湖 */
const SHORE: [number, number][] = [
  [-500, 460], [0, 340], [260, 300], [470, 236], [720, 214], [960, 192], [1120, 150], [1300, 84], [1480, 0], [1720, -170], [2500, -600],
]
export function shoreY(x: number) {
  for (let i = 0; i < SHORE.length - 1; i++) {
    const [x0, y0] = SHORE[i]
    const [x1, y1] = SHORE[i + 1]
    if (x <= x1) return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0) + Math.sin(x / 37) * 5
  }
  return -600
}
const isLake = (sx: number, sy: number) => sy < shoreY(sx)

export function ctosMapTexture() {
  return cached('wd2p1:ctosmap2d', () => {
    const { canvas, ctx } = makeCanvas(TW, TH)
    const img = ctx.createImageData(TW, TH)
    const d = img.data
    for (let i = 3; i < d.length; i += 4) d[i] = 255
    // 1) 马赛克街区块：6px 格，每格 4–5px 灰块，亮度/密度按大尺度噪声分区
    const C = 6
    for (let gy = 0; gy < TH / C; gy++)
      for (let gx = 0; gx < TW / C; gx++) {
        const sx = gx * C - PAD
        const sy = gy * C - PAD
        if (isLake(sx, sy)) continue
        const zone = fbm(sx / 260, sy / 260, 31, 3)
        const blk = h2(gx >> 3, gy >> 3, 32)
        // 暗区（公园/空地/铁路场）
        if (zone < 0.36 || blk < 0.15) continue
        const dens = (zone - 0.36) * 2.2
        if (h2(gx, gy, 33) > dens) continue
        let v = 18 + h2(gx, gy, 34) * 60 * (0.4 + dens)
        if (h2(gx >> 2, gy >> 2, 35) < 0.05) v += 80
        const s = h2(gx, gy, 36) < 0.3 ? C : C - 1.5
        const px0 = gx * C
        const py0 = gy * C
        for (let y = 0; y < s; y++)
          for (let x = 0; x < s; x++) {
            const k = ((py0 + y) * TW + px0 + x) * 4
            d[k] = d[k + 1] = d[k + 2] = Math.min(255, v)
          }
      }
    ctx.putImageData(img, 0, 0)
    ctx.save()
    ctx.translate(PAD, PAD)
    // 2) 亮铁路带（原片 10.6s 屏幕 y≈440、x 900–1700）
    for (let k = 0; k < 90; k++) {
      ctx.fillStyle = `rgba(200,200,200,${0.15 + h2(k, 1, 39) * 0.35})`
      ctx.fillRect(880 + k * 10, 430 + h2(k, 2, 39) * 8, 8, 10 + h2(k, 3, 39) * 16)
    }
    // 3) 轴向街道
    const street = (vertical: boolean, seed: number) => {
      let k = -PAD
      let i = 0
      const max = vertical ? 1920 + PAD : 1080 + PAD
      while (k < max) {
        k += 26 + h2(i, seed, 41) * 64
        i++
        const r = h2(i, seed, 42)
        const col = r < (k < 700 ? 0.4 : 0.15) ? '95,200,215' : r < 0.28 ? '205,190,90' : '225,228,228'
        const a = 0.16 + h2(i, seed, 43) * 0.42
        ctx.strokeStyle = `rgba(${col},${a})`
        ctx.lineWidth = h2(i, seed, 44) < 0.2 ? 2.2 : 1.2
        const from = -PAD + h2(i, seed, 45) * (h2(i, seed, 46) < 0.6 ? 0 : 900)
        const to = from + 700 + h2(i, seed, 47) * 2400
        ctx.beginPath()
        if (vertical) {
          ctx.moveTo(k, from)
          ctx.lineTo(k, to)
        } else {
          ctx.moveTo(from, k)
          ctx.lineTo(to, k)
        }
        ctx.stroke()
      }
    }
    street(true, 1)
    street(false, 2)
    // 4) 网络节点 + 长直连线
    const nodes: [number, number][] = []
    for (let i = 0; nodes.length < 220 && i < 2000; i++) {
      const x = -PAD + h2(i, 1, 51) * TW
      const y = -PAD + h2(i, 2, 51) * TH
      if (!isLake(x, y + 30)) nodes.push([x, y])
    }
    ctx.lineWidth = 1
    for (let i = 0; i < nodes.length; i++) {
      const n = 1 + Math.floor(h2(i, 3, 51) * 3)
      for (let k = 0; k < n; k++) {
        const j = Math.floor(h2(i, k + 4, 51) * nodes.length)
        const [x0, y0] = nodes[i]
        const [x1, y1] = nodes[j]
        if (Math.hypot(x1 - x0, y1 - y0) > 1300) continue
        ctx.strokeStyle = h2(i, k + 9, 51) < 0.25 ? 'rgba(95,200,215,0.35)' : `rgba(235,235,235,${0.1 + h2(i, k + 12, 51) * 0.22})`
        ctx.beginPath()
        ctx.moveTo(x0, y0)
        ctx.lineTo(x1, y1)
        ctx.stroke()
      }
    }
    // 5) 湖面压黑（街道线不进湖）
    ctx.fillStyle = '#000'
    ctx.beginPath()
    ctx.moveTo(-PAD, -PAD)
    for (let x = -PAD; x <= 1920 + PAD; x += 10) ctx.lineTo(x, shoreY(x))
    ctx.lineTo(1920 + PAD, -PAD)
    ctx.fill()
    // 湖岸亮线
    ctx.strokeStyle = 'rgba(220,220,220,0.45)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    for (let x = -PAD; x <= 1920 + PAD; x += 10) ctx.lineTo(x, shoreY(x) + 4)
    ctx.stroke()
    // 6) 节点小圆 + 零星亮点
    for (const [x, y] of nodes) {
      ctx.fillStyle = '#000'
      ctx.strokeStyle = 'rgba(240,240,240,0.85)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(x, y, 3.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }
    for (let k = 0; k < 900; k++) {
      const x = -PAD + h2(k, 1, 61) * TW
      const y = -PAD + h2(k, 2, 61) * TH
      if (isLake(x, y)) continue
      const s = h2(k, 3, 61) < 0.15 ? 5 : 3
      ctx.fillStyle = h2(k, 4, 61) < 0.12 ? 'rgba(215,205,90,0.8)' : `rgba(255,255,255,${0.5 + h2(k, 5, 61) * 0.5})`
      ctx.fillRect(x - s / 2, y - s / 2, s, s)
    }
    // 7) 红色方框（开口的方形括号）
    ctx.strokeStyle = 'rgba(232,64,43,0.95)'
    ctx.lineWidth = 3
    const reds: [number, number][] = [
      [1270, 212], [836, 364], [640, 478], [712, 490], [1004, 546], [1192, 540], [416, 614], [1494, 728], [380, 250], [1860, 620], [250, 900], [980, 980], [1640, 1040],
    ]
    for (const [x, y] of reds) {
      ctx.beginPath()
      ctx.moveTo(x, y + 12)
      ctx.lineTo(x, y)
      ctx.lineTo(x + 32, y)
      ctx.lineTo(x + 32, y + 32)
      ctx.lineTo(x + 12, y + 32)
      ctx.stroke()
    }
    ctx.restore()
    return canvas
  })
}

/** 相机：以焦点 F 为中心缩放（9.7s 时 s=1，屏幕与纹理 1:1） */
export function ctosMapCam(t: number) {
  const s = t < 9.7 ? lerp(0.9, 1, seg(t, 8.3, 9.7)) : t < 12.4 ? lerp(1, 1.3, seg(t, 9.7, 12.4)) : lerp(1.3, 2.1, ease.outQuad(seg(t, 12.4, 18.4)))
  return { fx: 1150, fy: lerp(700, 900, seg(t, 12.4, 18.4)), s }
}

export function drawCtosMap(ctx: CanvasRenderingContext2D, t: number, alpha = 1) {
  if (alpha <= 0) return
  const c = ctosMapCam(t)
  ctx.save()
  ctx.globalAlpha = alpha
  // 14.2 起与 hack.ts 的网格一起以约 124px/s 上移（原片镜头平移）
  ctx.translate(0, -124 * Math.max(0, t - 14.2))
  ctx.translate(c.fx, c.fy)
  ctx.scale(c.s, c.s)
  ctx.translate(-c.fx - PAD, -c.fy - PAD)
  ctx.drawImage(ctosMapTexture(), 0, 0)
  ctx.restore()
  // 推近后（12.4 起）原片地图明显变暗，只剩亮点与线
  const dim = 0.2 * seg(t, 12.4, 14.4)
  if (dim > 0) {
    ctx.fillStyle = `rgba(0,0,0,${dim * alpha})`
    ctx.fillRect(0, 0, 1920, 1080)
  }
}
