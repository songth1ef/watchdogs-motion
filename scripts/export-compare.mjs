// 导出对比视频：开头实现介绍（intro）+ WD1 对比 + WD2 对比，拼成一个 MP4。
// 用法：pnpm export:compare            全部
//       pnpm export:compare wd1 10 13  只导某一段的某个区间（调试用）
// 原片音轨与画面仅用于本地对照，成片不要公开发布。
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
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

async function pump(_h, enc, fn, start, end, label) {
  const total = Math.round((end - start) * FPS)
  const t0 = Date.now()
  for (let i = 0; i < total; i++) {
    const t = start + i / FPS
    // 无头页面在重 3D + 后期镜头可能崩溃重载（Execution context was destroyed）：重开浏览器后从这一帧续渲，最多重试 3 次
    let jpg
    for (let attempt = 0; ; attempt++) {
      try {
        jpg = await fn(t)
        break
      } catch (err) {
        if (attempt >= 3) throw err
        process.stdout.write(`\n${label} ${t.toFixed(2)}s 页面崩溃，重开浏览器续渲（第 ${attempt + 1} 次）\n`)
        try {
          await h.close()
        } catch {}
        h = await openHarness()
        page = h.page
      }
    }
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

let h = await openHarness()
const dataUrlToBuf = (u) => Buffer.from(u.split(',')[1], 'base64')
let page = h.page
const parts = []
try {
  if (!only || only === 'intro') {
    const dur = (await h.info('intro')).duration
    const [s, e] = [Number(a ?? 0), Number(b ?? dur)]
    const out = `${OUT}/_intro.mp4`
    // 配音：按 cues.json 的起点把每句旁白放到时间轴上混成一轨
    const voice = JSON.parse(readFileSync('assets/voice/intro/cues.json', 'utf8'))
    const vin = voice.cues.flatMap((c) => ['-i', `assets/voice/intro/${c.file}`])
    const mix = voice.cues.map((c, i) => `[${i + 1}:a]aresample=48000,aformat=channel_layouts=stereo,volume=2,adelay=${Math.round((c.start - s) * 1000)}:all=1[v${i}]`).join(';')
    const amix = `${mix};${voice.cues.map((_, i) => `[v${i}]`).join('')}amix=inputs=${voice.cues.length}:normalize=0,alimiter=limit=0.89:level=false,apad,atrim=0:${e - s}[a]`
    const enc = ffmpeg(['-f', 'image2pipe', '-framerate', String(FPS), '-i', '-', ...vin, '-filter_complex', amix, '-map', '0:v', '-map', '[a]', '-t', String(e - s), ...ENC, out])
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

// 三段都在就拼成片（只重导某一段时也会用上次导好的其他段）
const all = ['intro', 'wd1', 'wd2'].map((p) => `${OUT}/_${p}.mp4`)
if ((!only || !a) && all.every((p) => existsSync(p))) {
  writeFileSync(`${OUT}/_list.txt`, all.map((p) => `file '${p.replace(`${OUT}/`, '')}'`).join('\n') + '\n')
  // 章节：播放器里可直接跳到「WD1 对比」「WD2 对比」
  const probe = (f) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString())
  const [d0, d1, d2] = all.map(probe)
  const ch = (st, en, title) => `[CHAPTER]\nTIMEBASE=1/1000\nSTART=${Math.round(st * 1000)}\nEND=${Math.round(en * 1000)}\ntitle=${title}\n`
  writeFileSync(`${OUT}/_chapters.txt`, ';FFMETADATA1\n' + ch(0, d0, '实现介绍（可跳过）') + ch(d0, d0 + d1, 'WD1 复刻 vs 原片') + ch(d0 + d1, d0 + d1 + d2, 'WD2 复刻 vs 原片'))
  const cat = ffmpeg(['-f', 'concat', '-safe', '0', '-i', `${OUT}/_list.txt`, '-i', `${OUT}/_chapters.txt`, '-map_metadata', '1', '-map_chapters', '1', '-c', 'copy', '-movflags', '+faststart', `${OUT}/watchdogs-compare.mp4`])
  cat.stdin.end()
  await cat.done
  console.log(`成片：${OUT}/watchdogs-compare.mp4`)
} else console.log(parts.join('\n'))
if (h.errors.length) console.error('页面错误：\n' + [...new Set(h.errors)].slice(0, 10).join('\n'))
