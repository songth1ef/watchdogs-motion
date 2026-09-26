/**
 * 12.35–22.9s：代码窗风暴（PowerShell 脚本白纸条）→ 地图 + 白色点阵 → 方格/三角网格铺满（and cripple the entire grid）
 * → 白色大碎片扫过 → 黑底散落白方块 → 像素字乱码打出 "they were wrong."
 */
import type { Scene } from '../../../engine/types'
import { clamp, ease, lerp, seg } from '../../../engine/math'
import { FONT, font, tracking } from '../../../fx/text'
import { WD2 } from '../../../theme'
import { drawCityMap } from './ctos-city'
import { cached, fr, h2, makeCanvas } from './lib'
import { TILE_DT, TILE_GRID, TILE_ROWS, TILE_T0 } from './grid-tiles'
import { SCAT_DT, SCAT_FRAMES, SCAT_T0 } from './scatter-dots'
import { STORM_COLS, STORM_DT, STORM_GRID, STORM_ROWS, STORM_T0 } from './storm-luma'

// ───────────────────────── 代码窗风暴 ─────────────────────────

/** 原片白纸条上能辨认出的 PowerShell 片段（Empire agent 脚本风格） */
export const PS_LINES = [
  '# get the delay/jitter',
  'function Set-Delay {',
  '    param([int]$d, [double]$j=0.0)',
  '    $script:AgentDelay = $d',
  '    $script:AgentJitter = $j',
  '    "agent interval set to $script:AgentDelay seconds with a jitter of $script:AgentJitter"',
  '}',
  '# get the delay/jitter',
  'function Get-Delay {',
  '    "agent interval delay interval: $script:AgentDelay seconds"',
  '# set the killdate for the agent',
  'function Set-Killdate {',
  '    param([string]$date)',
  '    $script:KillDate = $date',
  '    "agent killdate set to $script:KillDate"',
  '# set the working hours for the agent',
  'function Set-WorkingHours {',
  '    param([string]$hours)',
  '    $script:WorkingHours = $hours',
  '# basic system information',
  'function Get-SysInfo {',
  '    $str = $Servers[$ServerIndex]',
  "    $str += '|' + [Environment]::UserDomainName+'|'+[Environment]::UserName",
  '    else {',
  '        # otherwise check the local machine',
  '$script:Headers = @()',
  '# add any additional request headers if there are any specified in the profile',
  "$Parts = $Profile.split('|')",
  'if($Parts[2]){',
  '    $HeadersRaw = $Parts[2..$Parts.length]',
  "    $key = $_.split(':')[0]",
  "    $value = $_.split(':')[1]",
  "    if($key -eq 'Cookie'){",
  '        # make sure we append this cookie value to the sessionID',
  '$script:Cookie = "SESSIONID=$SessionID"',
  '$script:UserAgent = $UserAgent',
  '$Retries = 1',
  '# c2 server list, by parameter or preloaded on staging',
  '$ServerIndex = 0',
  '# calculate the diff between the servers epoch',
  '$EpochDiff = $Epoch - [math]::abs($(Get-Date).ToUniversalTime())',
  '# background jobs created with format $JobNameBase_[rand]',
  "$script:JobNameBase = 'Debug32'",
  '$script:ImportedScript = ""',
  '# the currently imported script held in memory',
  '#####################',
]

/** 把代码按列宽折行（纸条很窄时一行只剩几个字） */
function wrapLines(start: number, cols: number, rows: number) {
  const out: string[] = []
  let k = start
  while (out.length < rows) {
    const line = PS_LINES[k % PS_LINES.length]
    k++
    for (let i = 0; i < line.length && out.length < rows; i += cols) out.push(line.slice(i, i + cols))
  }
  return out
}

/**
 * V2 代码风暴：按原片逐帧（1/30s）实测的 32×12 分区亮度（storm-luma.ts）驱动「白纸条覆盖率」。
 * 纸条 = 竖向窄条（不等宽列槽 × 12 段），某段的目标覆盖率高于该段阈值就画成白纸；
 * 阈值大部分固定、小部分逐帧抖动，所以覆盖率上升时纸条是「越铺越多」而不是纯随机闪。
 */
function stormFrame(t: number): number[] {
  const i = clamp(Math.round((t - STORM_T0) / STORM_DT), 0, STORM_GRID.length - 1)
  return cached(`wd2p1:stormf:${i}`, () => {
    const h = STORM_GRID[i]
    const out: number[] = []
    for (let k = 0; k < h.length; k += 2) out.push(parseInt(h.slice(k, k + 2), 16))
    return out
  })
}

