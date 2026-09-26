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
| 102.45–103.20 | s3 stripes | 黑白横条纹擦除转场（黑条里透出上一镜头大字）。V2：按原片逐帧平均亮度校准——102.55 前全黑，之后白条占比线性增长，103.2 全白 |
| 103.10–105.38 | s3 execute | 白纸底 + 左侧 "+" 列 + 像素字 "execute?"，块光标闪烁→换行→敲入 "Y" |
| 105.38–107.40 | s3 code | PowerShell 代码逐行打印并整体上滚，多层窗口（路径栏 usr/thishere/thathere/test_773.cgi）叠加，灰马赛克块，国防部公章 + "DTFN Estimates for Nano Domestic Quell / Phase 4 Updated Compliance" |
| 107.40–108.35 | s3 redact | 快切：马克笔涂黑机密文件、WARNING / NAVAL INVESTIGATIVE、SECRET 印章、逐帧上下跳 |
| 108.35–113.10 | s4 collage | V2 重做：整张拼贴画一次性画进 1920×4400 离屏画布，按 `scrollY(t)` 关键帧下摇（约 600→720→490→550→400→1000 px/s，末尾加速冲进墨浪）。分区：白纸机密文件/代码窗/ASCII 菱形 → DedSec 圆标 + 天蓝喷漆 → 品红斜条纹 + 荧光绿/黄/紫喷漆 → 紫 "Y"、左下黑云、ASCII oooo、尖叫男、眼球堆 → 灰弹窗阶梯 → 黑色墨浪带。原片里「突然出现」的元素做成跳入层：左侧黑块 110.25、右侧黑云 + OK 手势 110.35、一排假牙 111.35（比下摇更快上飞）、天蓝喷漆满屏 + 哥特字 DedSec 112.6；死神独立一层（112.0 升起、112.6 缩小右移）；109.95 起逐帧抖动 |
| 113.10–113.95 | s5 melt | 拼贴继续下摇；顶部残留一条拼贴，下方是去色的竖向拖影（拼贴一行像素竖向拉长），黑色火焰线 113.3≈900 → 113.7≈600 → 113.95≈380 上涨吞没 |
| 113.95–114.85 | s5 props | 黑底：顶部参差灰色滴流向上缩回（114.45 消失）；左侧两只眼球、中右上品红半调球、两只半调手向下按（先暗后亮）；114.5 起手向两侧上方张开、品红球切片故障；114.55 骷髅从下方斜着翻上来；114.6 起半调地板淡入 |
| 114.85–116.93 | s5 seated | 骷髅居中悬在地板上方（椭圆阴影），两侧大手 115.75 起淡出；115.55 一颗眼球从嘴边掉出、滚向镜头并变大（瞳孔随滚动转）；116.0 起骷髅下半渐暗 |
| 116.93–117.12 | s5 ballGlitch | 眼球占满下半屏 + 30fps 横向切片 / 白条故障 |
| 117.12–117.40 | s5 colorFlash | 逐 2 帧换色：青 → 黄绿 → 紫（眼球特写）→ 品红 → 深蓝 → 橄榄 / 紫 / 暗红「炸弹」斜排图案 |
| 117.40–121.00 | s5 black | 纯黑只剩字幕（V1 这里还在画骷髅与白球，与原片不符，已修正） |

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
- 拼贴段（s4）V2 已改为「一张竖长拼贴 + 下摇」，大块元素位置按原片 10fps 抽帧反推，但插画都是程序化剪影，
  原片是密集手绘漫画，SSIM 只有 ~0.1–0.2（V1 24.2 → V2 29.7），瓶颈是美术素材而非时序。
  换真实插画时保持 `drawCollage()` 里的画布坐标即可。
- s5 的手、骷髅、眼球同样是 ASSET；原片骷髅带单片眼镜、手有指节细节，本版未画。

## V2 精修记录（tmp 评分，step 0.5）

| 镜头 | V1 | V2 | 主要改动 |
| --- | --- | --- | --- |
| wd2-113-skull | 27.29 | 65.39 | 117.4 起改纯黑；113–117.4 按原片重排（融化 → 眼球/手 → 骷髅 → 眼球滚向镜头 → 换色故障） |
| wd2-108-dedsec | 24.20 | 29.65 | 5 个独立子镜头 → 一张竖长拼贴下摇 + 跳入层 + 死神层 |
| wd2-102-execute | 66.42 | 73.18 | 横条纹转场改为 102.55–103.2 线性（原片逐帧亮度量出） |
| wd2-094-currency | 56.28 | 56.30 | 未改（快切逐帧闪词，0.5s 采样点命中率决定分数；货币符号比原片粗黑是已知差距） |
| wd2-097-new-reality | 86.47 | 86.43 | 未改 |
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
