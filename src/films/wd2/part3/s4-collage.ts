/**
 * 108.35–113.1s：DedSec 霓虹拼贴。摄像机持续下摇穿过一张巨型拼贴画；110.2–112.7 逐帧快切 / 抖动最强。
 * 分 5 个子镜头（切点对齐检测到的 110.2 / 112.7）：
 *  C1 108.35–109.85 代码窗口 + 打字机机密文件 + ASCII 菱形 → 天蓝喷漆、DedSec 圆标
 *  C2 109.85–110.85 品红斜条纹、荧光绿 / 黄 / 紫喷漆、黑云、OK 手势剪影、左侧黑色故障块
 *  C3 110.85–111.75 黑云 + 紫 "Y" 喷漆、会咬人的假牙、眼球堆、尖叫的眼镜男
 *  C4 111.75–112.45 一排假牙、灰对话框阶梯、死神挥镰、天蓝喷漆
 *  C5 112.45–113.1  天蓝底、哥特字 DedSec、死神
 * 所有插画为 ASSET 近似（art.ts）。快切抖动用 fh() 逐帧确定。
 */
import type { FrameCtx } from '../../../engine/types'
import { clamp, ease, lerp } from '../../../engine/math'
import { WD2 } from '../../../theme'
import { cloudSprite, drawDedsecCircle, okHandSprite, reaperSprite, screamerSprite, teethSprite } from './art'
import { fh, fr, paperBg } from './common'
import {
  asciiBlock,
  asciiDiamond,
  blackletter,
  codeText,
  drip,
  eyePile,
  greyDialog,
  mosaic,
  spray,
  stripes,
  typewriter,
  winFrame,
} from './collage-draw'

const MAG = WD2.magenta
const SKY = WD2.sky
const LIME = '#cdee3a'
const PUR = '#a83bd6'

/** 快切抖动：110.2 之后每帧一个小的整体位移 + 偶发大跳 */
function jitter(f: FrameCtx, base: number) {
  const { ctx, t } = f
  if (t < 110.2 || t > 112.7) return () => {}
  const big = fh(t, 9) < 0.32
  const dx = (fh(t, 1) - 0.5) * (big ? 90 : 26) + base
  const dy = (fh(t, 2) - 0.5) * (big ? 140 : 30)
  ctx.save()
  ctx.translate(dx, dy)
  return () => ctx.restore()
}

// ------------------------------------------------------------------ C1

function c1(f: FrameCtx) {
  const { ctx, t } = f
  const p = t - 108.35
  const dy = -700 * p
  paperBg(ctx, 1920, 1080, '#f2f2ef', 'rgba(120,120,115,0.3)')
  // 打字机机密文件（左上，随下摇上移）
  ctx.save()
  ctx.translate(70, 40 + dy)
  ctx.rotate(-0.01)
  winFrame(ctx, 0, 60, 720, 640)
  typewriter(ctx, 40, 130, 58, 20, 7)
  ctx.restore()
  // 代码窗口（左中）
  winFrame(ctx, -40, 300 + dy, 620, 700)
  codeText(ctx, 20, 360 + dy, 0, 40, 15)
  // ASCII 菱形群（中下）
  asciiDiamond(ctx, 500, 520 + dy, 18, 12)
  asciiDiamond(ctx, 360, 780 + dy, 12, 10)
  asciiBlock(ctx, 900, 40 + dy, 10, '#111', 20)
  // 右下角开始露出天蓝喷漆和 DedSec 圆标（下一子镜头的入口）
  const rise = clamp((p - 0.9) / 0.6)
  spray(ctx, 1500, 900 + dy - rise * 200, 260, 200, SKY, 0.5 * rise)
  drawDedsecCircle(ctx, 1650, 780 + dy - rise * 150, 200 * rise, 12)
  // 灰马赛克块
  mosaic(ctx, 700, 360 + dy, 8, 4, 46, 71)
}

// ------------------------------------------------------------------ C2

function c2(f: FrameCtx) {
  const { ctx, t } = f
  const end = jitter(f, 0)
  const p = t - 109.85
  const dy = -520 * p
  ctx.fillStyle = LIME
  ctx.fillRect(0, 0, 1920, 1080)
  // 品红斜条纹（右上大片）
  stripes(ctx, 250, -120 + dy, 1500, 620, MAG, '#ffffff', 70, -1)
  // 喷漆
  spray(ctx, 1150, 420 + dy, 360, 300, PUR, 0.85)
  spray(ctx, 300, 650 + dy, 320, 260, SKY, 0.7)
  spray(ctx, 900, 250 + dy, 260, 180, '#f2f24a', 0.6)
  // 黑云（右侧涌出）
  ctx.drawImage(cloudSprite(760, 3), 980, 40 + dy, 760, 600)
  ctx.drawImage(cloudSprite(560, 8), 520, 420 + dy, 560, 440)
  // 左侧黑色故障块（fh 逐帧变宽）
  ctx.fillStyle = '#050505'
  ctx.fillRect(0, 0, 120 + fh(t, 5) * 160, 1080)
  // OK 手势剪影
  ctx.drawImage(okHandSprite(220), 330, 760 + dy, 220, 286)
  // 滴流
  drip(ctx, 820, 420 + dy, 1080, 26, SKY)
  drip(ctx, 640, 520 + dy, 1080, 20, MAG)
  drip(ctx, 300, 300 + dy, 900, 18, MAG)
  // 竖排 ASCII（右侧）
  asciiBlock(ctx, 1500, 500 + dy, 14, '#111', 18)
  drawDedsecCircle(ctx, 620, 220 + dy, 200, 12)
  end()
}

