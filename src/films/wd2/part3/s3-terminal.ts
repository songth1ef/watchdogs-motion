/**
 * 102.45–108.35s：
 *  - 102.45–103.1 黑白横条纹擦除转场（黑条里还能看到上一镜头的 "option"）
 *  - 103.1–105.4 白纸底 + 左侧 "+" 列 + 像素字 "execute?"，块光标闪烁 → 换行 → 敲入 "Y"
 *  - 105.4–107.4 PowerShell 代码逐行打印并整体上滚，窗口（路径栏 usr/thishere/thathere/test_773.cgi）叠加，
 *    灰色马赛克块、国防部公章 + "DTFN Estimates for Nano Domestic Quell"
 *  - 107.4–108.35 快切：黑色马克笔涂抹（机密涂黑）、WARNING / NAVAL INVESTIGATIVE 文件、SECRET 印章
 */
import type { FrameCtx } from '../../../engine/types'
import { clamp, ease, lerp, rng } from '../../../engine/math'
import { pixelate } from '../../../fx/image'
import { FONT } from '../../../fx/text'
import { sealSprite } from './art'
import { blink, clipRect, fh, fr, paperBg } from './common'
import { drawS2 } from './s2-type'

// ------------------------------------------------------------------ 代码内容（原片为 PowerShell Empire agent 片段）

export const CODE = `##################################################
$script:Headers = @()

# add any additional request s created with format $JobNameBase_[rand]
$JobNameBase = "Debug32"

# the currently imported script held in memory
$script:ImportedScript = ""

# calculate the diff between the servers epoch and the agent's
$script:EpochDiff = $Epoch - [math]::abs([Math]::Floor([decimal](Get-Date(Get-Date).ToUniversalTime()-uformat "%s")))

##################################################
# Command Helpers
##################################################

# set the delay/jitter
function Set-Delay {
    param([int]$d, [double]$j=0.0)
    $script:AgentDelay = $d
    $script:AgentJitter = $j
    "agent interval set to $script:AgentDelay seconds with a jitter of $script:AgentJitter"
}

# get the delay/jitter
function Get-Delay {
    "agent interval delay interval: $script:AgentDelay seconds with a jitter of $script:AgentJitter"
}

# set the killdate for the agent
function Set-Killdate {
    param([string]$date)
    $script:KillDate = $date
    "agent killdate set to $script:KillDate"
}

# get the killdate for the agent
function Get-Killdate {
    "agent killdate: $script:KillDate"
}

# set the working hours for the agent
function Set-WorkingHours {
    param([string]$hours)
    $script:WorkingHours = $hours
    "agent working hours set to $script:WorkingHours"
}

# get the working hours for the agent
function Get-WorkingHours {
    "agent working hours: $script:WorkingHours"
}

# basic system information
function Get-SysInfo {
    $str = $Servers[$ServerIndex]
    $str += '|' + [Environment]::UserDomainName+'|'+[Environment]::UserName+'|'+[Environment]::MachineName;
    $p = (gwmi Win32_NetworkAdapterConfiguration|Where{$_.IPAddress}|Select -Expand IPAddress);
    $str += '|' +@($true=$p[0];$false=$p)[$p.Length -lt 6];
    $str += '|' +(Get-WmiObject Win32_OperatingSystem).Name.split('|')[0];
    # if we're SYSTEM, we're high integrity
    if(([Environment]::UserName).ToLower() -eq "system"){
        $str += '|True'
    }
    else{
        # otherwise check the groups
        $str += '|'+($(whoami /groups) -join "").Contains("High Mandatory Level");
    }
    $n = [System.Diagnostics.Process]::GetCurrentProcess();
    $str += '|'+$n.ProcessName+'|'+$n.Id;
    $str += '|' + $PSVersionTable.PSVersion.Major
    $str
}

# add additional callback servers
function Add-Servers {
    param([string[]]$BackupServers)
    Foreach ($backup in $BackupServers) {
        $Servers = $Servers + $backup
    }
}
`.split('\n')

const LH = 15
const CODE_X = 288
const CODE_Y0 = 600
/** 代码行的内容坐标（空行只占 0.6 行高） */
const CODE_Y: number[] = (() => {
  const ys: number[] = []
  let y = 0
  for (const l of CODE) {
    ys.push(y)
    y += l.trim() ? LH : LH * 0.6
  }
  ys.push(y)
  return ys
})()
const CODE_H = CODE_Y[CODE.length]

