"""
从原片反求相机（Blender 无头运行）。

用法（一般经 scripts/solve-camera.mjs 调用）：
  Blender -b --factory-startup --python tools/blender/solve_camera.py -- \
      --video public/reference/wd1.mp4 --start 123.4 --end 139.3 --out assets/cameras/x.json \
      [--focal 35] [--sensor 36] [--no-refine] [--tripod] [--fps 30] [--threshold 0.002] ...

流程：
  1. ffmpeg 把 [start, end) 抽成 JPG 序列（按 --fps 重采样；帧 i 对应影片时间 start + (i-1)/fps）
  2. 载入 MovieClip，设置跟踪默认参数
  3. 每隔 --detect-every 帧 detect_features（Harris 角点，阈值 --threshold），
     剔除与已有轨迹重合的新点，然后从该帧向前、向后双向 track_markers
  4. 清理：删掉少于 --min-track-len 帧的短轨
  5. camera solve（自动选关键帧；可 refine 焦距；--tripod 走纯旋转解算），
     再删掉重投影误差 > --max-error 的轨迹，重解，迭代 --passes 次
  6. 输出每帧相机（位置、四元数、垂直 fov、该帧 solve 误差）+ 若干稳定 3D 点

坐标系（JSON 里全部是 Blender 约定，Z-up 右手系；转换到 three.js 在 TS 侧 camera-track.ts 做）：
  - 世界：+Z 朝上。反求结果只有相对尺度与任意朝向；--orient floor 时会把点云主平面（城市地面/屋顶群）
    旋到 XY 平面、法线朝 +Z、质心移到原点，其余情况保持 Blender 解算器给出的任意坐标。
  - 相机局部轴：看向 -Z、+Y 为画面上方、+X 为画面右方 —— 与 three.js 相机局部轴完全一致，
    所以四元数只需左乘一个世界系变换（Z-up → Y-up：绕 X 轴 -90°，(x,y,z)→(x,z,-y)）。
  - 四元数存为 [x, y, z, w]（与 THREE.Quaternion.set 的参数顺序一致）。
  - fov 为垂直视场角（度），与 THREE.PerspectiveCamera.fov 同义。
  - 像素坐标（points[].px 等）：左上角原点、单位为原片像素。
"""
import argparse
import json
import math
import os
import shutil
import subprocess
import sys
import tempfile

import bpy
from mathutils import Matrix, Vector

try:
    import numpy as np
except Exception:  # Blender 自带 numpy，防御一下
    np = None


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser(description="从视频片段反求相机")
    p.add_argument("--video", required=True)
    p.add_argument("--start", type=float, required=True, help="起始秒（影片时间）")
    p.add_argument("--end", type=float, required=True, help="结束秒（影片时间）")
    p.add_argument("--out", required=True, help="输出 JSON 路径")
    p.add_argument("--focal", type=float, default=35.0, help="焦距初值（mm）")
    p.add_argument("--sensor", type=float, default=36.0, help="传感器宽（mm）")
    p.add_argument("--focal-range", type=float, default=4.0, help="refine 后焦距超出 [初值/k, 初值*k] 视为跑飞，锁定初值重解")
    p.add_argument("--no-refine", action="store_true", help="不优化焦距（焦距已知时用）")
    p.add_argument("--tripod", action="store_true", help="纯旋转（三脚架）解算：相机只转不移时用")
    p.add_argument("--fps", type=float, default=0, help="抽帧帧率（0 = 原生帧率；WD2 60fps 容器里内容是 30fps，可传 29.97）")
    p.add_argument("--threshold", type=float, default=0.002, help="detect_features 的 Harris 阈值（越小点越多）")
    p.add_argument("--min-distance", type=int, default=36, help="特征点之间最小像素距离")
    p.add_argument("--margin", type=int, default=24, help="离画面边缘的最小像素距离")
    p.add_argument("--detect-every", type=int, default=8, help="每隔多少帧补一次特征点")
    p.add_argument("--pattern", type=int, default=21, help="跟踪模板尺寸（px）")
    p.add_argument("--search", type=int, default=91, help="搜索窗尺寸（px）")
    p.add_argument("--motion", default="LocRotScale", help="跟踪运动模型：Loc/LocRot/LocScale/LocRotScale/Affine/Perspective")
    p.add_argument("--match", default="PREV_FRAME", help="模板匹配：PREV_FRAME（抗外观变化）/ KEYFRAME（漂移小）")
    p.add_argument("--corr", type=float, default=0.8, help="最小相关系数，低于即判定丢失")
    p.add_argument("--min-track-len", type=int, default=12, help="短于此帧数的轨迹在 solve 前删除")
    p.add_argument("--max-error", type=float, default=2.0, help="solve 后删除重投影误差大于此值（px）的轨迹再重解")
    p.add_argument("--epi-thr", type=float, default=1.5, help="对极几何预筛阈值（px，Sampson 距离）；0 = 关闭预筛")
    p.add_argument("--epi-gap", type=int, default=6, help="对极预筛用的帧间隔")
    p.add_argument("--min-tracks", type=int, default=40, help="删高误差轨迹时至少保留这么多条")
    p.add_argument("--passes", type=int, default=6, help="「删高误差轨迹 → 重解」的迭代次数")
    p.add_argument("--keyframes", default="", help="手动指定关键帧 a,b（片段内 1 起算的帧号）；留空自动选")
    p.add_argument("--roi", default="", help="只在此区域检测特征：x0,y0,x1,y1（0..1，左上原点）")
    p.add_argument("--ignore", action="append", default=[], help="忽略区域（文字/叠加层）：x0,y0,x1,y1（0..1，左上原点），可多次")
    p.add_argument("--orient", default="floor", choices=["floor", "none"], help="floor = 把点云主平面对齐到 XY 地面")
    p.add_argument("--points", type=int, default=60, help="输出多少个稳定 3D 点")
    p.add_argument("--name", default="", help="写进 JSON 的名字")
    p.add_argument("--frames-dir", default="", help="抽帧目录（给了就复用/保留，不给用临时目录）")
    p.add_argument("--sub", default="", help="只解 t0,t1（影片秒）这一段：同一份跟踪缓存按阶段分段解")
    p.add_argument("--reuse-tracks", action="store_true", help="复用 --frames-dir 里上次保存的跟踪结果（tracks.blend），只重解")
    p.add_argument("--save-blend", default="", help="额外保存 .blend 便于在 Blender 里检查")
    return p.parse_args(argv)


