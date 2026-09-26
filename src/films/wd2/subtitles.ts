/**
 * WD2 旁白字幕：原片全程在画面底部居中有一行白色粗体小字（Helvetica Neue Bold）。
 *
 * 字幕 = 纯数据表（WD2_SUBS）+ 一个渲染镜头（subtitleScene），在 wd2/index.ts 里放在 scenes 最后，
 * 盖在所有画面之上。改字幕只需改下面的表。
 *
 * 时间码来自原片 10fps 逐帧裁切字幕带人工读出，按 seek 取帧（与 pnpm snap / 播放器一致）对齐，误差约 ±0.05s。
 * V2（G2）：用 1080p 原片 30fps 字幕带亮度跳变复核，修正了 14 处偏差 ≥0.1s 的起止点（4.63/9.95/11.03/15.42/21.2/35.27/38.05/45.4/55.07/59.47/65.2/81.42 等）。
 */
import type { Scene } from '../../engine/types'
import { FONT } from '../../fx/text'

export interface SubCue {
  start: number
  end: number
  text: string
}

/** 全片旁白（逐句对照原片） */
export const WD2_SUBS: SubCue[] = [
  { start: 0.2, end: 4.05, text: 'In 2013, Chicago realized the promise of smart cities with ctOS,' },
  { start: 4.63, end: 9.95, text: 'a citywide operating system merging big data with surveillance, security, and transit' },
  { start: 9.95, end: 10.45, text: 'programs.' },
  { start: 11.03, end: 15.42, text: 'With a few hundred lines of code, hackers were able to hijack its central servers' },
  { start: 15.43, end: 16.95, text: 'and cripple the entire grid.' },
  { start: 17.1, end: 21.2, text: 'Many believed the attack would be a killing blow for smart city development.' },
  { start: 21.3, end: 22.15, text: 'They were wrong.' },
  { start: 22.9, end: 27.85, text: 'Coordinated from the heart of Silicon Valley, ctOS 2.0 has been implemented across' },
  { start: 27.9, end: 31.35, text: 'the United States, ushering in the “Internet of Things”.' },
  { start: 31.5, end: 35.27, text: '6.4 billion connected devices now serve as collection points,' },
  { start: 35.37, end: 37.95, text: 'mapping and recording our daily routines,' },
  { start: 38.05, end: 40.95, text: 'making a more secure...and more invasive system.' },
  { start: 41.1, end: 42.65, text: 'But who else is listening?' },

  { start: 43.17, end: 45.3, text: 'Big Brother no longer works alone.' },
  { start: 45.4, end: 50.87, text: 'Thousands of little brothers monitor and aggregate your every move, building a complete' },
  { start: 50.87, end: 54.87, text: 'digital profile of YOU, to be bought, sold or stolen in an instant.' },
  { start: 55.07, end: 59.37, text: 'Toys study your children, reporting their play habits back to marketers.' },
  { start: 59.47, end: 64.42, text: 'Appliances, consoles and home security systems give corporations a window into your' },
  { start: 64.42, end: 65.2, text: 'private life.' },
  { start: 65.42, end: 70.17, text: 'Control of your vehicle and mobile device can now be breached remotely by anyone,' },
  { start: 70.17, end: 70.92, text: 'at any time.' },
  { start: 71.07, end: 74.67, text: 'You may think that you are immune or underestimate the risks,' },
  { start: 74.67, end: 77.57, text: 'but your digital shadow is already compromised.' },
  { start: 77.57, end: 81.42, text: 'Insurance companies use algorithms to monitor your life habits' },
  { start: 81.57, end: 83.27, text: 'and limit or deny coverage.' },
  { start: 83.37, end: 87.17, text: 'Health providers determine if your cancer is worth treating.' },
  { start: 87.27, end: 90.67, text: 'Search results and news feeds are skewed to bias mood' },
  { start: 90.67, end: 95.3, text: 'and influence your vote, engineering social uprisings on a massive scale.' },
  { start: 95.37, end: 98.68, text: 'You are now less valuable than the data you produce.' },
  { start: 98.75, end: 100.38, text: 'This is the new reality.' },
  { start: 100.45, end: 102.55, text: 'Going dark is no longer an option.' },
  { start: 102.85, end: 107.37, text: 'With threats to personal freedom rising, many are stepping forward.' },
  { start: 107.37, end: 111.95, text: 'Whistleblowers, Activists and Hackers have drawn their battle lines,' },
  { start: 111.95, end: 114.28, text: 'putting the establishment on watch.' },
  { start: 114.35, end: 116.67, text: 'But are they threats themselves...' },
  { start: 116.75, end: 120.1, text: 'or have they become freedom’s last line of defense?' },
]

/** 字幕版式（1920×1080 逻辑坐标）：基线 y=978，居中；字号按原片实测宽度标定 */
export const SUB_STYLE = {
  baseline: 978,
  /** 标定句：原片 720p 下宽 581px → 1080p 下 871px */
  refText: 'Many believed the attack would be a killing blow for smart city development.',
  refWidth: 871,
  color: '#f2f2f2',
}

let sizeCache = 0
function subSize(ctx: CanvasRenderingContext2D) {
  if (sizeCache) return sizeCache
  ctx.save()
  ctx.font = `700 20px ${FONT.sans}`
  const w = ctx.measureText(SUB_STYLE.refText).width
  ctx.restore()
  // 字体还没加载完时宽度不可信，不缓存
  const s = (20 * SUB_STYLE.refWidth) / w
  if (document.fonts?.status === 'loaded') sizeCache = s
  return s
}

/** 画一行字幕（白字 + 很淡的黑色描边，原片白底上字幕依然可读就是靠这圈描边） */
export function drawSubtitle(ctx: CanvasRenderingContext2D, text: string, W = 1920, alpha = 1) {
  const size = subSize(ctx)
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.font = `700 ${size}px ${FONT.sans}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = 'rgba(0,0,0,0.92)'
  ctx.lineWidth = 4
  ctx.strokeText(text, W / 2, SUB_STYLE.baseline)
  ctx.fillStyle = SUB_STYLE.color
  ctx.fillText(text, W / 2, SUB_STYLE.baseline)
  ctx.restore()
}

export function subtitleAt(cues: SubCue[], t: number) {
  for (const c of cues) if (t >= c.start && t < c.end) return c
  return null
}

/** 字幕渲染镜头：放在 scenes 数组末尾。硬切出现/消失（原片即如此，无淡入淡出） */
export function subtitleScene(id: string, start: number, end: number, cues: SubCue[]): Scene {
  return {
    id,
    start,
    end,
    note: '旁白字幕层（数据见 cues）',
    render({ ctx, t, W }) {
      const c = subtitleAt(cues, t)
      if (c) drawSubtitle(ctx, c.text, W)
    },
  }
}
