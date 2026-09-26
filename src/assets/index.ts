/**
 * 真实素材总入口：启动时预加载所有资产（src/main.ts 的 ready 流程调用）。
 * 单项失败只警告不抛错——镜头应当用 hasGeo()/hasEarth() 判断并回退到程序化替代品。
 */
import { loadBayTerrain, loadGeo, loadWorld } from './geo'
import { loadEarth } from './earth'

export * from './geo'
export * from './earth'

export async function preloadAssets(): Promise<void> {
  const jobs: [string, Promise<unknown>][] = [
    ['geo:chicago', loadGeo('chicago')],
    ['geo:sf', loadGeo('sf')],
    ['geo:bay', loadGeo('bay')],
    ['terrain:bay', loadBayTerrain()],
    ['world:50m', loadWorld('50m')],
    ['world:110m', loadWorld('110m')],
    ['earth', loadEarth()],
  ]
  const res = await Promise.allSettled(jobs.map(([, p]) => p))
  res.forEach((r, i) => {
    if (r.status === 'rejected') console.warn(`[assets] ${jobs[i][0]} 加载失败，相关镜头将回退到程序化替代品：`, r.reason)
  })
}
