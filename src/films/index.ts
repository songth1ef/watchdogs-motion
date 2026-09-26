import type { Film } from '../engine/types'
import { wd1 } from './wd1'
import { wd2 } from './wd2'

export const films: Record<Film['id'], Film> = { wd1, wd2 }