/** 画一段循环代码：从内容坐标 y0 起，屏幕上 [clipTop, clipBottom] 范围内可见；maxLines 为已打印行数 */
function codeBlock(ctx: CanvasRenderingContext2D, x: number, y0: number, maxLines: number, top = -50, bottom = 1130, alpha = 1) {
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.font = `500 18px ${FONT.plex}`
  ctx.fillStyle = '#1a1a1a'
  ctx.textBaseline = 'middle'
  const n = CODE.length
  for (let i = 0; i < maxLines; i++) {
    const rep = Math.floor(i / n)
    const k = i % n
    const y = y0 + rep * CODE_H + CODE_Y[k]
    if (y < top) continue
    if (y > bottom) break
    if (CODE[k]) ctx.fillText(CODE[k], x, y)
    // 左侧细小的 "+" 点列
    ctx.fillText(k % 2 ? ':' : '+', x - 56, y)
  }
  ctx.restore()
}

// ------------------------------------------------------------------ 时间函数

/** 105.62 起整体上滚：先快后慢 */
function scrollAt(t: number) {
  if (t < 105.62) return 0
  if (t < 105.9) return 1400 * (t - 105.62)
  return 392 + 650 * (t - 105.9)
}

const EXEC_Y = 505

function plusColumn(ctx: CanvasRenderingContext2D, scroll: number, hasInputLine: boolean) {
  ctx.save()
  ctx.font = `700 34px ${FONT.sans}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (let k = -12; k < 60; k++) {
    if (k === 0 || k === -8 || (k === 1 && hasInputLine)) continue
    const y = EXEC_Y - 13 + 51 * k - scroll
    if (y < -30 || y > 1110) continue
    ctx.fillStyle = 'rgba(235,190,20,0.8)'
    ctx.fillText('+', 258, y)
    ctx.fillStyle = 'rgba(40,80,230,0.6)'
    ctx.fillText('+', 262, y)
    ctx.fillStyle = '#0c0c0c'
    ctx.fillText('+', 260, y)
  }
  ctx.restore()
}

function executePrompt(ctx: CanvasRenderingContext2D, t: number, scroll: number) {
  const y = EXEC_Y - scroll
  if (y < -60) return
  ctx.save()
  ctx.font = `400 62px ${FONT.pixel}`
  ctx.fillStyle = '#0c0c0c'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText('execute?', 250, y)
  const ew = ctx.measureText('execute?').width
  const cw = 20
  const ch = 32
  const y2 = y + 51
  if (t < 103.95) {
    if (blink(t - 103.1, 0.5)) ctx.fillRect(250 + ew + 6, y - ch + 2, cw, ch)
  } else if (t < 104.75) {
    if (blink(t - 103.95, 0.5)) ctx.fillRect(252, y2 - ch + 2, cw, ch)
  } else {
    ctx.fillText('Y', 250, y2)
    const yw = ctx.measureText('Y').width
    if (t >= 105.35 || blink(t - 104.75, 0.5)) ctx.fillRect(250 + yw + 6, y2 - ch + 2, cw, ch)
  }
  ctx.restore()
}

// ------------------------------------------------------------------ 窗口

interface Win {
  t: number
  x: number
  w: number
  /** 出现时的屏幕 y（之后随内容上滚） */
  y: number
  codeOff: number
}
const WINS: Win[] = [
  { t: 105.95, x: 0, w: 1436, y: 1011, codeOff: 22 },
  { t: 106.45, x: 140, w: 1300, y: 1040, codeOff: 5 },
  { t: 106.78, x: 0, w: 1430, y: 980, codeOff: 40 },
  { t: 107.12, x: 1380, w: 700, y: 760, codeOff: 60 },
]

function windowBox(ctx: CanvasRenderingContext2D, w: Win, sy: number, t: number) {
  const bh = 33
  // 窗体：白底细框 + 右侧粗黑阴影
  ctx.fillStyle = 'rgba(246,246,243,0.93)'
  ctx.fillRect(w.x, sy, w.w, 900)
  ctx.fillStyle = '#0a0a0a'
  ctx.fillRect(w.x + w.w, sy + 18, 16, 900)
  ctx.strokeStyle = '#222'
  ctx.lineWidth = 1.5
  ctx.strokeRect(w.x + 0.5, sy + 0.5, w.w - 22, 900)
  clipRect(ctx, w.x, sy + bh, w.w - 22, 900, () => codeBlock(ctx, w.x + CODE_X - 10, sy + bh + 20 - w.codeOff * LH, 400, sy, sy + 900))
  // 标题栏
  ctx.fillStyle = '#050505'
  ctx.fillRect(w.x, sy, w.w - 80, bh)
  ctx.strokeStyle = '#050505'
  ctx.lineWidth = 2
  ctx.strokeRect(w.x + w.w - 80, sy, 36, bh)
  ctx.strokeRect(w.x + w.w - 44, sy, 36, bh)
  ctx.beginPath()
  ctx.moveTo(w.x + w.w - 44, sy + bh)
  ctx.lineTo(w.x + w.w - 8, sy)
  ctx.stroke()
  ctx.font = `400 30px ${FONT.pixel}`
  ctx.fillStyle = '#f2f2f2'
  ctx.textBaseline = 'middle'
  ctx.fillText('usr/thishere/thathere/test_773.cgi', w.x + 70, sy + bh / 2 + 1)
  ctx.textBaseline = 'alphabetic'
  // 窗口刚弹出时的前两帧闪一下
  if (t - w.t < 2 / 60) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)'
    ctx.fillRect(w.x, sy, w.w, bh)
  }
}

// ------------------------------------------------------------------ 马赛克灰块 / 公章 / 涂黑 / 机密文件

function mosaicBlocks(ctx: CanvasRenderingContext2D, t: number, amount: number) {
  const R = rng(1060 + Math.floor(t * 10))
  const n = Math.floor(6 * amount)
  for (let i = 0; i < n; i++) {
    const cx = R.range(0, 1500)
    const cy = R.range(100, 1000)
    const cell = R.pick([34, 48, 60])
    const cw = R.int(3, 9)
    const chh = R.int(2, 5)
    for (let a = 0; a < cw; a++)
      for (let b = 0; b < chh; b++) {
        if (R.chance(0.3)) continue
        const v = Math.floor(R.range(150, 235))
        ctx.fillStyle = `rgba(${v},${v},${v},${R.range(0.5, 0.95)})`
        ctx.fillRect(cx + a * cell, cy + b * cell, cell, cell)
      }
  }
}

function seal(ctx: CanvasRenderingContext2D, t: number) {
  const p = clamp((t - 107.0) / 0.45)
  const cy = lerp(1000, 720, ease.outCubic(p))
  const r = lerp(360, 430, p)
  // 标题（灰色双影）
  ctx.save()
  ctx.font = `400 50px ${FONT.sans}`
  ctx.fillStyle = 'rgba(70,70,70,0.75)'
  ctx.fillText('DTFN Estimates for Nano Domestic Quell', 0, cy - r - 230)
  ctx.fillText('Phase 4 Updated Compliance', 150, cy - r - 170)
  ctx.fillStyle = 'rgba(70,70,70,0.35)'
  ctx.fillText('DTFN Estimates for Nano Domestic Quell', 8, cy - r - 222)
  ctx.restore()
  // 原片公章是低清扫描件：马赛克化后再叠一层半透明原图
  pixelate(ctx, sealSprite(700), 670 - r, cy - r, r * 2, r * 2, 9)
  ctx.save()
  ctx.globalAlpha = 0.35
  ctx.drawImage(sealSprite(700), 670 - r, cy - r, r * 2, r * 2)
  ctx.restore()
  // 公章上横穿一条窗口标题栏
  ctx.fillStyle = '#060606'
  ctx.fillRect(420, cy - 30, 880, 26)
}

/** 马克笔涂黑：边缘毛糙的粗黑横条 */
function marker(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, seed: number) {
  const R = rng(seed)
  ctx.fillStyle = '#060606'
  ctx.beginPath()
  const steps = Math.ceil(w / 30)
  ctx.moveTo(x, y + R.range(0, h * 0.3))
  for (let i = 1; i <= steps; i++) ctx.lineTo(x + (i / steps) * w, y + R.range(-h * 0.1, h * 0.25))
  ctx.lineTo(x + w + R.range(0, 30), y + h * 0.5)
  for (let i = steps; i >= 0; i--) ctx.lineTo(x + (i / steps) * w, y + h + R.range(-h * 0.25, h * 0.1))
  ctx.lineTo(x - R.range(0, 25), y + h * 0.5)
  ctx.closePath()
  ctx.fill()
}

function redactions(ctx: CanvasRenderingContext2D, t: number) {
  const k = fr(t) - fr(107.6)
  const R = rng(1076)
  const total = 18
  const shown = clamp(Math.floor(k / 1.3) + 3, 0, total)
  for (let i = 0; i < shown; i++) {
    const y = R.range(0, 1000)
    const x = R.range(40, 260)
    marker(ctx, x, y, R.range(500, 900), R.range(34, 60), 900 + i)
  }
  // 窗口竖边（粗黑线）
  ctx.fillStyle = '#060606'
  ctx.fillRect(1318, 0, 16, 1080)
  ctx.fillRect(1438, 0, 12, 1080)
}

function warningDoc(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(s, s)
  ctx.fillStyle = '#f7f7f4'
  ctx.fillRect(0, 0, 640, 900)
  ctx.strokeStyle = '#222'
  ctx.lineWidth = 2
  ctx.strokeRect(0, 0, 640, 900)
  ctx.beginPath()
  ctx.arc(60, 60, 34, 0, Math.PI * 2)
  ctx.stroke()
  ctx.fillStyle = '#111'
  ctx.font = `800 58px ${FONT.sans}`
  ctx.fillText('WARNING', 150, 75)
  ctx.font = `500 30px ${FONT.sans}`
  ctx.fillText('NAVAL INVESTIGATIVE', 120, 120)
  ctx.font = `400 15px ${FONT.plex}`
  const R = rng(1080)
  for (let i = 0; i < 26; i++) {
    const w = R.range(200, 560)
    ctx.fillStyle = 'rgba(30,30,30,0.7)'
    ctx.fillRect(40, 170 + i * 26, w, 7)
  }
  ctx.restore()
}

function secretStamp(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(-0.08)
  ctx.font = `800 50px ${FONT.mono}`
  ctx.fillStyle = 'rgba(20,20,20,0.85)'
  ctx.fillText('SECRET', 0, 0)
  ctx.strokeStyle = 'rgba(20,20,20,0.85)'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(60, -60)
  ctx.lineTo(150, 20)
  ctx.moveTo(150, -60)
  ctx.lineTo(70, 20)
  ctx.stroke()
  // 手写潦草数字
  ctx.lineWidth = 2.5
  ctx.beginPath()
  for (let i = 0; i < 5; i++) {
    const yy = 60 + i * 34
    ctx.moveTo(-30, yy)
    for (let j = 0; j < 8; j++) ctx.lineTo(-30 + j * 22, yy + ((i + j) % 2 ? -12 : 8))
  }
  ctx.stroke()
  ctx.restore()
}

// ------------------------------------------------------------------ 组合

function terminal(f: FrameCtx) {
  const { ctx, W, H, t } = f
  paperBg(ctx, W, H, '#f4f4f1', 'rgba(110,110,105,0.32)')
  const scroll = scrollAt(t)
  plusColumn(ctx, scroll, t >= 103.95)
  executePrompt(ctx, t, scroll)
  if (t >= 105.38) {
    const n = Math.floor((t - 105.38) * 55) + 1
    codeBlock(ctx, CODE_X, CODE_Y0 - scroll, n)
  }
  for (const w of WINS) {
    if (t < w.t) continue
    const sy = w.y - (scroll - scrollAt(w.t))
    windowBox(ctx, w, sy, t)
  }
  if (t >= 106.55) mosaicBlocks(ctx, t, clamp((t - 106.55) / 0.3) * (t > 107.3 ? 1.6 : 1))
  if (t >= 107.0 && t < 107.47) seal(ctx, t)
  if (t >= 107.6) redactions(ctx, t)
  if (t >= 108.0) {
    warningDoc(ctx, 1480 - (t - 108) * 200, 330 - (t - 108) * 300, 0.75)
    if (t >= 108.08) secretStamp(ctx, 1000, 560 - (t - 108) * 300)
  }
  // 快切时偶尔整帧上下跳一下（原片 107.4 起的逐帧快切）
  if (t >= 107.4 && fh(t, 3) < 0.25) {
    const snap = ctx.getImageData(0, 0, W, H)
    ctx.putImageData(snap, 0, Math.round((fh(t, 4) - 0.5) * 120))
  }
}

/** 横条纹擦除：黑条里保留上一镜头 */
function stripes(f: FrameCtx) {
  const { ctx, t } = f
  terminal(f)
  const p = ease.inOutCubic(clamp((t - 102.45) / 0.62))
  const black = lerp(0.82, 0, p)
  if (black <= 0.01) return
  const period = 156
  ctx.save()
  ctx.beginPath()
  for (let y = -period; y < 1080 + period; y += period) {
    const h = period * black
    // 条纹略微倾斜
    ctx.moveTo(0, y + 6)
    ctx.lineTo(1920, y - 6)
    ctx.lineTo(1920, y - 6 + h)
    ctx.lineTo(0, y + 6 + h)
    ctx.closePath()
  }
  ctx.clip()
  drawS2({ ...f, t: Math.min(t, 102.44) })
  ctx.restore()
}

export function drawS3(f: FrameCtx) {
  if (f.t < 103.1) return stripes(f)
  terminal(f)
}
