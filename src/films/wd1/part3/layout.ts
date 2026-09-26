/**
 * 「填满街区」的素模城市布局：比 three/city.ts 的 cityLayout 更接近原片——
 * 楼块几乎占满街区、以中低层为主、屋顶带小体块，街道留成干净的黑色网格。
 * 输出与 cityLayout 相同的 Building[]（x/z 为中心，y 从 y0 起），可直接喂 InstancedMesh。
 */
import { rng } from '../../../engine/math'

export interface Box {
  x: number
  z: number
  w: number
  d: number
  h: number
  /** 底面高度（屋顶小体块 > 0） */
  y0: number
}

export function blockLayout(seed: number, nx: number, nz: number, bs: number, st: number, o: { tall?: number; maxH?: number; tallAt?: (x: number, z: number) => number } = {}): Box[] {
  const R = rng(seed)
  const out: Box[] = []
  const spanX = nx * (bs + st)
  const spanZ = nz * (bs + st)
  const tallP = o.tall ?? 0.06
  const maxH = o.maxH ?? 16
  const put = (x0: number, z0: number, w: number, d: number) => {
    const ins = R.range(0.25, 0.6)
    const bw = w - ins * 2
    const bd = d - ins * 2
    if (bw < 1 || bd < 1) return
    let h = 1.5 + 5.5 * R.next() ** 2
    if (R.chance(o.tallAt ? o.tallAt(x0, z0) : tallP)) h = R.range(maxH * 0.5, maxH)
    const x = x0 + w / 2
    const z = z0 + d / 2
    out.push({ x, z, w: bw, d: bd, h, y0: 0 })
    // 屋顶小体块 / 退台
    const k = R.int(0, 2)
    for (let i = 0; i < k; i++) {
      const sw = bw * R.range(0.25, 0.6)
      const sd = bd * R.range(0.25, 0.6)
      out.push({ x: x + R.range(-1, 1) * (bw - sw) * 0.5, z: z + R.range(-1, 1) * (bd - sd) * 0.5, w: sw, d: sd, h: R.range(0.4, 2.5), y0: h })
    }
  }
  for (let bx = 0; bx < nx; bx++)
    for (let bz = 0; bz < nz; bz++) {
      const x0 = bx * (bs + st) - spanX / 2
      const z0 = bz * (bs + st) - spanZ / 2
      if (R.chance(0.04)) continue // 空地
      const kind = R.int(0, 4)
      if (kind === 0) put(x0, z0, bs, bs)
      else if (kind === 1) {
        const s = bs * R.range(0.35, 0.65)
        put(x0, z0, s, bs)
        put(x0 + s, z0, bs - s, bs)
      } else if (kind === 2) {
        const s = bs * R.range(0.35, 0.65)
        put(x0, z0, bs, s)
        put(x0, z0 + s, bs, bs - s)
      } else {
        const sx = bs * R.range(0.4, 0.6)
        const sz = bs * R.range(0.4, 0.6)
        put(x0, z0, sx, sz)
        put(x0 + sx, z0, bs - sx, sz)
        put(x0, z0 + sz, sx, bs - sz)
        put(x0 + sx, z0 + sz, bs - sx, bs - sz)
      }
    }
  return out
}
