import * as THREE from 'three'

/**
 * 反求相机轨迹（camera track）：加载 tools/blender/solve_camera.py 输出的 JSON，
 * 按影片时间把相机摆到原片的位置/朝向/视场角。原理与用法见 docs/camera-solve.md。
 *
 * 坐标约定：
 * - JSON 里是 Blender 世界系（Z-up 右手系），这里加载时统一转成 three.js 的 Y-up：
 *   (x, y, z)_blender → (x, z, -y)_three，即绕 X 轴旋转 -90°。
 * - 相机局部轴两边相同（看 -Z、+Y 朝上），所以相机四元数只需左乘同一个世界旋转。
 * - 反求结果只有相对尺度、原点与平面内朝向任意（--orient floor 时地面已放平到 y=0），
 *   接入镜头时用 alignTrack() 把它缩放/旋转/平移到镜头场景的坐标里。
 *
 * 渲染是时间的纯函数：applyTrack() 只依赖 t，不读任何外部状态。
 */

/** solve_camera.py 输出的原始 JSON（Blender Z-up） */
export interface CameraTrackJson {
  version: number
  name: string
  ok: boolean
  reason?: string
  coord?: 'blender-zup'
  source: { video: string; start: number; end: number; fps: number; width: number; height: number; frames: number }
  intrinsics?: { focalMm: number; sensorMm: number; focalPx: number; vfov: number; hfov: number; refined: boolean }
  solve?: {
    /** good：<1px 且覆盖≥95%；usable：<3px 且覆盖≥80%；degenerate：重投影好但 3D 结构退化（2D 缩放/平面）；poor：不可用 */
    grade?: 'good' | 'usable' | 'degenerate' | 'poor'
    avgError: number
    coverage?: number
    solvedFrames: number
    tracks: number
    bundles: number
    tripod: boolean
    warnings?: string[]
  }
  frames?: { f: number; t: number; p: number[]; q: number[]; fov: number; err: number }[]
  points?: { p: number[]; err: number; len: number; f: number; px: number[] }[]
}

/** 转成 three.js 坐标后的轨迹（不可变：alignTrack 返回新对象） */
export interface CameraTrack {
  name: string
  /** 每个采样的影片时间（秒），升序 */
  times: number[]
  pos: THREE.Vector3[]
  quat: THREE.Quaternion[]
  /** 垂直视场角（度） */
  fov: number[]
  /** 每帧 solve 重投影误差（px，原片分辨率） */
  err: number[]
  /** 稳定 3D 点（便于对齐场景/挂标签） */
  points: THREE.Vector3[]
  /** 原片宽高比；镜头画布是 16:9，与两支原片一致 */
  aspect: number
  start: number
  end: number
  avgError: number
}

/** Blender Z-up → three Y-up 的世界旋转 */
const Z_UP_TO_Y_UP = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2)
const zupToYup = (p: number[]) => new THREE.Vector3(p[0], p[2], -p[1])

/**
 * 把 JSON 转成 three 坐标的轨迹。失败（ok=false）或评级 poor/degenerate 的反求会直接抛错，
 * 避免镜头静默用错相机；确实要用（比如只借它的大致运动）传 { allowPoor: true }。
 */
export function loadTrack(json: CameraTrackJson, opts: { allowPoor?: boolean } = {}): CameraTrack {
  if (!json.ok || !json.frames?.length) throw new Error(`相机轨迹 ${json.name} 不可用：${json.reason ?? '无帧'}`)
  const grade = json.solve?.grade
  if (!opts.allowPoor && (grade === 'poor' || grade === 'degenerate'))
    throw new Error(`相机轨迹 ${json.name} 评级 ${grade}（${json.solve?.warnings?.join('；') || `误差 ${json.solve?.avgError}px`}），见 docs/camera-solve.md`)
  const fr = [...json.frames].sort((a, b) => a.t - b.t)
  return {
    name: json.name,
    times: fr.map((k) => k.t),
    pos: fr.map((k) => zupToYup(k.p)),
    quat: fr.map((k) => Z_UP_TO_Y_UP.clone().multiply(new THREE.Quaternion(k.q[0], k.q[1], k.q[2], k.q[3]))),
    fov: fr.map((k) => k.fov),
    err: fr.map((k) => k.err),
    points: (json.points ?? []).map((k) => zupToYup(k.p)),
    aspect: json.source.width / json.source.height,
    start: fr[0].t,
    end: fr[fr.length - 1].t,
    avgError: json.solve?.avgError ?? NaN,
  }
}

/**
 * 构建期注册表：assets/cameras/*.json 全部由 Vite 在构建时内联（eager），运行时同步可取。
 * 用法：`const trk = cameraTrack('wd1-clay-city-b')`（名字 = 文件名去掉 .json）。
 */
const RAW = import.meta.glob<CameraTrackJson>('../../assets/cameras/*.json', { eager: true, import: 'default' })
const loaded = new Map<string, CameraTrack>()
export function cameraTrack(name: string, opts: { allowPoor?: boolean } = {}): CameraTrack {
  let trk = loaded.get(name)
  if (!trk) {
    const key = Object.keys(RAW).find((k) => k.endsWith(`/${name}.json`))
    if (!key) throw new Error(`找不到相机轨迹 assets/cameras/${name}.json（先跑 pnpm solve）`)
    trk = loadTrack(RAW[key], opts)
    loaded.set(name, trk)
  }
  return trk
}

