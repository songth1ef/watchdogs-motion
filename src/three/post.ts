/**
 * 3D 后期模块：给 three.js 镜头加上原片的「后期质感」——环境光遮蔽、景深/散景、辉光、亮边描线、
 * 色差、暗角、颗粒、色调映射/对比度。
 *
 * 用法（镜头里把 `three.render(scene, cam)` 换成下面这句，其余不变）：
 * ```ts
 * import { renderWithPost, presets, mergePost } from '../../../three/post'
 * const img = renderWithPost(three, scene, cam, mergePost(presets.greyCityEdges, { time: t }))
 * ctx.drawImage(img, 0, 0)
 * ```
 *
 * 设计要点：
 * - 基于 three 自带的 examples/jsm/postprocessing（EffectComposer + UnrealBloomPass + GTAOPass），
 *   景深、描线、收尾（色差/暗角/颗粒/调色）是本文件里的自定义 Pass。不引入新依赖，版本与 three 锁死。
 * - 与 ThreeHost 共用同一个 WebGLRenderer（浏览器 WebGL 上下文数有限）；渲染完恢复 renderer 状态，
 *   不影响其他仍在用 `three.render()` 裸渲染的镜头。
 * - 管线按「开了哪些效果」的组合缓存（每个 renderer 一份），不会每帧重建；参数全是 uniform，每帧更新。
 * - 渲染是时间的纯函数：所有参数可以写成 `(t) => number`，按 `opts.time` 求值；颗粒噪声种子 = 帧号。
 * - 管线内部是线性色彩空间（HalfFloat），最后的收尾 Pass 负责色调映射与 sRGB 编码，
 *   所以不开任何效果时输出与 `three.render()` 基本一致（仅多了 MSAA 解析路径的细微差别）。
 * - 透明背景（clearAlpha = 0）会被保留：输出是预乘 alpha 的 canvas，可以直接 drawImage 叠到 2D 背景上；
 *   辉光/描线在透明区域的颜色会以「加亮」方式叠到底下的 2D 图层上。
 */
import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { FullScreenQuad, Pass } from 'three/examples/jsm/postprocessing/Pass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js'
import type { ThreeHost } from '../engine/three-host'

// ───────────────────────── 参数类型 ─────────────────────────

/** 可随时间变化的数值：常数或 `t => 值`（t = opts.time，影片绝对秒） */
export type Anim = number | ((t: number) => number)

/** 环境光遮蔽（GTAO）。半径等长度单位 = 场景世界单位 */
export interface AOOpts {
  /** 遮蔽强度 0..1（与原图相乘的混合量），默认 1 */
  intensity?: Anim
  /** 采样半径（世界单位），默认 4 */
  radius?: Anim
  /** 厚度启发（世界单位），越大越容易在细缝里压暗，默认 1 */
  thickness?: Anim
  /** 距离衰减 0..1，默认 1 */
  distanceFallOff?: Anim
  /** 遮蔽整体缩放，默认 1 */
  scale?: Anim
  /** 每像素采样数（改动会重编译 shader，不要逐帧改），默认 12 */
  samples?: number
  /** AO 渲染分辨率比例（0.25..1），默认 0.5；属于管线结构，改了会建一条新管线 */
  resolution?: number
}

/**
 * 景深（散景）。两种写法二选一：
 * - 画面单位：`aperture` = 无限远处的虚化直径（像素，1920×1080 下）。直观，推荐。
 * - 物理单位：`fStop` + `focalLength`(mm，缺省按相机 fov 与 24mm 画幅高度换算) + `worldScale`(每世界单位多少米)。
 * 虚化直径 = aperture × |1 − focus / z|（z 为像素的视深），近处物体会很快虚到 maxBlur。
 */
export interface DofOpts {
  /**
   * 焦点：
   * - 数字 / 函数：焦点距离（沿视线的世界单位）
   * - `{ x, y, z }`：对准世界坐标里的一个点
   * - `{ uv: [u, v] }`：自动对焦到画面该位置（0..1，左上为 0,0）的深度，全在 GPU 内完成，无回读
   * 缺省 = `{ uv: [0.5, 0.5] }`（画面中心自动对焦）
   */
  focus?: Anim | THREE.Vector3Like | { uv: [number, number] }
  /** 无限远处的虚化直径（px） */
  aperture?: Anim
  fStop?: Anim
  focalLength?: Anim
  worldScale?: Anim
  /** 最大虚化直径（px），默认 36 */
  maxBlur?: Anim
  /** 近景（焦点前）虚化的额外倍数，默认 1 */
  nearScale?: Anim
  /** 高光散景增益（0..~60）：亮于阈值的采样在平均时权重 ×(1+增益)，小亮点会散成明亮的实心圆斑；默认 0 */
  highlight?: Anim
  /** 高光阈值（线性亮度），默认 0.8 */
  highlightThreshold?: Anim
  /** 调试：输出虚化图（R = 虚化直径/maxBlur，G = 混合比例，B = 焦点前） */
  debug?: boolean
}

/** 辉光（UnrealBloomPass） */
export interface BloomOpts {
  /** 亮度阈值（线性），默认 0.8 */
  threshold?: Anim
  /** 强度，默认 0.8 */
  strength?: Anim
  /** 半径 0..1，默认 0.5 */
  radius?: Anim
}

/** 基于法线/深度的亮边描线（复现 WD1 灰色城市的白色楼沿） */
export interface EdgeOpts {
  /** 线颜色，默认白 */
  color?: number
  /** 强度（加到线性颜色上），默认 1 */
  intensity?: Anim
  /** 取样偏移（px），越大线越粗，默认 1 */
  thickness?: Anim
  /** 法线差阈值（1 − cosθ），默认 0.15 */
  normalThreshold?: Anim
  /** 深度差阈值（相对深度），默认 0.02 */
  depthThreshold?: Anim
  /** 从这个视深开始淡出（世界单位），默认 1e9（不淡出） */
  fadeNear?: Anim
  /** 到这个视深完全消失，默认 1e9 */
  fadeFar?: Anim
  /** 朝上的面（楼顶）边缘的偏好 0..1：1 = 只描楼顶轮廓，默认 0 */
  roofBias?: Anim
  /** 非描线区域的颜色乘数（<1 把楼面压暗以拉高边线对比），默认 1 */
  faceGain?: Anim
}

