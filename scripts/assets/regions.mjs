// 真实地理资产的区域定义（fetch-osm.mjs 与 build-geo.mjs 共用）。
// bbox 顺序统一为 [south, west, north, east]（Overpass 的顺序）。
// origin 是本地米制坐标的原点：x = 向东米数，y = 向北米数（等距近似投影，几十公里内误差 < 0.1%）。

export const RAW_DIR = 'node_modules/.cache/wd-geo-raw'
export const OUT_DIR = 'public/assets/geo'

const HW_ALL = '^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|living_street)(_link)?$'
const HW_MAJOR = '^(motorway|trunk|primary|secondary)(_link)?$'

export const REGIONS = {
  /** 芝加哥 Loop 及周边：北到 North Ave 附近，南到 Cermak 以南，西到 Ashland 以西，东到湖面 */
  chicago: {
    origin: [-87.6298, 41.8837], // State & Madison（芝加哥门牌零点）
    bbox: [41.845, -87.69, 41.925, -87.595],
    quantum: 0.25, // 坐标量化步长（米）
    queries: {
      buildings: (b) => `[out:json][timeout:240][maxsize:1073741824];
(way["building"](${b});relation["building"]["type"="multipolygon"](${b});way["building:part"](${b}););out geom;`,
      roads: (b) => `[out:json][timeout:180];way["highway"~"${HW_ALL}"](${b});out geom;`,
      rail: (b) => `[out:json][timeout:180];way["railway"~"^(rail|subway|light_rail|elevated)$"](${b});out geom;`,
      water: (b) => `[out:json][timeout:180];
(way["natural"="water"](${b});relation["natural"="water"]["name"!="Lake Michigan"](${b});
 way["waterway"="riverbank"](${b});relation["waterway"="riverbank"](${b}););out geom;`,
      rivers: (b) => `[out:json][timeout:180];way["waterway"~"^(river|canal)$"](${b});out geom;`,
      // 密歇根湖在 OSM 里不是 coastline，而是一个巨大的 natural=water 多边形关系：只取与 bbox 相交的岸线成员
      lake: (b) => `[out:json][timeout:180];rel["natural"="water"]["name"="Lake Michigan"];way(r)(${b});out geom;`,
    },
    // 用来判定「水在哪一侧」的湖面测试点（lon, lat）
    lakePoint: [-87.6, 41.88],
  },
  /** 旧金山半岛：旧金山市 → 帕洛阿尔托，全等级道路 */
  sf: {
    origin: [-122.4194, 37.7749], // 旧金山市政厅附近
    bbox: [37.4, -122.53, 37.84, -122.05],
    quantum: 1,
    queries: {
      roads: (b) => `[out:json][timeout:300][maxsize:1073741824];way["highway"~"${HW_ALL}"](${b});out geom;`,
      // 旧金山市中心（FiDi / SoMa）建筑，可选
      buildings: () => `[out:json][timeout:240];(way["building"](37.765,-122.43,37.812,-122.385);relation["building"]["type"="multipolygon"](37.765,-122.43,37.812,-122.385););out geom;`,
    },
  },
  /** 整个湾区：海岸线（拼成陆地多边形）+ 主干道 */
  bay: {
    origin: [-122.25, 37.65],
    bbox: [37.15, -122.75, 38.15, -121.65],
    quantum: 2,
    split: { roads: 3 },
    queries: {
      coast: (b) => `[out:json][timeout:240];way["natural"="coastline"](${b});out geom;`,
      roads: (b) => `[out:json][timeout:180];way["highway"~"${HW_MAJOR}"](${b});out geom;`,
    },
  },
}
