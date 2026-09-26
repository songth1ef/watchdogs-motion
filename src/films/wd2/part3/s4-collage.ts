/**
 * 108.35–113.1s：DedSec 霓虹拼贴。
 *
 * V2：原片是「摄像机持续下摇穿过一张巨型竖长拼贴画」，不是 5 个独立子镜头。
 * 这里把整张拼贴一次性画进 1920×COLLAGE_H 的离屏画布（按 key 缓存），每帧按 scrollY(t) 取一屏显示，
 * 再叠加逐帧抖动与独立运动的死神层。元素的画布坐标由原片 10fps 抽帧反推：
 * 画布 y = 该元素在原片某刻的屏幕 y + scrollY(那一刻)。
 *
 * 画布纵向分区（原片出现时刻）：
 *   0–1400     白纸机密文件 / 代码窗口 / ASCII 菱形 / 灰马赛克（108.35–109.3）
 *   900–1600   DedSec 圆标（右）+ 天蓝喷漆（左）（108.9–110.1）
 *   1350–2200  品红斜条纹、荧光绿/黄/紫喷漆、左侧黑色故障块、黑云、OK 手势（109.5–110.9）
 *   1900–2900  紫色 "Y"、左下黑云、ASCII oooo 块、尖叫眼镜男、眼球堆、一排假牙（110.8–112.2）
 *   2600–3350  灰色 DEDSEC TAKEOVER 弹窗阶梯、天蓝喷漆带、哥特字 DedSec（111.9–113.1）
 *   3050–3470  黑色墨浪带（112.6 起从下涌入），其下白色撕边 + 黑火苗（s5 接着用）
 * 死神（112.0 起）单独一层：从下方升起后停在画面上部挥镰，112.6 起缩小右移。
 * 插画为 ASSET 近似（art.ts）。
 */
import type { FrameCtx } from '../../../engine/types'
import { clamp, ease, lerp, rng } from '../../../engine/math'
import { FONT } from '../../../fx/text'
import { WD2 } from '../../../theme'
import { cloudSprite, drawDedsecCircle, okHandSprite, reaperSprite, screamerSprite, sprite, teethSprite } from './art'
import { fh } from './common'
import { asciiBlock, asciiDiamond, blackletter, codeText, drip, eyePile, greyDialog, mosaic, spray, stripes, typewriter, winFrame } from './collage-draw'

const MAG = WD2.magenta
const SKY = WD2.sky
const LIME = '#cdee3a'
const PUR = '#a83bd6'
const PAPER = '#eeeeea'

export const COLLAGE_W = 1920
export const COLLAGE_H = 4400

/** 下摇位置关键帧（秒 → 画布 y）。速度约 600 → 720 → 490 → 550 → 400 → 1000 px/s（末尾加速冲进墨浪），由原片元素轨迹量出 */
const SCROLL: [number, number][] = [
  [108.35, 0],
  [109.5, 680],
  [110.3, 1260],
  [111.2, 1700],
  [112.3, 2300],
  [112.55, 2400],
  [113.1, 2950],
]

export function scrollY(t: number) {
  if (t <= SCROLL[0][0]) return SCROLL[0][1]
  for (let i = 1; i < SCROLL.length; i++) {
    const [t1, y1] = SCROLL[i]
    const [t0, y0] = SCROLL[i - 1]
    if (t <= t1) return lerp(y0, y1, (t - t0) / (t1 - t0))
  }
  const [ta, ya] = SCROLL[SCROLL.length - 1]
  return ya + (t - ta) * 600
}

// ------------------------------------------------------------------ 画布内容

/** 机密文件（WARNING / NAVAL INVESTIGATIVE / UNCLASSIFIED），版式近似原片 108.3 右上 */
function warningDoc(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  g.fillStyle = '#f7f7f4'
  g.fillRect(x, y, w, h)
  g.strokeStyle = '#222'
  g.lineWidth = 2
  g.strokeRect(x, y, w, h)
  g.fillStyle = '#111'
  g.font = `900 64px ${FONT.sans}`
  g.fillText('WARNING', x + 150, y + 110)
  g.font = `700 30px ${FONT.sans}`
  g.fillText('NAVAL INVESTIGATIVE', x + 120, y + 160)
  g.beginPath()
  g.arc(x + 70, y + 90, 40, 0, Math.PI * 2)
  g.lineWidth = 4
  g.stroke()
  typewriter(g, x + 30, y + 220, 36, 10, 21)
  g.font = `900 44px ${FONT.sans}`
  g.fillStyle = '#333'
  g.fillText('UNCLASSIFIED', x + 150, y + h - 60)
}