export interface GrainOpts {
  /** 强度（sRGB 空间的加减幅度），默认 0.05 */
  amount?: Anim
  /** 颗粒大小（px），默认 1.5 */
  size?: Anim
}

export interface VignetteOpts {
  /** 角落压暗量 0..1 */
  amount?: Anim
  /** 从画面中心到开始变暗的距离 0..1，默认 0.45 */
  offset?: Anim
}

export interface ToneOpts {
  /** 曝光倍数（线性），默认 1 */
  exposure?: Anim
  /** 色调映射，默认 'none'（与裸渲染一致） */
  toneMap?: 'none' | 'aces' | 'reinhard'
  /** 对比度（sRGB 上固定 0 与 1 的 S 曲线指数，>1 更硬），默认 1 */
  contrast?: Anim
  /** 饱和度，默认 1 */
  saturation?: Anim
  /** 黑位（sRGB，低于它压成黑），默认 0 */
  black?: Anim
  /** 白位（sRGB，高于它顶成白），默认 1 */
  white?: Anim
  /** 伽马（>1 提亮中间调），默认 1 */
  gamma?: Anim
}

export interface PostOpts {
  /** 影片绝对时间（秒）：Anim 参数按它求值；grain 种子也由它推出帧号 */
  time?: number
  /** 求颗粒帧号用的帧率，默认 30 */
  fps?: number
  /** 直接给帧号（优先于 time×fps） */
  frame?: number
  /** 清屏色与 alpha（同 ThreeHost.render 的默认：黑、透明） */
  clear?: number
  clearAlpha?: number
  /** 临时打开 renderer.shadowMap（PCFSoft）渲染这一帧，渲染完恢复 */
  shadows?: boolean
  /** 场景渲染的 MSAA 采样数，默认 4（0 = 关） */
  msaa?: number
  ao?: AOOpts | false
  dof?: DofOpts | false
  bloom?: BloomOpts | false
  edge?: EdgeOpts | false
  /** 颗粒：数字 = amount */
  grain?: number | GrainOpts | false
  /** 色差：画面角落处 R/B 通道的错位像素数 */
  chromatic?: Anim | false
  /** 暗角：数字 = amount */
  vignette?: number | VignetteOpts | false
  tone?: ToneOpts
  /** 逐 Pass 计时（每个 Pass 前后 gl.finish，会变慢，只在测性能时开）；结果用 lastPostStats() 读 */
  profile?: boolean
}

// ───────────────────────── 小工具 ─────────────────────────

const val = (a: Anim | undefined, d: number, t: number) => (a === undefined ? d : typeof a === 'function' ? a(t) : a)

/** 合并两份参数（第二份覆盖第一份；效果子对象逐字段合并，给 false 关掉该效果） */
export function mergePost(base: PostOpts, over: PostOpts): PostOpts {
  const out: Record<string, unknown> = { ...base }
  for (const [k, v] of Object.entries(over)) {
    const b = (base as Record<string, unknown>)[k]
    if (v && typeof v === 'object' && !Array.isArray(v) && b && typeof b === 'object') out[k] = { ...b, ...v }
    else out[k] = v
  }
  return out as PostOpts
}

const DEPTH_GLSL = /* glsl */ `
  uniform float cameraNear;
  uniform float cameraFar;
  float viewDepth(float d) { return -perspectiveDepthToViewZ(d, cameraNear, cameraFar); }
`

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`

function copyMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { tDiffuse: { value: null } },
    vertexShader: VERT,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse; varying vec2 vUv;
      void main() { gl_FragColor = texture2D(tDiffuse, vUv); }`,
    blending: THREE.NoBlending,
    depthTest: false,
    depthWrite: false,
  })
}

/** 当前帧的场景/相机/参数，所有 Pass 从这里读 */
interface FrameState {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  opts: PostOpts
  t: number
  frame: number
}

// ───────────────────────── Pass：场景 ─────────────────────────

/** 把场景渲染进带深度纹理的 MSAA 目标，再拷到合成链的缓冲 */
class ScenePass extends Pass {
  rt: THREE.WebGLRenderTarget
  private quad = new FullScreenQuad(copyMaterial())
  constructor(
    private st: { cur: FrameState | null },
    W: number,
    H: number,
    msaa: number,
  ) {
    super()
    this.rt = new THREE.WebGLRenderTarget(W, H, {
      type: THREE.HalfFloatType,
      samples: msaa,
      depthTexture: new THREE.DepthTexture(W, H),
    })
    this.needsSwap = true
  }
  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget) {
    const s = this.st.cur!
    renderer.setRenderTarget(this.rt)
    renderer.setClearColor(s.opts.clear ?? 0x000000, s.opts.clearAlpha ?? 0)
    renderer.clear()
    renderer.render(s.scene, s.camera)
    ;(this.quad.material as THREE.ShaderMaterial).uniforms.tDiffuse.value = this.rt.texture
    renderer.setRenderTarget(writeBuffer)
    this.quad.render(renderer)
  }
  dispose() {
    this.rt.dispose()
    this.quad.dispose()
  }
}

// ───────────────────────── Pass：法线 G-buffer ─────────────────────────

