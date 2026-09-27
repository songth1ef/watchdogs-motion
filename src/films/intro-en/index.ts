import type { Film, FrameCtx, Scene } from '../../engine/types'
import { clamp, ease, frameIndex, seg } from '../../engine/math'
import { renderFrame } from '../../engine/render'
import { offscreen } from '../../fx/canvas'
import { dotMatrix } from '../../fx/dot-matrix'
import { sliceGlitch } from '../../fx/glitch'
import { crossGrid, dotGrid } from '../../fx/grid'
import { pixelate } from '../../fx/image'
import { drawNetwork, makeNetwork } from '../../fx/network'
import { FONT, font, highlight, tag, tracking, typeOn } from '../../fx/text'
import { WD1 } from '../../theme'
import { wd1 } from '../wd1'
import { wd2 } from '../wd2'
import voice from '../../../assets/voice/intro-en/cues.json'

/**
 * 公开发布版（纯复刻、英文）的开头：约 1 分钟介绍实现方法。与中文版 ../intro 画面结构相同，文字全部英文，
 * 结尾过场改为「进入完整复刻」。各小节时间与旁白由 assets/voice/intro-en/cues.json 决定。
 */
export const INTRO_EN_TOTAL = voice.total
const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`

const CN = FONT.sans

function cn(ctx: CanvasRenderingContext2D, size: number, weight: number | string = 600) {
  font(ctx, size, weight, CN)
  tracking(ctx, 0)
}

/** 淡入淡出包络：镜头头尾各 fade 秒 */
const env = (f: FrameCtx, fade = 0.35) => clamp(Math.min(f.lt / fade, (f.dur - f.lt) / fade))

/** 小节标题：左上角「01 / 流程」+ 细线 */
function header(f: FrameCtx, no: string, title: string) {
  const { ctx, lt } = f
  tag(ctx, { text: no, x: 120, y: 150, size: 20, p: seg(lt, 0, 0.5) })
  cn(ctx, 56, 600)
  ctx.fillStyle = '#fff'
  ctx.fillText(typeOn(title, seg(lt, 0.15, 0.8)), 120, 235)
  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.fillRect(120, 262, 1680 * ease.outExpo(seg(lt, 0.2, 1.2)), 1)
}

// ---------------------------------------------------------------- 00 标题
const title: Scene = {
  id: 'intro-00-title',
  start: 0,
  end: 6,
  note: '标题',
  render(f) {
    const { ctx, lt } = f
    ctx.globalAlpha = env(f)
    crossGrid(ctx, { spacing: 120, size: 10, color: 'rgba(255,255,255,0.18)' })
    tag(ctx, { text: 'PROJECT / WATCHDOGS-MOTION', x: 160, y: 330, size: 22, p: seg(lt, 0.2, 1) })
    cn(ctx, 110, 700)
    ctx.fillStyle = '#fff'
    ctx.fillText(typeOn('Watch Dogs trailers', seg(lt, 0.4, 1.4)), 160, 480)
    highlight(ctx, { text: 'Recreated in code', x: 160, y: 610, size: 96, p: seg(lt, 1.2, 2.4), box: WD1.cyan, family: CN, weight: 700, cursor: true, frame: frameIndex(lt, 30) })
    cn(ctx, 34, 400)
    ctx.fillStyle = 'rgba(255,255,255,0.75)'
    ctx.fillText(typeOn('2 trailers · 151 s + 121 s · ~90 shots · every frame rendered by code', seg(lt, 2.2, 3.4)), 164, 720)
    // 开头直接强调：正片从几分几秒开始
    const jp = seg(lt, 0.3, 1.0)
    ctx.save()
    ctx.globalAlpha *= jp
    cn(ctx, 46, 700)
    const jt = `▶ Recreation starts at ${mmss(INTRO_EN_TOTAL)} — skip ahead anytime`
    ctx.fillStyle = WD1.cyan
    ctx.fillRect(160, 770, ctx.measureText(jt).width + 56, 92)
    ctx.fillStyle = '#000'
    ctx.fillText(jt, 188, 832)
    ctx.restore()
    const g = seg(lt, 0, 0.5)
    if (g < 1) sliceGlitch(ctx, { amount: 1 - g, seed: frameIndex(lt, 30), maxShift: 120 })
  },
}

// ---------------------------------------------------------------- 01 流程
const STEPS: [string, string][] = [
  ['Reference frames', 'frame grabs · shot detection'],
  ['Shot list', 'timecode · elements · motion'],
  ['Shared toolkit', 'type · glitch · maps · 3D'],
  ['Rebuild each shot', 'Canvas 2D + three.js'],
  ['Side-by-side check', 'recreation vs. source'],
]
const pipeline: Scene = {
  id: 'intro-01-pipeline',
  start: 6,
  end: 14,
  note: '实现流程',
  render(f) {
    const { ctx, lt } = f
    ctx.globalAlpha = env(f)
    header(f, '01', 'Process')
    const w = 300
    const gap = 42
    STEPS.forEach(([a, b], i) => {
      const p = seg(lt, 0.8 + i * 0.7, 1.5 + i * 0.7)
      if (p <= 0) return
      const x = 120 + i * (w + gap)
      const y = 420
      ctx.save()
      ctx.globalAlpha *= p
      ctx.strokeStyle = i === 4 ? WD1.cyan : 'rgba(255,255,255,0.7)'
      ctx.lineWidth = 2
      ctx.strokeRect(x, y, w, 190)
      font(ctx, 18, 400, FONT.mono)
      ctx.fillStyle = WD1.cyan
      ctx.fillText(`0${i + 1}`, x + 20, y + 40)
      cn(ctx, 36, 600)
      ctx.fillStyle = '#fff'
      ctx.fillText(a, x + 20, y + 100)
      cn(ctx, 20, 400)
      ctx.fillStyle = 'rgba(255,255,255,0.6)'
      ctx.fillText(b, x + 20, y + 150)
      if (i < 4) {
        ctx.strokeStyle = 'rgba(255,255,255,0.6)'
        ctx.beginPath()
        ctx.moveTo(x + w + 8, y + 95)
        ctx.lineTo(x + w + gap - 8, y + 95)
        ctx.lineTo(x + w + gap - 16, y + 87)
        ctx.moveTo(x + w + gap - 8, y + 95)
        ctx.lineTo(x + w + gap - 16, y + 103)
        ctx.stroke()
      }
      ctx.restore()
    })
    // 校准回环箭头
    const lp = seg(lt, 4.5, 5.5)
    if (lp > 0) {
      ctx.strokeStyle = WD1.cyan
      ctx.lineWidth = 2
      ctx.setLineDash([10, 8])
      const x0 = 120 + 4 * (w + gap) + w / 2
      const x1 = 120 + 3 * (w + gap) + w / 2
      ctx.beginPath()
      ctx.moveTo(x0, 620)
      ctx.lineTo(x0, 690)
      ctx.lineTo(x0 - (x0 - x1) * lp, 690)
      if (lp >= 1) ctx.lineTo(x1, 620)
      ctx.stroke()
      ctx.setLineDash([])
      cn(ctx, 26, 400)
      ctx.fillStyle = '#fff'
      ctx.fillText(typeOn('Adjust, re-check, repeat until it lines up', seg(lt, 5.2, 6.4)), x1 - 40, 750)
    }
  },
}

// ---------------------------------------------------------------- 02 原理
const THUMBS: [Film, number, string][] = [
  [wd1, 12.5, 'WD1 · 12.5s'],
  [wd1, 25, 'WD1 · 25s'],
  [wd1, 118, 'WD1 · 118s'],
  [wd2, 44, 'WD2 · 44s'],
  [wd2, 99, 'WD2 · 99s'],
]
/** 把某部片某一时刻真实渲染成缩略图（只渲一次，缓存） */
const thumbCache = new Map<string, HTMLCanvasElement>()
function thumb(f: FrameCtx, film: Film, t: number) {
  const key = `${film.id}@${t}`
  const hit = thumbCache.get(key)
  if (hit) return hit
  const big = offscreen(`intro-thumb-src`, 1920, 1080)
  renderFrame(film, t, big.ctx, f.three)
  const c = document.createElement('canvas')
  c.width = 480
  c.height = 270
  c.getContext('2d')!.drawImage(big.canvas, 0, 0, 480, 270)
  thumbCache.set(key, c)
  return c
}
const CODE = [
  'interface Scene {',
  '  start: number; end: number',
  '  render(f: { t, lt, p, ctx, three }): void',
  '}',
  '',
  '// same t → same frame, always',
  'renderFrame(film, t)  →  1920×1080',
]
const principle: Scene = {
  id: 'intro-02-principle',
  start: 14,
  end: 23,
  note: '核心原理：渲染是时间的纯函数',
  render(f) {
    const { ctx, lt } = f
    ctx.globalAlpha = env(f)
    header(f, '02', 'Every frame is a pure function of time')
    ctx.fillStyle = '#111416'
    ctx.fillRect(120, 320, 820, 330)
    font(ctx, 26, 400, FONT.plex)
    const total = CODE.join('\n').length
    let shown = Math.round(seg(lt, 0.6, 3.4) * total)
    CODE.forEach((line, i) => {
      const s = line.slice(0, Math.max(0, shown))
      shown -= line.length + 1
      ctx.fillStyle = line.startsWith('//') ? 'rgba(255,255,255,0.45)' : i === 6 ? WD1.cyan : '#e8eaea'
      ctx.fillText(s, 150, 375 + i * 40)
    })
    const bullets = ['Each shot depends only on t; randomness uses fixed seeds', 'So it can be scrubbed, exported frame by frame, compared', 'A film is a time-ordered list of shots, layered for cuts']
    bullets.forEach((b, i) => {
      const p = seg(lt, 3.4 + i * 0.6, 4.2 + i * 0.6)
      cn(ctx, 30, 400)
      ctx.fillStyle = `rgba(255,255,255,${p})`
      ctx.fillText(typeOn(b, p), 1000, 400 + i * 80)
      ctx.fillStyle = WD1.cyan
      if (p > 0) ctx.fillRect(980, 385 + i * 80, 8, 8)
    })
    THUMBS.forEach(([film, t, label], i) => {
      const p = seg(lt, 5.2 + i * 0.25, 5.8 + i * 0.25)
      if (p <= 0) return
      const x = 120 + i * 340
      const y = 730
      ctx.save()
      ctx.globalAlpha *= p
      ctx.drawImage(thumb(f, film, t), x, y, 320, 180)
      ctx.strokeStyle = 'rgba(255,255,255,0.3)'
      ctx.strokeRect(x + 0.5, y + 0.5, 320, 180)
      tag(ctx, { text: label, x, y: y + 214, size: 16 })
      ctx.restore()
    })
  },
}

// ---------------------------------------------------------------- 03 效果库
const net = () => makeNetwork({ seed: 3, count: 70, hubs: 5, box: { x: 0, y: 0, w: 440, h: 190 } })
const effects: Scene = {
  id: 'intro-03-effects',
  start: 23,
  end: 31,
  note: '共享效果库',
  render(f) {
    const { ctx, lt } = f
    ctx.globalAlpha = env(f)
    header(f, '03', 'A toolkit of effects, taken apart from the source')
    const fr = frameIndex(lt, 30)
    const cells: [string, (x: number, y: number, p: number) => void][] = [
      ['Typed highlight boxes', (x, y, p) => highlight(ctx, { text: 'centralOperatingSystem', x, y: y + 110, size: 44, p: (p * 1.6) % 1.3, cursor: true, frame: fr })],
      ['Glitch slicing', (x, y) => {
        font(ctx, 88, 800, FONT.sans)
        ctx.fillStyle = '#fff'
        ctx.fillText('WATCH_DOGS', x, y + 130)
        sliceGlitch(ctx, { amount: 0.7, seed: Math.floor(fr / 3), maxShift: 50, slices: 14, region: { x, y: y + 40, w: 520, h: 110 } })
      }],
      ['Dot-matrix type', (x, y, p) => dotMatrix(ctx, { text: 'VIRUS', x, y: y + 30, cell: 14, rows: 11, shape: 'square', p: Math.min(1, p * 2), seed: 7 })],
      ['Growing network graphs', (x, y, p) => {
        ctx.save()
        ctx.translate(x, y + 10)
        drawNetwork(ctx, net(), { p: (p * 1.4) % 1.2 })
        ctx.restore()
      }],
      ['Pixelate / halftone', (x, y, p) => {
        const src = thumb(f, wd2, 50)
        pixelate(ctx, src, x, y + 10, 340, 190, 6 + 40 * (0.5 + 0.5 * Math.sin(p * 6)))
      }],
      ['Procedural 3D city', (x, y) => ctx.drawImage(thumb(f, wd1, 45), x, y + 10, 340, 190)],
    ]
    cells.forEach(([label, draw], i) => {
      const col = i % 3
      const row = Math.floor(i / 3)
      const x = 120 + col * 580
      const y = 320 + row * 330
      const p = seg(lt, 0.6 + i * 0.3, 1.2 + i * 0.3)
      if (p <= 0) return
      ctx.save()
      ctx.globalAlpha *= p
      ctx.beginPath()
      ctx.rect(x - 10, y, 560, 230)
      ctx.clip()
      draw(x, y, seg(lt, 0.6 + i * 0.3, 7.5))
      ctx.restore()
      ctx.save()
      ctx.globalAlpha *= p
      cn(ctx, 24, 500)
      ctx.fillStyle = WD1.cyan
      ctx.fillText(label, x, y + 270)
      ctx.restore()
    })
  },
}

// ---------------------------------------------------------------- 04 分工
const LANES: [string, number, number, string][] = [
  ['WD1', 0, 50, 'Agent 1 · rating → Earth → city'],
  ['WD1', 50, 100, 'Agent 2 · COMPUTER → skull'],
  ['WD1', 100, 151, 'Agent 3 · NETWORK → logo'],
  ['WD2', 0, 43, 'Agent 4 · 2013 → ctOS'],
  ['WD2', 43, 94, 'Agent 5 · BIG BROTHER'],
  ['WD2', 94, 121, 'Agent 6 · DedSec'],
]
const team: Scene = {
  id: 'intro-04-team',
  start: 31,
  end: 40,
  note: '6 个 AI 子代理并行 + 主代理拼接',
  render(f) {
    const { ctx, lt } = f
    ctx.globalAlpha = env(f)
    header(f, '04', 'Six AI agents, working in parallel')
    const x0 = 420
    const scale = 1380 / 151
    LANES.forEach(([film, a, b, label], i) => {
      const y = 330 + i * 72
      const p = seg(lt, 0.5 + i * 0.25, 3.5 + i * 0.25)
      font(ctx, 22, 400, FONT.mono)
      ctx.fillStyle = 'rgba(255,255,255,0.6)'
      ctx.fillText(`${film}  ${String(a).padStart(3)}–${b}s`, 120, y + 30)
      ctx.fillStyle = 'rgba(255,255,255,0.08)'
      ctx.fillRect(x0 + a * scale, y, (b - a) * scale, 44)
      ctx.fillStyle = film === 'WD1' ? WD1.cyan : '#ffffff'
      ctx.fillRect(x0 + a * scale, y, (b - a) * scale * ease.inOutCubic(p), 44)
      cn(ctx, 20, 500)
      ctx.fillStyle = '#000'
      if (p > 0.5) ctx.fillText(label, x0 + a * scale + 14, y + 29)
    })
    font(ctx, 18, 400, FONT.mono)
    ctx.fillStyle = 'rgba(255,255,255,0.45)'
    for (let sec = 0; sec <= 150; sec += 25) ctx.fillText(`${sec}s`, x0 + sec * scale - 10, 312)
    const lines = ['Lead agent: engine + toolkit → dispatch → stitch the seams → unify 36 subtitle lines', 'Each agent matched its own time range against the source, shot by shot']
    lines.forEach((s, i) => {
      cn(ctx, 28, 400)
      ctx.fillStyle = '#fff'
      ctx.fillText(typeOn(s, seg(lt, 4.2 + i * 1.2, 5.6 + i * 1.2)), 120, 830 + i * 56)
    })
  },
}

// ---------------------------------------------------------------- 05 局限与下一步
const limits: Scene = {
  id: 'intro-05-limits',
  start: 40,
  end: 47,
  note: '做到了什么 / 还差什么 / 下一步',
  render(f) {
    const { ctx, lt } = f
    ctx.globalAlpha = env(f)
    header(f, '05', 'What version two adds')
    const col = (x: number, head: string, box: string, items: string[], t0: number) => {
      highlight(ctx, { text: head, x, y: 380, size: 40, p: seg(lt, t0, t0 + 0.8), box, family: CN, weight: 700 })
      items.forEach((s, i) => {
        cn(ctx, 28, 400)
        ctx.fillStyle = '#fff'
        ctx.fillText(typeOn(s, seg(lt, t0 + 0.5 + i * 0.35, t0 + 1.1 + i * 0.35)), x, 470 + i * 56)
      })
    }
    col(120, 'Close to 1:1', WD1.cyan, ['Layout and copy', 'Type weight, tracking, typing rhythm', 'Transition timing', 'Subtitle timing'], 0.4)
    col(700, 'New in V2', '#ffffff', ['Real Chicago + Bay Area (OSM)', 'NASA Earth · Natural Earth', '9 camera moves solved in Blender', '3D post · score-driven polish'], 1.4)
    col(1280, 'Still approximate', '#ffffff', ['Scanned-city detail', 'Hand-drawn DedSec art', 'Photos and faces', 'Some camera moves'], 2.4)
  },
}

// ---------------------------------------------------------------- 06 过场
const handoff: Scene = {
  id: 'intro-06-handoff',
  start: 47,
  end: 50,
  note: '进入对比',
  render(f) {
    const { ctx, lt } = f
    ctx.globalAlpha = env(f, 0.25)
    dotGrid(ctx, { spacing: 48, color: 'rgba(255,255,255,0.15)' })
    cn(ctx, 64, 700)
    ctx.fillStyle = '#fff'
    ctx.textAlign = 'center'
    ctx.fillText(typeOn('The full recreation', seg(lt, 0.1, 0.8)), 960, 470)
    ctx.textAlign = 'left'
    highlight(ctx, { text: 'WD1 → WD2', x: 560, y: 620, size: 44, p: seg(lt, 0.6, 1.4), box: WD1.cyan, family: CN, weight: 600 })
    highlight(ctx, { text: 'no original footage', x: 900, y: 620, size: 44, p: seg(lt, 0.9, 1.7), box: '#ffffff', family: CN, weight: 600 })
  },
}

// ---------------------------------------------------------------- 全程叠加：右上角倒计时 + 底部旁白字幕
const overlay: Scene = {
  id: 'intro-overlay',
  start: 0,
  end: INTRO_EN_TOTAL,
  note: '右上角「正片倒计时」+ 旁白字幕',
  render({ ctx, t }) {
    const left = Math.max(0, INTRO_EN_TOTAL - t)
    const text = `Recreation at ${mmss(INTRO_EN_TOTAL)} · ${Math.ceil(left)} s ▸`
    cn(ctx, 26, 600)
    const w = ctx.measureText(text).width + 36
    ctx.fillStyle = 'rgba(79,245,227,0.92)'
    ctx.fillRect(1920 - 60 - w, 50, w, 50)
    ctx.fillStyle = '#000'
    ctx.fillText(text, 1920 - 60 - w + 18, 85)
    const cue = voice.cues.find((c) => t >= c.start && t < c.start + c.dur + 0.2)
    if (cue) {
      cn(ctx, 30, 500)
      ctx.textAlign = 'center'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = 'rgba(0,0,0,0.9)'
      ctx.lineWidth = 6
      // 长句折成两行
      const words = cue.text
      // 英文按词折行：超过 70 字符时在最靠近中点的空格处断成两行
      let lines = [words]
      if (words.length > 70) {
        const mid = words.length / 2
        let cut = words.indexOf(' ', Math.floor(mid))
        const back = words.lastIndexOf(' ', Math.floor(mid))
        if (cut < 0 || (back > 0 && mid - back < cut - mid)) cut = back
        lines = [words.slice(0, cut), words.slice(cut + 1)]
      }
      lines.forEach((l, i) => {
        const y = 1010 - (lines.length - 1 - i) * 44
        ctx.strokeText(l, 960, y)
        ctx.fillStyle = '#fff'
        ctx.fillText(l, 960, y)
      })
      ctx.textAlign = 'left'
    }
  },
}

const SECTIONS = [title, pipeline, principle, effects, team, limits, handoff].map((s, i) => ({
  ...s,
  start: voice.scenes[i][0],
  end: voice.scenes[i][1],
}))

export const introEn: Film = {
  id: 'intro-en',
  title: 'Intro · how it was made (English, public cut)',
  duration: INTRO_EN_TOTAL,
  fps: 30,
  background: '#000000',
  scenes: [...SECTIONS, overlay],
}
