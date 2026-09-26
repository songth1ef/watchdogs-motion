# 第三方数据来源与许可

本工程 `public/assets/` 下的真实地理/地球资产全部来自第三方开放数据，经 `scripts/assets/*.mjs` 预处理。
原始下载缓存在 `node_modules/.cache/wd-*-raw/`（不入库），重跑脚本即可复现。
下载日期统一为 **2026-09-26**（Overpass 数据库时间戳 2026-09-26T08:09Z 前后）。

> 发布含 OSM 数据的画面时需要署名「© OpenStreetMap contributors」；ODbL 要求对**数据库本身**的再分发保持同一许可（ODbL 1.0），
> 用它渲染出的图像/视频属于「Produced Work」，只需署名。

## 1. OpenStreetMap（芝加哥 / 旧金山半岛 / 湾区）

| 产物 | 内容 | 来源 URL | 许可 |
| --- | --- | --- | --- |
| `public/assets/geo/chicago.wdgeo.gz`（1.5 MB） | bbox 41.845,-87.690,41.925,-87.595（约 7.9 km × 8.9 km，Loop 为中心）：建筑轮廓 + `building:part` + `height` / `building:levels` / `min_height`；道路（motorway…living_street 及 _link）；铁路 / CTA L 线；河道中心线；水面多边形；密歇根湖岸线与湖面 | Overpass API `https://overpass-api.de/api/interpreter`（查询语句见 `scripts/assets/regions.mjs`） | ODbL 1.0，© OpenStreetMap contributors，https://www.openstreetmap.org/copyright |
| `public/assets/geo/sf.wdgeo.gz`（1.8 MB） | bbox 37.40,-122.53,37.84,-122.05（旧金山市 → 帕洛阿尔托）：全等级道路；旧金山市中心（FiDi/SoMa，37.765–37.812 N）建筑；海岸线拼出的陆地面（取自 bay 的海岸线原始数据） | 同上 | 同上 |
| `public/assets/geo/bay.wdgeo.gz`（0.95 MB） | bbox 37.15,-122.75,38.15,-121.65（整个湾区）：`natural=coastline` 海岸线 + 拼接后的陆地面；主干道（motorway/trunk/primary/secondary，3×3 分块下载后按 id 去重合并，68,222 段） | 同上；整块查询在所有镜像 504 超时，改分块后大部分块来自 overpass-api.de，个别块来自镜像 `https://maps.mail.ru/osm/tools/overpass/api/interpreter`（同一 OSM 数据库） | 同上 |

处理方式（`scripts/assets/build-geo.mjs` + `geo-lib.mjs`）：

- 投影到区域本地米制坐标（等距近似：x = 向东米、y = 向北米，原点见 `regions.mjs` 的 `origin`）。
- 建筑：multipolygon 关系按成员拼环（含内环洞）；有 `building:part` 的建筑用部件代替外轮廓（OSM 3D 惯例）；
  高度优先级 `height` → `building:levels`×3.5 m（+`roof:levels`）→ 周边 300 m 网格已知高度中位数（小于 150 m² 的小房子封顶 9 m）→ 按 `building` 类型兜底；
  来源记录在 `buildings.src`（0 标签 / 1 层数 / 2 估计）。芝加哥 53,651 个体块中 525 个有 height、25,878 个按层数、27,248 个为估计。
- 线：裁剪到 bbox，Douglas–Peucker 抽稀（容差 = 2 × 量化步长）。
- 密歇根湖：湖关系在 bbox 内的成员岸线拼接后，沿 bbox 边界补边闭合成湖面（用湖面测试点判定水在哪一侧）。
- 海岸线：保持 OSM 方向（陆地在左），裁剪到 bbox 后沿边界逆时针补边，得到陆地面；水面 = bbox − 陆地。
- 坐标按区域量化步长（芝加哥 0.25 m、旧金山 1 m、湾区 2 m）取整，存成 WDGEO 二进制（头 JSON + 类型化数组）再 gzip。

## 2. NASA 地球贴图

| 产物 | 来源 URL | 许可 / 署名 | 处理 |
| --- | --- | --- | --- |
| `public/assets/earth/black-marble-2016-4096.jpg`（0.58 MB） | https://eoimages.gsfc.nasa.gov/images/imagerecords/144000/144898/BlackMarble_2016_3km.jpg（13500×6750） | NASA 影像，美国公有领域（不受版权保护）；署名建议「NASA Earth Observatory / Black Marble 2016（Joshua Stevens, Miguel Román, Suomi NPP VIIRS）」，见 https://earthobservatory.nasa.gov/image-use-policy | ffmpeg lanczos 缩到 4096×2048，JPEG q3 |
| `public/assets/earth/blue-marble-topo-bathy-4096.jpg`（1.06 MB） | https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73909/world.topo.bathy.200412.3x5400x2700.jpg | 同上，公有领域；署名「NASA Earth Observatory, Blue Marble Next Generation（Reto Stöckli）」 | 同上 |
| `public/assets/earth/topography-gray-4096.jpg`（0.30 MB） | https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/topography/gebco_08_rev_elev_5400x2700.jpg（Visible Earth #73934） | NASA 公有领域；底层数据 GEBCO_08 Grid（GEBCO 允许自由使用，需署名「GEBCO」） | 同上，转单通道灰度 |

## 3. Natural Earth 矢量

| 产物 | 来源 URL | 许可 | 处理 |
| --- | --- | --- | --- |
| `public/assets/geo/world-50m.json.gz`（0.48 MB） | https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ 下的 `ne_50m_land`、`ne_50m_coastline`、`ne_50m_admin_0_countries`、`ne_50m_admin_1_states_provinces_lakes`（只保留 USA/CAN）、`ne_50m_lakes`（有名字的）、`ne_50m_populated_places_simple`（美国全收 + 其他国家人口 ≥ 30 万） | 公有领域（https://www.naturalearthdata.com/about/terms-of-use/），无需署名（建议注明「Made with Natural Earth」） | 经纬度 ×100 取整（≈1 km），环内差分编码、去重，JSON + gzip |
| `public/assets/geo/world-110m.json.gz`（0.05 MB） | 同目录 `ne_110m_land`、`ne_110m_coastline`、`ne_110m_admin_0_countries` | 同上 | 同上 |

## 4. 湾区地形（AWS Terrain Tiles）

| 产物 | 来源 URL | 许可 / 署名 | 处理 |
| --- | --- | --- | --- |
| `public/assets/geo/bay-hillshade.jpg`（1.08 MB）、`bay-elevation.png`（1.06 MB）、`bay-terrain.json` | `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/11/{x}/{y}.png`（z11，x 325–331，y 788–796，共 63 块；AWS Open Data「Terrain Tiles」） | 各底层数据为公有领域或开放许可，需按 https://github.com/tilezen/joerd/blob/master/docs/attribution.md 署名；本区域主要为 USGS 3DEP/NED（美国公有领域）、SRTM（NASA，公有领域）、GMTED2010 / ETOPO1（公有领域）。建议署名「Terrain Tiles（Mapzen/Tilezen，AWS Open Data）；USGS 3DEP, NASA SRTM」 | 解码 Terrarium（R·256 + G + B/256 − 32768 米），重投影到 bay 区域本地米制栅格 2048×2352（47.3 m/px），计算晕渲（光源方位 315°、高度 45°、垂直夸张 2，海拔 ≤ 0.5 m 置黑）；高程 0–1000 m 线性映射到 0–255 灰度 |
