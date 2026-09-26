// 复刻 vs 原片 量化评分。
// 用法：pnpm score <wd1|wd2> [起 终] [--step 0.5] [--tag v1]
//
// 流程：
//   1. 原片：一次 ffmpeg（-ss 精确 seek + fps=1/step + 960x540 灰度 rawvideo）批量抽到临时目录；
//   2. 复刻：harness 无头渲染每个采样时刻，在页面内缩到 960x540 灰度直接回传（不走 PNG/JPEG 编解码）；
//   3. 逐帧算三项指标 → 综合分 → 按镜头聚合；
//   4. 输出 docs/score/<tag>-<film>.md / .json / -heat.png，最差 10 个时刻并排图到 snaps/score/。
//
// 综合分（0–100）：
//   score = 100 × (0.4 × SSIM⁺ + 0.4 × EDGE + 0.2 × HIST)
//   SSIM⁺ = max(0, SSIM)，960x540 灰度，8x8 窗口、步长 4、标准常数 C1=(0.01·255)²、C2=(0.03·255)²
//   EDGE  = 边缘图相关系数：两边各 2x2 均值降到 480x270 → 3x3 高斯 → Sobel 幅值 → 5x5 盒式模糊（容忍几像素错位）
//           → Pearson 相关 clamp 到 [0,1]；两边都几乎没边缘（黑场）记 1，只有一边没边缘记 0
//   HIST  = 1 − min(1, 4 × EMD)，EMD 为 64 档亮度直方图的一维推土机距离（归一化到 0..1，
//           0.25 ≈ 整体亮度差 64 级即判 0 分）
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openHarness } from './harness.mjs'

const GW = 960
const GH = 540
const W_SSIM = 0.4
const W_EDGE = 0.4
const W_HIST = 0.2

// ---------- 参数 ----------
const argv = process.argv.slice(2)
const opt = (name, def) => {
  const i = argv.indexOf(name)
  if (i < 0) return def
  const v = argv[i + 1]
  argv.splice(i, 2)
  return v
}
const step = Number(opt('--step', 0.5))
const tag = opt('--tag', 'v1')
const [film, a0, b0] = argv
if (!['wd1', 'wd2'].includes(film) || !(step > 0)) {
  console.error('用法：pnpm score <wd1|wd2> [起 终] [--step 0.5] [--tag v1]')
  process.exit(1)
}
const refPath = film === 'wd2' && existsSync('public/reference/wd2-1080.mp4') ? 'public/reference/wd2-1080.mp4' : `public/reference/${film}.mp4`
if (!existsSync(refPath)) {
  console.error(`缺原片 ${refPath}，见 README「原片参考」`)
  process.exit(1)
}

const t0 = performance.now()
const log = (s) => console.log(`[${((performance.now() - t0) / 1000).toFixed(1)}s] ${s}`)

// ---------- 原片批量抽帧（后台进行，与渲染并行） ----------
const tmp = mkdtempSync(join(tmpdir(), `wd-score-${film}-`))
const refRaw = join(tmp, 'ref.gray')
function extractRef(start, end) {
  return new Promise((resolve, reject) => {
    // -ss 在 -i 前：精确 seek（解码到目标帧，与 snap.mjs 同语义：取 ≥ t 的第一帧）。
    // 不用 fps 滤镜：实测它在 wd1 上系统性晚 7 帧（+0.233s）。改用 select 取每个采样刻度后的第一帧。
    const sel = `select='isnan(prev_pts)+gt(floor((t+0.001)/${step})\\,floor((prev_pts*TB+0.001)/${step}))'`
    const args = ['-loglevel', 'error', '-y', '-ss', String(start), '-t', String(end - start + step / 2), '-i', refPath,
      '-an', '-vf', `${sel},scale=${GW}:${GH}:flags=area,format=gray`, '-fps_mode', 'passthrough', '-f', 'rawvideo', refRaw]
    const p = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'inherit'] })
    p.on('exit', (c) => (c === 0 ? resolve() : reject(new Error(`ffmpeg 退出码 ${c}`))))
  })
}

