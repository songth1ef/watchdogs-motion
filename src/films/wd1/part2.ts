import type { Scene } from '../../engine/types'
import { placeholder } from '../placeholder'
import { s50City } from './part2/s50-city'
import { s53Computer } from './part2/s53-computer'
import { s58Tower } from './part2/s58-tower'
import { s62Skull } from './part2/s62-skull'
import { s69Network } from './part2/s69-network'
import { s72Statue } from './part2/s72-statue'
import { s77Represent } from './part2/s77-represent'
import { s82CtosSilos } from './part2/s82-ctos-silos'
import { s86PixelWords } from './part2/s86-pixel-words'
import { s91Profiles } from './part2/s91-profiles'
import { s94Sell } from './part2/s94-sell'
import { s96MapCtos } from './part2/s96-map-ctos'

/**
 * WD1 50s–100s。镜头表见 docs/shots/wd1-part2.md。
 * 各镜头实现放在 ./part2/sNN-*.ts（文件名里的数字 = 起始秒），坐标统一用原片 1280×720（见 part2/common.ts）。
 */
const shots: Scene[] = [s50City, s53Computer, s58Tower, s62Skull, s69Network, s72Statue, s77Represent, s82CtosSilos, s86PixelWords, s91Profiles, s94Sell, s96MapCtos]

/** 未实现的空档自动补占位，保证 [50,98.2) 连续（98.2 起设备台由 part3/objects.ts 接管） */
function fillGaps(list: Scene[], a: number, b: number): Scene[] {
  const sorted = [...list].sort((x, y) => x.start - y.start)
  const out: Scene[] = []
  let cur = a
  for (const s of sorted) {
    if (s.start > cur + 1e-6) out.push(placeholder(`wd1-part2-gap-${cur.toFixed(1)}`, cur, s.start, '待实现'))
    out.push(s)
    cur = Math.max(cur, s.end)
  }
  if (cur < b) out.push(placeholder(`wd1-part2-gap-${cur.toFixed(1)}`, cur, b, '待实现'))
  return out
}

export const part2: Scene[] = fillGaps(shots, 50, 98.2)
