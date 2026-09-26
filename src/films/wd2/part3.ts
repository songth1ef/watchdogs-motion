import type { Scene } from '../../engine/types'
import { drawS1 } from './part3/s1-currency'
import { drawS2 } from './part3/s2-type'
import { drawS3 } from './part3/s3-terminal'
import { drawS4 } from './part3/s4-collage'
import { drawS5 } from './part3/s5-skull'

/**
 * WD2 94s–121s：货币符号铺屏 + 动态排版 → this is the new reality / going dark → 白底 execute? Y 命令行
 * → 代码与机密文件拼贴 → DedSec 霓虹拼贴 → 死神 → 黑色墨浪 → 骷髅与手 → 黑场字幕结尾。
 * 镜头表见 docs/shots/wd2-part3.md。
 */
export const part3: Scene[] = [
  { id: 'wd2-094-currency', start: 94.2, end: 97.8, note: '货币符号铺屏 + you are now less valuable 动态排版', render: drawS1 },
  { id: 'wd2-097-new-reality', start: 97.8, end: 102.45, note: 'this is the new reality / going dark 黑底大字', render: drawS2 },
  { id: 'wd2-102-execute', start: 102.45, end: 108.35, note: '横条纹转场 → 白底 execute? Y → 代码 / 窗口 / 公章 / 涂黑文件', render: drawS3 },
  { id: 'wd2-108-dedsec', start: 108.35, end: 113.1, note: 'DedSec 霓虹拼贴 / 快切（云 骷髅牙 眼球 死神）', render: drawS4 },
  { id: 'wd2-113-skull', start: 113.1, end: 121, note: '墨浪过渡 → 手 / 白球 / 骷髅钻出含球 → 骷髅坐球上 → 黑场淡出', render: drawS5 },
]
