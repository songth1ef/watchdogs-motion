import type { Film } from './engine/types'
import { activeScenes } from './engine/render'
import { FONT } from './fx/text'
import { WD1 } from './theme'

/**
 * 对比视频的一帧：1920×1080 画布，左格放复刻画面，右格留黑（导出时由 ffmpeg 把原片叠进去），
 * 上方标题与格子标签，下方时间码、当前镜头 id 与说明、进度条。ffmpeg 没有 drawtext，所有文字都在这里画。
 */
export const PANE = { w: 944, h: 531, y: 196, left: 16, right: 960 } as const

const CN = `"PingFang SC", "Hiragino Sans GB", ${FONT.sans}`

export function drawCompare(out: CanvasRenderingContext2D, film: Film, t: number, frame: HTMLCanvasElement) {
  const W = 1920
  const H = 1080
  out.save()
  out.fillStyle = '#0b0c0d'
  out.fillRect(0, 0, W, H)
  out.fillStyle = '#ffffff'
  out.font = `700 40px ${CN}`
  out.fillText(film.id === 'wd1' ? 'WD1 · Watch Dogs E3 Introduction Trailer' : 'WD2 · Watch Dogs 2 ctOS Introduction Scene', PANE.left, 80)
  out.font = `400 22px ${CN}`
  out.fillStyle = 'rgba(255,255,255,0.55)'
  out.fillText('左右画面同一时刻 · 复刻为浏览器 Canvas 2D + three.js 逐帧渲染，无任何原片素材', PANE.left, 122)
  const label = (x: number, text: string, bg: string) => {
    out.font = `600 24px ${CN}`
    const w = out.measureText(text).width + 28
    out.fillStyle = bg
    out.fillRect(x, PANE.y - 46, w, 36)
    out.fillStyle = '#000'
    out.fillText(text, x + 14, PANE.y - 19)
  }
  label(PANE.left, '复刻 · 代码渲染', WD1.cyan)
  label(PANE.right, '原片', '#ffffff')
  out.imageSmoothingQuality = 'high'
  out.drawImage(frame, PANE.left, PANE.y, PANE.w, PANE.h)
  out.fillStyle = '#000'
  out.fillRect(PANE.right, PANE.y, PANE.w, PANE.h)

  // 时间码 + 当前镜头
  const y0 = PANE.y + PANE.h + 70
  out.font = `400 44px ${FONT.mono}`
  out.fillStyle = WD1.cyan
  const mm = Math.floor(t / 60)
  const ss = (t % 60).toFixed(2).padStart(5, '0')
  out.fillText(`${mm}:${ss}`, PANE.left, y0)
  out.font = `400 22px ${FONT.mono}`
  out.fillStyle = 'rgba(255,255,255,0.5)'
  out.fillText(`/ ${Math.floor(film.duration / 60)}:${String(film.duration % 60).padStart(2, '0')}   f${Math.floor(t * film.fps)}`, PANE.left + 210, y0 - 4)
  const scenes = activeScenes(film, t).filter((s) => !s.id.endsWith('subtitles'))
  const main = scenes[scenes.length - 1]
  if (main) {
    out.font = `400 22px ${FONT.mono}`
    out.fillStyle = 'rgba(255,255,255,0.7)'
    out.fillText(`镜头 ${main.id}  ${main.start.toFixed(2)}–${main.end.toFixed(2)}s`, PANE.left, y0 + 56)
    out.font = `400 28px ${CN}`
    out.fillStyle = '#ffffff'
    const note = main.note ?? ''
    out.fillText(note.length > 60 ? note.slice(0, 59) + '…' : note, PANE.left, y0 + 104)
  }
  // 进度条
  out.fillStyle = 'rgba(255,255,255,0.15)'
  out.fillRect(PANE.left, H - 60, W - PANE.left * 2, 4)
  out.fillStyle = WD1.cyan
  out.fillRect(PANE.left, H - 60, (W - PANE.left * 2) * (t / film.duration), 4)
  out.restore()
}
