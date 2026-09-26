import { clamp, rng } from '../engine/math'

export interface NetNode {
  x: number
  y: number
  /** 出现时间偏移 0..1 */
  delay: number
}
export interface Network {
  nodes: NetNode[]
  edges: [number, number, number][] // a, b, delay
}

const cache = new Map<string, Network>()

/**
 * 可复现的随机网络：hubs 个中心点，每个普通点连向最近的中心和若干邻居。
 * WD1 "_DATA CLUSTER / _Global Network"、WD2 "the internet of things" 都是这种星状网。
 */
export function makeNetwork(o: {
  seed: number
  count: number
  hubs?: number
  box: { x: number; y: number; w: number; h: number }
  /** 可选：只在掩码为 true 的位置撒点（比如国家轮廓） */
  mask?: (x: number, y: number) => boolean
  neighbors?: number
}): Network {
  const key = JSON.stringify({ ...o, mask: !!o.mask })
  const hit = cache.get(key)
  if (hit) return hit
  const R = rng(o.seed)
  const nodes: NetNode[] = []
  let guard = 0
  while (nodes.length < o.count && guard++ < o.count * 50) {
    const x = o.box.x + R.next() * o.box.w
    const y = o.box.y + R.next() * o.box.h
    if (o.mask && !o.mask(x, y)) continue
    nodes.push({ x, y, delay: R.next() })
  }
  const hubCount = Math.min(o.hubs ?? 6, nodes.length)
  const edges: [number, number, number][] = []
  for (let i = hubCount; i < nodes.length; i++) {
    let best = 0
    let bd = Infinity
    for (let h = 0; h < hubCount; h++) {
      const d = (nodes[i].x - nodes[h].x) ** 2 + (nodes[i].y - nodes[h].y) ** 2
      if (d < bd) {
        bd = d
        best = h
      }
    }
    edges.push([best, i, nodes[i].delay])
    for (let k = 0; k < (o.neighbors ?? 1); k++) edges.push([i, R.int(hubCount, nodes.length - 1), R.next()])
  }
  const net = { nodes, edges }
  cache.set(key, net)
  return net
}

/** 画网络：边按进度生长，节点随后亮起 */
export function drawNetwork(
  ctx: CanvasRenderingContext2D,
  net: Network,
  o: { p: number; line?: string; node?: string; lineWidth?: number; nodeR?: number; hubR?: number; hubs?: number },
) {
  ctx.strokeStyle = o.line ?? 'rgba(255,255,255,0.35)'
  ctx.lineWidth = o.lineWidth ?? 1
  ctx.beginPath()
  for (const [a, b, d] of net.edges) {
    const q = clamp((o.p - d * 0.6) / 0.4)
    if (q <= 0) continue
    const A = net.nodes[a]
    const B = net.nodes[b]
    ctx.moveTo(A.x, A.y)
    ctx.lineTo(A.x + (B.x - A.x) * q, A.y + (B.y - A.y) * q)
  }
  ctx.stroke()
  ctx.fillStyle = o.node ?? '#ffffff'
  net.nodes.forEach((n, i) => {
    if (o.p < n.delay * 0.6) return
    const r = i < (o.hubs ?? 6) ? (o.hubR ?? 3) : (o.nodeR ?? 1.2)
    ctx.beginPath()
    ctx.arc(n.x, n.y, r, 0, Math.PI * 2)
    ctx.fill()
  })
}
