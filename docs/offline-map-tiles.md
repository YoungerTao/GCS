# 离线地图瓦片（MP 风格）

GCS 通过本地瓦片服务缓存 Esri WGS84 底图，支持 Mission Planner 风格的区域预取。

## 架构

- **下载 CLI**：`tools/map-tiles/download_map_tiles.py`
- **瓦片服务**：`tools/map-tiles/tile_server.py` → `http://127.0.0.1:8768`
- **缓存目录**：`~/.gcs/map-tiles/{layer}/{z}/{x}/{y}.png`
- **图层**：`imagery`（卫星）、`roads`（道路）、`places`（地名）
- **启动**：`tools/gcs_watchdog.py` 在拉起 runtime 后会调用 `map_tiles_supervisor.ensure_tile_server()`

## CLI 示例

```bash
python3 tools/map-tiles/download_map_tiles.py \
  --south 29.5 --west 106.1 --north 29.7 --east 106.4 \
  --zoom-min 14 --zoom-max 17 --dry-run

python3 tools/map-tiles/download_map_tiles.py \
  --south 29.5 --west 106.1 --north 29.7 --east 106.4 \
  --zoom-min 14 --zoom-max 17
```

## HTTP API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health` | 服务状态、`cachedTiles`、地形 `terrainReady`、预取进度 |
| GET | `/tiles/{layer}/{z}/{x}/{y}.png` | 本地瓦片；`?cacheOnly=1` 无缓存则 404 |
| POST | `/prefetch?dryRun=1` | 估算瓦片数与体积（JSON 见下） |
| POST | `/prefetch` | 后台预取影像 |
| GET | `/prefetch/status` | 影像预取进度 |
| POST | `/prefetch/cancel` | 取消影像预取 |
| GET | `/elevation?lat=&lng=` | 单点 AMSL 高程（米） |
| POST | `/elevation/batch` | 批量高程 `{ "points": [{lat,lng}] }` |
| POST | `/elevation/profile` | 沿折线剖面 `{ "points", "stepM" }` |
| POST | `/terrain/stats` | 测区统计 `{ "polygon": [...] }` |
| POST | `/terrain/prefetch` | 预下载 SRTM Skadi 瓦片 |
| GET | `/terrain/prefetch/status` | 地形预取进度 |
| POST | `/terrain/prefetch/cancel` | 取消地形预取 |
| GET/POST | `/terrain/grid` | MAVLink 地形网格行（`lat`/`lon` degE7、`grid_spacing`、`mask`） |

预取 JSON 体示例：

```json
{
  "south": 29.5,
  "west": 106.1,
  "north": 29.7,
  "east": 106.4,
  "zoomMin": 14,
  "zoomMax": 17,
  "layers": ["imagery", "roads", "places"]
}
```

## 前端

- 底图经 `JS/core/map-layers.js` 走本地服务，失败时回退 Esri 直连。
- 顶栏「预取地图」「仅缓存」由 `map-tile-settings.js` 驱动。
- 地图上 **Shift+拖拽** 选区打开预取对话框（`map-prefetch.js`）。

环境变量 `GCS_MAP_TILE_ROOT` 可覆盖默认影像缓存路径；`GCS_TERRAIN_ROOT` 可覆盖地形缓存（默认 `~/.gcs/terrain`）。

地形 CLI：

```bash
python3 tools/map-tiles/download_terrain.py \
  --south 29.5 --west 106.1 --north 29.7 --east 106.4 --dry-run
```
