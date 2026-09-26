import '@fontsource/inter-tight/400.css'
import '@fontsource/inter-tight/500.css'
import '@fontsource/inter-tight/700.css'
import '@fontsource/inter-tight/800.css'
import '@fontsource/share-tech-mono/400.css'
import '@fontsource/vt323/400.css'
import '@fontsource/ibm-plex-mono/400.css'
import { films } from './films'
import type { Film } from './engine/types'
import { H, W, activeScenes, renderFrame } from './engine/render'
import { ThreeHost } from './engine/three-host'
import { FONT } from './fx/text'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const canvas = $<HTMLCanvasElement>('out')
const ctx = canvas.getContext('2d', { willReadFrequently: true })!
const three = new ThreeHost(W, H)
const ref = $<HTMLVideoElement>('ref')
const overlay = $<HTMLVideoElement>('refOverlay')
const scrub = $<HTMLInputElement>('scrub')
const filmSel = $<HTMLSelectElement>('film')
const refMode = $<HTMLSelectElement>('refMode')
const playBtn = $<HTMLButtonElement>('play')

const params = new URLSearchParams(location.search)
let film: Film = films[(params.get('film') as Film['id']) ?? 'wd1'] ?? films.wd1
let t = Number(params.get('t') ?? 0)
let playing = false
let last = 0

async function loadFonts() {
  const faces = [
    `400 20px ${FONT.mono}`,
    `400 20px ${FONT.pixel}`,
    `400 20px ${FONT.plex}`,
    `400 20px ${FONT.sans}`,
    `500 20px ${FONT.sans}`,
    `700 20px ${FONT.sans}`,
    `800 20px ${FONT.sans}`,
  ]
  await Promise.all(faces.map((f) => document.fonts.load(f)))
}

function draw() {
  renderFrame(film, t, ctx, three)
  $('time').textContent = `${t.toFixed(3)}s / ${film.duration}s  f${Math.floor(t * film.fps)}`
  $('scenes').textContent = activeScenes(film, t)
    .map((s) => s.id)
    .join('  ·  ')
  scrub.value = String(t / film.duration)
}

function syncVideo(v: HTMLVideoElement, force = false) {
  if (!v.src || v.readyState < 1) return
  if (force || Math.abs(v.currentTime - t) > 0.12) v.currentTime = t
  if (playing && v.paused) v.play().catch(() => {})
  if (!playing && !v.paused) v.pause()
}

function refVideos() {
  const mode = refMode.value
  const vs: HTMLVideoElement[] = []
  if (mode === 'side') vs.push(ref)
  if (mode === 'onion' || mode === 'diff') vs.push(overlay)
  return vs
}

function seek(nt: number) {
  t = Math.min(film.duration - 1e-3, Math.max(0, nt))
  for (const v of refVideos()) syncVideo(v, true)
  draw()
}

function loop(now: number) {
  if (playing) {
    const dt = Math.min(0.1, (now - last) / 1000)
    t += dt
    if (t >= film.duration) {
      t = 0
      for (const v of refVideos()) syncVideo(v, true)
    }
    for (const v of refVideos()) syncVideo(v)
    draw()
  }
  last = now
  requestAnimationFrame(loop)
}

function setFilm(id: Film['id']) {
  film = films[id]
  const src = `/reference/${id}.mp4`
  ref.src = src
  overlay.src = src
  filmSel.value = id
  seek(Math.min(t, film.duration - 0.01))
}

function applyRefMode() {
  const mode = refMode.value
  $('stage').classList.toggle('side', mode === 'side')
  $('mainView').classList.toggle('onion', mode === 'onion')
  $('mainView').classList.toggle('diff', mode === 'diff')
  for (const v of [ref, overlay]) if (!refVideos().includes(v)) v.pause()
  seek(t)
}

function setPlaying(p: boolean) {
  playing = p
  playBtn.textContent = p ? '暂停' : '播放'
  for (const v of refVideos()) syncVideo(v, true)
}

// ---- 录制：实时录 canvas（逐帧精确导出请用 `pnpm export`） ----
let recorder: MediaRecorder | null = null
function toggleRecord() {
  const btn = $<HTMLButtonElement>('rec')
  if (recorder) {
    recorder.stop()
    return
  }
  const stream = canvas.captureStream(film.fps)
  const chunks: Blob[] = []
  recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9', videoBitsPerSecond: 16_000_000 })
  recorder.ondataavailable = (e) => chunks.push(e.data)
  recorder.onstop = () => {
    const url = URL.createObjectURL(new Blob(chunks, { type: 'video/webm' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${film.id}-${Date.now()}.webm`
    a.click()
    recorder = null
    btn.classList.remove('on')
    btn.textContent = '录制 WebM'
  }
  recorder.start()
  btn.classList.add('on')
  btn.textContent = '停止录制'
  seek(0)
  setPlaying(true)
}

// ---- 供 scripts/snap.mjs 与 scripts/export.mjs 调用的无头接口 ----
declare global {
  interface Window {
    __wd: {
      ready: Promise<void>
      renderAt(id: Film['id'], time: number): string
      duration(id: Film['id']): number
      fps(id: Film['id']): number
    }
  }
}

const ready = loadFonts()
window.__wd = {
  ready,
  renderAt(id, time) {
    film = films[id]
    t = time
    draw()
    return canvas.toDataURL('image/png')
  },
  duration: (id) => films[id].duration,
  fps: (id) => films[id].fps,
}

for (const f of Object.values(films)) filmSel.add(new Option(`${f.id.toUpperCase()} · ${f.title}`, f.id))
filmSel.onchange = () => setFilm(filmSel.value as Film['id'])
refMode.onchange = applyRefMode
playBtn.onclick = () => setPlaying(!playing)
$('prev').onclick = () => seek(t - 1 / film.fps)
$('next').onclick = () => seek(t + 1 / film.fps)
$('rec').onclick = toggleRecord
$<HTMLInputElement>('sound').onchange = (e) => {
  const on = (e.target as HTMLInputElement).checked
  ref.muted = overlay.muted = !on
}
scrub.oninput = () => seek(Number(scrub.value) * film.duration)
addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement).tagName === 'SELECT') return
  if (e.code === 'Space') {
    e.preventDefault()
    setPlaying(!playing)
  } else if (e.code === 'ArrowLeft') seek(t - (e.shiftKey ? 1 : 1 / film.fps))
  else if (e.code === 'ArrowRight') seek(t + (e.shiftKey ? 1 : 1 / film.fps))
})

ready.then(() => {
  setFilm(film.id)
  requestAnimationFrame(loop)
})
