# WD2 Part3 镜头表（94s–121s）

原片：`public/reference/wd2.mp4`（1280×720 59.94fps，121s）的 ctOS Introduction Scene 结尾段。
坐标系 1920×1080。渲染为时间纯函数（见 README）。所有随机用 `rng(seed)` / `hash()`，逐帧确定。

代码入口：`src/films/wd2/part3.ts`（导出 `part3: Scene[]`）。拆分文件在 `src/films/wd2/part3/`：
- `common.ts` 通用工具（纸白底、暗角、斜纹、色边大字、块光标闪烁、逐帧 hash）
- `subtitles.ts` 本段旁白字幕（数据表 + 渲染）
- `s1-currency.ts` `s2-type.ts` `s3-terminal.ts` `s4-collage.ts` `s5-skull.ts` 五个镜头组
- `collage-draw.ts` 拼贴段绘制原语；`art.ts` DedSec 插画剪影（ASSET）

## 镜头列表

| 时间码 | id / 子镜头 | 一句话 |
| --- | --- | --- |
| 94.00–94.20 | s1 worldTail | 上一镜头尾巴：黑底暗蓝点阵世界地图（ASSET 近似） |
| 94.20–97.33 | s1 currency | 黑色货币符号铺满白纸底；巨型单词 now/less/va/able/than/data/you 逐帧快切闪现（天蓝/紫/荧光绿/品红底色跳变），短语 "you are now less valuable / than the data you produce." 逐字收拢成正常排版 |
| 97.33–97.47 | s1 stripeGlitch | 白底 + 横向彩条故障，文字切片错位 |
| 97.47–97.80 | s1 黑场 | 只剩字幕 |
| 97.80–100.05 | s2 pop | 黑底大字：this / is / the / new / reality.，每词先以色块（荧光绿→品红→红/白）遮罩弹出，"reality" 变红再变白；带黄/蓝色边（RGB 分离） |
| 100.05–102.45 | s2 roll | "this is the new reality" 上下滚出；going / dark / is / no / longer / no longer an option / an option 在各自条带里上滚替换 |
| 102.45–103.10 | s3 stripes | 黑白横条纹擦除转场（黑条里透出上一镜头大字） |
| 103.10–105.38 | s3 execute | 白纸底 + 左侧 "+" 列 + 像素字 "execute?"，块光标闪烁→换行→敲入 "Y" |
| 105.38–107.40 | s3 code | PowerShell 代码逐行打印并整体上滚，多层窗口（路径栏 usr/thishere/thathere/test_773.cgi）叠加，灰马赛克块，国防部公章 + "DTFN Estimates for Nano Domestic Quell / Phase 4 Updated Compliance" |
| 107.40–108.35 | s3 redact | 快切：马克笔涂黑机密文件、WARNING / NAVAL INVESTIGATIVE、SECRET 印章、逐帧上下跳 |
| 108.35–109.85 | s4 C1 | DedSec 拼贴入场：代码窗口 + 打字机机密文件 + ASCII 菱形 → 右下露出天蓝喷漆、DedSec 圆标 |
| 109.85–110.85 | s4 C2 | 品红斜条纹、荧光绿/黄/紫喷漆、黑云、OK 手势剪影、左侧黑色故障块、天蓝/品红滴流 |
| 110.85–111.75 | s4 C3 | 黑云 + 紫 "Y" 喷漆、会咬人的假牙、眼球堆、尖叫的眼镜男（逐帧快切/抖动最强） |
| 111.75–112.45 | s4 C4 | 一排假牙、灰色 DEDSEC TAKEOVER 弹窗阶梯、死神挥镰、天蓝喷漆 |
| 112.45–113.10 | s4 C5 | 天蓝底、哥特字 DedSec、死神；黑色墨浪从下涌起 |
| 113.10–114.30 | s5 inkWave | 拼贴碎块顶部瓦解，黑场从下涨起，上缘白色火焰边界 |
| 114.30–116.70 | s5 emerge | 黑底半调地板 + 两只手按地 + 白球 + 红色半调块；骷髅从下钻出、张嘴含白球 |
| 116.70–119.00 | s5 seated | 骷髅坐白球上，镜头轻微推近 |
| 119.00–121.00 | s5 fadeout | 骷髅与球淡出，黑场只剩字幕，最后字幕消失 |