/** 只画实体网格的视空间法线 + 深度（线、点、线框、半透明全息体不参与 AO/描线） */
class NormalPass extends Pass {
  rt: THREE.WebGLRenderTarget
  private mat = new THREE.MeshNormalMaterial()
  private hidden: THREE.Object3D[] = []
  constructor(
    private st: { cur: FrameState | null },
    W: number,
    H: number,
  ) {
    super()
    this.rt = new THREE.WebGLRenderTarget(W, H, { depthTexture: new THREE.DepthTexture(W, H) })
    this.needsSwap = false
  }
  render(renderer: THREE.WebGLRenderer) {
    const { scene, camera } = this.st.cur!
    scene.traverse((o) => {
      if (!o.visible) return
      const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined
      const first = Array.isArray(m) ? m[0] : m
      const skip =
        (o as THREE.Points).isPoints ||
        (o as THREE.Line).isLine ||
        (o as THREE.Sprite).isSprite ||
        (first && ((first as THREE.MeshBasicMaterial).wireframe || (first.transparent && first.opacity < 0.35) || first.visible === false))
      if (skip) {
        o.visible = false
        this.hidden.push(o)
      }
    })
    const bg = scene.background
    const ov = scene.overrideMaterial
    scene.background = null
    scene.overrideMaterial = this.mat
    renderer.setRenderTarget(this.rt)
    renderer.setClearColor(0x7f7fff, 1)
    renderer.clear()
    renderer.render(scene, camera)
    scene.overrideMaterial = ov
    scene.background = bg
    for (const o of this.hidden) o.visible = true
    this.hidden.length = 0
  }
  dispose() {
    this.rt.dispose()
    this.mat.dispose()
  }
}

// ───────────────────────── Pass：AO（GTAO，低分辨率） ─────────────────────────

class ScaledGTAOPass extends GTAOPass {
  resScale?: number
  setSize(width: number, height: number) {
    const k = this.resScale ?? 1
    super.setSize(Math.max(1, Math.round(width * k)), Math.max(1, Math.round(height * k)))
  }
}

// ───────────────────────── Pass：描线 ─────────────────────────

class EdgePass extends Pass {
  private quad: FullScreenQuad
  mat: THREE.ShaderMaterial
  constructor(
    private st: { cur: FrameState | null },
    normal: NormalPass,
    W: number,
    H: number,
  ) {
    super()
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        tNormal: { value: normal.rt.texture },
        tDepth: { value: normal.rt.depthTexture },
        texel: { value: new THREE.Vector2(1 / W, 1 / H) },
        cameraNear: { value: 1 },
        cameraFar: { value: 1000 },
        color: { value: new THREE.Color() },
        intensity: { value: 1 },
        thickness: { value: 1 },
        nThr: { value: 0.15 },
        dThr: { value: 0.02 },
        fadeNear: { value: 1e9 },
        fadeFar: { value: 1e9 },
        roofBias: { value: 0 },
        faceGain: { value: 1 },
        upView: { value: new THREE.Vector3(0, 1, 0) },
      },
      vertexShader: VERT,
      fragmentShader: /* glsl */ `
        #include <packing>
        ${DEPTH_GLSL}
        uniform sampler2D tDiffuse; uniform sampler2D tNormal; uniform sampler2D tDepth;
        uniform vec2 texel; uniform vec3 color; uniform float intensity, thickness, nThr, dThr, fadeNear, fadeFar, roofBias, faceGain;
        uniform vec3 upView;
        varying vec2 vUv;
        vec3 nrm(vec2 uv) { return normalize(texture2D(tNormal, uv).xyz * 2.0 - 1.0); }
        void main() {
          vec4 c = texture2D(tDiffuse, vUv);
          float d = texture2D(tDepth, vUv).x;
          vec3 n = nrm(vUv);
          float z = viewDepth(d);
          float ne = 0.0, de = 0.0, up = max(dot(n, upView), 0.0);
          for (int i = 0; i < 8; i++) {
            float a = float(i) * 0.7853982;
            vec2 o = vec2(cos(a), sin(a)) * thickness * texel;
            float d2 = texture2D(tDepth, vUv + o).x;
            vec3 n2 = nrm(vUv + o);
            float z2 = viewDepth(d2);
            // 邻居是背景（没画到实体）时法线无意义，只算深度边
            if (d2 < 1.0) ne = max(ne, 1.0 - dot(n, n2));
            // 邻居更远 → 我在前景轮廓上（线画在近的一侧，粗细不随距离变化）
            de = max(de, (z2 - z) / z);
            up = max(up, max(dot(n2, upView), 0.0));
          }
          float e = max(smoothstep(nThr, nThr * 2.0 + 0.02, ne), smoothstep(dThr, dThr * 3.0, de));
          if (d >= 1.0) e = 0.0;
          e *= mix(1.0, smoothstep(0.6, 0.95, up), roofBias);
          e *= 1.0 - smoothstep(fadeNear, fadeFar, z);
          float k = clamp(e * intensity, 0.0, 4.0);
          c.rgb = c.rgb * mix(faceGain, 1.0, min(e, 1.0)) + color * k;
          c.a = max(c.a, min(k, 1.0));
          gl_FragColor = c;
        }`,
      blending: THREE.NoBlending,
      depthTest: false,
      depthWrite: false,
    })
    this.quad = new FullScreenQuad(this.mat)
    this.needsSwap = true
  }
  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget) {
    const { camera, opts, t } = this.st.cur!
    const o = opts.edge as EdgeOpts
    const u = this.mat.uniforms
    u.tDiffuse.value = readBuffer.texture
    u.cameraNear.value = camera.near
    u.cameraFar.value = camera.far
    u.color.value.set(o.color ?? 0xffffff)
    u.intensity.value = val(o.intensity, 1, t)
    u.thickness.value = val(o.thickness, 1, t)
    u.nThr.value = val(o.normalThreshold, 0.15, t)
    u.dThr.value = val(o.depthThreshold, 0.02, t)
    u.fadeNear.value = val(o.fadeNear, 1e9, t)
    u.fadeFar.value = val(o.fadeFar, 1e9, t)
    u.roofBias.value = val(o.roofBias, 0, t)
    u.faceGain.value = val(o.faceGain, 1, t)
    // 世界「上」方向在视空间里的方向（楼顶判定用）
    u.upView.value.set(0, 1, 0).transformDirection(camera.matrixWorldInverse)
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer)
    this.quad.render(renderer)
  }
  dispose() {
    this.mat.dispose()
    this.quad.dispose()
  }
}

// ───────────────────────── Pass：景深 ─────────────────────────