def log(*a):
    print("[solve]", *a, flush=True)


def probe_fps(video):
    out = subprocess.check_output([
        "ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=r_frame_rate",
        "-of", "default=nw=1:nk=1", video]).decode().strip()
    n, d = out.split("/")
    return float(n) / float(d)


def extract_frames(a, fps):
    d = a.frames_dir or tempfile.mkdtemp(prefix="solve-")
    os.makedirs(d, exist_ok=True)
    for f in os.listdir(d):
        if f.endswith(".jpg"):
            os.remove(os.path.join(d, f))
    vf = ["-vf", f"fps={fps}"] if a.fps else []
    # -ss 在 -i 前 + 重新编码：ffmpeg 会精确到帧（解码到 start 再开始输出）
    subprocess.check_call(["ffmpeg", "-loglevel", "error", "-y", "-ss", str(a.start), "-i", a.video,
                           "-t", str(a.end - a.start), *vf, "-q:v", "2", os.path.join(d, "%05d.jpg")])
    n = len([f for f in os.listdir(d) if f.endswith(".jpg")])
    return d, n


def rect(s):
    x0, y0, x1, y1 = [float(v) for v in s.split(",")]
    return x0, y0, x1, y1


class Ctx:
    """clip 编辑器的上下文覆盖：无头模式下仍有一个窗口，把它的第一个区域改成 CLIP_EDITOR 即可跑 clip.* 算子。"""

    def __init__(self, clip):
        self.win = bpy.context.window_manager.windows[0]
        self.area = self.win.screen.areas[0]
        self.area.type = "CLIP_EDITOR"
        self.space = self.area.spaces.active
        self.space.clip = clip
        self.region = [r for r in self.area.regions if r.type == "WINDOW"][0]
        self.clip = clip

    def goto(self, f):
        """无头模式没有重绘，clip 编辑器的 clip_user 帧不会跟着场景帧走，检测/跟踪都以它为准，必须两边都设。"""
        bpy.context.scene.frame_set(f)
        self.space.clip_user.frame_current = f

    def __call__(self):
        return bpy.context.temp_override(window=self.win, area=self.area, region=self.region,
                                         space_data=self.space, edit_movieclip=self.clip)