// ------------------------------------------------------------------ C3

function c3(f: FrameCtx) {
  const { ctx, t } = f
  const end = jitter(f, 0)
  const p = t - 110.85
  const dy = -480 * p
  ctx.fillStyle = LIME
  ctx.fillRect(0, 0, 1920, 1080)
  stripes(ctx, 700, -80, 1400, 520, MAG, '#ffffff', 60, 1)
  stripes(ctx, 1300, 300, 700, 700, SKY, LIME, 46, -1)
  spray(ctx, 1180, 180 + dy, 360, 280, PUR, 0.85)
  // 眼球堆（底部）
  eyePile(ctx, 900, 600 + dy, 1000, 480, 33, 150)
  eyePile(ctx, 0, 720 + dy, 400, 360, 34, 130)
  // 黑云（顶部）
  ctx.drawImage(cloudSprite(720, 3), 850, -120 + dy, 720, 560)
  ctx.drawImage(cloudSprite(520, 5), 0, -60 + dy, 520, 420)
  // 紫色 "Y" 喷漆字
  ctx.save()
  ctx.font = `900 320px ${FONT_SANS}`
  ctx.fillStyle = PUR
  ctx.fillText('Y', 1050, 360 + dy)
  ctx.restore()
  // 会咬人的假牙
  ctx.drawImage(teethSprite(360, 0.8), 1080, 380 + dy, 360, 324)
  // 尖叫的眼镜男（右下）
  ctx.drawImage(screamerSprite(420), 1560, 520 + dy, 420, 525)
  // 滴流
  drip(ctx, 1160, 480 + dy, 1080, 26, SKY)
  drip(ctx, 980, 560 + dy, 1080, 22, MAG)
  end()
}

const FONT_SANS = '"Helvetica Neue", Helvetica, "Inter Tight", Arial, sans-serif'

// ------------------------------------------------------------------ C4

function c4(f: FrameCtx) {
  const { ctx, t } = f
  const end = jitter(f, 0)
  const p = t - 111.75
  const dy = -520 * p
  ctx.fillStyle = LIME
  ctx.fillRect(0, 0, 1920, 1080)
  spray(ctx, 500, 400 + dy, 420, 320, SKY, 0.8)
  spray(ctx, 1400, 300 + dy, 360, 280, SKY, 0.7)
  spray(ctx, 200, 700 + dy, 300, 240, MAG, 0.6)
  // 灰对话框阶梯
  for (let i = 0; i < 10; i++) greyDialog(ctx, 200 + i * 70, 260 + i * 46 + dy, 520, 120)
  // 一排假牙（顶部）
  for (let i = 0; i < 4; i++) ctx.drawImage(teethSprite(320, 0.6), 60 + i * 340, -60 + dy + (i % 2) * 30, 320, 288)
  // 死神挥镰（右侧大剪影）
  ctx.drawImage(reaperSprite(1000), 700, 220 + dy, 1000, 900)
  // 眼球（左下）
  eyePile(ctx, 0, 760 + dy, 380, 320, 44, 140)
  drip(ctx, 380, 480 + dy, 1080, 24, MAG)
  drip(ctx, 820, 420 + dy, 1080, 26, SKY)
  end()
}

// ------------------------------------------------------------------ C5

function c5(f: FrameCtx) {
  const { ctx, t } = f
  const end = jitter(f, 0)
  const p = t - 112.45
  const dy = -360 * p
  // 天蓝底 + 底部荧光绿
  ctx.fillStyle = SKY
  ctx.fillRect(0, 0, 1920, 1080)
  ctx.fillStyle = LIME
  ctx.fillRect(0, 760 + dy, 1920, 400)
  spray(ctx, 1500, 300 + dy, 300, 240, LIME, 0.5)
  // 哥特字 DedSec（左中，深蓝）
  blackletter(ctx, 120, 620 + dy, 200, '#14324a')
  // 死神挥镰（右）
  ctx.drawImage(reaperSprite(1100), 780, 120 + dy, 1100, 990)
  // 黑色墨浪从下方涌起（进入下一段）
  const inkP = clamp((t - 112.75) / 0.35)
  ctx.fillStyle = '#050505'
  ctx.beginPath()
  const baseY = lerp(1120, 620, ease.inCubic(inkP))
  ctx.moveTo(0, 1080)
  ctx.lineTo(0, baseY)
  for (let x = 0; x <= 1920; x += 80) {
    const wob = Math.sin(x * 0.012 + fr(t) * 0.3) * 60
    ctx.lineTo(x, baseY + wob)
  }
  ctx.lineTo(1920, 1080)
  ctx.closePath()
  ctx.fill()
  end()
}

export function drawS4(f: FrameCtx) {
  const t = f.t
  if (t < 109.85) return c1(f)
  if (t < 110.85) return c2(f)
  if (t < 111.75) return c3(f)
  if (t < 112.45) return c4(f)
  return c5(f)
}
