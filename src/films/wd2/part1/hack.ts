/**
 * 12.35–22.9s：代码窗风暴（PowerShell 脚本白纸条）→ 地图 + 白色点阵 → 方格/三角网格铺满（and cripple the entire grid）
 * → 白色大碎片扫过 → 黑底散落白方块 → 像素字乱码打出 "they were wrong."
 */
import type { Scene } from '../../../engine/types'
import { clamp, ease, lerp, seg } from '../../../engine/math'
import { FONT, font, scramble, tracking } from '../../../fx/text'
import { WD2 } from '../../../theme'
import { drawCityMap } from './ctos-city'
import { fr, h2 } from './lib'

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

interface Panel {
  x: number
  y: number
  w: number
  h: number
  a: number
  b: number
  kind: 'paper' | 'black' | 'red' | 'teal' | 'strip'
  seed: number
}

/** 预生成纸条：时间窗 [a,b]，风暴在 12.9–13.5 最密 */
function panels(): Panel[] {
  const out: Panel[] = []
  for (let i = 0; i < 150; i++) {
    const r = (k: number) => h2(i, k, 1207)
    const center = 12.62 + r(1) * 1.25
    const life = 0.1 + r(2) * 0.4
    const a = Math.max(12.6, center - life / 2)
    const b = Math.min(14.2, center + life / 2)
    const roll = r(3)
    const kind: Panel['kind'] = roll < 0.6 ? 'paper' : roll < 0.8 ? 'black' : roll < 0.85 ? 'red' : roll < 0.88 ? 'teal' : 'strip'
    const wide = r(4) < 0.25
    const w = kind === 'strip' ? 8 + r(9) * 30 : wide ? 160 + r(10) * 260 : 18 + r(10) * r(10) * 150
    const full = r(5) < 0.7
    const y = full ? -20 : r(8) * 600 - 100
    const h = full ? 1120 : 250 + r(11) * 700
    out.push({ x: r(6) * 1960 - 40, y, w, h, a, b, kind, seed: i })
  }
  // 12.5 时画面上已有的两张纸条（原片 "$Retries = 1" 那两张）
  out.push({ x: 556, y: 648, w: 192, h: 460, a: 12.36, b: 12.66, kind: 'paper', seed: 900 })
  out.push({ x: 822, y: 300, w: 170, h: 800, a: 12.36, b: 12.66, kind: 'paper', seed: 901 })
  // 14.0 以后残留在顶部的一张
  out.push({ x: 996, y: -10, w: 360, h: 470, a: 13.7, b: 14.35, kind: 'paper', seed: 902 })
  return out
}
const PANELS = panels()

function drawPanel(ctx: CanvasRenderingContext2D, p: Panel, f: number) {
  // 纸条在生命期内偶尔整条横向跳动（逐帧故障）
  const jump = h2(p.seed, f >> 1, 3) < 0.15 ? (h2(p.seed, f, 4) - 0.5) * 80 : 0
  const x = p.x + jump
  if (p.kind === 'black') {
    ctx.fillStyle = '#050505'
    ctx.fillRect(x, p.y, p.w, p.h)
    return
  }
  if (p.kind === 'red' || p.kind === 'teal') {
    ctx.fillStyle = p.kind === 'red' ? '#7e1330' : '#2f9fbe'
    ctx.fillRect(x, p.y, p.w, p.h)
    ctx.fillStyle = 'rgba(0,0,0,0.35)'
    for (let i = 0; i < 8; i++) ctx.fillRect(x + h2(p.seed, i, 5) * p.w, p.y + h2(p.seed, i, 6) * p.h, 20 + h2(p.seed, i, 7) * 60, 6 + h2(p.seed, i, 8) * 30)
    return
  }
  ctx.fillStyle = '#ecece8'
  ctx.fillRect(x, p.y, p.w, p.h)
  if (p.kind === 'strip') return
  const size = p.w < 170 ? 12 : 13
  const lh = size * 1.35
  font(ctx, size, 400, FONT.plex)
  ctx.fillStyle = '#1a1a1a'
  const cols = Math.max(3, Math.floor((p.w - 16) / (size * 0.6)))
  const rows = Math.floor((p.h - 16) / lh)
  const lines = wrapLines(p.seed * 3, cols, rows)
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, p.y, p.w, p.h)
  ctx.clip()
  for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], x + 8, p.y + 20 + i * lh)
  // 零星黑色涂抹块
  for (let i = 0; i < 3; i++) if (h2(p.seed, i, 9) < 0.5) ctx.fillRect(x + h2(p.seed, i, 10) * p.w, p.y + h2(p.seed, i, 11) * p.h, 20 + h2(p.seed, i, 12) * 50, 14)
  ctx.restore()
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
  end: 14.35,
  note: '代码窗风暴：execute? Y + 白色代码列 → 大量白纸条（PowerShell 脚本）/黑条/红青色条逐帧闪现铺满 → 14.0 退去',
  render({ ctx, t }) {
    const f = fr(t)
    if (t < 13.45) codeColumn(ctx, t)
    for (const p of PANELS) {
      if (t < p.a || t >= p.b) continue
      // 生命期内按帧随机闪断
      if (h2(p.seed, f, 13) < 0.12) continue
      drawPanel(ctx, p, f)
    }
  },
}