## 旁白字幕（底部居中白色粗体小字，逐句还原）

时间码来自原片 10fps 逐帧抽样比对，精度约 ±0.05s：

- 94.00–95.30 and influence your vote, engineering social uprisings on a massive scale.（上段尾巴）
- 95.37–98.68 You are now less valuable than the data you produce.
- 98.75–100.38 This is the new reality.
- 100.45–102.55 Going dark is no longer an option.
- 102.85–107.37 With threats to personal freedom rising, many are stepping forward.
- 107.37–111.95 Whistleblowers, Activists and Hackers have drawn their battle lines,
- 111.95–114.28 putting the establishment on watch.
- 114.35–116.67 But are they threats themselves...
- 116.75–120.10 or have they become freedom’s last line of defense?

## 与原片的差异 / 近似替代（ASSET）

标 `ASSET` 的都是无法用代码 1:1 还原的手绘/扫描素材，用 Canvas 路径 + halftone 网点做风格化近似；
替换真实 PNG 只需改对应函数（调用方不变）：

- `s1-currency.ts worldTail()`：点阵世界地图。用椭圆撒点近似大洲；真实素材替换本函数即可。
- `art.ts` 全部剪影为 ASSET：`skullSprite`（眼罩骷髅）、`handSprite`（爪状手）、`eyeballSprite`（带视神经眼球）、
  `teethSprite`（会咬人的假牙）、`cloudSprite`（半调积雨云）、`reaperSprite`（死神）、`okHandSprite`、
  `screamerSprite`（尖叫眼镜男）、`sealSprite`（国防部公章）、`drawDedsecCircle`（DedSec 圆标）。
  每个 `xxxSprite()` 返回一张透明底 CanvasImageSource（按 key 缓存）；换成加载真实插画 PNG 即可 1:1。
- `collage-draw.ts blackletter()`：哥特体 "DedSec" 依赖系统字体（UnifrakturMaguntia/Old English Text MT），
  换机字体缺失时回落 Georgia serif，字形与原片像素化哥特标不完全一致。
- `collage-draw.ts typewriter()`：机密备忘录用等宽字随机行块表现「质感」，不逐字抄原文（原片模糊到几乎不可读）。
- 拼贴段（s4）是对「摄像机下摇穿过一张巨型拼贴」的重新编排：元素类别、配色、快切节奏对齐原片，
  但具体元素位置为风格化布局，非逐像素复刻。
- 代码文本（`s3-terminal.ts CODE`）取自原片可辨识的 PowerShell Empire agent 片段，长度足够循环填充窗口。

## 建议上提到共享库（src/fx / src/engine）

以下能力目前只在本段实现，若其他段也需要，建议上提：

- `common.ts fringeText()`：廉价的文字色边（黄/蓝错位 + 主色），比逐像素 `rgbSplit` 便宜，适合整段大字每帧绘制。
  建议进 `fx/glitch.ts` 或 `fx/text.ts`。
- `common.ts diagHatch()` / `collage-draw.ts stripes()`：斜向细纹 / 斜条纹填充。`fx/image.ts` 已有 `hatchRect`，
  可合并为一个支持方向/双色的版本。
- `art.ts halftoneShade()`：在任意 path 内按灰度渐变生成半调网点阴影（含 invert）。是把 `fx/image.ts halftone`
  和裁剪/明暗结合的常用封装，建议上提为 `fx/image.ts` 的高阶函数。
- `art.ts sprite()`：按 key 缓存的离屏精灵工厂，任何「程序化插画 → 可替换为 PNG」的镜头都用得上，建议进 `fx/canvas.ts`。
- `common.ts flatBg/paperBg/vignette`：纯色/纸白底 + 暗角，多段通用背景，建议进 `fx/canvas.ts`。
- 字幕（`subtitles.ts`）：本段自带数据表 + 渲染；各段字幕风格一致（白色粗体 22.5px、中心 y≈969、细黑描边），
  合并时建议统一为 `src/fx` 的字幕组件，各段只提供数据表。