/** 列出已有的轨迹名（含失败的，失败的 cameraTrack() 会抛错） */
export const cameraTrackNames = () => Object.keys(RAW).map((k) => k.replace(/^.*\/(.+)\.json$/, '$1'))

/** 二分找 t 所在区间：返回 [i, 局部进度 0..1]；t 超出范围时夹紧到首尾帧 */
function locate(times: number[], t: number): [number, number] {
  const n = times.length
  if (n === 1 || t <= times[0]) return [0, 0]
  if (t >= times[n - 1]) return [n - 2, 1]
  let lo = 0
  let hi = n - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (times[mid] <= t) lo = mid
    else hi = mid
  }
  return [lo, (t - times[lo]) / (times[hi] - times[lo])]
}

const _q = new THREE.Quaternion()

/** 取 t 时刻的相机状态（位置线性、旋转 slerp、fov 线性）。out 可复用以免每帧分配。 */
export function sampleTrack(
  track: CameraTrack,
  t: number,
  out = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), fov: 0, err: 0 },
) {
  if (track.times.length === 1) {
    out.pos.copy(track.pos[0])
    out.quat.copy(track.quat[0])
    out.fov = track.fov[0]
    out.err = track.err[0]
    return out
  }
  const [i, u] = locate(track.times, t)
  out.pos.lerpVectors(track.pos[i], track.pos[i + 1], u)
  out.quat.copy(track.quat[i]).slerp(_q.copy(track.quat[i + 1]), u)
  out.fov = track.fov[i] + (track.fov[i + 1] - track.fov[i]) * u
  out.err = track.err[i] + (track.err[i + 1] - track.err[i]) * u
  return out
}

const _s = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), fov: 0, err: 0 }

/**
 * 把相机摆到 t 时刻（影片时间）。会覆盖 position / quaternion / fov，并更新投影矩阵与世界矩阵。
 * 注意：不要再对这个相机调用 lookAt()（会覆盖反求的朝向）；up 无需设置；会清掉 setViewOffset 移轴。
 */
export function applyTrack(camera: THREE.PerspectiveCamera, track: CameraTrack, t: number) {
  const s = sampleTrack(track, t, _s)
  camera.position.copy(s.pos)
  camera.quaternion.copy(s.quat)
  camera.fov = s.fov
  // 反求假定主点在画面中心：清掉别处（如 applyOrbit 的 shift）留下的移轴
  if (camera.view?.enabled) camera.clearViewOffset()
  camera.updateProjectionMatrix()
  camera.updateMatrixWorld(true)
  return camera
}

export interface TrackAlign {
  /** 统一缩放（反求只有相对尺度），默认 1 */
  scale?: number
  /** 旋转：Euler 角度数组 [x,y,z]（度，XYZ 顺序）、THREE.Euler 或 THREE.Quaternion */
  rotation?: [number, number, number] | THREE.Euler | THREE.Quaternion
  /** 平移（three 坐标） */
  offset?: [number, number, number] | THREE.Vector3
  /** 时间平移（秒）：把轨迹整体挪到别的影片时间上用，默认 0 */
  timeShift?: number
  /** 视场角倍率（例如画面需要裁切时），默认 1 */
  fovScale?: number
}

/**
 * 把反求坐标对齐到镜头场景：X' = R·(s·X) + offset（先缩放、再旋转、最后平移，均绕原点）。
 * 相机朝向同步左乘 R；fov 不受缩放影响。返回新轨迹，不改原对象。
 */
export function alignTrack(track: CameraTrack, a: TrackAlign): CameraTrack {
  const s = a.scale ?? 1
  const R =
    a.rotation instanceof THREE.Quaternion
      ? a.rotation.clone()
      : a.rotation instanceof THREE.Euler
        ? new THREE.Quaternion().setFromEuler(a.rotation)
        : a.rotation
          ? new THREE.Quaternion().setFromEuler(new THREE.Euler(...a.rotation.map(THREE.MathUtils.degToRad) as [number, number, number]))
          : new THREE.Quaternion()
  const off = a.offset instanceof THREE.Vector3 ? a.offset.clone() : new THREE.Vector3(...(a.offset ?? [0, 0, 0]))
  const tp = (p: THREE.Vector3) => p.clone().multiplyScalar(s).applyQuaternion(R).add(off)
  const dt = a.timeShift ?? 0
  const fs = a.fovScale ?? 1
  return {
    ...track,
    times: track.times.map((t) => t + dt),
    pos: track.pos.map(tp),
    quat: track.quat.map((q) => R.clone().multiply(q)),
    fov: track.fov.map((f) => f * fs),
    points: track.points.map(tp),
    start: track.start + dt,
    end: track.end + dt,
  }
}

/** 把轨迹的稳定 3D 点投影到 1920×1080 画布（调对齐参数时画出来和原片比对） */
export function projectTrackPoints(camera: THREE.PerspectiveCamera, track: CameraTrack, W = 1920, H = 1080) {
  const v = new THREE.Vector3()
  return track.points.map((p) => {
    v.copy(p).project(camera)
    return { x: (v.x * 0.5 + 0.5) * W, y: (-v.y * 0.5 + 0.5) * H, behind: v.z > 1 }
  })
}