// ───────────────────────── 地图 + 点阵 + 方格网格 ─────────────────────────

const CELL = 155
const OX = 80
const OY = 70

/** 白色「骰子点」簇：3×3 格里随机亮几个方点 */
function diceDots(ctx: CanvasRenderingContext2D, alpha: number, drift: number, count = 300) {
  ctx.fillStyle = `rgba(255,255,255,${alpha})`
  for (let i = 0; i < count; i++) {
    const x = h2(i, 1, 51) * 1920 + drift
    const y = h2(i, 2, 51) * 1080
    for (let k = 0; k < 9; k++) {
      if (h2(i, k + 3, 52) < 0.45) continue
      ctx.fillRect(x + (k % 3) * 13, y + Math.floor(k / 3) * 13, 6, 6)
    }
  }
}

type Tile = 'black' | 'white' | 'tri0' | 'tri1' | 'tri2' | 'tri3' | 'none'

/** 某个格子在某帧的状态（出现时间、类型、偶尔跳变） */
function tileAt(i: number, j: number, t: number, f: number, sub = 0): Tile {
  const s = i * 31 + j * 17 + sub * 7
  const a = 15.4 + h2(s, 1, 61) * 2.2
  const d = 18.0 + h2(s, 2, 61) * 1.0
  if (t < a || t > d) return 'none'
  // 每 3 帧有概率换形
  const roll = h2(s, (f / 3) | 0, h2(s, 3, 61) < 0.3 ? 62 : 63)
  const late = t > 18.0
  if (roll < (late ? 0.85 : 0.5)) return late ? 'none' : 'black'
  if (roll < 0.6) return 'white'
  if (roll < 0.74) return (['tri0', 'tri1', 'tri2', 'tri3'] as const)[Math.floor(h2(s, 4, 61) * 4)]
  return 'none'
}

function drawTile(ctx: CanvasRenderingContext2D, x: number, y: number, c: number, tile: Tile) {
  if (tile === 'none') return
  if (tile === 'black') {
    ctx.fillStyle = '#000'
    ctx.fillRect(x, y, c, c)
    return
  }
  ctx.fillStyle = '#f0f0ec'
  if (tile === 'white') {
    ctx.fillRect(x, y, c, c)
    return
  }
  // 三角：以格子中心为顶点、贴一条边
  const cx = x + c / 2
  const cy = y + c / 2
  ctx.beginPath()
  if (tile === 'tri0') {
    ctx.moveTo(x, y)
    ctx.lineTo(x + c, y)
  } else if (tile === 'tri1') {
    ctx.moveTo(x + c, y)
    ctx.lineTo(x + c, y + c)
  } else if (tile === 'tri2') {
    ctx.moveTo(x + c, y + c)
    ctx.lineTo(x, y + c)
  } else {
    ctx.moveTo(x, y + c)
    ctx.lineTo(x, y)
  }
  ctx.lineTo(cx, cy)
  ctx.fill()
}