/** 屏幕 (x,y) 处的目标白纸覆盖率（分区中心双线性插值；地图底亮度按 ~20 计，纸条平均 ~190） */
function coverage(L: number[], x: number, y: number) {
  const cw = 1920 / STORM_COLS
  const rh = 1080 / STORM_ROWS
  const fx = clamp(x / cw - 0.5, 0, STORM_COLS - 1)
  const fy = clamp(y / rh - 0.5, 0, STORM_ROWS - 1)
  const i = Math.min(STORM_COLS - 2, Math.floor(fx))
  const j = Math.min(STORM_ROWS - 2, Math.floor(fy))
  const u = fx - i
  const v = fy - j
  const g = (c: number, r: number) => L[r * STORM_COLS + c]
  const top = lerp(g(i, j), g(i + 1, j), u)
  const bot = lerp(g(i, j + 1), g(i + 1, j + 1), u)
  return clamp((lerp(top, bot, v) - 24) / 150)
}

/** 纸条底纹：整张「代码纸」（多栏 PowerShell），纸条从中截取；inv = 黑底白字版 */
function paperTex(inv: boolean) {
  return cached(`wd2p1:paper:${inv}`, () => {
    const W = 1600
    const H = 1400
    const { canvas, ctx } = makeCanvas(W, H)
    ctx.fillStyle = inv ? '#0b0b0b' : '#f7f7f3'
    ctx.fillRect(0, 0, W, H)
    const ink = inv ? '#e8e8e8' : '#6e6e6e'
    font(ctx, 13, 400, FONT.plex)
    for (let col = 0; col < 5; col++) {
      const x0 = col * 320 + 10
      const lines = wrapLines(col * 9, 44, 80)
      for (let i = 0; i < lines.length; i++) {
        const y = 22 + i * 17.5
        ctx.fillStyle = ink
        if (h2(col, i, 81) < 0.06) {
          ctx.fillText('################################', x0, y)
          continue
        }
        if (h2(col, i, 82) < 0.1) ctx.fillText('+', x0, y)
        ctx.fillText(lines[i], x0 + (h2(col, i, 82) < 0.1 ? 18 : 0), y)
        // 马克笔涂黑块 / 小方块
        if (h2(col, i, 83) < 0.07) ctx.fillRect(x0 + h2(col, i, 84) * 220, y - 12, 20 + h2(col, i, 85) * 70, 14)
      }
    }
    return canvas
  })
}

interface Slot {
  x: number
  w: number
  cuts: number[]
}

/** 列槽布局：每 4 帧（0.133s）换一次，模拟镜头穿过不同层的纸条 */
function slots(epoch: number): Slot[] {
  return cached(`wd2p1:slots:${epoch}`, () => {
    const out: Slot[] = []
    let x = -10 - h2(epoch, 0, 91) * 40
    let i = 0
    while (x < 1930) {
      const r = h2(epoch, i, 92)
      const w = r < 0.55 ? 20 + h2(epoch, i, 93) * 50 : r < 0.9 ? 70 + h2(epoch, i, 93) * 70 : 140 + h2(epoch, i, 93) * 100
      const cuts = [0]
      for (let k = 1; k < 12; k++) cuts.push(k * 90 + (h2(epoch * 7 + k, i, 94) - 0.5) * 40)
      cuts.push(1080)
      out.push({ x, w, cuts })
      x += w + (h2(epoch, i, 95) < 0.3 ? 3 + h2(epoch, i, 96) * 10 : 0)
      i++
    }
    return out
  })
}

/** 左侧暗底上的白色代码列（带 + 号行标）与 "execute? Y" */
function codeColumn(ctx: CanvasRenderingContext2D, t: number) {
  font(ctx, 46, 400, FONT.pixel)
  ctx.fillStyle = WD2.fg
  ctx.fillText('execute?', 246, 150)
  ctx.fillText('Y', 246, 196)
  ctx.fillStyle = 'rgba(255,255,255,0.8)'
  font(ctx, 26, 400, FONT.mono)
  for (let i = 0; i < 22; i++) ctx.fillText('+', 250, 44 + i * 50.5)
  font(ctx, 15, 400, FONT.plex)
  ctx.fillStyle = 'rgba(235,235,235,0.85)'
  const lines = wrapLines(0, 72, 34)
  const shown = Math.floor(seg(t, 12.36, 12.6) * lines.length)
  for (let i = 0; i < shown; i++) {
    const l = lines[i]
    ctx.fillText(l.startsWith('#') && i % 7 === 0 ? '############################' : l, 286, 262 + i * 24)
  }
}

