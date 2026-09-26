import * as THREE from 'three'

/**
 * 3D 镜头共用的一个 WebGLRenderer（离屏）。镜头自己建 Scene/Camera，
 * 调 `three.render(scene, camera)` 拿到 canvas，再 drawImage 到主 2D 画布上叠加 2D 图层。
 * 只建一个 renderer：浏览器对 WebGL 上下文数量有上限。
 */
export class ThreeHost {
  private _renderer: THREE.WebGLRenderer | null = null
  constructor(
    public readonly W: number,
    public readonly H: number,
  ) {}

  get renderer() {
    if (!this._renderer) {
      const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
      r.setPixelRatio(1)
      r.setSize(this.W, this.H, false)
      r.outputColorSpace = THREE.SRGBColorSpace
      this._renderer = r
    }
    return this._renderer
  }

  render(scene: THREE.Scene, camera: THREE.Camera, clear = 0x000000, clearAlpha = 0) {
    const r = this.renderer
    r.setClearColor(clear, clearAlpha)
    r.render(scene, camera)
    return r.domElement
  }
}

/** 缓存 3D 场景构建结果：镜头每帧都会调用，但几何体只建一次。 */
const cache = new Map<string, unknown>()
export function memo<T>(key: string, build: () => T): T {
  if (!cache.has(key)) cache.set(key, build())
  return cache.get(key) as T
}
