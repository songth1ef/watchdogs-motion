// 逐帧精确导出：pnpm export wd1 [起始秒] [结束秒] [--audio]
// --audio 会把原片音轨混进来（仅限本地对照，原片音乐有版权，不要外发）。
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { openHarness } from './harness.mjs'

const args = process.argv.slice(2)
const audio = args.includes('--audio')
const [film, a, b] = args.filter((x) => x !== '--audio')
if (!film) {
  console.error('用法：pnpm export <wd1|wd2> [起始秒] [结束秒] [--audio]')
  process.exit(1)
}
mkdirSync('dist-video', { recursive: true })
const h = await openHarness()
const { duration, fps } = await h.info(film)
const start = Number(a ?? 0)
const end = Math.min(duration, Number(b ?? duration))
const out = `dist-video/${film}-${start}-${end}.mp4`
const ff = ['-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-']
if (audio) ff.push('-ss', String(start), '-t', String(end - start), '-i', `public/reference/${film}.mp4`, '-map', '0:v', '-map', '1:a', '-c:a', 'aac')
ff.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16', out)
const enc = spawn('ffmpeg', ff, { stdio: ['pipe', 'inherit', 'inherit'] })
const total = Math.round((end - start) * fps)
for (let i = 0; i < total; i++) {
  const png = await h.render(film, start + i / fps)
  if (!enc.stdin.write(png)) await new Promise((r) => enc.stdin.once('drain', r))
  if (i % fps === 0) process.stdout.write(`\r${film} ${(start + i / fps).toFixed(1)}s / ${end}s`)
}
enc.stdin.end()
await new Promise((r) => enc.on('close', r))
await h.close()
console.log(`\n${out}`)
