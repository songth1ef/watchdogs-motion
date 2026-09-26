"""
把外部模型（glb / gltf）转成本工程可同步 import 的精简网格 JSON（只要几何，不要贴图/材质）。

用法（Blender 无头）：
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup -P src/films/wd1/part3/models/convert.py -- \
      <输入.glb> <输出.json> [目标三角形数=6000] [丢弃网格名正则=] [保留网格名正则=]

处理：导入 → 合并全部网格（应用变换）→ 可选丢弃部件 → Decimate（Collapse）到目标三角形数 →
      转 three.js 坐标（Blender Z-up → Y-up：(x, y, z) → (x, z, -y)）→ 水平居中、底面落在 y=0、最长边归一化为 1 →
      输出 {"v": [x,y,z,...]（4 位小数）, "i": [三角形索引...], "src": 来源文件名, "tris": 三角形数}。
原始下载缓存在 node_modules/.cache/wd-models-raw/（不入库），来源与许可见 assets/LICENSES.md「3D 模型」一节。
"""
import bpy, bmesh, sys, json, re, os

argv = sys.argv[sys.argv.index('--') + 1:]
src, dst = argv[0], argv[1]
target = int(argv[2]) if len(argv) > 2 else 6000
drop = re.compile(argv[3]) if len(argv) > 3 and argv[3] else None
keep = re.compile(argv[4]) if len(argv) > 4 and argv[4] else None

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
if drop:
    meshes = [o for o in meshes if not drop.search(o.name)]
if keep:
    meshes = [o for o in meshes if keep.search(o.name)]
print('网格：', [o.name for o in meshes])

bm = bmesh.new()
dg = bpy.context.evaluated_depsgraph_get()
for o in meshes:
    me = o.evaluated_get(dg).to_mesh()
    me.transform(o.matrix_world)
    bm.from_mesh(me)
    o.evaluated_get(dg).to_mesh_clear()
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
bmesh.ops.triangulate(bm, faces=bm.faces)
me = bpy.data.meshes.new('merged')
bm.to_mesh(me)
bm.free()
obj = bpy.data.objects.new('merged', me)
bpy.context.scene.collection.objects.link(obj)
tris = len(me.polygons)
if tris > target:
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    mod = obj.modifiers.new('dec', 'DECIMATE')
    mod.ratio = target / tris
    bpy.ops.object.modifier_apply(modifier='dec')
me = obj.data
bm = bmesh.new()
bm.from_mesh(me)
bmesh.ops.triangulate(bm, faces=bm.faces)
bm.to_mesh(me)
bm.free()

V = [(v.co.x, v.co.z, -v.co.y) for v in me.vertices]
xs, ys, zs = zip(*V)
cx, cz = (min(xs) + max(xs)) / 2, (min(zs) + max(zs)) / 2
y0 = min(ys)
s = 1.0 / max(max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs))
flat = []
for x, y, z in V:
    flat += [round((x - cx) * s, 4), round((y - y0) * s, 4), round((z - cz) * s, 4)]
idx = []
for p in me.polygons:
    idx += list(p.vertices)
json.dump({'src': os.path.basename(src), 'tris': len(me.polygons), 'v': flat, 'i': idx}, open(dst, 'w'), separators=(',', ':'))
print('输出', dst, '顶点', len(V), '三角形', len(me.polygons), '尺寸', [round((max(a) - min(a)) * s, 3) for a in (xs, ys, zs)])
