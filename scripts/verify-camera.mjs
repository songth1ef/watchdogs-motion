// 临时验证脚本：用反求相机渲染地面网格 + 反求 3D 点，叠加到原片同一时刻，输出 snaps/camera/。
// 用法：node scripts/verify-camera.mjs <轨迹名> <秒...>      （轨迹 = assets/cameras/<名>.json）
//       node scripts/verify-camera.mjs <轨迹名> --n 8         （在轨迹时间范围内均匀取 8 帧）
// 输出：snaps/camera/<名>-<t>.png（原片 + 叠加）、snaps/camera/<名>-sheet.png（拼图）
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { openHarness } from './harness.mjs'

const [name, ...rest] = process.argv.slice(2)
if (!name) {
  console.error('用法：node scripts/verify-camera.mjs <轨迹名> <秒...> | --n 8')
  process.exit(1)
}
const json = JSON.parse(readFileSync(`assets/cameras/${name}.json`, 'utf8'))
if (!json.ok) throw new Error(`${name} 反求失败：${json.reason}`)
let times = rest.filter((x) => !x.startsWith('--')).map(Number)
const ni = rest.indexOf('--n')
if (!times.length || ni >= 0) {
  const n = ni >= 0 ? Number(rest[ni + 1]) : 8
  const a = json.frames[0].t
  const b = json.frames[json.frames.length - 1].t
  times = Array.from({ length: n }, (_, i) => +(a + ((b - a) * (i + 0.5)) / n).toFixed(3))
}
mkdirSync('snaps/camera', { recursive: true })
const h = await openHarness()
const outs = []
try {
  for (const t of times) {
    const url = await h.page.evaluate(
      async ([j, tt]) => (await import('/scripts/verify-camera/scene.js')).renderTrackFrame(j, tt),
      [json, t],
    )
    const tag = `snaps/camera/${name}-${t.toFixed(2)}`
    writeFileSync(`${tag}-overlay.png`, Buffer.from(url.split(',')[1], 'base64'))
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-ss', String(t), '-i', json.source.video, '-frames:v', '1', '-vf', 'scale=1920:1080', `${tag}-ref.png`])
    // 原片压暗一点让叠加线条更显眼
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', `${tag}-ref.png`, '-i', `${tag}-overlay.png`, '-filter_complex',
      '[0:v]eq=brightness=-0.12[b];[b][1:v]overlay=0:0', `${tag}.png`])
    outs.push(`${tag}.png`)
    console.log(`${tag}.png`)
  }
  if (outs.length > 1) {
    const cols = outs.length > 4 ? 3 : 2
    const inputs = outs.flatMap((o) => ['-i', o])
    const rows = Math.ceil(outs.length / cols)
    const scaled = outs.map((_, i) => `[${i}:v]scale=640:360[s${i}]`).join(';')
    const pad = Array.from({ length: rows * cols - outs.length }, (_, i) => `color=black:s=640x360:d=1[p${i}]`).join(';')
    const all = [...outs.map((_, i) => `[s${i}]`), ...Array.from({ length: rows * cols - outs.length }, (_, i) => `[p${i}]`)].join('')
    const layout = Array.from({ length: rows * cols }, (_, i) => `${(i % cols) * 640}_${Math.floor(i / cols) * 360}`).join('|')
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...inputs, '-filter_complex',
      `${scaled}${pad ? ';' + pad : ''};${all}xstack=inputs=${rows * cols}:layout=${layout}`, '-frames:v', '1', `snaps/camera/${name}-sheet.png`])
    console.log(`snaps/camera/${name}-sheet.png`)
  }
  if (h.errors.length) console.error('页面错误：\n' + h.errors.join('\n'))
} finally {
  await h.close()
}
