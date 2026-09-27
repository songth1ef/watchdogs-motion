import type { Film, Scene } from '../../engine/types'
import { clamp, seg } from '../../engine/math'
import { FONT, font, tag, tracking } from '../../fx/text'
import { WD1 } from '../../theme'

/**
 * 公开发布版片尾：免责声明 + 开放数据/模型署名（OSM 的 ODbL 要求署名，其余为建议署名）。
 * 署名内容与 assets/LICENSES.md 保持一致；新增第三方素材时两处一起改。
 */
const CREDITS: [string, string][] = [
  ['Map data', '© OpenStreetMap contributors (ODbL) · Made with Natural Earth'],
  ['Earth imagery', 'NASA Earth Observatory — Black Marble 2016, Blue Marble Next Generation · GEBCO'],
  ['Terrain', 'Terrain Tiles (Mapzen / Tilezen, AWS Open Data) · USGS 3DEP · NASA SRTM'],
  ['3D models', 'NASA 3D Resources (public domain) · Poly Haven (CC0)'],
  ['Voice', 'Neural text-to-speech'],
  ['Engine', 'Canvas 2D + three.js · every frame rendered in the browser'],
]

const credits: Scene = {
  id: 'outro-00-credits',
  start: 0,
  end: 14,
  note: '免责声明与署名',
  render({ ctx, lt, dur }) {
    const a = clamp(Math.min(lt / 0.6, (dur - lt) / 0.8))
    ctx.globalAlpha = a
    tag(ctx, { text: 'FAN-MADE RECREATION', x: 160, y: 190, size: 24, p: seg(lt, 0.1, 0.8) })
    font(ctx, 64, 700, FONT.sans)
    tracking(ctx, -1.5)
    ctx.fillStyle = '#fff'
    ctx.fillText('Watch Dogs trailers, recreated in code', 160, 290)
    tracking(ctx, 0)
    font(ctx, 28, 400, FONT.sans)
    ctx.fillStyle = 'rgba(255,255,255,0.8)'
    ctx.fillText('Watch Dogs, ctOS and DedSec are trademarks of Ubisoft. This is an unofficial study,', 160, 360)
    ctx.fillText('not affiliated with or endorsed by Ubisoft. Original trailer footage and audio © Ubisoft, shown for comparison.', 160, 400)
    CREDITS.forEach(([k, v], i) => {
      const p = seg(lt, 0.8 + i * 0.25, 1.4 + i * 0.25)
      ctx.globalAlpha = a * p
      font(ctx, 22, 400, FONT.mono)
      ctx.fillStyle = WD1.cyan
      ctx.fillText(k.toUpperCase(), 160, 500 + i * 58)
      font(ctx, 28, 400, FONT.sans)
      ctx.fillStyle = '#fff'
      ctx.fillText(v, 460, 500 + i * 58)
    })
    ctx.globalAlpha = a
  },
}

export const outroEnCmp: Film = {
  id: 'outro-en-cmp',
  title: 'Outro · credits (English, comparison cut)',
  duration: 14,
  fps: 30,
  background: '#000000',
  scenes: [credits],
}