export const gridCollapse: Scene = {
  id: 'wd2-014.2-grid-collapse',
  start: 14.2,
  end: 19.45,
  note: 'ASSET 地图 + 白色骰子点阵；15.4 起 155px 方格（带 X 对角线）逐格翻出黑块/白块/白三角并逐帧跳变，17.4 起地图淡出，18.0 起方块退去只剩网格与点',
  render({ ctx, t }) {
    const f = fr(t)
    // 地图（14.2 从代码风暴里露出来，17.4–18.4 淡出）
    drawCityMap(ctx, t, 0.8 * (1 - seg(t, 17.4, 18.4)))
    ctx.save()
    // 地图上的红色疏排字 "WEST SIDE"
    font(ctx, 34, 400, FONT.mono)
    tracking(ctx, 30)
    ctx.fillStyle = `rgba(224,36,43,${0.35 * (1 - seg(t, 17.5, 18.2))})`
    ctx.fillText('WEST', 590, 390)
    ctx.fillText('SIDE', 590, 470)
    tracking(ctx, 0)
    ctx.restore()
    const drift = -(t - 14.2) * 6
    // 网格与方块
    const cols = 13
    const rows = 7
    ctx.lineWidth = 1.2
    for (let i = -1; i < cols; i++)
      for (let j = -1; j < rows; j++) {
        const x = OX + i * CELL + drift
        const y = OY + j * CELL
        const s = i * 31 + j * 17
        const a = 15.3 + h2(s, 1, 61) * 2.2
        if (t < a) continue
        const split = h2(s, 5, 61) < 0.25
        if (split) {
          const c = CELL / 2
          for (let k = 0; k < 4; k++) drawTile(ctx, x + (k % 2) * c, y + (k >> 1) * c, c, tileAt(i, j, t, f, k + 1))
        } else drawTile(ctx, x, y, CELL, tileAt(i, j, t, f))
        // 网格线 + X 对角线（19.3 前一直在）
        if (t < 19.35) {
          ctx.strokeStyle = 'rgba(210,210,210,0.55)'
          ctx.beginPath()
          ctx.rect(x, y, CELL, CELL)
          if (h2(s, 6, 61) < 0.7) {
            ctx.moveTo(x, y)
            ctx.lineTo(x + CELL, y + CELL)
            ctx.moveTo(x + CELL, y)
            ctx.lineTo(x, y + CELL)
          }
          if (split) {
            ctx.moveTo(x + CELL / 2, y)
            ctx.lineTo(x + CELL / 2, y + CELL)
            ctx.moveTo(x, y + CELL / 2)
            ctx.lineTo(x + CELL, y + CELL / 2)
          }
          ctx.stroke()
        }
      }
    // 骰子点阵：一直在，19.3 前后开始散开
    diceDots(ctx, 0.9 * (1 - seg(t, 19.3, 19.45)), drift)
  },
}

// ───────────────────────── 白色大碎片 + 散落方块 ─────────────────────────

export const shards: Scene = {
  id: 'wd2-019.35-shards',
  start: 19.35,
  end: 19.65,
  note: '两块巨大的白色斜向碎片（"K" 字形）一闪扫过',
  render({ ctx, t }) {
    const k = ease.outCubic(seg(t, 19.35, 19.65))
    ctx.fillStyle = '#f0f0ec'
    ctx.save()
    ctx.translate(lerp(-120, 160, k), lerp(-80, 60, k))
    ctx.beginPath()
    ctx.moveTo(380, -40)
    ctx.lineTo(560, -40)
    ctx.lineTo(860, 330)
    ctx.lineTo(860, 380)
    ctx.lineTo(760, 380)
    ctx.lineTo(560, 160)
    ctx.lineTo(440, 160)
    ctx.closePath()
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(1180, 1080)
    ctx.lineTo(850, 700)
    ctx.lineTo(1010, 560)
    ctx.lineTo(1260, 360)
    ctx.lineTo(1160, 580)
    ctx.lineTo(1050, 720)
    ctx.lineTo(1400, 1080)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  },
}

export const scatter: Scene = {
  id: 'wd2-019.4-scatter',
  start: 19.4,
  end: 22.9,
  note: '黑底散落白色小方块/小三角 + 少量红方块，逐帧闪烁、缓慢变少',
  render({ ctx, t }) {
    const f = fr(t)
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
    diceDots(ctx, 0.5 * left * (1 - seg(t, 21.3, 21.6)) * clamp((t - 19.45) / 0.1), 0, 110)
  },
}

// ───────────────────────── they were wrong. ─────────────────────────

export const theyWereWrong: Scene = {
  id: 'wd2-021.35-they-were-wrong',
  start: 21.35,
  end: 22.9,
  note: '像素字（VT323）乱码逐字解出 "they were wrong." + 白色块光标；22.3 起文字消失只留光标闪烁',
  render({ ctx, t }) {
    const f = fr(t)
    const text = 'they were wrong.'
    font(ctx, 84, 400, FONT.pixel)
    tracking(ctx, 4)
    ctx.fillStyle = WD2.fg
    const x = 462
    const y = 1080 * 0.5 + 22
    const p = seg(t, 21.35, 22.15)
    let shown = ''
    if (t < 22.3) {
      const n = Math.max(1, Math.round(p * text.length))
      shown = scramble(text.slice(0, n), clamp((p * text.length - n + 3) / 3), f, 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefhiklmnoprsuvwxy_[]*`^')
      if (p >= 1) shown = text
      ctx.fillText(shown, x, y)
    }
    const cw = ctx.measureText(t < 22.3 ? shown : text).width
    tracking(ctx, 0)
    // 块状光标：打字时常亮，结束后闪烁
    if (t < 22.3 || Math.floor(f / 6) % 2 === 0) ctx.fillRect(x + cw + 6, y - 50, 40, 46)
  },
}
