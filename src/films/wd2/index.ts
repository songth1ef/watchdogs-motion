import type { Film } from '../../engine/types'
import { WD2 } from '../../theme'
import { part1 } from './part1'
import { part2 } from './part2'
import { part3 } from './part3'
import { WD2_SUBS, subtitleScene } from './subtitles'

export const wd2: Film = {
  id: 'wd2',
  title: 'Watch Dogs 2 — ctOS Introduction Scene',
  duration: 121,
  fps: 60,
  background: WD2.bg,
  // 字幕层放最后，压在所有镜头之上
  scenes: [...part1, ...part2, ...part3, subtitleScene('wd2-subtitles', 0, 121, WD2_SUBS)],
}
