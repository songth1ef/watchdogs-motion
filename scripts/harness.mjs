// 无头渲染工具：起一个 vite dev server + Chromium（软件 WebGL），暴露 renderAt()。
import { createServer } from 'vite'
import { chromium } from 'playwright'

export async function openHarness() {
  const server = await createServer({ logLevel: 'error', server: { port: 0, host: '127.0.0.1', hmr: false, watch: null } })
  await server.listen()
  const url = server.resolvedUrls.local[0]
  const browser = await chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  })
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const errors = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto(url)
  await page.waitForFunction(() => !!window.__wd)
  await page.evaluate(() => window.__wd.ready)
  return {
    errors,
    /** 返回 PNG Buffer */
    async render(film, t) {
      const dataUrl = await page.evaluate(([f, tt]) => window.__wd.renderAt(f, tt), [film, t])
      return Buffer.from(dataUrl.split(',')[1], 'base64')
    },
    info: (film) => page.evaluate((f) => ({ duration: window.__wd.duration(f), fps: window.__wd.fps(f) }), film),
    async close() {
      await browser.close()
      await server.close()
    },
  }
}
