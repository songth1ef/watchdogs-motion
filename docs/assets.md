# 真实数据资产（替换镜头里的 ASSET 程序化替代品）

数据来源、许可、下载日期与处理方式见 [`assets/LICENSES.md`](../assets/LICENSES.md)。
所有资产在 `src/main.ts` 的 `ready` 流程里由 `preloadAssets()` 预加载；镜头 `render()` 里只能**同步**取用。
单项加载失败只打 `console.warn`，镜头应当用 `hasGeo()` / `hasWorld()` / `hasEarth()` 判断并回退到原来的程序化实现。

## 文件一览

| 文件 | 体积 | 内容 |
| --- | --- | --- |
| `public/assets/geo/chicago.wdgeo.gz` | 1.5 MB | 芝加哥 Loop ±4 km：53,651 个建筑体块（含高度）、道路、铁路/CTA L、河道、水面、密歇根湖 |
| `public/assets/geo/sf.wdgeo.gz` | 1.8 MB | 旧金山半岛（旧金山 → 帕洛阿尔托）全等级道路 66k 条、市中心建筑 1.6 万、陆地面 + 海岸线 |
| `public/assets/geo/bay.wdgeo.gz` | 0.95 MB | 整个湾区：陆地面 + 海岸线 + 主干道 |
| `public/assets/geo/bay-hillshade.jpg` / `bay-elevation.png` / `bay-terrain.json` | 1.1 + 1.1 MB | 湾区晕渲与高程栅格（2048×2352，47 m/px，bay 区域坐标） |
| `public/assets/geo/world-50m.json.gz` / `world-110m.json.gz` | 0.48 / 0.05 MB | Natural Earth：陆地、海岸线、国家、美加州/省界、湖泊（含五大湖）、城市点 |
| `public/assets/earth/*.jpg` | 0.58 + 1.06 + 0.30 MB | 4096×2048 等距圆柱：Black Marble 2016 夜光、Blue Marble 地形测深、GEBCO 高程灰度 |

## 坐标系约定

- **区域数据（chicago / sf / bay）**：本地米制，`x` = 向东米，`y` = 向北米，原点 = `geo(id).origin`
  （芝加哥 = State & Madison `[-87.6298, 41.8837]`；旧金山 = 市政厅 `[-122.4194, 37.7749]`；湾区 = `[-122.25, 37.65]`）。
  经纬度互转：`geo(id).toLocal(lon, lat)` / `geo(id).toLonLat(x, y)`。sf 与 bay 原点不同，混用时先转经纬度。
- **2D 画布**：`MapView { cx, cy, scale(px/米), rot(弧度，正 = 顺时针), ox, oy }`，北朝上时 y 自动取反（`geo-draw.ts`）。
- **three.js**：`X = 东`、`Z = 南（−北）`、`Y = 高度`；`buildRealCity()` 默认以 `center` 为世界原点、1 单位 = 1 米（`scale` 可改）。
- **经纬度地图**：`projection.ts` 的投影函数返回 `[x, y, 可见]`，画布 y 向下、北朝上。
- **地球贴图**：等距圆柱，左 = 经度 −180、上 = 北纬 90，与 `THREE.SphereGeometry` UV 一致（`wd1/part1/earth.ts` 的 `lonLatVec` 可直接用）。

## API

### `src/assets/geo.ts`（`src/assets/index.ts` 汇总导出）

- `loadGeo(id)` / `geo(id)` / `hasGeo(id)`：区域数据，`id ∈ 'chicago' | 'sf' | 'bay'`。
  `layers.buildings`（面，`props.h`/`props.min` 分米，`props.src` 高度来源）、`roads`（线，`props.cls` 见 `ROAD`）、`rail`、`rivers`、`water`、`lake`、`shore`、`land`、`coast`。
  面：`polyStart → ringStart → xy`；线：`lineStart → xy`（`xy` 为米制 `Float32Array` 交错 x,y）。工具：`forEachPoly`、`polyCenter`、`buildingHeight`、`roadRank`。
- `loadWorld(res)` / `world(res)`：`land`、`coast`、`countries`、`states`（仅 50m）、`lakes`（仅 50m）、`cities`（仅 50m）；环为经纬度交错 `Float32Array`。`GREAT_LAKES` 为五大湖名字。
- `loadBayTerrain()` / `bayTerrain()`：`{ hillshade, elevation, rect, metersPerPixel }`。

