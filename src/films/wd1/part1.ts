import type { Scene } from '../../engine/types'
import { pegi } from './part1/s01-pegi'
import { earth } from './part1/s02-earth'
import { blackout } from './part1/s03-blackout'
import { roads } from './part1/s04-roads'
import { blame } from './part1/s05-blame'
import { pylons } from './part1/s06-pylons'
import { raymond } from './part1/s07-raymond'
import { overloaded, virus } from './part1/s08-virus'
import { city, floor } from './part1/s09-city'
import { centralOS, control, ctos } from './part1/s10-ctos'

/**
 * WD1 0s–50s。镜头表见 docs/shots/wd1-part1.md。
 * PEGI、地球「14 AUGUST 2003」、2003 Blackout 气泡地图、11 PEOPLE DIED、BLAME?/ME?、电塔阵列、
 * Raymond Kenney/VIRUS、OVERLOADED、3D 城市与 ctOS 标题、centralized control 城市设施标签。
 */
export const part1: Scene[] = [pegi, earth, blackout, roads, pylons, blame, raymond, virus, overloaded, floor, city, centralOS, ctos, control]