export const codeStorm: Scene = {
  id: 'wd2-012.35-code-storm',
  start: 12.35,
  end: 14.75,
  note: 'V2：execute? Y + 白色代码列 → 竖向白纸条（PowerShell）按原片 3×3 分区亮度曲线越铺越满，13.35–13.9 几乎全白 → 14.0 退去露出地图',
  render({ ctx, t }) {
    const f = fr(t)
    if (t < 13.12) codeColumn(ctx, t)
    const L = stormFrame(t)
    const epoch = Math.floor(f / 4)
    const paper = paperTex(false)
    const dark = paperTex(true)
    const sl = slots(epoch)
    for (let i = 0; i < sl.length; i++) {
      const s = sl[i]
      for (let k = 0; k < 12; k++) {
        const y0 = s.cuts[k]
        const y1 = s.cuts[k + 1]
        let c = coverage(L, s.x + s.w / 2, (y0 + y1) / 2)
        // 12.9 前左侧白色代码列本身抬高了分区亮度，扣掉这部分，免得误铺纸条
        if (t < 12.9 && s.x < 1100) c = clamp(c - 0.22)
        // 大部分阈值固定，小部分逐帧抖动
        const thr = 0.8 * h2(i * 13 + k, epoch >> 2, 97) + 0.2 * h2(i * 13 + k, f, 98)
        if (thr >= c) continue
        const kind = h2(i * 13 + k, epoch, 99)
        const sx = (h2(i, epoch, 100) * (1600 - s.w)) | 0
        const sy = (h2(k, i + epoch, 101) * 300) | 0
        const src = kind < 0.05 ? dark : paper
        ctx.drawImage(src, sx, sy + y0 * 0.3, s.w, y1 - y0, s.x, y0, s.w, y1 - y0)
        // 13.1–13.4 原片有荧光黄绿染色的纸条
        if (t > 13.1 && t < 13.42 && kind > 0.9) {
          ctx.fillStyle = 'rgba(150,170,40,0.55)'
          ctx.fillRect(s.x, y0, s.w, y1 - y0)
        }
      }
    }
    // 13.2–13.35 右侧暗红竖条
    if (t > 13.2 && t < 13.36) {
      ctx.fillStyle = '#6d1224'
      ctx.fillRect(1778, 0, 34, 1080)
    }
    // 纸条内偶发的黑色横条（逐帧故障）
    ctx.fillStyle = '#050505'
    for (let i = 0; i < 10; i++) {
      if (t > 14.0 || h2(i, f, 102) > 0.5) continue
      ctx.fillRect(h2(i, f, 103) * 1920, h2(i, f, 104) * 1080, 30 + h2(i, f, 105) * 120, 8 + h2(i, f, 106) * 40)
    }
  },
}

// ───────────────────────── 地图 + 点阵 + 方格网格 ─────────────────────────

/**
 * 网格几何（原片 15.2–19.4s 逐 0.1s 用格线亮度的傅里叶相位测出）：
 * 格宽 155，18.6 起拉远到 142（19.1）→ 132；竖线过 x≈1005（18.9 起右移 25）；
 * 整个网格（连同地图上的点）以约 124px/s 向上滚动，ay = 某条横线的 y（不取模）。
 */
export function gridGeo(t: number) {
  const cell = t < 18.6 ? 155 : t < 19.1 ? lerp(155, 142, seg(t, 18.6, 19.1)) : lerp(142, 132, seg(t, 19.1, 19.5))
  const gx = 1005 + 25 * seg(t, 18.9, 19.1)
  const ay = 427 - 124 * (t - 16.6)
  const base = ((ay % cell) + cell) % cell
  return { cell, gx, ay, base }
}

/** 某帧的格子状态（每格 4 象限：0 无 / 1 黑 / 2 白） */
function tileFrame(t: number): number[] {
  const i = clamp(Math.round((t - TILE_T0) / TILE_DT), 0, TILE_GRID.length - 1)
  return cached(`wd2p1:tilef:${i}`, () => {
    const h = TILE_GRID[i]
    const out: number[] = []
    for (let k = 0; k < h.length; k += 2) out.push(parseInt(h.slice(k, k + 2), 16))
    return out
  })
}

