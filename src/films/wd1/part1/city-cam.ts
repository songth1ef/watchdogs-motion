/**
 * WD1 3D 城市镜头共用的「反求相机 + 手调相机」拼接工具（G4a，V2）。
 * 只包装 engine/camera-track.ts 的公开 API，不改 engine：
 * - 轨迹首尾之外按首/尾帧速度线性外推（applyTrack 是夹紧，衔接段会出现「停一帧」）
 * - 多段轨迹 / 手调关键帧之间按时间窗平滑混合（位置 lerp、旋转 slerp、fov lerp）
 * - 反求坐标 ↔ 场景坐标的点变换、屏幕坐标反投影到水平面（给贴在城市上的 2D 标签定锚点）
 *
 * part1（s06 电塔、s09 灰色城市、s10 设施标签）、part2（s50）、part3（素模城市）都从这里取。
 * 建议上提到共享库：sampleTrackExt / blendPose / alignPoint 适合并入 engine/camera-track.ts。
 */
import * as THREE from 'three'
import { sampleTrack, type CameraTrack, type TrackAlign } from '../../../engine/camera-track'
import { clamp } from '../../../engine/math'

export interface Pose {
  pos: THREE.Vector3
  quat: THREE.Quaternion
  /** 垂直视场角（度） */
  fov: number
}

const newPose = (): Pose => ({ pos: new THREE.Vector3(), quat: new THREE.Quaternion(), fov: 40 })

/**
 * 取轨迹在 t 的相机；超出 [start, end] 时按首/尾两帧的速度线性外推位置（旋转与 fov 夹紧），
 * `maxExt` 秒以外不再外推（避免长时间外推跑飞）。
 */
export function sampleTrackExt(track: CameraTrack, t: number, maxExt = 0.5, out = newPose()): Pose {
  const s = sampleTrack(track, t)
  out.pos.copy(s.pos)
  out.quat.copy(s.quat)
  out.fov = s.fov
  const n = track.times.length
  if (n < 2) return out
  if (t > track.end) {
    const dt = track.times[n - 1] - track.times[n - 2]
    const v = track.pos[n - 1].clone().sub(track.pos[n - 2]).divideScalar(dt)
    out.pos.addScaledVector(v, Math.min(t - track.end, maxExt))
  } else if (t < track.start) {
    const dt = track.times[1] - track.times[0]
    const v = track.pos[1].clone().sub(track.pos[0]).divideScalar(dt)
    out.pos.addScaledVector(v, -Math.min(track.start - t, maxExt))
  }
  return out
}

/** 两个相机姿态按 w（0 = a，1 = b）混合 */
export function blendPose(a: Pose, b: Pose, w: number, out = newPose()): Pose {
  const k = clamp(w)
  out.pos.lerpVectors(a.pos, b.pos, k)
  out.quat.copy(a.quat).slerp(b.quat, k)
  out.fov = a.fov + (b.fov - a.fov) * k
  return out
}

/** smoothstep 权重：t ≤ a → 0，t ≥ b → 1 */
export const smoothW = (t: number, a: number, b: number) => {
  const x = clamp((t - a) / (b - a))
  return x * x * (3 - 2 * x)
}

/** 把姿态写进相机（同 applyTrack：覆盖位置/朝向/fov、清掉移轴、更新矩阵；之后不要再 lookAt） */
export function poseToCamera(cam: THREE.PerspectiveCamera, p: Pose) {
  cam.position.copy(p.pos)
  cam.quaternion.copy(p.quat)
  cam.fov = p.fov
  if (cam.view?.enabled) cam.clearViewOffset()
  cam.updateProjectionMatrix()
  cam.updateMatrixWorld(true)
  return cam
}

/** 从相机读出姿态 */
export function cameraPose(cam: THREE.PerspectiveCamera, out = newPose()): Pose {
  out.pos.copy(cam.position)
  out.quat.copy(cam.quaternion)
  out.fov = cam.fov
  return out
}

/** 与 alignTrack 同一变换：X' = R·(s·X) + offset，用于把反求坐标里量出的点（如 HACKED 位置）搬到场景 */
export function alignPoint(p: THREE.Vector3Like, a: TrackAlign): THREE.Vector3 {
  const r = a.rotation
  const R =
    r instanceof THREE.Quaternion
      ? r
      : r instanceof THREE.Euler
        ? new THREE.Quaternion().setFromEuler(r)
        : new THREE.Quaternion().setFromEuler(new THREE.Euler(...((r ?? [0, 0, 0]).map(THREE.MathUtils.degToRad) as [number, number, number])))
  const off = a.offset instanceof THREE.Vector3 ? a.offset : new THREE.Vector3(...(a.offset ?? [0, 0, 0]))
  return new THREE.Vector3(p.x, p.y, p.z).multiplyScalar(a.scale ?? 1).applyQuaternion(R).add(off)
}

/** 画布坐标（1920×1080）反投影到水平面 y = h，返回世界点（射线与平面不相交时返回 null） */
export function unprojectToPlane(cam: THREE.PerspectiveCamera, x: number, y: number, h: number, W = 1920, H = 1080) {
  const ray = new THREE.Raycaster()
  ray.setFromCamera(new THREE.Vector2((x / W) * 2 - 1, -(y / H) * 2 + 1), cam)
  const hit = new THREE.Vector3()
  return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -h), hit) ? hit : null
}

/** 世界点投影到画布（1920×1080） */
export function projectTo(cam: THREE.Camera, p: THREE.Vector3Like, W = 1920, H = 1080) {
  const v = new THREE.Vector3(p.x, p.y, p.z).project(cam)
  return { x: (v.x * 0.5 + 0.5) * W, y: (-v.y * 0.5 + 0.5) * H, behind: v.z > 1 }
}