// ---------- 指标 ----------
function ssim(a, b) {
  const C1 = (0.01 * 255) ** 2
  const C2 = (0.03 * 255) ** 2
  const win = 8
  const stride = 4
  let sum = 0
  let n = 0
  for (let y = 0; y + win <= GH; y += stride) {
    for (let x = 0; x + win <= GW; x += stride) {
      let sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0
      for (let j = 0; j < win; j++) {
        let i = (y + j) * GW + x
        for (let k = 0; k < win; k++, i++) {
          const va = a[i], vb = b[i]
          sa += va; sb += vb; saa += va * va; sbb += vb * vb; sab += va * vb
        }
      }
      const N = win * win
      const ma = sa / N, mb = sb / N
      const va = saa / N - ma * ma, vb = sbb / N - mb * mb, cov = sab / N - ma * mb
      sum += ((2 * ma * mb + C1) * (2 * cov + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2))
      n++
    }
  }
  return sum / n
}

const EW = GW / 2
const EH = GH / 2
function edgeMap(g) {
  // 降采样到 480x270
  const s = new Float32Array(EW * EH)
  for (let y = 0; y < EH; y++)
    for (let x = 0; x < EW; x++) {
      const i = 2 * y * GW + 2 * x
      s[y * EW + x] = (g[i] + g[i + 1] + g[i + GW] + g[i + GW + 1]) / 4
    }
  const bl = blur3(s)
  // Sobel 幅值
  const m = new Float32Array(EW * EH)
  for (let y = 1; y < EH - 1; y++)
    for (let x = 1; x < EW - 1; x++) {
      const i = y * EW + x
      const gx = bl[i - EW + 1] + 2 * bl[i + 1] + bl[i + EW + 1] - bl[i - EW - 1] - 2 * bl[i - 1] - bl[i + EW - 1]
      const gy = bl[i + EW - 1] + 2 * bl[i + EW] + bl[i + EW + 1] - bl[i - EW - 1] - 2 * bl[i - EW] - bl[i - EW + 1]
      m[i] = Math.sqrt(gx * gx + gy * gy)
    }
  return boxBlur(m, 2)
}
function blur3(s) {
  const o = new Float32Array(s.length)
  for (let y = 1; y < EH - 1; y++)
    for (let x = 1; x < EW - 1; x++) {
      const i = y * EW + x
      o[i] = (4 * s[i] + 2 * (s[i - 1] + s[i + 1] + s[i - EW] + s[i + EW]) + s[i - EW - 1] + s[i - EW + 1] + s[i + EW - 1] + s[i + EW + 1]) / 16
    }
  return o
}
function boxBlur(s, r) {
  // 可分离盒式模糊
  const tmpb = new Float32Array(s.length)
  const o = new Float32Array(s.length)
  const d = 2 * r + 1
  for (let y = 0; y < EH; y++) {
    let acc = 0
    for (let x = -r; x <= r; x++) acc += s[y * EW + Math.min(EW - 1, Math.max(0, x))]
    for (let x = 0; x < EW; x++) {
      tmpb[y * EW + x] = acc / d
      acc += s[y * EW + Math.min(EW - 1, x + r + 1)] - s[y * EW + Math.max(0, x - r)]
    }
  }
  for (let x = 0; x < EW; x++) {
    let acc = 0
    for (let y = -r; y <= r; y++) acc += tmpb[Math.min(EH - 1, Math.max(0, y)) * EW + x]
    for (let y = 0; y < EH; y++) {
      o[y * EW + x] = acc / d
      acc += tmpb[Math.min(EH - 1, y + r + 1) * EW + x] - tmpb[Math.max(0, y - r) * EW + x]
    }
  }
  return o
}
function edgeSim(a, b) {
  const ea = edgeMap(a)
  const eb = edgeMap(b)
  const n = ea.length
  let sa = 0, sb = 0
  for (let i = 0; i < n; i++) { sa += ea[i]; sb += eb[i] }
  const ma = sa / n, mb = sb / n
  // 平均梯度 < 1.5 视为「几乎没边缘」（纯黑场/纯色）
  const flatA = ma < 1.5, flatB = mb < 1.5
  if (flatA && flatB) return 1
  if (flatA || flatB) return 0
  let cov = 0, va = 0, vb = 0
  for (let i = 0; i < n; i++) {
    const da = ea[i] - ma, db = eb[i] - mb
    cov += da * db; va += da * da; vb += db * db
  }
  return Math.max(0, cov / Math.sqrt(va * vb + 1e-9))
}
function hist(g) {
  const h = new Float64Array(64)
  for (let i = 0; i < g.length; i++) h[g[i] >> 2]++
  for (let i = 0; i < 64; i++) h[i] /= g.length
  return h
}
function histSim(a, b) {
  const ha = hist(a), hb = hist(b)
  let ca = 0, cb = 0, emd = 0
  for (let i = 0; i < 64; i++) {
    ca += ha[i]; cb += hb[i]
    emd += Math.abs(ca - cb)
  }
  emd /= 63
  return { emd, sim: Math.max(0, 1 - 4 * emd) }
}
const mean = (g) => {
  let s = 0
  for (let i = 0; i < g.length; i++) s += g[i]
  return s / g.length
}

