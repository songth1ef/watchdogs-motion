// 导出对比视频：开头实现介绍（intro）+ WD1 对比 + WD2 对比，拼成一个 MP4。
// 用法：pnpm export:compare            全部
//       pnpm export:compare wd1 10 13  只导某一段的某个区间（调试用）
// 原片音轨与画面仅用于本地对照，成片不要公开发布。
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { openHarness } from './harness.mjs'

const FPS = 30
const OUT = 'dist-video'
const PANE = { w: 944, h: 531, x: 960, y: 196 } // 与 src/compare.ts 的 PANE 一致
const REF = { wd1: 'public/reference/wd1.mp4', wd2: existsSync('public/reference/wd2-1080.mp4') ? 'public/reference/wd2-1080.mp4' : 'public/reference/wd2.mp4' }
const ENC = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2']

mkdirSync(OUT, { recursive: true })
const [only, a, b] = process.argv.slice(2)

function ffmpeg(args) {
  const p = spawn('ffmpeg', ['-loglevel', 'error', '-y', ...args], { stdio: ['pipe', 'inherit', 'inherit'] })
  const done = new Promise((res, rej) => p.on('close', (c) => (c === 0 ? res() : rej(new Error(`ffmpeg 退出码 ${c}`)))))
  return { stdin: p.stdin, done }
}

async function pump(h, enc, fn, start, end, label) {
  const total = Math.round((end - start) * FPS)
  const t0 = Date.now()
  for (let i = 0; i < total; i++) {
    const t = start + i / FPS
    const jpg = await fn(t)
    if (!enc.stdin.write(jpg)) await new Promise((r) => enc.stdin.once('drain', r))
    if (i % 15 === 0) {
      const el = (Date.now() - t0) / 1000
      const eta = (el / (i + 1)) * (total - i - 1)
      process.stdout.write(`\r${label} ${t.toFixed(1)}s/${end}s  ${(((i + 1) / el) || 0).toFixed(1)} fps  剩余约 ${Math.round(eta / 60)} 分钟   `)
    }
  }
  enc.stdin.end()
  await enc.done
  process.stdout.write('\n')
}

const h = await openHarness()
const dataUrlToBuf = (u) => Buffer.from(u.split(',')[1], 'base64')
const page = h.page
const parts = []
try {
  if (!only || only === 'intro') {
    const dur = (await h.info('intro')).duration
    const [s, e] = [Number(a ?? 0), Number(b ?? dur)]
    const out = `${OUT}/_intro.mp4`
    const enc = ffmpeg(['-f', 'image2pipe', '-framerate', String(FPS), '-i', '-', '-f', 'lavfi', '-t', String(e - s), '-i', 'anullsrc=r=48000:cl=stereo', '-map', '0:v', '-map', '1:a', '-shortest', ...ENC, out])
    await pump(h, enc, async (t) => dataUrlToBuf(await page.evaluate(([tt]) => window.__wd.renderAt('intro', tt, 'jpeg'), [t])), s, e, 'intro')
    parts.push(out)
  }
  for (const film of ['wd1', 'wd2']) {
    if (only && only !== film) continue
    const dur = (await h.info(film)).duration
    const [s, e] = [Number(a ?? 0), Number(b ?? dur)]
    const out = `${OUT}/_${film}.mp4`
    const enc = ffmpeg([
      '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
      '-ss', String(s), '-t', String(e - s), '-i', REF[film],
      '-filter_complex', `[1:v]fps=${FPS},scale=${PANE.w}:${PANE.h}:flags=lanczos,setpts=PTS-STARTPTS[r];[0:v][r]overlay=${PANE.x}:${PANE.y}:eof_action=pass[v];[1:a]aresample=48000,asetpts=PTS-STARTPTS[a]`,
      '-map', '[v]', '-map', '[a]', '-t', String(e - s), ...ENC, out,
    ])
    await pump(h, enc, async (t) => dataUrlToBuf(await page.evaluate(([f, tt]) => window.__wd.compareAt(f, tt), [film, t])), s, e, film)
    parts.push(out)
  }
} finally {
  await h.close()
}

if (!only && parts.length === 3) {
  writeFileSync(`${OUT}/_list.txt`, parts.map((p) => `file '${p.replace(`${OUT}/`, '')}'`).join('\n') + '\n')
  const cat = ffmpeg(['-f', 'concat', '-safe', '0', '-i', `${OUT}/_list.txt`, '-c', 'copy', '-movflags', '+faststart', `${OUT}/watchdogs-compare.mp4`])
  cat.stdin.end()
  await cat.done
  console.log(`成片：${OUT}/watchdogs-compare.mp4`)
} else console.log(parts.join('\n'))
if (h.errors.length) console.error('页面错误：\n' + [...new Set(h.errors)].slice(0, 10).join('\n'))