/** 景深公共 GLSL：由深度算虚化直径（px） */
const COC_GLSL = /* glsl */ `
  uniform float focusDist, autoFocus, cocInf, maxBlur, nearScale;
  uniform vec2 focusUv;
  float focusAt(sampler2D tDepth) {
    if (autoFocus < 0.5) return focusDist;
    // 自动对焦：取焦点附近 5 个点的最近深度（避免对到缝隙里的远处）
    vec2 px = vec2(6.0) / vec2(textureSize(tDepth, 0));
    float z = viewDepth(texture2D(tDepth, focusUv).x);
    z = min(z, viewDepth(texture2D(tDepth, focusUv + vec2(px.x, 0.0)).x));
    z = min(z, viewDepth(texture2D(tDepth, focusUv - vec2(px.x, 0.0)).x));
    z = min(z, viewDepth(texture2D(tDepth, focusUv + vec2(0.0, px.y)).x));
    z = min(z, viewDepth(texture2D(tDepth, focusUv - vec2(0.0, px.y)).x));
    return z;
  }
  float cocOf(float z, float f) {
    float k = 1.0 - f / z;
    return min(maxBlur, cocInf * abs(k) * (k < 0.0 ? nearScale : 1.0));
  }
`

/**
 * 半分辨率「以聚代散」景深：黄金角螺旋 48 个采样 + 8 个前景探针。
 * 输出两张图（MRT）：0 = 虚化后的预乘颜色，1.r = 该像素应取虚化结果的比例（含前景溢出）。
 * 再由合成 shader 在全分辨率上按比例混合清晰图与虚化图。
 */
