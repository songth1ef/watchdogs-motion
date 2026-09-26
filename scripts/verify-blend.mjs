// 临时验证脚本：打开 assets/blender/<名>.blend，打印工程设置，用 Workbench 渲染代理几何（透明底）
// 叠到同帧原片上，输出 snaps/camera/<名>-blend-sheet.png。确认「在 Blender 相机视图里代理几何贴合原片」。
// 用法：node scripts/verify-blend.mjs <名> [帧数=4]
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'

const BLENDER = process.env.BLENDER || '/Applications/Blender.app/Contents/MacOS/Blender'
const [name, count = '4'] = process.argv.slice(2)
if (!name) {
  console.error('用法：node scripts/verify-blend.mjs <名> [帧数]')
  process.exit(1)
}
const tmp = `/tmp/wd-verify-blend/${name}`
rmSync(tmp, { recursive: true, force: true })
mkdirSync(tmp, { recursive: true })
mkdirSync('snaps/camera', { recursive: true })
const py = `${tmp}/check.py`
writeFileSync(
  py,
  `import bpy, json, os
sc = bpy.context.scene
clip = sc.active_clip
cam = sc.camera
info = {"frames": [sc.frame_start, sc.frame_end], "fps": sc.render.fps / sc.render.fps_base,
        "res": [sc.render.resolution_x, sc.render.resolution_y], "clip": clip.filepath if clip else None,
        "clipFound": bool(clip) and clip.size[0] > 0, "tracks": len(clip.tracking.tracks) if clip else 0,
        "camera": cam.name if cam else None, "bg": [b.source for b in cam.data.background_images] if cam else [],
        "workspaces": [w.name for w in bpy.data.workspaces if w.name in ("Layout", "Motion Tracking")],
        "empties": sum(1 for o in bpy.data.objects if o.type == "EMPTY")}
print("INFO " + json.dumps(info, ensure_ascii=False))
n = ${Number(count)}
fs = [round(sc.frame_start + (sc.frame_end - sc.frame_start) * (i + 0.5) / n) for i in range(n)]
for f in fs:
    sc.frame_set(f)
    sc.render.filepath = "${tmp}/r%05d.png" % f
    bpy.ops.render.render(write_still=True)
print("FRAMES " + json.dumps(fs))
`,
)
const log = execFileSync(BLENDER, ['-b', `assets/blender/${name}.blend`, '--python', py], { encoding: 'utf8', maxBuffer: 1 << 26 })
const info = log.split('\n').find((l) => l.startsWith('INFO '))
const frames = JSON.parse(log.split('\n').find((l) => l.startsWith('FRAMES ')).slice(7))
console.log(info)
const outs = []
for (const f of frames) {
  const ref = `assets/blender/${name}.frames/${String(f).padStart(5, '0')}.jpg`
  const o = `${tmp}/c${f}.png`
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', ref, '-i', `${tmp}/r${String(f).padStart(5, '0')}.png`, '-filter_complex',
    '[0:v]scale=960:-2,eq=brightness=-0.1[b];[1:v]scale=960:-2,format=rgba,colorchannelmixer=aa=0.75[o];[b][o]overlay=0:0', o])
  outs.push(o)
}
const sheet = `snaps/camera/${name}-blend-sheet.png`
const inputs = outs.flatMap((o) => ['-i', o])
const cols = 2
const rows = Math.ceil(outs.length / cols)
const layout = outs.map((_, i) => `${(i % cols) * 960}_${Math.floor(i / cols) * 540}`).join('|')
execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...inputs, '-filter_complex',
  `${outs.map((_, i) => `[${i}:v]scale=960:540[s${i}]`).join(';')};${outs.map((_, i) => `[s${i}]`).join('')}xstack=inputs=${outs.length}:layout=${layout}:fill=black`,
  '-frames:v', '1', sheet])
console.log(`${sheet}（帧 ${frames.join(', ')}；rows=${rows}）`)