/** 竖排字符列（原片 0.47W 处那条 "$ + H I N M E M W C { l d + f 6" 竖列） */
function charColumn(g: CanvasRenderingContext2D, x: number, y0: number, y1: number, seed: number) {
  const R = rng(seed)
  const cs = '$+HINMEWC{ld+f6+WStr=%&'
  g.font = `400 34px ${FONT.plex}`
  g.fillStyle = '#1a1a1a'
  for (let y = y0; y < y1; y += 44) g.fillText(cs[R.int(0, cs.length - 1)], x, y)
}

/** 火焰 / 墨浪尖齿边：沿 (x0,yA)→(x1,yB) 连续画曲线，dir=-1 齿尖朝上。调用前需已 moveTo 起点 */
export function flameEdge(g: CanvasRenderingContext2D, x0: number, x1: number, yA: number, yB: number, dir: number, seed: number, amp = 110) {
  const R = rng(seed)
  for (let x = x0; x < x1; ) {
    const w = R.range(60, 150)
    const y = lerp(yA, yB, (x - x0) / (x1 - x0))
    const y2 = lerp(yA, yB, Math.min(1, (x + w - x0) / (x1 - x0)))
    const hgt = R.range(0.3, 1) * amp
    g.quadraticCurveTo(x + w * 0.1, y + dir * hgt * 0.6, x + w * 0.35, y + dir * hgt)
    g.quadraticCurveTo(x + w * 0.45, y + dir * hgt * 0.2, x + w, y2)
    x += w
  }
}

