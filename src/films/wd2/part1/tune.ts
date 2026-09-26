/**
 * G1 调参钩子（仅本地调参用）：无头调参脚本往 window.__g1 塞覆盖值，render 里用 tune('key', 默认值) 读取。
 * 正常播放/导出时 __g1 不存在，恒返回默认值，不影响「渲染是时间的纯函数」。
 */
export function tune(key: string, def: number): number {
  const o = (globalThis as { __g1?: Record<string, number> }).__g1
  const v = o?.[key]
  return typeof v === 'number' ? v : def
}
