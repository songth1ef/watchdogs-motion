// 用法：pnpm snap wd1 12 13.5 20.25
// 输出 snaps/<film>-<t>.png：左 = 复刻，右 = 原片同一时刻（需要 public/reference/<film>.mp4）。
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { openHarness } from './harness.mjs'

const [film, ...times] = process.argv.slice(2)
if (!film || !times.length) {
  console.error('用法：pnpm snap <wd1|wd2> <秒> [秒...]')
  process.exit(1)
}
mkdirSync('snaps', { recursive: true })
const refPath = `public/reference/${film}.mp4`
const h = await openHarness()
try {
  for (const ts of times) {
    const t = Number(ts)
    const tag = `${film}-${t.toFixed(2).padStart(6, '0')}`
    const mine = `snaps/${tag}-mine.png`
    writeFileSync(mine, await h.render(film, t))
    if (existsSync(refPath)) {
      const refPng = `snaps/${tag}-ref.png`
      execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-ss', String(t), '-i', refPath, '-frames:v', '1', '-vf', 'scale=1920:1080', refPng])
      execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', mine, '-i', refPng, '-filter_complex', '[0:v]scale=960:540[a];[1:v]scale=960:540[b];[a][b]hstack=inputs=2', `snaps/${tag}.png`])
      console.log(`snaps/${tag}.png  (左复刻 | 右原片)`)
    } else console.log(mine)
  }
  if (h.errors.length) console.error('页面错误：\n' + h.errors.join('\n'))
} finally {
  await h.close()
}
