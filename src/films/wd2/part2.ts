import type { Scene } from '../../engine/types'
import { bigBrother } from './part2/bigbrother'
import { brainScene } from './part2/brain'
import { faces } from './part2/faces'
import { homeScenes } from './part2/home'
import { streetScenes } from './part2/street'
import { worldScenes } from './part2/world'

/**
 * WD2 43s–94s：BIG BROTHER → 碎片 → 人脸档案卡 + ctOS 面板 → you/bought/sold/stolen → X 光娃娃「toys study your children.」
 * → 线框客厅 → 车辆 VIN + 定位针 → DedSec 故障帧 → N. Oak St. 街区地图 + 数据卡片 → 网络汇成大脑
 * → 像素人脸 + 保险卡 → 数据碎片宇宙 → 世界地图数据点。
 * 镜头表见 docs/shots/wd2-part2.md；各镜头实现在 ./part2/ 目录。字幕是最后一个 Scene，盖在所有镜头之上。
 */
/**
 * 镜头内部的时间码是用 ffmpeg fps 滤镜逐帧抽图量出来的，比 seek 取帧（pnpm snap / 播放器）早约 0.07s，
 * 这里统一平移校准；首尾夹紧在 [43, 94.2)：世界地图镜头延续到 94.2s 硬切进 part3 的货币镜头。
 */
const DT = 0.07
const shift = (s: Scene): Scene => ({
  ...s,
  start: s.start <= 43 ? 43 : s.start + DT,
  end: Math.min(94.2, s.end + DT),
  render: (f) => s.render({ ...f, t: f.t - DT }),
})

export const part2: Scene[] = [
  ...[...bigBrother, ...faces, ...homeScenes, ...streetScenes, brainScene, ...worldScenes].map(shift),
]