/** 画一格：4 象限同色画整块，否则按象限画三角（上/右/下/左，顶点在格心） */
function drawTile(ctx: CanvasRenderingContext2D, x: number, y: number, c: number, code: number, blackOk: boolean, whiteOk: boolean) {
  const q = [code & 3, (code >> 2) & 3, (code >> 4) & 3, (code >> 6) & 3].map((v) => ((v === 1 && !blackOk) || (v === 2 && !whiteOk) ? 0 : v))
  if (q[0] && q.every((v) => v === q[0])) {
    ctx.fillStyle = q[0] === 2 ? '#f0f0ec' : '#000'
    ctx.fillRect(x, y, c, c)
    return
  }
  const cx = x + c / 2
  const cy = y + c / 2
  const P: [number, number][] = [[x, y], [x + c, y], [x + c, y + c], [x, y + c]]
  for (let k = 0; k < 4; k++) {
    if (!q[k]) continue
    ctx.fillStyle = q[k] === 2 ? '#f0f0ec' : '#000'
    ctx.beginPath()
    ctx.moveTo(P[k][0], P[k][1])
    ctx.lineTo(P[(k + 1) % 4][0], P[(k + 1) % 4][1])
    ctx.lineTo(cx, cy)
    ctx.fill()
  }
}

/** 白色小方点：稀疏的 1–4 点小簇（原片是沿街散布的亮点，不是满 3×3 骰子） */
function diceDots(ctx: CanvasRenderingContext2D, alpha: number, count = 260, h = 1080) {
  if (alpha <= 0.01) return
  for (let i = 0; i < count; i++) {
    const x = h2(i, 1, 51) * 1920
    const y = h2(i, 2, 51) * h - (h - 1080) / 2
    const edge = Math.abs(x - 960) > 760
    ctx.fillStyle = edge ? `rgba(235,215,120,${alpha})` : `rgba(255,255,255,${alpha})`
    const n = 1 + Math.floor(h2(i, 3, 52) * 4)
    for (let k = 0; k < n; k++) {
      const dx = Math.floor(h2(i, k + 4, 52) * 3) * 26
      const dy = Math.floor(h2(i, k + 8, 52) * 3) * 26
      ctx.fillRect(x + dx, y + dy, 7, 7)
    }
  }
}

export const gridCollapse: Scene = {
  id: 'wd2-014.2-grid-collapse',
  start: 14.2,
  end: 19.45,
  note: 'V2：地图 + 白色小方点；155px 带 X 对角线的方格，方块/三角的逐帧状态按原片实测（grid-tiles.ts）；17.3 起网格缓慢拉远，17.4 起地图淡出，18.0 后只剩网格与点',
  render({ ctx, t }) {
    // 地图（14.2 从代码风暴里露出来，17.4–18.1 淡出）
    drawCityMap(ctx, t, 0.85 * (1 - seg(t, 17.4, 18.1)))
    const { cell, gx, ay, base } = gridGeo(t)
    const z = cell / 155
    ctx.save()
    // 地图上的红色疏排字 "WEST SIDE"（原片 16.6s 时 x≈590、y≈200/295，随网格上移）
    font(ctx, 64, 400, FONT.mono)
    tracking(ctx, 58)
    ctx.fillStyle = `rgba(200,30,40,${0.4 * seg(t, 14.6, 15.2) * (1 - seg(t, 18.8, 19.2))})`
    ctx.fillText('WEST', gx + (590 - gx) * z, ay + (200 - 427) * z)
    ctx.fillText('SIDE', gx + (590 - gx) * z, ay + (295 - 427) * z)
    tracking(ctx, 0)
    ctx.restore()
    const tiles = tileFrame(t)
    const blackOk = t < 18.2
    // 网格线出现：15.3 起逐步铺开（原片 15.5 仍只有零星格线，16.2 起完整）
    const lineA = 0.6 * seg(t, 15.3, 16.1)
    const row0 = Math.floor((ay - base) / cell + 0.5) // 世界行号偏移（让对角线/分格样式跟着格子走）
    ctx.lineWidth = 1.3
    for (let j = 0; j < TILE_ROWS; j++)
      for (let k = -7; k < 7; k++) {
        const x = gx + k * cell
        const y = base - cell + j * cell
        const code = tiles[j * 14 + (k + 7)]
        if (code) drawTile(ctx, x, y, cell, code, blackOk, t < 19.33) // 19.33 以后的白色是斜条碎片（shards 镜头负责）
        if (t < 19.35 && lineA > 0) {
          const s = k * 31 + (j - row0) * 17
          ctx.strokeStyle = `rgba(215,215,215,${lineA})`
          ctx.beginPath()
          ctx.rect(x, y, cell, cell)
          if (h2(s, 6, 61) < 0.85) {
            ctx.moveTo(x, y)
            ctx.lineTo(x + cell, y + cell)
            ctx.moveTo(x + cell, y)
            ctx.lineTo(x, y + cell)
          }
          if (h2(s, 5, 61) < 0.15) {
            ctx.moveTo(x + cell / 2, y)
            ctx.lineTo(x + cell / 2, y + cell)
            ctx.moveTo(x, y + cell / 2)
            ctx.lineTo(x + cell, y + cell / 2)
          }
          ctx.stroke()
        }
      }
    // 小方点：跟随网格滚动与缩放（点阵在一张 1920×2400 的平面上，随 ay 上移）
    ctx.save()
    ctx.translate(gx, ay)
    ctx.scale(z, z)
    ctx.translate(-gx, -427)
    diceDots(ctx, 0.95 * (1 - seg(t, 19.3, 19.45)), 420, 2400)
    ctx.restore()
  },
}

