import type { Film } from '../engine/types'
import { intro } from './intro'
import { introEn } from './intro-en'
import { outroEn } from './outro-en'
import { introEnCmp } from './intro-en-cmp'
import { outroEnCmp } from './outro-en-cmp'
import { wd1 } from './wd1'
import { wd2 } from './wd2'

export const films: Record<Film['id'], Film> = { wd1, wd2, intro, 'intro-en': introEn, 'outro-en': outroEn, 'intro-en-cmp': introEnCmp, 'outro-en-cmp': outroEnCmp }
