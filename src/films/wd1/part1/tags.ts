/**
 * 灰色城市上的设施小标签（46.55–53.4，s10 control 与 part2 s50 共用）：贴在城市地面锚点上、随相机投影。
 *
 * 做法（G4a，V2）：48.3 以后反求不出相机，相机由这些标签的屏幕轨迹反解（s09-city.ts 的 TAIL / TAIL2），
 * 锚点 TAG_ANCHORS 与 TAIL 联合求出。投影仍有残差（48.55–50 段 RMS 45 px；50 以后相机模型较粗、残差更大），
 * 所以屏幕位置 = 锚点按当前相机投影 + 残差修正，残差只在「量过原片的时刻」取值、之间平滑插值：
 * 量过的时刻与原片重合，之间随相机的真实运动（视差、转动）走，而不是 2D 直线插值。
 */
import * as THREE from 'three'
import { memo } from '../../../engine/three-host'
import { poseToCamera, projectTo } from './city-cam'
import { grayPose, TAG_ANCHORS } from './s09-city'
import { spline } from './util'

/** 各标签：出现时刻、原片量出的标签框左上角 [t, x, y]（1920 坐标；48.55–50 取自参考帧逐帧，51.5/52.2 补量） */
export const TAG_KEYS: { text: string; t0: number; keys: [number, number, number][] }[] = [
  { text: 'TRAFFIC LIGHTS', t0: 48.55, keys: [[48.55, 570, 520], [48.7, 571, 456], [49.2, 569, 281], [49.6, 648, 168], [50, 751, 91], [51.5, 979, 38], [52.2, 978, 260]] },
  { text: 'CAMERAS', t0: 48.6, keys: [[48.6, 890, 830], [48.7, 828, 761], [49.2, 614, 602], [49.6, 576, 463], [50, 600, 355], [51.5, 783, 211], [52.2, 882, 363]] },
  { text: 'NUCLEAR PLANT', t0: 48.75, keys: [[48.75, 1075, 225], [49.2, 1154, 211], [49.6, 1224, 197], [50, 1298, 185], [51.5, 1411, 167], [52.2, 1197, 342]] },
  { text: 'WATER SUPPLY', t0: 48.8, keys: [[48.8, 1830, 936], [49.2, 1598, 960], [49.6, 1368, 984], [50, 1214, 950], [51.5, 1119, 743], [52.2, 1046, 615]] },
  { text: 'DOOR LOCK', t0: 48.95, keys: [[48.95, 145, 1040], [49.2, 108, 876], [49.6, 48, 614], [50, 91, 434], [51.5, 380, 205], [52.2, 683, 360]] },
  { text: 'SECURITY SYSTEM', t0: 49.15, keys: [[49.15, 548, 1144], [49.6, 446, 955], [50, 355, 787], [51.5, 499, 499], [52.2, 755, 507]] },
  { text: 'BRIDGE CTRL', t0: 49.45, keys: [[49.45, 700, 1085], [50, 648, 960], [51.5, 678, 666], [52.2, 845, 582]] },
]

const cam = new THREE.PerspectiveCamera(24, 1920 / 1080, 20, 40000)
const projAt = (p: THREE.Vector3Like, t: number) => projectTo(poseToCamera(cam, grayPose(t)), p)

/** 每个标签在各关键时刻的投影残差（量出值 − 投影值），构建一次 */
const residuals = () =>
  memo('wd1p1:tag-residuals', () =>
    TAG_KEYS.map((g) => {
      const A = TAG_ANCHORS[g.text]
      const rx: [number, number][] = []
      const ry: [number, number][] = []
      for (const [t, x, y] of g.keys) {
        const p = projAt({ x: A[0], y: A[1], z: A[2] }, t)
        rx.push([t, x - p.x])
        ry.push([t, y - p.y])
      }
      return { rx, ry }
    }),
  )

/** 标签 i 在 t 时刻、给定相机下的屏幕左上角（1920 坐标） */
export function tagScreen(i: number, t: number, camera: THREE.Camera) {
  const g = TAG_KEYS[i]
  const A = TAG_ANCHORS[g.text]
  const p = projectTo(camera, { x: A[0], y: A[1], z: A[2] })
  const r = residuals()[i]
  return { x: p.x + spline(t, r.rx), y: p.y + spline(t, r.ry), behind: p.behind }
}