class DofPass extends Pass {
  private half: THREE.WebGLRenderTarget
  private pre: THREE.WebGLRenderTarget
  private preMat: THREE.ShaderMaterial
  private preQuad: FullScreenQuad
  private blurMat: THREE.ShaderMaterial
  private compMat: THREE.ShaderMaterial
  private blurQuad: FullScreenQuad
  private compQuad: FullScreenQuad
  constructor(
    private st: { cur: FrameState | null },
    depth: THREE.DepthTexture,
    W: number,
    H: number,
  ) {
    super()
    this.half = new THREE.WebGLRenderTarget(Math.ceil(W / 2), Math.ceil(H / 2), {
      count: 2,
      type: THREE.HalfFloatType,
      depthBuffer: false,
    })
    for (const tx of this.half.textures) tx.minFilter = tx.magFilter = THREE.LinearFilter
    this.pre = new THREE.WebGLRenderTarget(Math.ceil(W / 2), Math.ceil(H / 2), { type: THREE.HalfFloatType, depthBuffer: false })
    // 预滤波：全分辨率 → 半分辨率。普通像素取 4×4 平均；亮点取最大值（膨胀），
    // 这样 1–2px 的小灯在稀疏采样里也不会漏掉，才能散成完整的圆形光斑。
    this.preMat = new THREE.ShaderMaterial({
      uniforms: { tColor: { value: null }, texel: { value: new THREE.Vector2(1 / W, 1 / H) }, hlThr: { value: 0.8 } },
      vertexShader: VERT,
      fragmentShader: /* glsl */ `
        uniform sampler2D tColor; uniform vec2 texel; uniform float hlThr;
        varying vec2 vUv;
        float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
        void main() {
          vec4 a = texture2D(tColor, vUv + vec2(-1.0, -1.0) * texel);
          vec4 b = texture2D(tColor, vUv + vec2( 1.0, -1.0) * texel);
          vec4 c = texture2D(tColor, vUv + vec2(-1.0,  1.0) * texel);
          vec4 d = texture2D(tColor, vUv + vec2( 1.0,  1.0) * texel);
          vec4 avg = (a + b + c + d) * 0.25;
          vec4 mx = a;
          if (lum(b.rgb) > lum(mx.rgb)) mx = b;
          if (lum(c.rgb) > lum(mx.rgb)) mx = c;
          if (lum(d.rgb) > lum(mx.rgb)) mx = d;
          gl_FragColor = mix(avg, mx, smoothstep(hlThr * 0.5, hlThr, lum(mx.rgb)));
        }`,
      blending: THREE.NoBlending,
      depthTest: false,
      depthWrite: false,
    })
    this.preQuad = new FullScreenQuad(this.preMat)
    const common = () => ({
      tColor: { value: null as THREE.Texture | null },
      tDepth: { value: depth as THREE.Texture },
      texel: { value: new THREE.Vector2(1 / W, 1 / H) },
      cameraNear: { value: 1 },
      cameraFar: { value: 1000 },
      focusDist: { value: 10 },
      autoFocus: { value: 0 },
      focusUv: { value: new THREE.Vector2(0.5, 0.5) },
      cocInf: { value: 10 },
      maxBlur: { value: 36 },
      nearScale: { value: 1 },
    })
    this.blurMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: { ...common(), hlGain: { value: 0 }, hlThr: { value: 0.8 } },
      vertexShader: VERT,
      fragmentShader: /* glsl */ `
        #include <packing>
        ${DEPTH_GLSL}
        ${COC_GLSL}
        layout(location = 0) out vec4 outColor;
        layout(location = 1) out vec4 outInfo;
        uniform sampler2D tColor; uniform sampler2D tDepth; uniform vec2 texel;
        uniform float hlGain, hlThr;
        in vec2 vUv;
        const int N = 48;
        void main() {
          float f = focusAt(tDepth);
          float zc = viewDepth(texture(tDepth, vUv).x);
          float cc = cocOf(zc, f);
          // 前景探针：周围有更近、且虚化圈能盖到这里的像素 → 放大采样半径
          float R = cc;
          float fg = 0.0;
          for (int i = 0; i < 8; i++) {
            float a = float(i) * 0.7853982 + 0.39;
            for (int j = 1; j <= 2; j++) {
              float r = maxBlur * 0.5 * float(j) * 0.5;
              vec2 o = vec2(cos(a), sin(a)) * r * texel;
              float zs = viewDepth(texture(tDepth, vUv + o).x);
              float cs = cocOf(zs, f);
              if (zs < zc && cs * 0.5 >= r) { R = max(R, cs); fg = max(fg, smoothstep(r, r + 2.0, cs * 0.5)); }
            }
          }
          R = max(R * 0.5, 0.5); // 虚化直径 → 半径
          vec4 acc = texture(tColor, vUv);
          float tot = 1.0;
          float soft = max(1.0, R * 0.2);
          for (int i = 0; i < N; i++) {
            float r = sqrt((float(i) + 0.5) / float(N)) * R;
            float a = float(i) * 2.39996323;
            vec2 uv = vUv + vec2(cos(a), sin(a)) * r * texel;
            vec4 s = texture(tColor, uv);
            float zs = viewDepth(texture(tDepth, uv).x);
            float cs = cocOf(zs, f) * 0.5;
            // 比中心更远的像素不能溢出到比中心更大的范围（清晰的前景不被背景盖住）
            if (zs > zc) cs = min(cs, cc * 0.5 * 2.0 + 0.5);
            float m = smoothstep(r - soft, r + soft, cs);
            float l = dot(s.rgb, vec3(0.2126, 0.7152, 0.0722));
            float w = m * (1.0 + hlGain * smoothstep(hlThr, hlThr + 0.25, l));
            acc += s * w;
            tot += w;
          }
          outColor = acc / tot;
          outInfo = vec4(max(smoothstep(0.6, 2.0, cc), fg), cc, 0.0, 1.0);
        }`,
      blending: THREE.NoBlending,
      depthTest: false,
      depthWrite: false,
    })
    this.compMat = new THREE.ShaderMaterial({
      uniforms: { ...common(), tBlur: { value: this.half.textures[0] }, tInfo: { value: this.half.textures[1] }, showCoc: { value: 0 } },
      vertexShader: VERT,
      fragmentShader: /* glsl */ `
        #include <packing>
        ${DEPTH_GLSL}
        ${COC_GLSL}
        uniform sampler2D tColor; uniform sampler2D tDepth; uniform sampler2D tBlur; uniform sampler2D tInfo;
        uniform float showCoc;
        varying vec2 vUv;
        void main() {
          float f = focusAt(tDepth);
          // 取十字 5 点的最近深度：MSAA 解析后的边缘像素颜色是前后景混合、深度却只取一个样本，
          // 按最近深度算可避免轮廓外侧一圈被当成背景虚化成黑边
          vec2 tx = 1.0 / vec2(textureSize(tDepth, 0));
          float dmin = texture2D(tDepth, vUv).x;
          dmin = min(dmin, texture2D(tDepth, vUv + vec2(tx.x, 0.0)).x);
          dmin = min(dmin, texture2D(tDepth, vUv - vec2(tx.x, 0.0)).x);
          dmin = min(dmin, texture2D(tDepth, vUv + vec2(0.0, tx.y)).x);
          dmin = min(dmin, texture2D(tDepth, vUv - vec2(0.0, tx.y)).x);
          float cc = cocOf(viewDepth(dmin), f);
          float k = max(smoothstep(0.6, 2.0, cc), texture2D(tInfo, vUv).r);
          // 半分辨率结果做一次 tent 后滤波（4 个双线性采样），抹掉稀疏采样的颗粒
          vec2 ht = 0.5 / vec2(textureSize(tBlur, 0));
          vec4 bl = 0.25 * (texture2D(tBlur, vUv + vec2(-ht.x, -ht.y)) + texture2D(tBlur, vUv + vec2(ht.x, -ht.y))
                          + texture2D(tBlur, vUv + vec2(-ht.x, ht.y)) + texture2D(tBlur, vUv + vec2(ht.x, ht.y)));
          gl_FragColor = mix(texture2D(tColor, vUv), bl, k);
          // 调试：R = 本像素虚化直径 / maxBlur，G = 混合比例，B = 是否在焦点前
          if (showCoc > 0.5) gl_FragColor = vec4(cc / maxBlur, k, viewDepth(texture2D(tDepth, vUv).x) < f ? 1.0 : 0.0, 1.0);
        }`,
      blending: THREE.NoBlending,
      depthTest: false,
      depthWrite: false,
    })
    this.blurQuad = new FullScreenQuad(this.blurMat)
    this.compQuad = new FullScreenQuad(this.compMat)
    this.needsSwap = true
  }
  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget) {
    const { camera, opts, t } = this.st.cur!
    const o = opts.dof as DofOpts
    const H = renderer.getSize(new THREE.Vector2()).y
    // 焦点
    let focus = 10
    let auto = 0
    const fo = o.focus ?? { uv: [0.5, 0.5] as [number, number] }
    const fu = fo as { uv?: [number, number] }
    const fp = fo as THREE.Vector3Like
    if (typeof fo === 'number' || typeof fo === 'function') focus = val(fo, 10, t)
    else if (fu.uv) auto = 1
    else {
      const dir = new THREE.Vector3()
      camera.getWorldDirection(dir)
      focus = new THREE.Vector3(fp.x, fp.y, fp.z).sub(camera.getWorldPosition(new THREE.Vector3())).dot(dir)
    }
    // 无限远虚化直径（px）
    let cocInf: number
    if (o.aperture !== undefined) cocInf = val(o.aperture, 10, t)
    else {
      const ws = val(o.worldScale, 1, t)
      const fovV = (camera.fov * Math.PI) / 180
      const fmm = val(o.focalLength, 12 / Math.tan(fovV / 2), t)
      const fm = fmm / 1000
      const N = val(o.fStop, 2.8, t)
      const zf = Math.max(focus * ws, fm * 1.01)
      // 薄透镜：c∞ = f² / (N (zf − f))，换算到画幅高 24mm 的像素
      cocInf = ((fm * fm) / (N * (zf - fm)) / 0.024) * H
    }
    for (const m of [this.blurMat, this.compMat]) {
      const u = m.uniforms
      u.tColor.value = readBuffer.texture
      u.cameraNear.value = camera.near
      u.cameraFar.value = camera.far
      u.focusDist.value = focus
      u.autoFocus.value = auto
      if (fu.uv) u.focusUv.value.set(fu.uv[0], 1 - fu.uv[1])
      u.cocInf.value = cocInf
      u.maxBlur.value = val(o.maxBlur, 36, t)
      u.nearScale.value = val(o.nearScale, 1, t)
    }
    this.compMat.uniforms.showCoc.value = o.debug ? 1 : 0
    this.blurMat.uniforms.hlGain.value = val(o.highlight, 0, t)
    this.blurMat.uniforms.hlThr.value = val(o.highlightThreshold, 0.8, t)
    this.preMat.uniforms.hlThr.value = val(o.highlightThreshold, 0.8, t)
    this.preMat.uniforms.tColor.value = readBuffer.texture
    renderer.setRenderTarget(this.pre)
    this.preQuad.render(renderer)
    this.blurMat.uniforms.tColor.value = this.pre.texture
    renderer.setRenderTarget(this.half)
    this.blurQuad.render(renderer)
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer)
    this.compQuad.render(renderer)
  }
  dispose() {
    this.half.dispose()
    this.pre.dispose()
    this.preMat.dispose()
    this.preQuad.dispose()
    this.blurMat.dispose()
    this.compMat.dispose()
    this.blurQuad.dispose()
    this.compQuad.dispose()
  }
}

