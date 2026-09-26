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

// ───────────────────────── V2：真实芝加哥（OSM）布局与反求相机对齐 ─────────────────────────
// 方法（G4a）：把原片 124.3–129.3 的近俯拍帧按反求相机（wd1-clay-city-a）正射到点云主平面上拼成一张图，
// 与 OSM 建筑轮廓二值图做 FFT 归一化互相关，扫描 旋转 × 尺度 × 平移：
// 峰值 NCC 0.377（次高 0.31 是错一个街区），落在 River North（State St 以西 ~200 m、Grand Ave 一带），
// 旋转 250°、2100 米/反求单位。随后用 132–133 的斜俯视核对：主河道（Main Branch）、Merchandise Mart
// 一带长楼、河对岸 Loop 高楼群与原片对得上——原片素模城市就是芝加哥这一片。
// three 坐标：X = 东、Z = 南、Y = 高（米），世界原点 = 芝加哥区域原点 State & Madison（buildRealCity 默认）。

/**
 * a 段（124.3–133.37）：反求坐标 → 世界。offset.y = 点云主平面（中低层楼顶）离地高度。
 * 配准后再做一轮图像精修：用无后期的真实城市渲染 124.8–132.3 共 9 帧，与原片同帧比「模糊 Sobel 边缘图」NCC，
 * 对 尺度/旋转/平移/高度 坐标下降：NCC 0.10 → 0.45（tmp 工具，未入库；方法见 docs/shots/wd1-part3.md）。
 */
export const CLAY_A_ALIGN = { scale: 2101.9, rotation: [0, 250.05, 0] as [number, number, number], offset: [-210.1, 23, -888.3] as [number, number, number] }
/**
 * b 段（133.4–138.97）：独立坐标系，主平面是手机屏幕（= 城市地面）。
 * 初值：让 b 在 133.4 的相机与 a 在 133.37（按尾速外推一帧）的相机重合（只绕 Y 转，尺度由相机离地高度定：5894）；
 * 再对 133.4–136.9 六帧画面下半部（城市）做同样的边缘 NCC 精修：0.29 → 0.34，尺度 +9%。
 * 所以交界处两段相机并不严格重合，city.ts 在 133.1–133.7 做姿态混合。
 */
export const CLAY_B_ALIGN = { scale: 6418.8, rotation: [0, 249.93, 0] as [number, number, number], offset: [-548.3, 15, -916.6] as [number, number, number] }

/** 手机屏幕上真实城市的范围（本地米 [西, 南, 东, 北]）：由 137.9/138.9 帧按 b 段相机正射到地面量出 */
export const CLAY_RECT: [number, number, number, number] = [-1360, -1755, 1030, 3455]
/** 手机屏幕（世界 X/Z 米）：[x0, z0, x1, z1]；机身厚度 */
export const PHONE_SCREEN: [number, number, number, number] = [-1900, -4610, 1020, 2315]
export const PHONE_T = 420

/**
 * HACKED 像素字在 a 段反求坐标里的位置（128 s 正射拼图量出）：左下角、右下角（字底边），
 * 字高 5 格。世界位置 = alignPoint(…, CLAY_A_ALIGN)，y 取地面。
 */
export const HACKED_TRACK = { bl: [-0.11, 0, 0.02] as const, br: [0.0425, 0, -0.0275] as const }