// ---------- 主流程 ----------
const h = await openHarness()
let refJob
try {
  const info = await h.info(film)
  const start = a0 !== undefined ? Number(a0) : 0
  const end = Math.min(b0 !== undefined ? Number(b0) : info.duration, info.duration - 1e-3)
  const times = []
  for (let k = 0; start + k * step < end - 1e-9; k++) times.push(+(start + k * step).toFixed(4))
  log(`${film} ${start}–${end}s，step ${step}，共 ${times.length} 帧；原片 ${refPath}`)
  refJob = extractRef(start, end)

  const scenes = await h.page.evaluate(async (id) => {
    const m = await import('/src/films/index.ts')
    return m.films[id].scenes.map((s) => ({ id: s.id, start: +s.start.toFixed(3), end: +s.end.toFixed(3) }))
  }, film)
  const shots = scenes.filter((s) => !/subtitles|overlay/.test(s.id))

  // 页面内：渲染 → 缩到 960x540 → 灰度（Rec.601 与 ffmpeg format=gray 一致）→ base64
  const grab = (t) =>
    h.page.evaluate(
      ([id, tt, w, hh]) => {
        window.__wd.renderAt(id, tt, 'jpeg')
        const src = document.getElementById('out')
        const c = (window.__scoreCanvas ??= Object.assign(document.createElement('canvas'), { width: w, height: hh }))
        const cx = c.getContext('2d', { willReadFrequently: true })
        cx.imageSmoothingEnabled = true
        cx.imageSmoothingQuality = 'high'
        cx.drawImage(src, 0, 0, w, hh)
        const d = cx.getImageData(0, 0, w, hh).data
        const g = new Uint8Array(w * hh)
        for (let i = 0, j = 0; j < g.length; i += 4, j++) g[j] = (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29 + 128) >> 8
        let s = ''
        for (let i = 0; i < g.length; i += 0x8000) s += String.fromCharCode.apply(null, g.subarray(i, i + 0x8000))
        return btoa(s)
      },
      [film, t, GW, GH],
    )

  const mine = []
  for (let i = 0; i < times.length; i++) {
    mine.push(Buffer.from(await grab(times[i]), 'base64'))
    if (i % 40 === 0) log(`渲染 ${i + 1}/${times.length}  t=${times[i]}`)
  }
  log('复刻帧渲染完成，等待原片抽帧')
  await refJob
  const refAll = readFileSync(refRaw)
  const fsz = GW * GH
  const nRef = Math.floor(refAll.length / fsz)
  log(`原片抽出 ${nRef} 帧`)
  if (nRef < times.length) console.warn(`⚠ 原片帧数 ${nRef} < 采样数 ${times.length}，尾部用最后一帧补`)

  const frames = []
  for (let i = 0; i < times.length; i++) {
    const t = times[i]
    const a = mine[i]
    // 原片不足（片尾）时用最后一帧
    const b = refAll.subarray(Math.min(i, nRef - 1) * fsz, Math.min(i, nRef - 1) * fsz + fsz)
    const s = ssim(a, b)
    const e = edgeSim(a, b)
    const hs = histSim(a, b)
    const score = 100 * (W_SSIM * Math.max(0, s) + W_EDGE * e + W_HIST * hs.sim)
    const active = shots.filter((sc) => t >= sc.start && t < sc.end).map((sc) => sc.id)
    frames.push({
      t, score: +score.toFixed(2), ssim: +s.toFixed(4), edge: +e.toFixed(4), hist: +hs.sim.toFixed(4), emd: +hs.emd.toFixed(4),
      lumaMine: +mean(a).toFixed(1), lumaRef: +mean(b).toFixed(1), scenes: active,
    })
  }
  log('指标计算完成')

  // 按镜头聚合
  const avg = (xs) => (xs.length ? xs.reduce((p, q) => p + q, 0) / xs.length : NaN)
  const shotRows = shots
    .map((sc) => {
      const fs = frames.filter((f) => f.scenes.includes(sc.id))
      if (!fs.length) return null
      const worst = fs.reduce((p, q) => (q.score < p.score ? q : p))
      return {
        id: sc.id, start: sc.start, end: sc.end, samples: fs.length,
        score: +avg(fs.map((f) => f.score)).toFixed(2),
        ssim: +avg(fs.map((f) => f.ssim)).toFixed(4),
        edge: +avg(fs.map((f) => f.edge)).toFixed(4),
        hist: +avg(fs.map((f) => f.hist)).toFixed(4),
        lumaMine: +avg(fs.map((f) => f.lumaMine)).toFixed(1),
        lumaRef: +avg(fs.map((f) => f.lumaRef)).toFixed(1),
        worst: { t: worst.t, score: worst.score },
        hint: diagnose(fs),
      }
    })
    .filter(Boolean)
    .sort((p, q) => p.score - q.score)
  const filmAvg = +avg(frames.map((f) => f.score)).toFixed(2)

  // 输出
  mkdirSync('docs/score', { recursive: true })
  mkdirSync('snaps/score', { recursive: true })
  const base = `docs/score/${tag}-${film}`
  const heatPng = `${base}-heat.png`
  writeHeat(heatPng, frames, shots, start, end)
  const worst10 = [...frames].sort((p, q) => p.score - q.score).slice(0, 10)
  const meta = {
    baseline: tag, film, reference: refPath, range: [start, end], step, generatedAt: new Date().toISOString(),
    formula: 'score = 100 * (0.4*max(0,SSIM) + 0.4*EDGE + 0.2*HIST)；详见 scripts/score.mjs 文件头',
    filmAvg, elapsedSec: 0,
  }
  // 最差 10 个时刻并排图（左复刻 | 右原片）
  for (const f of worst10) {
    const name = `snaps/score/${tag}-${film}-${f.t.toFixed(2).padStart(6, '0')}`
    writeFileSync(`${name}-mine.png`, await h.render(film, f.t))
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-ss', String(f.t), '-i', refPath, '-i', `${name}-mine.png`, '-frames:v', '1',
      '-filter_complex', '[1:v]scale=960:540[a];[0:v]scale=960:540[b];[a][b]hstack=inputs=2', `${name}.png`])
    rmSync(`${name}-mine.png`)
    f.snap = `${name}.png`
  }
  meta.elapsedSec = +((performance.now() - t0) / 1000).toFixed(1)
  writeFileSync(`${base}.json`, JSON.stringify({ ...meta, shots: shotRows, worst10, frames }, null, 1))
  writeFileSync(`${base}.md`, renderMd(meta, shotRows, worst10, heatPng))
  log(`完成：全片均分 ${filmAvg}；${base}.md / .json / -heat.png；snaps/score/`)
  if (h.errors.length) console.error('页面错误：\n' + [...new Set(h.errors)].slice(0, 20).join('\n'))
} finally {
  await h.close()
  await refJob?.catch(() => {})
  rmSync(tmp, { recursive: true, force: true })
}

