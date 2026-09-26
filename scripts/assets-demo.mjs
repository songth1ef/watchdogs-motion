// 无头渲染真实资产演示页（src/dev/assets-demo.html），输出 snaps/assets/<视图>.png；
// 若有参考帧，另出 snaps/assets/<视图>-cmp.jpg（左 = 资产演示，右 = 原片对应帧）。
// 用法：node scripts/assets-demo.mjs [视图名...]
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'vite'
import { chromium } from 'playwright'

// 视图 → 对照的参考帧（reference/frames/<film>/NNN.jpg，第 N 张 ≈ 第 N-1 秒）
const REF = {
  'chicago-clay-top': 'wd1/126.jpg',
  'chicago-clay-oblique': 'wd1/133.jpg',
  'chicago-dark': 'wd1/046.jpg',
  'chicago-wire': 'wd2/007.jpg',
  'chicago-map': 'wd2/010.jpg',
  'sf-peninsula': 'wd2/039.jpg',
  'bay-terrain': 'wd2/036.jpg',
  'earth-night': 'wd1/008.jpg',
  'world-dots': 'wd2/093.jpg',
  'usa-states': 'wd2/030.jpg',
}
const only = process.argv.slice(2)
mkdirSync('snaps/assets', { recursive: true })
const server = await createServer({ logLevel: 'error', server: { port: 0, host: '127.0.0.1', hmr: false, watch: null } })
await server.listen()
const url = server.resolvedUrls.local[0] + 'src/dev/assets-demo.html'
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 1000, height: 640 } })
const errors = []
page.on('console', (m) => ['error', 'warning'].includes(m.type()) && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))
try {
  await page.goto(url)
  await page.waitForFunction(() => !!window.__assets)
  await page.evaluate(() => window.__assets.ready)
  const views = only.length ? only : await page.evaluate(() => window.__assets.views)
  for (const v of views) {
    const t0 = Date.now()
    const dataUrl = await page.evaluate((n) => window.__assets.render(n), v)
    const out = `snaps/assets/${v}.png`
    writeFileSync(out, Buffer.from(dataUrl.split(',')[1], 'base64'))
    const ref = REF[v] && `reference/frames/${REF[v]}`
    if (ref && existsSync(ref)) {
      execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', out, '-i', ref, '-filter_complex', '[0:v]scale=960:540[a];[1:v]scale=960:540[b];[a][b]hstack=inputs=2', '-q:v', '3', `snaps/assets/${v}-cmp.jpg`])
    }
    console.log(`${out}  ${Date.now() - t0}ms`)
  }
  if (errors.length) console.error('页面错误/警告：\n' + errors.join('\n'))
} finally {
  await browser.close()
  await server.close()
}
