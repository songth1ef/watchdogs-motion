import type { Film } from '../../engine/types'
import { WD1 } from '../../theme'
import { part1 } from './part1'
import { part2 } from './part2'
import { part3 } from './part3'

export const wd1: Film = {
  id: 'wd1',
  title: 'Watch Dogs — E3 Introduction Trailer',
  duration: 151,
  fps: 30,
  background: WD1.bg,
  scenes: [...part1, ...part2, ...part3],
}
