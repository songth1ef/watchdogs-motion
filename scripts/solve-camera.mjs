// 从原片反求相机：调 Blender 无头跑 tools/blender/solve_camera.py，输出 assets/cameras/<name>.json
//
// 用法：
//   pnpm solve wd1 123.4 139.3 --name wd1-clay-city [透传给 solve_camera.py 的参数…]
//   pnpm solve preset wd1-clay-city-a        # 按 tools/blender/presets.json 里记录的参数重跑
//   pnpm solve preset all                    # 重跑全部预设
//   pnpm solve presets                       # 列出预设
// 透传参数见 solve_camera.py 顶部（--focal / --tripod / --threshold / --ignore x0,y0,x1,y1 …）。
// 环境变量 BLENDER 可覆盖 Blender 路径；--keep-frames 会把抽帧留在 /tmp/wd-solve/<name>/ 方便复查。
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'

const BLENDER = process.env.BLENDER || '/Applications/Blender.app/Contents/MacOS/Blender'
const SCRIPT = 'tools/blender/solve_camera.py'
const PRESETS = 'tools/blender/presets.json'
const VIDEOS = {
  wd1: ['public/reference/wd1.mp4'],
  wd2: ['public/reference/wd2-1080.mp4', 'public/reference/wd2.mp4'],
}

function usage(msg) {
  if (msg) console.error(msg)
  console.error('用法：pnpm solve <wd1|wd2> <起始秒> <结束秒> --name <名字> [solve_camera.py 参数…]\n      pnpm solve preset <名字|all>\n      pnpm solve presets')
  process.exit(1)
}

function video(film) {
  const v = (VIDEOS[film] || []).find((p) => existsSync(p))
  if (!v) usage(`找不到 ${film} 的参考视频（${(VIDEOS[film] || []).join(' / ') || '未知片名'}），见 README「原片参考」`)
  return v
}

async function run({ film, start, end, name, args = [] }) {
  if (!existsSync(BLENDER)) usage(`找不到 Blender：${BLENDER}（可用环境变量 BLENDER 指定）`)
  const keep = args.includes('--keep-frames')
  const blend = args.includes('--blend')
  const pass = args.filter((a) => a !== '--keep-frames' && a !== '--blend')
  // --blend：另存 Blender 工程到 assets/blender/<name>.blend（原片抽帧放同目录 <name>.frames/）
  if (blend) pass.push('--save-blend', `assets/blender/${name}.blend`)
  const out = `assets/cameras/${name}.json`
  mkdirSync('assets/cameras', { recursive: true })
  const cmd = ['-b', '--factory-startup', '--python', SCRIPT, '--',
    '--video', video(film), '--start', String(start), '--end', String(end), '--out', out, '--name', name, ...pass]
  if (keep && !pass.includes('--frames-dir')) cmd.push('--frames-dir', `/tmp/wd-solve/${name}`)
  console.log(`▶ ${name}：${film} ${start}–${end}s ${pass.join(' ')}`)
  const t0 = Date.now()
  if (existsSync(out)) rmSync(out)
  const child = spawn(BLENDER, cmd, { stdio: ['ignore', 'pipe', 'pipe'] })
  // Blender/libmv 的日志很吵，只实时转发本脚本自己的 [solve] 行和报错
  for (const stream of [child.stdout, child.stderr])
    createInterface({ input: stream }).on('line', (l) => {
      if (l.startsWith('[solve]') || /Traceback|Error:/.test(l)) console.log('  ' + l)
    })
  const code = await new Promise((res) => child.on('close', res))
  if (!existsSync(out)) {
    console.error(`✗ ${name}：没有输出（Blender 退出码 ${code}）`)
    return null
  }
  const j = JSON.parse(readFileSync(out, 'utf8'))
  const sec = ((Date.now() - t0) / 1000).toFixed(0)
  if (j.ok) console.log(`✓ ${name}：[${j.solve.grade}] 误差 ${j.solve.avgError}px，3D 点 ${j.solve.bundles}，${j.solve.solvedFrames}/${j.source.frames} 帧，焦距 ${j.intrinsics.focalMm}mm（vfov ${j.intrinsics.vfov}°），${sec}s → ${resolve(out)}`)
  else console.log(`✗ ${name}：${j.reason}（${sec}s）`)
  return j
}

const argv = process.argv.slice(2)
if (argv[0] === 'presets' || argv[0] === 'preset') {
  const presets = JSON.parse(readFileSync(PRESETS, 'utf8')).presets
  if (argv[0] === 'presets' || !argv[1]) {
    for (const p of presets) console.log(`${p.name.padEnd(26)} ${p.film} ${p.start}–${p.end}  ${(p.args || []).join(' ')}${p.comment ? '  # ' + p.comment : ''}`)
    process.exit(0)
  }
  const pick = argv[1] === 'all' ? presets : presets.filter((p) => p.name === argv[1])
  if (!pick.length) usage(`没有预设 ${argv[1]}`)
  const extra = argv.slice(2)
  for (const p of pick) await run({ ...p, args: [...(p.args || []), ...extra] })
} else {
  const [film, a, b, ...rest] = argv
  if (!film || a === undefined || b === undefined) usage()
  const ni = rest.indexOf('--name')
  const name = ni >= 0 ? rest[ni + 1] : `${film}-${a}-${b}`
  const args = ni >= 0 ? [...rest.slice(0, ni), ...rest.slice(ni + 2)] : rest
  const j = await run({ film, start: Number(a), end: Number(b), name, args })
  process.exit(j?.ok ? 0 : 2)
}