### `src/assets/geo-draw.ts`（区域数据 2D 绘制）

`viewAt(region, lon, lat, scale, rot)`、`fitView(rect, W, H, pad)`、`toScreen` / `fromScreen`、
`drawLayer(ctx, id, layer, view, { stroke, fill, width, filter, filterKey })`（Path2D 按 key 缓存）、
`drawWater(ctx, id, view, 水色, 陆地色?)`、`drawRaster(ctx, img, rect, view, alpha)`、`mapCanvas(key, w, h, draw)`（离屏缓存）、`ROAD_FILTERS.major/minor/highway`。

### `src/assets/projection.ts`（经纬度地图）

`equirect({lon0, lat0, scale})`、`mercator({lon0, lat0, scale})`、`orthographic({lon0, lat0, r, roll})`、`clampToLimb()`（正交投影填充面用）、
`fillPolys`、`strokeRings`、`ringsOf`、`landDots(land, 步长°)`（陆地规则点阵）。

### `src/assets/earth.ts`

`loadEarth()`、`earthImage('night' | 'blue' | 'topo')`、`earthTexture(名字或 canvas, key)`（`THREE.Texture`，sRGB）、
`earthComposite({ topo, blue, lights, ocean, gamma })`（灰度合成：地形浮雕 + 夜光，WD1 开场风格）、`earthUV(lon, lat)`。

### `src/three/real-city.ts`

`buildRealCity({ region, style: 'clay' | 'wire' | 'dark', center | centerLonLat, radius | rect, scale, heightScale, minHeight, minArea, jitter, edges, edgeColor, edgeOpacity, ground, water, roads })`
→ `{ group, mesh, edges, count, toWorld(x, y, h), fromLonLat(lon, lat, h), bounds }`。
所有建筑合并成一个 BufferGeometry（墙 + 屋顶共享顶点、`flatShading`），边线合并成一个 LineSegments。
另有 `buildGeoLines(layer, opts)` / `buildGeoPolys(layer, opts)` 生成贴地道路线 / 水面网格。调用方负责 `memo()` 缓存。

## 调用示例

WD1 素模城市（`wd1-123-clay-city`，替换 `city.ts buildCity()` 里的 InstancedMesh）：

```ts
import { buildRealCity } from '../../../three/real-city'
const city = memo('wd1p3:real', () => buildRealCity({ region: 'chicago', style: 'clay', radius: 1500, jitter: 0.1 }))
scene.add(city.group) // 1 单位 = 1 米；原片城市规模约为本工程 PITCH=18 → 可用 scale: 18 / 100 对齐
const hacked = city.fromLonLat(-87.6278, 41.8819) // 在真实街区上放 HACKED
```

WD2 俯拍芝加哥街道地图（`wd2-008.3-city-map`，湖在左上）：

```ts
import { drawLayer, drawWater, viewAt, ROAD_FILTERS } from '../../../assets/geo-draw'
import { geo } from '../../../assets'
const v = { ...viewAt(geo('chicago'), -87.635, 41.885, 0.3), rot: -125 * Math.PI / 180 + t * 0.01 }
drawWater(ctx, 'chicago', v, '#0a0d10')
drawLayer(ctx, 'chicago', 'roads', v, { stroke: 'rgba(230,240,240,.8)', width: 1.4, filter: ROAD_FILTERS.major, filterKey: 'major' })
```

WD2 湾区地形（`wd2-033.4-bay-area`，替换 `bayTexture()`）：

```ts
const T = bayTerrain(), v = { ...viewAt(geo('bay'), -122.25, 37.68, 0.0125), rot: -0.26 }
drawRaster(ctx, T.hillshade, T.rect, v, 0.55)
drawWater(ctx, 'bay', v, '#000')                       // 只涂水面，保留陆地上的晕渲
drawLayer(ctx, 'bay', 'roads', v, { stroke: '#fff', width: 1.1 })
```

WD1 夜光地球（`wd1-003-earth`，替换 `earth.ts earthTexture()`，UV 约定不变）：