// ───────────────────────── 白色大碎片 + 散落方块 ─────────────────────────

/**
 * V2：按原片 19.35–19.60s 逐帧（每 0.05s 一张）量出的白色斜条多边形（1920×1080 坐标）。
 * 19.35 左下三角 + 右侧斜臂 → 19.40/19.45 两根交叉斜条（K / V 形）→ 19.50/19.55 单根斜条右移 → 19.60 右缘残片。
 */
const SHARD_FRAMES: [number, number][][][] = [
  [
    [[0, 570], [525, 1080], [0, 1080]],
    [[1680, 750], [1920, 510], [1920, 960], [1710, 930], [1530, 1080], [1380, 1080]],
  ],
  [
    [[0, 45], [60, 15], [885, 915], [990, 915], [990, 1035], [870, 1080], [720, 1080], [0, 375]],
    [[1770, 390], [1920, 384], [1260, 990], [1080, 1080], [1020, 1050]],
    [[1500, 915], [1770, 915], [1770, 1050], [1500, 1050]],
  ],
  [
    [[0, 0], [405, 0], [840, 495], [840, 900], [990, 900], [990, 1035], [885, 1035], [0, 75]],
    [[1680, 405], [1776, 378], [1155, 990], [1350, 1080], [1020, 1080], [1020, 750], [1116, 855]],
    [[1740, 915], [1860, 915], [1860, 1040], [1740, 1040]],
  ],
  [[[1020, 336], [1200, 336], [1380, 450], [1920, 945], [1920, 1080], [1830, 1080], [1020, 390]]],
  [[[1440, 390], [1500, 384], [1920, 810], [1920, 1035], [1455, 480]]],
  [[[1710, 165], [1920, 150], [1920, 270], [1720, 285]]],
]

export const shards: Scene = {
  id: 'wd2-019.35-shards',
  start: 19.35,
  end: 19.65,
  note: 'V2：白色斜条逐帧关键形（原片实测）：三角 → 交叉 K 形 → 单条右移 → 残片',
  render({ ctx, t }) {
    const i = Math.floor((t - 19.35) / 0.05 + 1e-6)
    const polys = SHARD_FRAMES[Math.min(i, SHARD_FRAMES.length - 1)]
    ctx.fillStyle = '#efefeb'
    for (const poly of polys) {
      ctx.beginPath()
      poly.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
      ctx.closePath()
      ctx.fill()
    }
  },
}

