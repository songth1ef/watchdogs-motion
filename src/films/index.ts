import type { Film } from '../engine/types'
import { intro } from './intro'
import { introEn } from './intro-en'
import { outroEn } from './outro-en'
import { wd1 } from './wd1'
import { wd2 } from './wd2'

export const films: Record<Film['id'], Film> = { wd1, wd2, intro, 'intro-en': introEn, 'outro-en': outroEn }
