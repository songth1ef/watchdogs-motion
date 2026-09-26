// 临时演示：node scripts/post-demo.mjs [预设名...]
// 每个预设在对应镜头的几个时刻出三联图 snaps/post/<预设>-<t>.png：裸渲染 | 加后期 | 原片。
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { openHarness } from './harness.mjs'

const CASES = {
  clayCity: ['wd1', [126.5, 130.5, 132.5]],
  greyCityEdges: ['wd1', [41.0, 44.3, 47.5]],
  stageDOF: ['wd1', [100.5, 103.2, 107.0]],
  skylineBokeh: ['wd1', [135.0, 136.8]],
  wireGlow: ['wd2', [5.0, 6.5]],
}
const only = process.argv.slice(2)
// 调参用：POST_OVER='{"bloom":false}' 覆盖预设；POST_T='44.3' 只跑某个时刻；POST_TAG 给输出加后缀
const over = JSON.parse(process.env.POST_OVER ?? '{}')
const onlyT = process.env.POST_T ? process.env.POST_T.split(',').map(Number) : null
const suffix = process.env.POST_TAG ? '-' + process.env.POST_TAG : ''
mkdirSync('snaps/post', { recursive: true })
const h = await openHarness()
const perf = []
try {
  await h.page.evaluate(() => import('/scripts/post-demo/entry.ts'))
  for (const [preset, [film, times]] of Object.entries(CASES)) {
    if (only.length && !only.includes(preset)) continue
    for (const t of times) {
      if (onlyT && !onlyT.includes(t)) continue
      const r = await h.page.evaluate(([f, tt, p, o]) => window.__post.renderCase(f, tt, p, o), [film, t, preset, over])
      const tag = `snaps/post/${preset}-${t.toFixed(1)}${suffix}`
      writeFileSync(`${tag}-bare.png`, Buffer.from(r.bare.split(',')[1], 'base64'))
      writeFileSync(`${tag}-post.png`, Buffer.from(r.post.split(',')[1], 'base64'))
      const ref = `public/reference/${film}.mp4`
      const inputs = ['-i', `${tag}-bare.png`, '-i', `${tag}-post.png`]
      if (existsSync(ref)) {
        execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-ss', String(t), '-i', ref, '-frames:v', '1', '-vf', 'scale=1920:1080', `${tag}-ref.png`])
        inputs.push('-i', `${tag}-ref.png`)
      }
      const n = inputs.length / 2
      const chain = Array.from({ length: n }, (_, i) => `[${i}:v]scale=640:360[v${i}]`).join(';')
      const stack = Array.from({ length: n }, (_, i) => `[v${i}]`).join('') + `hstack=inputs=${n}`
      execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...inputs, '-filter_complex', `${chain};${stack}`, `${tag}.png`])
      console.log(`${tag}.png  裸 ${r.bareMs.toFixed(0)}ms | 后期 ${r.postMs.toFixed(0)}ms | ${JSON.stringify(Object.fromEntries(Object.entries(r.stats).map(([k, v]) => [k, Math.round(v)])))}`)
      perf.push({ preset, t, ...r, bare: undefined, post: undefined })
    }
  }
  if (process.env.POST_BOKEH) {
    const png = await h.page.evaluate(() => window.__post.bokehTest())
    writeFileSync('snaps/post/bokeh-test.png', Buffer.from(png.split(',')[1], 'base64'))
    console.log('snaps/post/bokeh-test.png')
  }
  if (process.env.POST_BENCH) {
    for (const [preset, [film, times]] of Object.entries(CASES)) {
      if (only.length && !only.includes(preset)) continue
      const r = await h.page.evaluate(([f, tt, p, o]) => window.__post.benchPasses(f, tt, p, o), [film, times[0], preset, over])
      console.log(`bench ${preset}@${times[0]}: ${JSON.stringify(r)}  合计 ${Object.values(r).reduce((a, b) => a + b, 0)}ms`)
    }
  }
  writeFileSync('snaps/post/perf.json', JSON.stringify(perf, null, 2))
  if (h.errors.length) console.error('页面错误：\n' + h.errors.join('\n'))
} finally {
  await h.close()
}