def main():
    a = parse_args()
    src_fps = probe_fps(a.video)
    fps = a.fps or src_fps
    cache = os.path.join(a.frames_dir, "tracks.blend") if a.frames_dir else ""
    reuse = a.reuse_tracks and cache and os.path.exists(cache)
    if reuse:
        # 只重解：复用上次抽帧 + 跟踪结果（调 solve 参数时省掉最耗时的跟踪）
        bpy.ops.wm.open_mainfile(filepath=cache)
        frames_dir = a.frames_dir
        clip = bpy.data.movieclips[0]
        n = clip.frame_duration
        log(f"复用跟踪缓存 {cache}（{n} 帧，{len(clip.tracking.tracks)} 条轨迹）")
    else:
        frames_dir, n = extract_frames(a, fps)
        log(f"抽帧 {n} 张 @ {fps:.3f}fps → {frames_dir}")
        if n < 8:
            raise SystemExit("帧数太少")
        clip = bpy.data.movieclips.load(os.path.join(frames_dir, "00001.jpg"))
    W, H = clip.size
    scene = bpy.context.scene
    scene.frame_start, scene.frame_end = 1, n
    scene.render.fps = round(fps)
    tr = clip.tracking
    cam = tr.camera
    cam.sensor_width = a.sensor
    cam.focal_length = a.focal
    cam.principal_point_pixels = (W / 2, H / 2)
    cam.k1 = cam.k2 = cam.k3 = 0.0
    s = tr.settings
    s.default_pattern_size = a.pattern
    s.default_search_size = a.search
    s.default_motion_model = a.motion
    s.default_pattern_match = a.match
    s.default_correlation_min = a.corr
    s.default_margin = a.margin
    s.use_default_normalization = True
    s.use_default_brute = True
    s.default_frames_limit = 0
    ctx = Ctx(clip)
    tracks = tr.tracks
    roi = rect(a.roi) if a.roi else None
    ignores = [rect(r) for r in a.ignore]

    def in_rect(co, r):
        x, y = co[0], 1 - co[1]
        return r[0] <= x <= r[2] and r[1] <= y <= r[3]

    def delete(names):
        if not names:
            return
        for t in tracks:
            t.select = t.name in names
        with ctx():
            bpy.ops.clip.delete_track(confirm=False)

    def marker_at(t, f):
        m = t.markers.find_frame(f)
        return m if (m and not m.mute) else None

    # ---------- 检测 + 双向跟踪 ----------
    min_d2 = (a.min_distance / W) ** 2
    for kf in (range(1, n + 1, a.detect_every) if not reuse else []):
        ctx.goto(kf)
        before = {t.name for t in tracks}
        existing = [m.co.copy() for t in tracks if (m := marker_at(t, kf))]
        for t in tracks:
            t.select = False
        with ctx():
            bpy.ops.clip.detect_features(placement="FRAME", margin=a.margin, threshold=a.threshold,
                                         min_distance=a.min_distance)
        new = [t for t in tracks if t.name not in before]
        drop = set()
        for t in new:
            m = marker_at(t, kf)
            co = m.co
            if roi and not in_rect(co, roi):
                drop.add(t.name)
            elif any(in_rect(co, r) for r in ignores):
                drop.add(t.name)
            elif any((co[0] - e[0]) ** 2 + ((co[1] - e[1]) * H / W) ** 2 < min_d2 for e in existing):
                drop.add(t.name)
        delete(drop)
        keep = {t.name for t in new} - drop
        if not keep:
            continue
        for t in tracks:
            t.select = t.name in keep
        with ctx():
            bpy.ops.clip.track_markers(backwards=False, sequence=True)
        ctx.goto(kf)
        for t in tracks:
            t.select = t.name in keep
        with ctx():
            bpy.ops.clip.track_markers(backwards=True, sequence=True)
        log(f"帧 {kf}/{n}：新增 {len(keep)} 条，共 {len(tracks)} 条")

    if cache and not reuse:
        bpy.ops.wm.save_as_mainfile(filepath=cache)

    # 忽略区：轨迹跑进忽略区的那几帧静音（叠加文字跟着画面走时尤其要剔）
    if ignores:
        for t in tracks:
            for m in t.markers:
                if not m.mute and any(in_rect(m.co, r) for r in ignores):
                    m.mute = True

    # 子区间：同一份跟踪结果按硬切/运动阶段分段解（配合 --reuse-tracks，不用重跟踪）
    f_lo, f_hi = 1, n
    if a.sub:
        t0, t1 = [float(v) for v in a.sub.split(",")]
        f_lo = max(1, round((t0 - a.start) * fps) + 1)
        f_hi = min(n, round((t1 - a.start) * fps) + 1)
        for t in tracks:
            for m in t.markers:
                if not m.mute and not (f_lo <= m.frame <= f_hi):
                    m.mute = True
        log(f"只解子区间 {t0}–{t1}s（帧 {f_lo}–{f_hi}）")
    n_range = f_hi - f_lo + 1

    def track_len(t):
        return sum(1 for m in t.markers if not m.mute)

    delete({t.name for t in tracks if track_len(t) < a.min_track_len})
    log(f"清理短轨后剩 {len(tracks)} 条")
    if a.epi_thr > 0 and np is not None:
        dropped, muted = epipolar_prefilter(tracks, n, W, H, a.epi_gap, a.epi_thr)
        delete(dropped)
        delete({t.name for t in tracks if track_len(t) < a.min_track_len})
        log(f"对极几何预筛：删除 {len(dropped)} 条外点轨迹、静音 {muted} 个跳点，剩 {len(tracks)} 条")
    if len(tracks) < 8:
        write_fail(a, W, H, fps, n, f"有效轨迹只有 {len(tracks)} 条（<8），特征过少或运动过快")
        return

    # ---------- 解算 ----------
    s.use_tripod_solver = a.tripod
    s.refine_intrinsics_focal_length = not a.no_refine
    s.refine_intrinsics_principal_point = False
    s.refine_intrinsics_radial_distortion = False
    s.refine_intrinsics_tangential_distortion = False
    obj = tr.objects.active

    def solve(fixed=None):
        # 每次都从焦距初值出发：上一轮若解坏了，refine 出的离谱焦距会把下一轮也带偏
        cam.focal_length = a.focal
        if fixed or a.keyframes:
            ka, kb = fixed or [int(v) for v in a.keyframes.split(",")]
            candidates = [(ka, kb)]
        else:
            # 先自动选关键帧；失败再退回若干手动组合
            step = max(8, n // 6)
            candidates = [None] + [(k, min(n, k + g)) for g in (step, step * 2, 15, 30) for k in range(1, n - g, step)]
        last = None
        for c in candidates:
            s.use_keyframe_selection = c is None
            if c:
                obj.keyframe_a, obj.keyframe_b = c
            try:
                with ctx():
                    bpy.ops.clip.solve_camera()
                if tr.reconstruction.is_valid and len(tr.reconstruction.cameras) >= 2:
                    lo, hi = a.focal / a.focal_range, a.focal * a.focal_range
                    if s.refine_intrinsics_focal_length and not (lo <= cam.focal_length <= hi):
                        # refine 跑飞（常见：几乎没有纵深时解成超长焦）→ 锁定焦距初值重解
                        log(f"  焦距跑飞到 {cam.focal_length:.1f}mm（允许 {lo:.1f}–{hi:.1f}），锁定 {a.focal}mm 重解")
                        s.refine_intrinsics_focal_length = False
                        cam.focal_length = a.focal
                        try:
                            with ctx():
                                bpy.ops.clip.solve_camera()
                        finally:
                            s.refine_intrinsics_focal_length = True
                        if not tr.reconstruction.is_valid:
                            continue
                    return True
            except RuntimeError as e:
                last = str(e).strip()
        log("solve 失败：", last)
        return False

    def state():
        r = tr.reconstruction
        return (r.average_error, len(r.cameras)) if r.is_valid else (float("inf"), 0)

    ok = solve()
    for i in range(a.passes):
        if not ok:
            break
        err, cov = state()
        log(f"第 {i + 1} 轮：平均误差 {err:.3f}px，焦距 {cam.focal_length:.2f}mm，轨迹 {len(tracks)}，"
            f"重建帧 {cov}/{n}，关键帧 {obj.keyframe_a},{obj.keyframe_b}")
        errs = sorted(t.average_error for t in tracks if t.has_bundle)
        thr = a.max_error
        # 误差普遍偏大时不要一刀切光：每轮最多删 40%（按误差分位逐步收紧）
        if errs and sum(1 for e in errs if e > thr) > 0.4 * len(errs):
            thr = errs[int(len(errs) * 0.6)]
        bad = {t.name for t in tracks if (not t.has_bundle) or t.average_error > thr}
        if not bad or len(tracks) - len(bad) < a.min_tracks:
            break
        keys = (obj.keyframe_a, obj.keyframe_b)
        delete(bad)
        ok = solve()
        e2, c2 = state()
        if not ok or e2 > max(err * 1.5, a.max_error) or c2 < cov * 0.9:
            # 自动选关键帧在删轨后可能跳到坏的一对上：沿用上一轮的关键帧再解一次
            log(f"  重解退化（{e2:.3f}px，{c2} 帧），改用上一轮关键帧 {keys}")
            ok = solve(fixed=keys) or solve()
    if not ok:
        write_fail(a, W, H, fps, n, "camera solve 失败（关键帧视差不足/轨迹不一致）")
        return

    rec = tr.reconstruction
    log(f"最终：平均误差 {rec.average_error:.3f}px，焦距 {cam.focal_length:.2f}mm，重建帧 {len(rec.cameras)}/{n}")

    # ---------- 取结果 ----------
    cams = {c.frame: (c.matrix.copy(), c.average_error) for c in rec.cameras if f_lo <= c.frame <= f_hi}
    bundles = [(t, Vector(t.bundle)) for t in tracks if t.has_bundle]
    focal_px = cam.focal_length / cam.sensor_width * W

    # 自检：用我们自己的针孔投影复算重投影误差，确认矩阵约定（相机看 -Z）无误
    def project(M, X):
        pc = M.inverted() @ X
        if pc.z >= 0:
            return None
        return (focal_px * pc.x / -pc.z + W / 2, focal_px * pc.y / -pc.z + H / 2)

    errs = []
    for t, X in bundles:
        for m in t.markers:
            if m.mute or m.frame not in cams:
                continue
            p = project(cams[m.frame][0], X)
            if p:
                errs.append(math.hypot(p[0] - m.co[0] * W, p[1] - m.co[1] * H))
    check = sum(errs) / len(errs) if errs else float("nan")
    log(f"自检重投影误差 {check:.3f}px（应与 Blender 的平均误差同量级）")

    # ---------- 对齐地面（可选） ----------
    align = Matrix.Identity(4)
    plane_info = None
    if a.orient == "floor" and len(bundles) >= 12 and np is not None:
        align, plane_info = fit_floor([X for _, X in bundles], [M.translation for M, _ in cams.values()])

    frames = []
    for f in sorted(cams):
        M, e = cams[f]
        M = align @ M
        loc, rot, sc = M.decompose()
        vfov = math.degrees(2 * math.atan(H / 2 / focal_px))
        frames.append({
            "f": f,
            "t": round(a.start + (f - 1) / fps, 5),
            "p": [round(v, 6) for v in loc],
            "q": [round(rot.x, 7), round(rot.y, 7), round(rot.z, 7), round(rot.w, 7)],
            "fov": round(vfov, 4),
            "err": round(e, 4),
        })

    # 稳定点：误差小、轨迹长的优先
    ranked = sorted(bundles, key=lambda b: (b[0].average_error / max(1, track_len(b[0]) ** 0.5)))
    pts = []
    for t, X in ranked[: a.points]:
        Xa = align @ X
        ms = [m for m in t.markers if not m.mute]
        mid = ms[len(ms) // 2]
        pts.append({
            "p": [round(v, 5) for v in Xa],
            "err": round(t.average_error, 4),
            "len": len(ms),
            "f": mid.frame,
            "px": [round(mid.co[0] * W, 2), round((1 - mid.co[1]) * H, 2)],
        })

    missing = [f for f in range(f_lo, f_hi + 1) if f not in cams]
    coverage = (n_range - len(missing)) / n_range
    # 只看平均误差会被「删到只剩几条轨迹/几帧」的退化解骗过，所以同时卡覆盖率和 3D 点数
    if rec.average_error < 1 and coverage >= 0.95 and len(bundles) >= 30:
        grade = "good"
    elif rec.average_error < 3 and coverage >= 0.8 and len(bundles) >= 15:
        grade = "usable"
    else:
        grade = "poor"
    # 退化检测：视差 = 相机基线 / 场景中位深度。太小说明接近纯旋转或 2D 平面缩放，
    # 此时重投影误差再小，3D 结构（点深度、相机位置、焦距）也不可信
    warnings = []
    cpos = [M.translation for M, _ in cams.values()]
    base = max((p - q).length for p in cpos[:: max(1, len(cpos) // 40)] for q in cpos[:: max(1, len(cpos) // 40)])
    depths = sorted((X - cpos[len(cpos) // 2]).length for _, X in bundles)
    depth = depths[len(depths) // 2] if depths else 1.0
    parallax = base / depth if depth > 0 else 0.0
    if parallax < 0.05:
        warnings.append(f"视差很小（基线/深度 = {parallax:.3f}）：接近纯旋转或 2D 缩放，3D 结构不可信，可试 --tripod")
        if grade != "poor":
            grade = "degenerate"
    if plane_info and plane_info["inliers"] >= 0.9 * plane_info["total"]:
        hs = sorted(abs((align @ p).z) for p in cpos)
        h_rel = hs[len(hs) // 2] / depth if depth > 0 else 0
        plane_info["cameraHeightRel"] = round(h_rel, 4)
        if h_rel < 0.1:
            warnings.append(f"3D 点几乎共面且相机贴着这个平面（高度/深度 = {h_rel:.3f}）：平面场景的退化解，"
                            "多半是 2D 图层的缩放/平移，不要当 3D 相机用")
            if grade != "poor":
                grade = "degenerate"
    if not a.no_refine and abs(cam.focal_length - a.focal) / a.focal < 0.002:
        warnings.append("refine 后焦距几乎没动：焦距没有被约束住（常见于平面场景），fov 只是初值")
    for w in warnings:
        log("警告：" + w)
    log(f"评级 {grade}：误差 {rec.average_error:.3f}px，覆盖 {coverage:.0%}，3D 点 {len(bundles)}")
    out = {
        "version": 1,
        "name": a.name or os.path.splitext(os.path.basename(a.out))[0],
        "ok": True,
        "coord": "blender-zup",
        "note": "世界 Z-up 右手系；相机局部 -Z 前 +Y 上（同 three.js 相机）；q=[x,y,z,w]；fov=垂直视场角（度）；px 左上原点",
        "source": {"video": os.path.relpath(a.video), "start": round(a.start + (f_lo - 1) / fps, 4),
                   "end": round(a.start + (f_hi - 1) / fps, 4), "clipStart": a.start, "fps": fps,
                   "sourceFps": src_fps, "width": W, "height": H, "frames": n_range},
        "intrinsics": {"focalMm": round(cam.focal_length, 4), "sensorMm": a.sensor, "focalPx": round(focal_px, 3),
                       "vfov": round(math.degrees(2 * math.atan(H / 2 / focal_px)), 4),
                       "hfov": round(math.degrees(2 * math.atan(W / 2 / focal_px)), 4),
                       "refined": not a.no_refine},
        "solve": {"grade": grade, "avgError": round(rec.average_error, 4), "checkError": round(check, 4),
                  "coverage": round(coverage, 4), "parallax": round(parallax, 4), "warnings": warnings,
                  "focalInitMm": a.focal,
                  "tracks": len(tracks), "bundles": len(bundles), "solvedFrames": len(cams),
                  "missingFrames": compress(missing), "tripod": a.tripod,
                  "keyframes": [obj.keyframe_a, obj.keyframe_b],
                  "params": {k: v for k, v in vars(a).items() if k not in ("video", "out", "frames_dir", "save_blend")}},
        "floor": plane_info,
        "frames": frames,
        "points": pts,
    }
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    with open(a.out, "w") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
    log(f"写出 {a.out}")
    if a.save_blend:
        save_blend(a, ctx, clip, cams, align, ranked, fps, f_lo, f_hi, W, H, frames_dir, focal_px, out)
    if not a.frames_dir:
        shutil.rmtree(frames_dir, ignore_errors=True)


VFX_TEMPLATE = os.path.join(os.path.dirname(bpy.app.binary_path), "..", "Resources",
                            f"{bpy.app.version[0]}.{bpy.app.version[1]}", "scripts", "startup",
                            "bl_app_templates_system", "VFX", "startup.blend")


def save_blend(a, ctx, clip, cams, align, ranked, fps, f_lo, f_hi, W, H, frames_dir, focal_px, out):
    """
    保存一个可直接打开检查的 Blender 工程：
      - 原片片段（抽帧序列，复制到 <name>.frames/）作为 MovieClip，并设为相机背景
      - 反求相机（逐帧关键帧，已应用 --orient 对齐，与 JSON 同一坐标）
      - 跟踪标记（Movie Clip Editor / Motion Tracking 工作区可见）
      - 重建 3D 点（Empty）+ 代理几何（地面网格、从地面立到 3D 点的细柱）
      - 分辨率/帧率/帧范围与原片一致
    """
    blend = os.path.abspath(a.save_blend)
    bdir = os.path.dirname(blend)
    name = os.path.splitext(os.path.basename(blend))[0]
    os.makedirs(bdir, exist_ok=True)
    fdir = os.path.join(bdir, name + ".frames")
    shutil.rmtree(fdir, ignore_errors=True)
    shutil.copytree(frames_dir, fdir, ignore=shutil.ignore_patterns("*.blend", "*.blend1"))
    clip.filepath = os.path.join(fdir, "00001.jpg")
    clip.name = name

    scene = bpy.context.scene
    scene.frame_start, scene.frame_end = f_lo, f_hi
    scene.frame_current = f_lo
    scene.render.fps = round(fps)
    scene.render.fps_base = round(fps) / fps
    scene.render.resolution_x, scene.render.resolution_y = W, H
    scene.render.resolution_percentage = 100
    scene.active_clip = clip
    scene.render.engine = "BLENDER_WORKBENCH"

    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o)
    pts = [align @ X for _, X in ranked]
    cpos = [(align @ M).translation for M, _ in cams.values()]
    ds = sorted((p - cpos[len(cpos) // 2]).length for p in pts)
    ext = (ds[len(ds) // 2] if ds else 10.0) or 10.0  # 场景尺度 = 相机到 3D 点的中位距离

    # ---- 相机 ----
    cd = bpy.data.cameras.new("反求相机")
    cd.sensor_fit = "HORIZONTAL"
    cd.sensor_width = a.sensor
    cd.lens = focal_px / W * a.sensor
    cd.clip_start = ext * 0.001
    cd.clip_end = ext * 100
    cd.show_background_images = True
    bg = cd.background_images.new()
    bg.source = "MOVIE_CLIP"
    bg.clip = clip
    bg.alpha = 1.0
    bg.frame_method = "FIT"
    co = bpy.data.objects.new("反求相机", cd)
    scene.collection.objects.link(co)
    scene.camera = co
    co.rotation_mode = "QUATERNION"
    prefs = bpy.context.preferences.edit
    prev_interp = prefs.keyframe_new_interpolation_type
    prefs.keyframe_new_interpolation_type = "LINEAR"
    prev_q = None
    for f in sorted(cams):
        loc, q, _ = (align @ cams[f][0]).decompose()
        if prev_q is not None and prev_q.dot(q) < 0:
            q.negate()  # 保持四元数半球连续，否则插值会绕远路
        prev_q = q
        co.location = loc
        co.rotation_quaternion = q
        co.keyframe_insert("location", frame=f)
        co.keyframe_insert("rotation_quaternion", frame=f)
    prefs.keyframe_new_interpolation_type = prev_interp

    # ---- 3D 点 ----
    col_pts = bpy.data.collections.new("反求3D点")
    scene.collection.children.link(col_pts)
    for (t, _), p in list(zip(ranked, pts))[:400]:
        e = bpy.data.objects.new(f"pt_{t.name}", None)
        e.empty_display_type = "PLAIN_AXES"
        e.empty_display_size = ext * 0.01
        e.location = p
        col_pts.objects.link(e)

    # ---- 代理几何：地面网格（z=0）+ 从地面立到 3D 点的细柱 ----
    col_geo = bpy.data.collections.new("代理几何")
    scene.collection.children.link(col_geo)
    xs = [p.x for p in pts] or [0]
    ys = [p.y for p in pts] or [0]
    cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    half = max(max(xs) - min(xs), max(ys) - min(ys), 1e-3) * 0.75
    N = 24
    lw = half / N * 0.025
    verts, faces = [], []

    def quad(p0, p1, p2, p3):
        i = len(verts)
        verts.extend([p0, p1, p2, p3])
        faces.append((i, i + 1, i + 2, i + 3))

    for k in range(N + 1):
        u = -half + 2 * half * k / N
        quad((cx + u - lw, cy - half, 0), (cx + u + lw, cy - half, 0), (cx + u + lw, cy + half, 0), (cx + u - lw, cy + half, 0))
        quad((cx - half, cy + u - lw, 0), (cx + half, cy + u - lw, 0), (cx + half, cy + u + lw, 0), (cx - half, cy + u + lw, 0))
    grid = bpy.data.meshes.new("地面网格")
    grid.from_pydata(verts, [], faces)
    go = bpy.data.objects.new("地面网格", grid)
    go.color = (0.2, 0.9, 1.0, 1.0)
    col_geo.objects.link(go)

    verts, faces = [], []
    r = ext * 0.0025
    for p in pts[:60]:
        z0, z1 = min(0.0, p.z), max(0.0, p.z)
        b = len(verts)
        for z in (z0, z1):
            verts += [(p.x - r, p.y - r, z), (p.x + r, p.y - r, z), (p.x + r, p.y + r, z), (p.x - r, p.y + r, z)]
        faces += [(b, b + 1, b + 2, b + 3), (b + 4, b + 7, b + 6, b + 5), (b, b + 4, b + 5, b + 1),
                  (b + 1, b + 5, b + 6, b + 2), (b + 2, b + 6, b + 7, b + 3), (b + 3, b + 7, b + 4, b)]
    cols = bpy.data.meshes.new("点柱")
    cols.from_pydata(verts, [], faces)
    po = bpy.data.objects.new("点柱", cols)
    po.color = (1.0, 0.85, 0.2, 1.0)
    col_geo.objects.link(po)
    scene.display.shading.color_type = "OBJECT"
    scene.display.shading.light = "FLAT"
    scene.render.film_transparent = True

    # ---- 界面：把 Motion Tracking 工作区（VFX 模板）追加进来，所有 3D 视图切相机视角 ----
    ctx.area.type = "PROPERTIES"  # 还原 Ctx 借用的区域
    if os.path.exists(VFX_TEMPLATE) and "Motion Tracking" not in bpy.data.workspaces:
        with bpy.data.libraries.load(VFX_TEMPLATE) as (src, dst):
            dst.workspaces = [w for w in src.workspaces if w == "Motion Tracking"]
    for scr in bpy.data.screens:
        for area in scr.areas:
            sp = area.spaces.active
            if area.type == "CLIP_EDITOR":
                sp.clip = clip
            elif area.type == "VIEW_3D":
                sp.region_3d.view_perspective = "CAMERA"
                sp.shading.type = "SOLID"
                sp.shading.color_type = "OBJECT"
                sp.clip_start = ext * 0.001
                sp.clip_end = ext * 100

    # ---- 自检：用保存进工程的相机对象（关键帧 + 镜头参数）重投影 3D 点，与跟踪标记比较 ----
    from bpy_extras.object_utils import world_to_camera_view
    errs = []
    for f in range(f_lo, f_hi + 1, max(1, (f_hi - f_lo) // 12)):
        scene.frame_set(f)
        for (t, _), p in zip(ranked[:80], pts[:80]):
            m = t.markers.find_frame(f)
            if not m or m.mute:
                continue
            v = world_to_camera_view(scene, co, p)
            if v.z > 0:
                errs.append(math.hypot((v.x - m.co[0]) * W, (v.y - m.co[1]) * H))
    blend_err = sum(errs) / len(errs) if errs else float("nan")
    log(f"工程自检：相机对象重投影误差 {blend_err:.3f}px（{len(errs)} 个样本）")
    scene.frame_set(f_lo)

    bpy.ops.wm.save_as_mainfile(filepath=blend)
    try:
        bpy.ops.file.make_paths_relative()
        bpy.ops.wm.save_mainfile()
    except Exception as e:  # 相对路径只是方便挪目录，失败不致命
        log("相对路径转换失败：", e)
    for fn in os.listdir(bdir):
        if fn.startswith(name) and fn.endswith(".blend1"):
            os.remove(os.path.join(bdir, fn))
    out["blend"] = {"path": os.path.relpath(blend), "frames": os.path.relpath(fdir), "checkError": round(blend_err, 4)}
    with open(a.out, "w") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
    log(f"保存工程 {blend}")


def _norm(p):
    c = p.mean(axis=0)
    d = np.sqrt(((p - c) ** 2).sum(axis=1)).mean() or 1.0
    k = math.sqrt(2) / d
    T = np.array([[k, 0, -k * c[0]], [0, k, -k * c[1]], [0, 0, 1]])
    return np.c_[p, np.ones(len(p))] @ T.T, T


def _fundamental(x1, x2):
    """归一化 8 点法（x1/x2 已是齐次、已归一化）"""
    A = np.stack([x2[:, 0] * x1[:, 0], x2[:, 0] * x1[:, 1], x2[:, 0], x2[:, 1] * x1[:, 0], x2[:, 1] * x1[:, 1],
                  x2[:, 1], x1[:, 0], x1[:, 1], np.ones(len(x1))], axis=1)
    F = np.linalg.svd(A)[2][-1].reshape(3, 3)
    u, sv, vt = np.linalg.svd(F)
    return u @ np.diag([sv[0], sv[1], 0]) @ vt


def _sampson(F, x1, x2):
    Fx1 = x1 @ F.T
    Ftx2 = x2 @ F
    num = (x2 * Fx1).sum(axis=1) ** 2
    den = Fx1[:, 0] ** 2 + Fx1[:, 1] ** 2 + Ftx2[:, 0] ** 2 + Ftx2[:, 1] ** 2
    return num / np.maximum(den, 1e-12)


def epipolar_prefilter(tracks, n, W, H, gap, thr):
    """
    solve 前的外点预筛：每隔几帧取一对 (f, f+gap)，用 RANSAC 拟合基础矩阵，
    不满足对极约束的点 = 叠加文字/独立运动物体/跟踪跳到相邻相似特征上。
    外点比例 > 30% 的轨迹整条删除，其余只把出错那几帧的 marker 静音。
    （libmv 的 solve 对外点很敏感：带着 20% 外点直接解，常常误差几十像素、关键帧也选歪。）
    """
    rng = np.random.default_rng(11)
    pos = {}
    for t in tracks:
        pos[t.name] = {m.frame: (m.co[0] * W, m.co[1] * H) for m in t.markers if not m.mute}
    bad = {k: 0 for k in pos}
    tot = {k: 0 for k in pos}
    bad_frames = {k: set() for k in pos}
    for f in range(1, n - gap + 1, max(1, gap // 2)):
        g = f + gap
        names = [k for k, d in pos.items() if f in d and g in d]
        if len(names) < 16:
            continue
        p1 = np.array([pos[k][f] for k in names])
        p2 = np.array([pos[k][g] for k in names])
        if np.median(np.linalg.norm(p2 - p1, axis=1)) < 0.5:
            continue  # 几乎没动，判不出外点
        x1, T1 = _norm(p1)
        x2, T2 = _norm(p2)
        best, best_cnt = None, -1
        for _ in range(300):
            idx = rng.choice(len(names), 8, replace=False)
            Fn = _fundamental(x1[idx], x2[idx])
            F = T2.T @ Fn @ T1
            d = _sampson(F, np.c_[p1, np.ones(len(p1))], np.c_[p2, np.ones(len(p2))])
            cnt = int((d < thr * thr).sum())
            if cnt > best_cnt:
                best, best_cnt = d, cnt
        out = best >= thr * thr
        for k, o in zip(names, out):
            tot[k] += 1
            if o:
                bad[k] += 1
                bad_frames[k].update(range(f, g + 1))
    dropped = {k for k in pos if tot[k] and bad[k] / tot[k] > 0.3}
    muted = 0
    for t in tracks:
        if t.name in dropped or not bad_frames[t.name]:
            continue
        for m in t.markers:
            if m.frame in bad_frames[t.name] and not m.mute:
                m.mute = True
                muted += 1
    return dropped, muted


def fit_floor(points, cam_positions):
    """RANSAC 找点云主平面 → 旋到 XY、法线朝相机一侧（+Z）、质心平移到原点。返回 (4x4 对齐矩阵, 说明)。"""
    P = np.array([list(p) for p in points])
    rng = np.random.default_rng(7)
    ext = np.ptp(P, axis=0).max() or 1.0
    thr = ext * 0.03
    best = None
    for _ in range(400):
        idx = rng.choice(len(P), 3, replace=False)
        nrm = np.cross(P[idx[1]] - P[idx[0]], P[idx[2]] - P[idx[0]])
        ln = np.linalg.norm(nrm)
        if ln < 1e-9:
            continue
        nrm /= ln
        d = np.abs((P - P[idx[0]]) @ nrm)
        inl = d < thr
        if best is None or inl.sum() > best.sum():
            best = inl
    Q = P[best]
    c = Q.mean(axis=0)
    _, _, vt = np.linalg.svd(Q - c)
    nrm = vt[2]
    C = np.array([list(p) for p in cam_positions])
    if ((C - c) @ nrm).mean() < 0:
        nrm = -nrm
    z = Vector(nrm.tolist())
    R = z.rotation_difference(Vector((0, 0, 1))).to_matrix().to_4x4()
    T = Matrix.Translation(Vector((-c).tolist()))
    M = R @ T
    return M, {"inliers": int(best.sum()), "total": len(P), "normal": [round(v, 5) for v in nrm.tolist()],
               "note": "已把 RANSAC 主平面旋到 z=0；平面内朝向（绕 Z 的转角）和尺度仍任意，用 alignTrack 调"}


def compress(frames):
    """[1,2,3,7,8] → [[1,3],[7,8]]"""
    out = []
    for f in frames:
        if out and out[-1][1] == f - 1:
            out[-1][1] = f
        else:
            out.append([f, f])
    return out


def write_fail(a, W, H, fps, n, reason):
    log("失败：", reason)
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    with open(a.out, "w") as fh:
        json.dump({"version": 1, "name": a.name, "ok": False, "reason": reason,
                   "source": {"video": os.path.relpath(a.video), "start": a.start, "end": a.end, "fps": fps,
                              "width": W, "height": H, "frames": n}}, fh, ensure_ascii=False)


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception:
        import traceback
        traceback.print_exc()
        sys.exit(1)
