// 导出公开发布版（纯复刻、英文）：英文开头介绍 + WD1 复刻 + WD2 复刻 + 片尾署名，
// 不含任何原片画面或原片音频；配乐由 ffmpeg 现场合成（原创），开头配音时自动压低配乐。
// 用法：pnpm export:replica        → dist-video/watchdogs-recreation-en.mp4
import { execFileSync, spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { openHarness } from './harness.mjs'

const FPS = 30
const OUT = 'dist-video/replica'
const FINAL = 'dist-video/watchdogs-recreation-en.mp4'
mkdirSync(OUT, { recursive: true })

function ffmpeg(args) {
  const p = spawn('ffmpeg', ['-loglevel', 'error', '-y', ...args], { stdio: ['pipe', 'inherit', 'inherit'] })
  const done = new Promise((res, rej) => p.on('close', (c) => (c === 0 ? res() : rej(new Error(`ffmpeg 退出码 ${c}`)))))
  return { stdin: p.stdin, done }
}

let h = await openHarness()
const buf = (u) => Buffer.from(u.split(',')[1], 'base64')

/** 渲染一段为无声 MP4；无头页面崩溃时重开浏览器从当前帧续渲（最多 3 次） */
async function renderPart(name, film, method, duration) {
  const out = `${OUT}/${name}.mp4`
  const enc = ffmpeg(['-f', 'image2pipe', '-framerate', String(FPS), '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', '-r', String(FPS), out])
  const total = Math.round(duration * FPS)
  const t0 = Date.now()
  for (let i = 0; i < total; i++) {
    const t = i / FPS
    let jpg
    for (let attempt = 0; ; attempt++) {
      try {
        jpg = buf(await h.page.evaluate(([f, tt, m]) => window.__wd[m](f, tt, 'jpeg'), [film, t, method]))
        break
      } catch (err) {
        if (attempt >= 3) throw err
        process.stdout.write(`\n${name} ${t.toFixed(2)}s 页面崩溃，重开浏览器续渲（第 ${attempt + 1} 次）\n`)
        try {
          await h.close()
        } catch {}
        h = await openHarness()
      }
    }
    if (!enc.stdin.write(jpg)) await new Promise((r) => enc.stdin.once('drain', r))
    if (i % 15 === 0) {
      const el = (Date.now() - t0) / 1000
      process.stdout.write(`\r${name} ${t.toFixed(1)}s/${duration}s  ${((i + 1) / el).toFixed(1)} fps  剩余约 ${Math.round(((el / (i + 1)) * (total - i - 1)) / 60)} 分钟   `)
    }
  }
  enc.stdin.end()
  await enc.done
  process.stdout.write('\n')
  return out
}

const info = async (f) => h.page.evaluate((id) => window.__wd.duration(id), f)
const parts = []
try {
  const plan = [
    ['00-intro', 'intro-en', 'renderAt'],
    ['01-wd1', 'wd1', 'replicaAt'],
    ['02-wd2', 'wd2', 'replicaAt'],
    ['03-outro', 'outro-en', 'renderAt'],
  ]
  for (const [name, film, method] of plan) parts.push([await renderPart(name, film, method, await info(film)), await info(film)])
} finally {
  await h.close()
}
if (h.errors.length) console.error('页面错误：\n' + [...new Set(h.errors)].slice(0, 10).join('\n'))

// ---- 拼接画面（无声） ----
writeFileSync(`${OUT}/list.txt`, parts.map(([p]) => `file '${p.replace(`${OUT}/`, '')}'`).join('\n') + '\n')
execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', `${OUT}/list.txt`, '-c', 'copy', `${OUT}/video.mp4`])
const [dIntro, dWd1, dWd2, dOutro] = parts.map(([, d]) => d)
const TOTAL = dIntro + dWd1 + dWd2 + dOutro

// ---- 原创合成配乐：开头只有低音垫；正片起加入鼓点、踩镲、琶音（A 小调） ----
const I = dIntro
const expr = [
  `0.10*sin(2*PI*55*t)*(0.7+0.3*sin(2*PI*0.5*t))`,
  `0.05*sin(2*PI*110*t+1.5*sin(2*PI*0.25*t))+0.04*sin(2*PI*164.81*t+1.2*sin(2*PI*0.18*t))+0.03*sin(2*PI*220*t)`,
  `gte(t,${I})*0.45*exp(-14*mod(t,0.5))*sin(2*PI*(45+70*exp(-35*mod(t,0.5)))*mod(t,0.5))`,
  `gte(t,${I})*0.05*(2*random(0)-1)*exp(-70*mod(t+0.25,0.5))`,
  `gte(t,${I})*0.035*sin(2*PI*220*pow(2,(3*mod(floor(t*4),4))/12)*t)*exp(-8*mod(t,0.25))`,
].join('+')
execFileSync('ffmpeg', [
  '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `aevalsrc=exprs='${expr}':s=48000:d=${TOTAL}`,
  '-af', `highpass=f=30,lowpass=f=9000,aecho=0.6:0.4:250:0.2,afade=t=in:d=2,afade=t=out:st=${TOTAL - 4}:d=4,aformat=channel_layouts=stereo`,
  '-c:a', 'pcm_s16le', `${OUT}/music.wav`,
])

// ---- 配音 + 压低配乐（sidechain）+ 响度标准化 ----
const voice = JSON.parse(readFileSync('assets/voice/intro-en/cues.json', 'utf8'))
const vin = voice.cues.flatMap((c) => ['-i', `assets/voice/intro-en/${c.file}`])
const n = voice.cues.length
const delays = voice.cues.map((c, i) => `[${i + 1}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${Math.round(c.start * 1000)}:all=1[v${i}]`).join(';')
const graph = `${delays};${voice.cues.map((_, i) => `[v${i}]`).join('')}amix=inputs=${n}:normalize=0,apad,atrim=0:${TOTAL},asplit=2[vo][sc];` +
  `[0:a][sc]sidechaincompress=threshold=0.02:ratio=8:attack=20:release=400[mu];[mu][vo]amix=inputs=2:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11[a]`
execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', `${OUT}/music.wav`, ...vin, '-filter_complex', graph, '-map', '[a]', '-ar', '48000', '-c:a', 'pcm_s16le', `${OUT}/audio.wav`])

// ---- 合成成片 + 章节 ----
const ch = (st, en, title) => `[CHAPTER]\nTIMEBASE=1/1000\nSTART=${Math.round(st * 1000)}\nEND=${Math.round(en * 1000)}\ntitle=${title}\n`
writeFileSync(`${OUT}/chapters.txt`, ';FFMETADATA1\ntitle=Watch Dogs trailers, recreated in code\n' +
  ch(0, dIntro, 'How it was made') + ch(dIntro, dIntro + dWd1, 'Watch Dogs — E3 introduction (recreation)') +
  ch(dIntro + dWd1, dIntro + dWd1 + dWd2, 'Watch Dogs 2 — ctOS introduction (recreation)') + ch(TOTAL - dOutro, TOTAL, 'Credits'))
execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', `${OUT}/video.mp4`, '-i', `${OUT}/audio.wav`, '-i', `${OUT}/chapters.txt`,
  '-map', '0:v', '-map', '1:a', '-map_metadata', '2', '-map_chapters', '2', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-shortest', '-movflags', '+faststart', FINAL])
console.log(`成片：${FINAL}（${TOTAL.toFixed(1)}s）`)