function drawCollage(g: CanvasRenderingContext2D) {
  const W = COLLAGE_W
  // ---- 底色分区
  g.fillStyle = PAPER
  g.fillRect(0, 0, W, COLLAGE_H)
  g.fillStyle = LIME
  g.fillRect(560, 1950, 1360, 1300)
  // 纸面灰色细纹理（代码 / 公文）
  for (let i = 0; i < 9; i++) {
    const R = rng(900 + i)
    const x = R.pick([0, 20, 470, 960, 1460])
    typewriter(g, x, i * 160 - 40, 34, 7, 30 + i)
  }
  // 代码窗口（黑色标题栏）
  winFrame(g, -30, 220, 880, 520)
  codeText(g, 10, 280, 0, 24, 17, '#2a2a2a')
  winFrame(g, 20, 650, 860, 640)
  codeText(g, 50, 710, 30, 30, 17, '#2a2a2a')
  winFrame(g, 960, 320, 470, 560)
  typewriter(g, 980, 380, 38, 18, 44)
  // 左上公文：SECRET 章 + 黑色涂黑条
  g.save()
  g.translate(480, 150)
  g.rotate(-0.08)
  g.strokeStyle = '#222'
  g.lineWidth = 4
  g.strokeRect(-10, -50, 200, 70)
  g.fillStyle = '#111'
  g.font = `900 46px ${FONT.sans}`
  g.fillText('SECRET', 0, 0)
  g.restore()
  g.fillStyle = '#0a0a0a'
  g.fillRect(0, 396, 420, 22)
  g.fillRect(1180, 1090, 200, 26)
  g.fillRect(1060, 540, 180, 40)
  warningDoc(g, 1450, -60, 470, 820)
  // ASCII 菱形 / 心形群
  asciiDiamond(g, 640, 640, 16, 12)
  asciiDiamond(g, 520, 900, 14, 11)
  asciiDiamond(g, 700, 1050, 18, 12)
  asciiDiamond(g, 1260, 330, 10, 11, '^')
  // 灰马赛克块
  mosaic(g, 1440, 760, 11, 7, 44, 71)
  mosaic(g, 1060, 1280, 6, 3, 44, 72)
  // 两条竖线 + 字符列
  g.fillStyle = '#0a0a0a'
  g.fillRect(896, 0, 7, 2050)
  g.fillRect(1436, 0, 7, 1150)
  g.fillRect(1436, 880, 480, 7)
  charColumn(g, 850, 300, 2100, 5)
  // 天蓝喷漆（左）
  spray(g, 230, 1330, 320, 170, SKY, 0.85)
  spray(g, 420, 1480, 200, 110, SKY, 0.7)
  spray(g, 120, 1580, 200, 100, SKY, 0.6)
  // ---- 品红斜条纹 + 喷漆
  stripes(g, 900, 1290, 1020, 680, MAG, '#f4f4f0', 64, -1)
  stripes(g, 440, 1600, 470, 420, MAG, '#f4f4f0', 64, -1)
  spray(g, 1250, 1600, 720, 150, LIME, 0.9)
  spray(g, 700, 1720, 260, 150, '#f2f24a', 0.9)
  spray(g, 1500, 1920, 480, 230, PUR, 0.95)
  spray(g, 1080, 2020, 260, 150, MAG, 0.9)
  spray(g, 1150, 1850, 170, 150, '#d34de0', 0.9)
  // DedSec 圆标（压在条纹上）
  drawDedsecCircle(g, 1600, 1230, 330, 18)
  // 左侧黑色故障块的像素碎边（黑块本体是 110.25 起的跳入层，见 popIns）
  {
    const R = rng(311)
    for (let i = 0; i < 40; i++) {
      const s = R.pick([30, 44, 60])
      g.fillStyle = R.chance(0.5) ? '#060606' : R.pick(['#d9d9d6', '#9a9a98', '#f2f2ef'])
      g.fillRect(R.range(0, 520), R.range(2080, 2320), s, s)
    }
  }
  // ASCII 表情 / 小窗口（中左白区）
  g.fillStyle = '#f4f4f0'
  g.fillRect(460, 1990, 440, 330)
  g.fillStyle = '#111'
  g.font = `700 40px ${FONT.plex}`
  g.fillText('¯\\_(^)_/¯', 470, 2050)
  asciiBlock(g, 480, 2100, 8, '#111', 22)
  // 黑云（右）+ OK 手势
  // ---- 1900–2900：ASCII oooo、斜纹、紫 Y、左下黑云
  g.fillStyle = '#f4f4f0'
  g.fillRect(930, 2020, 560, 330)
  asciiBlock(g, 950, 2060, 13, '#1a1a1a', 22)
  stripes(g, 1280, 2080, 640, 420, SKY, '#141414', 48, 1)
  stripes(g, 900, 2380, 380, 300, PUR, LIME, 50, 1)
  g.save()
  g.filter = 'blur(8px)'
  g.font = `900 360px ${FONT.sans}`
  g.fillStyle = PUR
  g.fillText('Y', 300, 2150)
  g.restore()
  spray(g, 560, 1980, 120, 200, PUR, 0.9)
  // 尖叫眼镜男（右）
  g.drawImage(screamerSprite(560), 1380, 2270, 560, 700)
  // 眼球堆
  eyePile(g, 0, 2420, 700, 800, 33, 150)
  eyePile(g, 1000, 2500, 400, 300, 34, 120)
  // 左下黑云（压在眼球上）
  g.drawImage(cloudSprite(980, 5), -160, 1900, 980, 784)
  g.drawImage(cloudSprite(640, 8), 260, 2200, 640, 512)
  // ---- 2400–3350：灰弹窗阶梯（左下 → 右上）、天蓝带、DedSec
  for (let i = 0; i < 13; i++) greyDialog(g, 120 + i * 82, 3230 - i * 62, 540, 140)
  spray(g, 1500, 2600, 460, 160, SKY, 0.95)
  spray(g, 420, 2800, 160, 170, MAG, 0.95)
  // 右侧黑圆 + 方形螺旋
  g.fillStyle = '#0a0a0a'
  g.beginPath()
  g.arc(1930, 3000, 130, 0, Math.PI * 2)
  g.fill()
  g.strokeStyle = '#2d5f78'
  g.lineWidth = 12
  for (let k = 0; k < 6; k++) g.strokeRect(1720 + k * 22, 3120 + k * 22, 300 - k * 44, 300 - k * 44)
  // 竖向滴流线（品红 / 天蓝）
  {
    const R = rng(77)
    for (let i = 0; i < 16; i++) {
      const x = R.range(40, 1880)
      const y0 = R.range(1800, 2800)
      drip(g, x, y0, y0 + R.range(250, 600), R.range(10, 20), R.chance(0.55) ? SKY : MAG)
    }
    drip(g, 1640, 1180, 1960, 18, SKY)
    drip(g, 1560, 1300, 1700, 14, SKY)
  }
  // ---- 黑色墨浪带（上缘尖齿）
  g.fillStyle = '#050505'
  g.beginPath()
  g.moveTo(0, 3440)
  flameEdge(g, 0, W, 3440, 3300, -1, 91, 90)
  g.lineTo(W, 3580)
  g.lineTo(0, 3720)
  g.closePath()
  g.fill()
  // 墨浪以下：白色撕边 + 黑色火苗（向下）
  g.fillStyle = '#e9e9e6'
  g.fillRect(0, 3700, W, COLLAGE_H - 3700)
  g.fillStyle = '#050505'
  g.beginPath()
  g.moveTo(0, 3690)
  flameEdge(g, 0, W, 3690, 3560, 1, 92, 140)
  g.lineTo(W, 3540)
  g.lineTo(0, 3670)
  g.closePath()
  g.fill()
}