// 根据三项指标与亮度给一句粗判断（只作线索，要看并排图确认）
function diagnose(fs) {
  const avg = (k) => fs.reduce((p, f) => p + f[k], 0) / fs.length
  const lm = avg('lumaMine'), lr = avg('lumaRef'), e = avg('edge'), s = avg('ssim'), hs = avg('hist')
  const out = []
  if (lm - lr > 20) out.push('整体偏亮')
  else if (lr - lm > 20) out.push('整体偏暗')
  if (e < 0.25) out.push('构图/线条位置基本不对')
  else if (e < 0.5) out.push('构图部分对上')
  if (s < 0.3 && e >= 0.5) out.push('布局对但纹理/细节差')
  if (hs < 0.6 && Math.abs(lm - lr) <= 20) out.push('亮度分布（对比度）不同')
  return out.join('；') || '接近'
}

function writeHeat(path, frames, shots, start, end) {
  // 全片热力条：宽 1200，上 60px 为逐帧分数色块（红=0 → 黄=50 → 绿=100），下 12px 为镜头分界刻度
  const WW = 1200, HB = 60, HT = 12, HH = HB + HT
  const buf = Buffer.alloc(WW * HH * 3)
  const color = (s) => {
    const v = Math.max(0, Math.min(1, s / 100))
    return v < 0.5 ? [220, Math.round(40 + 360 * v), 40] : [Math.round(220 - 380 * (v - 0.5)), 220, 40]
  }
  const span = end - start
  for (let x = 0; x < WW; x++) {
    const t = start + ((x + 0.5) / WW) * span
    let best = frames[0]
    for (const f of frames) if (Math.abs(f.t - t) < Math.abs(best.t - t)) best = f
    const [r, g, b] = color(best.score)
    for (let y = 0; y < HB; y++) buf.set([r, g, b], (y * WW + x) * 3)
    for (let y = HB; y < HH; y++) buf.set([24, 24, 24], (y * WW + x) * 3)
  }
  for (const sc of shots) {
    const x = Math.round(((sc.start - start) / span) * WW)
    if (x < 0 || x >= WW) continue
    for (let y = HB; y < HH; y++) buf.set([235, 235, 235], (y * WW + x) * 3)
  }
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${WW}x${HH}`, '-i', '-', '-frames:v', '1', path], { input: buf })
}

function renderMd(meta, rows, worst10, heatPng) {
  const L = []
  L.push(`# 评分基线 ${meta.baseline} · ${meta.film}`)
  L.push('')
  L.push(`> **baseline: ${meta.baseline}**。由 \`pnpm score ${meta.film}\` 生成（${meta.generatedAt}），原片 \`${meta.reference}\`，区间 ${meta.range[0]}–${meta.range[1]}s，step ${meta.step}s，耗时 ${meta.elapsedSec}s。`)
  L.push(`> 公式：\`${meta.formula}\`。分数只作精修优先级线索，定性结论以并排图为准。`)
  L.push('')
  L.push(`**全片均分：${meta.filmAvg}**`)
  L.push('')
  L.push(`![热力条](./${heatPng.split('/').pop()})`)
  L.push('')
  L.push('热力条：红 = 0 → 黄 = 50 → 绿 = 100，下方白色刻度为镜头起点。')
  L.push('')
  L.push('## 最差 10 个时刻')
  L.push('')
  L.push('| t | 分数 | SSIM | EDGE | HIST | 亮度 复刻/原片 | 镜头 | 并排图 |')
  L.push('| --- | --- | --- | --- | --- | --- | --- | --- |')
  for (const f of worst10) L.push(`| ${f.t} | ${f.score} | ${f.ssim} | ${f.edge} | ${f.hist} | ${f.lumaMine}/${f.lumaRef} | ${f.scenes.join(', ')} | \`${f.snap}\` |`)
  L.push('')
  L.push('## 镜头表（按分数升序）')
  L.push('')
  L.push('| 镜头 | 区间 | 均分 | SSIM | EDGE | HIST | 亮度 复刻/原片 | 最差时刻(分) | 粗判断 |')
  L.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- |')
  for (const r of rows)
    L.push(`| ${r.id} | ${r.start}–${r.end} | ${r.score} | ${r.ssim} | ${r.edge} | ${r.hist} | ${r.lumaMine}/${r.lumaRef} | ${r.worst.t} (${r.worst.score}) | ${r.hint} |`)
  L.push('')
  return L.join('\n')
}