// ───────────────────────── Pass：收尾（色差/调色/暗角/颗粒 + sRGB） ─────────────────────────

class FinishPass extends Pass {
  private quad: FullScreenQuad
  mat: THREE.ShaderMaterial
  constructor(
    private st: { cur: FrameState | null },
    W: number,
    H: number,
  ) {
    super()
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        res: { value: new THREE.Vector2(W, H) },
        exposure: { value: 1 },
        toneMap: { value: 0 },
        contrast: { value: 1 },
        saturation: { value: 1 },
        black: { value: 0 },
        white: { value: 1 },
        gamma: { value: 1 },
        vigAmount: { value: 0 },
        vigOffset: { value: 0.45 },
        chroma: { value: 0 },
        grain: { value: 0 },
        grainSize: { value: 1.5 },
        seed: { value: 0 },
      },
      vertexShader: VERT,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse; uniform vec2 res;
        uniform float exposure, toneMap, contrast, saturation, black, white, gamma;
        uniform float vigAmount, vigOffset, chroma, grain, grainSize, seed;
        varying vec2 vUv;
        vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
        vec3 toSRGB(vec3 c) {
          c = max(c, 0.0);
          return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
        }
        float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
        void main() {
          vec2 d = vUv - 0.5;
          vec4 c = texture2D(tDiffuse, vUv);
          if (chroma > 0.0) {
            // 径向色差：角落处 R 往外、B 往里各错 chroma 像素
            vec2 off = d * 2.0 * chroma / res;
            c.r = texture2D(tDiffuse, vUv + off).r;
            c.b = texture2D(tDiffuse, vUv - off).b;
          }
          float a = clamp(c.a, 0.0, 1.0);
          // 缓冲里是预乘 alpha 的线性色 = 「叠在黑底上的样子」。直接对它调色：
          // 下面每一步都保持 0 → 0（对比度用固定两端的 S 曲线），透明区域不会被抬灰；
          // 透明区域里的辉光/描线（rgb > a）在 2D 合成时表现为加亮。
          vec3 col = max(c.rgb, 0.0) * exposure;
          if (toneMap > 1.5) col = col / (1.0 + col);
          else if (toneMap > 0.5) col = aces(col);
          col = toSRGB(col);
          float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
          col = max(mix(vec3(l), col, saturation), 0.0);
          col = clamp((col - black) / max(white - black, 1.0e-3), 0.0, 1.0);
          vec3 lo = 0.5 * pow(2.0 * col, vec3(contrast));
          vec3 hi = 1.0 - 0.5 * pow(2.0 - 2.0 * col, vec3(contrast));
          col = mix(lo, hi, step(0.5, col));
          col = pow(col, vec3(1.0 / gamma));
          float v = 1.0 - vigAmount * smoothstep(vigOffset, vigOffset + 0.6, length(d * vec2(res.x / res.y, 1.0)) / 0.9);
          col *= v;
          if (grain > 0.0) {
            vec2 g = floor(gl_FragCoord.xy / grainSize);
            float n = hash12(g + seed * vec2(17.13, 7.77)) + hash12(g * 1.7 + seed * 3.1) - 1.0;
            col += n * grain * a * (1.0 - 0.5 * dot(col, vec3(0.333)));
          }
          gl_FragColor = vec4(clamp(col, 0.0, 1.0), a);
        }`,
      blending: THREE.NoBlending,
      depthTest: false,
      depthWrite: false,
    })
    this.quad = new FullScreenQuad(this.mat)
    this.needsSwap = true
  }
  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget) {
    const { opts, t, frame } = this.st.cur!
    const u = this.mat.uniforms
    const tone = opts.tone ?? {}
    u.tDiffuse.value = readBuffer.texture
    u.exposure.value = val(tone.exposure, 1, t)
    u.toneMap.value = tone.toneMap === 'aces' ? 1 : tone.toneMap === 'reinhard' ? 2 : 0
    u.contrast.value = val(tone.contrast, 1, t)
    u.saturation.value = val(tone.saturation, 1, t)
    u.black.value = val(tone.black, 0, t)
    u.white.value = val(tone.white, 1, t)
    u.gamma.value = val(tone.gamma, 1, t)
    const vg = typeof opts.vignette === 'number' ? { amount: opts.vignette } : opts.vignette || { amount: 0 }
    u.vigAmount.value = val(vg.amount, 0, t)
    u.vigOffset.value = val(vg.offset, 0.45, t)
    u.chroma.value = opts.chromatic ? val(opts.chromatic, 0, t) : 0
    const gr = typeof opts.grain === 'number' ? { amount: opts.grain } : opts.grain || { amount: 0 }
    u.grain.value = val(gr.amount, 0.05, t)
    u.grainSize.value = val(gr.size, 1.5, t)
    // 种子只由帧号决定（纯函数）；取模避免大数精度问题
    u.seed.value = frame % 997
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer)
    this.quad.render(renderer)
  }
  dispose() {
    this.mat.dispose()
    this.quad.dispose()
  }
}

// ───────────────────────── 管线（按效果组合缓存） ─────────────────────────

interface Pipeline {
  composer: EffectComposer
  st: { cur: FrameState | null }
  gtao?: ScaledGTAOPass
  bloom?: UnrealBloomPass
  names: string[]
  stats: Record<string, number>
  profile: boolean
}

const pipelines = new WeakMap<THREE.WebGLRenderer, Map<string, Pipeline>>()

function keyOf(o: PostOpts) {
  const ao = o.ao ? `ao${o.ao.resolution ?? 0.5}` : ''
  return [`msaa${o.msaa ?? 4}`, ao, o.edge ? 'edge' : '', o.dof ? 'dof' : '', o.bloom ? 'bloom' : ''].join('|')
}

function buildPipeline(renderer: THREE.WebGLRenderer, W: number, H: number, o: PostOpts): Pipeline {
  const st: { cur: FrameState | null } = { cur: null }
  const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, depthBuffer: false })
  const composer = new EffectComposer(renderer, rt)
  composer.renderToScreen = true
  const names: string[] = []
  const add = (name: string, p: Pass) => {
    composer.addPass(p)
    names.push(name)
  }
  const scenePass = new ScenePass(st, W, H, o.msaa ?? 4)
  add('scene', scenePass)
  let normal: NormalPass | undefined
  if (o.ao || o.edge) {
    normal = new NormalPass(st, W, H)
    add('normals', normal)
  }
  let gtao: ScaledGTAOPass | undefined
  if (o.ao) {
    // GTAO 构造时会按相机类型选 shader 分支；这里给一个占位透视相机，每帧换成真相机
    const placeholder = new THREE.PerspectiveCamera()
    // 注意：three r186 的 GTAOPass 若在构造时就传入外部 G-buffer，会访问不存在的 normalRenderTarget 而报错，
    // 所以先按默认构造（内部 RT 只是占位，从不渲染、不分配显存），再 setGBuffer 换成我们的法线/深度。
    gtao = new ScaledGTAOPass(new THREE.Scene(), placeholder, W, H)
    gtao.setGBuffer(normal!.rt.depthTexture!, normal!.rt.texture)
    gtao.resScale = o.ao.resolution ?? 0.5
    gtao.setSize(W, H)
    add('ao', gtao)
  }
  if (o.edge) add('edge', new EdgePass(st, normal!, W, H))
  if (o.dof) add('dof', new DofPass(st, scenePass.rt.depthTexture!, W, H))
  let bloom: UnrealBloomPass | undefined
  if (o.bloom) {
    bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.8, 0.5, 0.8)
    add('bloom', bloom)
  }
  add('finish', new FinishPass(st, W, H))

  const pl: Pipeline = { composer, st, gtao, bloom, names, stats: {}, profile: false }
  // 计时包装：只有 profile 时才 gl.finish（否则零开销）
  const gl = renderer.getContext() as WebGL2RenderingContext
  composer.passes.forEach((p, i) => {
    const orig = p.render.bind(p)
    p.render = (...args: Parameters<Pass['render']>) => {
      if (!pl.profile) return orig(...args)
      glSync(gl)
      const t0 = performance.now()
      orig(...args)
      glSync(gl)
      pl.stats[names[i]] = (pl.stats[names[i]] ?? 0) + performance.now() - t0
    }
  })
  return pl
}

/**
 * 等 GPU 做完：Chrome 里 gl.finish() 并不阻塞，只有回读像素才会真正同步。
 * 按当前读缓冲的实现格式读 1 个像素（浮点目标读 FLOAT/HALF_FLOAT），只在 profile 时调用。
 */
export function glSync(gl: WebGL2RenderingContext) {
  const fmt = gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_FORMAT) as number
  const type = gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_TYPE) as number
  if (!fmt || !type) return gl.finish()
  const buf = type === gl.FLOAT ? new Float32Array(4) : type === gl.HALF_FLOAT ? new Uint16Array(4) : new Uint8Array(4)
  gl.readPixels(0, 0, 1, 1, fmt, type, buf)
}

let lastStats: Record<string, number> = {}
/** 最近一次 profile:true 渲染的逐 Pass 耗时（毫秒） */
export function lastPostStats() {
  return { ...lastStats }
}

/**
 * 带后期渲染一帧，返回共享 renderer 的 canvas（与 `three.render()` 相同，可直接 drawImage）。
 * 相机须为 PerspectiveCamera（景深/AO/描线要用 near/far 还原视深）。
 */
export function renderWithPost(three: ThreeHost, scene: THREE.Scene, camera: THREE.Camera, opts: PostOpts = {}) {
  const r = three.renderer
  const cam = camera as THREE.PerspectiveCamera
  let map = pipelines.get(r)
  if (!map) pipelines.set(r, (map = new Map()))
  const key = keyOf(opts)
  let pl = map.get(key)
  if (!pl) map.set(key, (pl = buildPipeline(r, three.W, three.H, opts)))

  const t = opts.time ?? 0
  const frame = opts.frame ?? Math.round(t * (opts.fps ?? 30))
  pl.st.cur = { scene, camera: cam, opts, t, frame }
  cam.updateMatrixWorld()

  if (pl.gtao && opts.ao) {
    const g = pl.gtao
    g.scene = scene
    g.camera = cam
    g.blendIntensity = val(opts.ao.intensity, 1, t)
    g.updateGtaoMaterial({
      radius: val(opts.ao.radius, 4, t),
      thickness: val(opts.ao.thickness, 1, t),
      distanceFallOff: val(opts.ao.distanceFallOff, 1, t),
      scale: val(opts.ao.scale, 1, t),
      samples: opts.ao.samples ?? 12,
    })
  }
  if (pl.bloom && opts.bloom) {
    pl.bloom.threshold = val(opts.bloom.threshold, 0.8, t)
    pl.bloom.strength = val(opts.bloom.strength, 0.8, t)
    pl.bloom.radius = val(opts.bloom.radius, 0.5, t)
  }

  // 保存 renderer 状态
  const prevClear = r.getClearColor(new THREE.Color())
  const prevAlpha = r.getClearAlpha()
  const prevAuto = r.autoClear
  const prevTarget = r.getRenderTarget()
  const prevShadow = r.shadowMap.enabled
  const prevShadowType = r.shadowMap.type
  if (opts.shadows) {
    r.shadowMap.enabled = true
    r.shadowMap.type = THREE.PCFSoftShadowMap
  }
  pl.profile = !!opts.profile
  pl.stats = {}
  try {
    pl.composer.render()
  } finally {
    r.shadowMap.enabled = prevShadow
    r.shadowMap.type = prevShadowType
    r.setRenderTarget(prevTarget)
    r.setClearColor(prevClear, prevAlpha)
    r.autoClear = prevAuto
    pl.st.cur = null
  }
  if (opts.profile) lastStats = { ...pl.stats }
  return r.domElement
}

/** 释放某个 renderer 上缓存的所有后期管线（一般不需要调用） */
export function disposePost(three: ThreeHost) {
  const map = pipelines.get(three.renderer)
  if (!map) return
  for (const pl of map.values()) {
    for (const p of pl.composer.passes) p.dispose()
    pl.composer.dispose()
  }
  pipelines.delete(three.renderer)
}

// ───────────────────────── 预设 ─────────────────────────

/**
 * 预设：对照原片参考帧（reference/frames，1fps）调的起点参数。镜头接入时用 `mergePost(presets.x, {...})`
 * 覆盖焦点等随镜头变化的量。长度单位都是对应镜头场景的世界单位。
 */
export const presets = {
  /**
   * 白色素模城市 —— WD1 123.4–133.4（src/films/wd1/part3/city.ts，参考帧 125–133）。
   * 原片：柔和的楼脚/街角遮蔽，白楼略微辉光，斜俯视时远近两端移轴虚化，轻颗粒。
   * 需要 shadows: true（该镜头原本用 renderShadowed）。
   */
  clayCity: {
    shadows: true,
    ao: { intensity: 0.85, radius: 9, thickness: 3, distanceFallOff: 1, scale: 1.2, samples: 12 },
    dof: { focus: { uv: [0.5, 0.5] }, aperture: 26, maxBlur: 30, nearScale: 1.2 },
    // 白楼本身就接近 1.0：阈值要贴着 1，否则整条街都被辉光抬灰（原片街道是纯黑）
    bloom: { threshold: 0.97, strength: 0.18, radius: 0.2 },
    grain: 0.035,
    vignette: 0.25,
    tone: { contrast: 1.08, exposure: 1.05 },
  } satisfies PostOpts,

  /**
   * 灰色城市亮边 —— WD1 38.2–50（src/films/wd1/part1/s09-city.ts，参考帧 040–050）。
   * 原片：楼面深灰、楼沿一圈白色亮边，高反差、黑位压死，前后景虚化，颗粒明显。
   * 镜头原本在 2D 里用 `contrast(1.5)` 拉反差——接入后应去掉，改由 tone.contrast 负责。
   */
  greyCityEdges: {
    ao: { intensity: 0.9, radius: 5, thickness: 2, scale: 1.3, samples: 12 },
    edge: { intensity: 0.75, thickness: 1, normalThreshold: 0.25, depthThreshold: 0.04, roofBias: 0.85, faceGain: 0.6, fadeNear: 150, fadeFar: 400 },
    dof: { focus: { uv: [0.5, 0.55] }, aperture: 14, maxBlur: 28, nearScale: 1.8 },
    bloom: { threshold: 0.85, strength: 0.4, radius: 0.25 },
    grain: 0.06,
    vignette: 0.35,
    tone: { contrast: 1.3, black: 0.03, exposure: 0.9 },
  } satisfies PostOpts,

  /**
   * 设备台强景深 + 发光边 —— WD1 98.2–111（src/films/wd1/part3/objects.ts，参考帧 099–111）。
   * 原片：焦点在中央物件，远处平板与天幕强烈虚化；平板白色侧边与线框物件有辉光；背景是 2D 天幕（透明 clear）。
   * 镜头原本在 2D 用 blur(1.6px) 近似景深——接入后应去掉。
   */
  stageDOF: {
    // 焦点对准物件群中心（该镜头轨道相机的注视点在原点附近）；接入时可改成随时间变化的函数
    dof: { focus: { x: 0, y: 25, z: 0 }, aperture: 12, maxBlur: 30, nearScale: 2.5, highlight: 1.5, highlightThreshold: 0.8 },
    bloom: { threshold: 0.7, strength: 0.9, radius: 0.55 },
    grain: 0.035,
    vignette: 0.3,
    tone: { contrast: 1.05 },
  } satisfies PostOpts,

  /**
   * 天际线散景 —— WD1 133.4–139.3（手机上的城市 city.ts + 天际线 lights.ts，参考帧 134–139）。
   * 原片：远处夜景的窗灯全是圆形散景光斑，137.6 才对焦；城市发光带辉光。
   * 高光增益 highlight 让亮点凝成清晰圆斑；焦点给数值由镜头随时间拉（见 docs/post.md）。
   */
  skylineBokeh: {
    shadows: true,
    dof: { focus: { uv: [0.5, 0.8] }, aperture: 30, maxBlur: 44, nearScale: 1, highlight: 20, highlightThreshold: 0.6 },
    bloom: { threshold: 0.95, strength: 0.35, radius: 0.35 },
    grain: 0.03,
    vignette: 0.35,
  } satisfies PostOpts,

  /**
   * 线框城市辉光 + 色差 —— WD2 3.6–8.75（src/films/wd2/part1/ctos-city.ts，参考帧 wd2/005–009）。
   * 原片：青色线框/点云发出柔光，远处天际线虚化成雾，画面边缘有 RGB 错位，暗部有细颗粒。
   */
  wireGlow: {
    msaa: 4,
    dof: { focus: { uv: [0.5, 0.75] }, aperture: 8, maxBlur: 14 },
    bloom: { threshold: 0.35, strength: 0.45, radius: 0.35 },
    chromatic: 3,
    grain: 0.045,
    vignette: 0.3,
    tone: { contrast: 1.1, exposure: 1.1 },
  } satisfies PostOpts,
}
