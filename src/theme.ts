/**
 * 配色：从参考帧取色（原片 H.264 压缩后有偏差，取的是大面积纯色区的中位值）。
 */
export const WD1 = {
  bg: '#000000',
  fg: '#ffffff',
  /** 高亮底块、气泡地图、城市线路 */
  cyan: '#4ff5e3',
  cyanDeep: '#1fbfae',
  grey: '#8a8a8a',
  /** 白底段落里的深灰标签底 */
  ink: '#1d2b2b',
  /** "HOMELAND OFFICE - DALLAS" 这类黄绿色小字 */
  lime: '#d6f03c',
} as const

export const WD2 = {
  bg: '#000000',
  fg: '#f2f2f2',
  /** ctOS 标志底色、线框地图主色 */
  teal: '#3fb6c4',
  tealLine: '#5fd3d9',
  /** 飞机图标、红色虚线轨迹、红色告警框 */
  red: '#e0242b',
  /** "sold"、货币符号铺屏 */
  purple: '#c94fe6',
  /** "you are now less valuable..." 背景 */
  lime: '#d3ee6a',
  /** DedSec 拼贴段 */
  magenta: '#ff2d8f',
  yellow: '#f4f24a',
  sky: '#29c6ec',
  paper: '#f4f4f0',
} as const