export const scatter: Scene = {
  id: 'wd2-019.4-scatter',
  start: 19.4,
  end: 22.9,
  note: '黑底散落白色小方块/小三角 + 少量红方块，逐帧闪烁、缓慢变少',
  render({ ctx, t }) {
    const f = fr(t)
    // V2：19.4–21.38 用原片逐帧测得的亮块位置（scatter-dots.ts），偶尔带红块
    const si = Math.floor((t - SCAT_T0) / SCAT_DT + 1e-6)
    if (si >= 0 && si < SCAT_FRAMES.length) {
      const h = SCAT_FRAMES[si]
      for (let k = 0; k + 8 <= h.length; k += 8) {
        const v = (o: number) => parseInt(h.slice(k + o, k + o + 2), 16)
        const red = h2(k, si >> 2, 73) < 0.03
        ctx.fillStyle = red ? '#d8331f' : '#f0f0ec'
        ctx.fillRect(v(0) * 8, v(2) * 8, v(4) * 4, v(6) * 4)
      }
      return
    }
    const n = 150
    const left = 1 - ease.inQuad(seg(t, 19.6, 22.6))
    for (let i = 0; i < n; i++) {
      if (h2(i, 1, 71) > left * 1.1) continue
      if (h2(i, f >> 1, 72) < 0.12) continue
      const x = h2(i, 2, 71) * 1920 + (t - 19.4) * (h2(i, 8, 71) - 0.5) * 20
      const y = h2(i, 3, 71) * 1000
      const s = h2(i, 4, 71) < 0.7 ? 8 : 14 + h2(i, 5, 71) * 8
      const red = h2(i, 6, 71) < 0.06
      ctx.fillStyle = red ? '#d8331f' : '#f0f0ec'
      if (h2(i, 7, 71) < 0.12) {
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(x + s * 1.3, y + s * 0.65)
        ctx.lineTo(x, y + s * 1.3)
        ctx.fill()
      } else ctx.fillRect(x, y, s, s)
    }
    // 小点簇（点阵残留）
    // 小点簇（网格点阵残留，继续随网格上移，21.3 起消失）
    const g = gridGeo(Math.min(t, 19.5))
    ctx.save()
    ctx.translate(g.gx, g.ay - 124 * Math.max(0, t - 19.5))
    ctx.scale(g.cell / 155, g.cell / 155)
    ctx.translate(-g.gx, -427)
    diceDots(ctx, 0.5 * (1 - seg(t, 21.0, 21.4)), 200, 2400)
    ctx.restore()
  },
}

// ───────────────────────── they were wrong. ─────────────────────────

/** 原片每 0.1s 量出的字宽（px/字）：文字从大号快速缩小（镜头拉远），整行 17 格（含光标）以 x≈955 居中 */
const TWW_ADV: [number, number][] = [
  [21.4, 97], [21.5, 88], [21.6, 72], [21.7, 63], [21.8, 57], [21.9, 53], [22.0, 49.5], [22.1, 46.6], [22.2, 45], [22.3, 43.5], [22.4, 43],
]
function twwAdv(t: number) {
  if (t <= TWW_ADV[0][0]) return TWW_ADV[0][1]
  for (let i = 0; i < TWW_ADV.length - 1; i++)
    if (t < TWW_ADV[i + 1][0]) return lerp(TWW_ADV[i][1], TWW_ADV[i + 1][1], seg(t, TWW_ADV[i][0], TWW_ADV[i + 1][0]))
  return 43
}

export const theyWereWrong: Scene = {
  id: 'wd2-021.35-they-were-wrong',
  start: 21.35,
  end: 22.9,
  note: 'V2：像素字乱码逐字解出 "they were wrong." + 块光标，同时整行从大号缩小（原片逐 0.1s 量字宽）；22.35 起只留光标闪烁',
  render({ ctx, t }) {
    const f = fr(t)
    const text = 'they were wrong.'
    const adv = twwAdv(t)
    // 按字宽反推字号（VT323 等宽）
    font(ctx, 100, 400, FONT.pixel)
    const unit = ctx.measureText('m').width / 100
    font(ctx, adv / unit, 400, FONT.pixel)
    const x0 = 955 - (17 * adv) / 2
    const cy = lerp(490, 516, seg(t, 21.4, 21.75))
    ctx.fillStyle = WD2.fg
    ctx.textBaseline = 'middle'
    const n = clamp(Math.floor(3 + (t - 21.4) * 20), 1, 16)
    // 已解出的字数（原片：21.7「they 」、21.9「they wer」、22.1「they were wr」、22.2 只差句点）
    const solved = Math.floor(t < 21.7 ? 0 : t < 22.1 ? lerp(5, 12, seg(t, 21.7, 22.1)) : lerp(12, 15.9, seg(t, 22.1, 22.2)))
    const junk = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefhiklmnoprsuvwxy_[]*`^@()'
    let cursorI = n
    if (t < 22.35) {
      for (let i = 0; i < n; i++) {
        const ch = t >= 22.28 || i < solved ? text[i] : junk[Math.floor(h2(i, f, 111) * junk.length)]
        if (ch !== ' ') ctx.fillText(ch, x0 + i * adv, cy)
      }
    } else cursorI = 16
    ctx.textBaseline = 'alphabetic'
    // 块状光标：打字时常亮，结束后闪烁（原片 22.4/22.5 都亮）
    if (t < 22.6 || Math.floor(f / 6) % 2 === 0) ctx.fillRect(x0 + cursorI * adv, cy - adv * 0.48, adv * 0.95, adv * 0.95)
  },
}