```ts
import { earthComposite, earthTexture as earthTex, hasEarth } from '../../../assets/earth'
// earth.ts 里：真实贴图可用时直接返回，否则走原来的程序化贴图
if (hasEarth('night') && hasEarth('topo')) return earthTex(earthComposite({ topo: 0.3, lights: 1.1, ocean: 10 }), 'wd1-earth')
```

美国州界 / 世界点阵（`wd2-026.45-us-map`、`wd2-084-universe-world`）：

```ts
const w = world('50m'), P = mercator({ lon0: -97, lat0: 38.5, scale: 1900 })
strokeRings(ctx, ringsOf(w.states.filter((s) => s.country === 'USA').flatMap((s) => s.polys)), P, 'rgba(160,190,200,.45)')
const dots = landDots(w.land, 0.9) // [lon, lat, ...]，再用 world.ts 现有的 projX/projY 投影
```

## 覆盖的原片镜头

| 资产 | 可接入的镜头 id（见 docs/shots） | 替换的函数 |
| --- | --- | --- |
| chicago 建筑 clay | `wd1-123-clay-city` | `wd1/part3/city.ts buildCity()`（`layout.ts blockLayout`） |
| chicago 建筑 dark + rail | `wd1-034-city`、`wd1-050-city-ctos-list` | `wd1/part1/s09-city.ts cityScene()`（青色线路可用 `rail` 图层 = subway lines）、`wd1/part2/s50-city.ts buildCity()` |
| chicago 建筑 wire + roads | `wd2-003.6-ctos-grid` | `wd2/part1/ctos-city.ts buildGrid()` |
| chicago 2D 道路/湖/建筑 | `wd2-008.3-city-map`、`wd2-014.2-grid-collapse`（用同一地图）、`wd2-001.5-chicago-sat`（夜景卫星图可用道路/建筑合成近似） | `cityMapTexture()` / `groundTexture()` / `chicagoTexture()` |
| chicago Willis Tower 部件 | `wd1-058-tower-answer-ctos` | `s58-tower.ts drawTower()`（可从 buildings 里按位置取 Willis Tower 的 building:part 轮廓与高度） |
| sf 道路/陆地/建筑 | `wd2-036.9-peninsula`、`wd2-031.45-64-billion` | `bay.ts penTexture()`、`drawCityTile()` |
| bay 地形 + 海岸 + 主干道 | `wd2-033.4-bay-area`、`wd2-026.45-us-map`（开头 SAN JOSE 近景） | `bay.ts bayTexture()` |
| 地球贴图 | `wd1-003-earth` | `wd1/part1/earth.ts earthTexture()` |
| world-50m 州界 + 五大湖 | `wd1-012-blackout`、`wd1-015-roads`（州界/海岸，道路仍需另取）、`wd2-026.45-us-map`、`wd2-000-2013`（HUD 国界） | `geo.ts` 各常量、`s04-roads.ts outlines()`、`usa.ts` 美国轮廓/州界 |
| world 陆地 / 城市点 | `wd1-069-global-network`（`US_OUTLINE`、`CITIES`）、`wd1-096-world-views-ctos-stage`（`CONTINENTS`）、`wd2-084-universe-world`（`CONTINENTS` → `landDots`）、`wd2-part3` 的 s1 worldTail（94.0–94.2） | 各文件的手写多边形 |

## 验证 / 重新生成

```bash
node scripts/assets-demo.mjs            # 无头渲染演示页，输出 snaps/assets/<视图>.png 与 <视图>-cmp.jpg（左演示 | 右原片）
# 开发时浏览：pnpm dev → /src/dev/assets-demo.html?v=chicago-clay-top

node scripts/assets/fetch-osm.mjs [区域] [图层]   # 下载 OSM 原始数据（缓存在 node_modules/.cache/wd-geo-raw）
node scripts/assets/build-geo.mjs [区域]           # → public/assets/geo/<区域>.wdgeo.gz
node scripts/assets/build-world.mjs                # Natural Earth（先下载到 node_modules/.cache/wd-ne-raw，URL 见 LICENSES）
node scripts/assets/build-terrain.mjs              # 湾区地形
```

性能注意：`drawLayer` 首次画某个大图层（芝加哥 5 万栋楼填充）需要约 1.5 s 建立光栅缓存，之后每帧约 0.15 s（swiftshader 无头环境）；
需要平移/缩放一张静态地图时，建议先用 `mapCanvas()` 画成离屏大图再 `drawRaster()`。
