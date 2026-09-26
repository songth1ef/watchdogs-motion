import type { Scene } from '../../engine/types'
import { chicagoSat, year2013 } from './part1/intro'
import { cityTopDown, ctosBadge, dossier, fewHundred } from './part1/ctos-city'
import { ctosGrid } from './part1/ctos-grid3d'
import { codeStorm, gridCollapse, scatter, shards, theyWereWrong } from './part1/hack'
import { barChart, internetWords, redNoise, usMap } from './part1/usa'
import { bars3d, bayArea, darkGrid, peninsula, sixtyFourBillion, waveforms } from './part1/bay'

/**
 * WD2 0s–43s。镜头表见 docs/shots/wd2-part1.md。
 * scenes 按绘制顺序排列（后者盖在前者上）；字幕层永远在最后。
 */
export const part1: Scene[] = [
  chicagoSat,
  year2013,
  ctosGrid,
  cityTopDown,
  gridCollapse,
  dossier,
  ctosBadge,
  codeStorm,
  fewHundred,
  shards,
  scatter,
  theyWereWrong,
  barChart,
  usMap,
  internetWords,
  redNoise,
  sixtyFourBillion,
  bayArea,
  peninsula,
  bars3d,
  waveforms,
  darkGrid,
]