export function collageCanvas() {
  return sprite('s4-collage-v2', COLLAGE_W, COLLAGE_H, (g) => drawCollage(g))
}

/** 把拼贴画在 scrollY(t) 处的一屏画到 ctx（dx/dy 为抖动偏移，只取一屏源矩形） */
export function drawCollageView(ctx: CanvasRenderingContext2D, t: number, dx = 0, dy = 0) {
  const c = collageCanvas()
  const sy = clamp(Math.round(scrollY(t) - dy), 0, COLLAGE_H - 1080)
  ctx.fillStyle = PAPER
  ctx.fillRect(0, 0, 1920, 1080)
  ctx.drawImage(c, 0, sy, COLLAGE_W, 1080, Math.round(dx), 0, COLLAGE_W, 1080)
}

/** 快切抖动：110.0 之后每帧小位移 + 偶发大跳（原片逐帧跳，幅度约 10–60px） */
export function jitter(t: number): [number, number] {
  if (t < 109.95) return [0, 0]
  const big = fh(t, 9) < 0.18
  return [(fh(t, 1) - 0.5) * (big ? 80 : 18), (fh(t, 2) - 0.5) * (big ? 120 : 24)]
}

/**
 * 跳入层：原片这几块不是随下摇从画面下缘进来，而是在某一帧突然出现（快切），
 * 所以不画进静态画布，按时间在画布坐标上叠加。
 */
function popIns(ctx: CanvasRenderingContext2D, t: number, sy: number, dx: number) {
  ctx.save()
  ctx.translate(Math.round(dx), -sy)
  if (t >= 110.25) {
    // 左侧黑色故障块
    ctx.fillStyle = '#060606'
    ctx.fillRect(0, 1225, 430, 880)
    spray(ctx, 150, 1420, 160, 120, SKY, 0.55)
  }
  if (t >= 110.35) {
    ctx.drawImage(cloudSprite(860, 3), 1020, 1330, 860, 688)
    ctx.drawImage(okHandSprite(240), 1230, 1880, 240, 312)
    ctx.drawImage(okHandSprite(200), 1000, 1650, 200, 260)
  }
  if (t >= 111.35) {
    // 一排假牙：跳入后比下摇更快地向上飞（原片 111.5 在画面中部，112.0 已到顶）
    const up = (t - 111.35) * 320
    for (let i = 0; i < 4; i++) {
      const open = fh(t + i * 0.05, 30 + i) < 0.5 ? 0.5 : 0.75
      ctx.drawImage(teethSprite(340, open), 560 + i * 300, 2300 - up + (i % 2) * 40, 340, 306)
    }
  }
  if (t >= 112.6) {
    // 天蓝喷漆盖满上半屏 + 哥特字 DedSec（原片 112.6 起一帧喷满）
    const a = clamp((t - 112.6) / 0.08)
    ctx.globalAlpha = a
    spray(ctx, 960, 2860, 1100, 220, SKY, 1)
    ctx.fillStyle = SKY
    ctx.fillRect(0, 2900, 1920, 520)
    spray(ctx, 300, 2900, 260, 120, MAG, 0.9)
    blackletter(ctx, 290, 3230, 190, '#2d5f78')
    ctx.globalAlpha = 1
  }
  ctx.restore()
}

/** 死神层：112.0 从下方升起，112.35 停在上部挥镰，112.6 起缩小右移（原片镜头拉开） */
function reaper(ctx: CanvasRenderingContext2D, t: number, dx: number, dy: number) {
  if (t < 111.95) return
  const rise = ease.outCubic(clamp((t - 111.95) / 0.4))
  const back = ease.inOutCubic(clamp((t - 112.6) / 0.5))
  const w = lerp(1000, 720, back)
  const x = lerp(560, 900, back) + dx
  const y = lerp(820, 60, rise) + lerp(0, 230, back) + dy
  ctx.drawImage(reaperSprite(1000), x, y, w, w * 0.9)
}

export function drawS4(f: FrameCtx) {
  const { ctx, t } = f
  const [dx, dy] = jitter(t)
  drawCollageView(ctx, t, dx, dy)
  popIns(ctx, t, clamp(Math.round(scrollY(t) - dy), 0, COLLAGE_H - 1080), dx)
  reaper(ctx, t, dx, dy)
  // 墨浪带压在死神之上（死神下半身被黑浪吞没）
  const sy = clamp(Math.round(scrollY(t) - dy), 0, COLLAGE_H - 1080)
  const top = 3280
  if (sy + 1080 > top) {
    const c = collageCanvas()
    const y0 = top - sy
    ctx.drawImage(c, 0, top, COLLAGE_W, 1080 - y0, Math.round(dx), y0, COLLAGE_W, 1080 - y0)
  }
}
