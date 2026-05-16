/**
 * GCS 地图底图：卫星 + 道路 + 地名，全部采用 WGS84（与 GPS / ArduPilot 一致）。
 * 勿将高德等 GCJ-02 标注叠在 Esri WGS84 影像上，否则道路与底图会系统性偏移。
 */
(function () {
  function addGcsMapBaseLayers(map) {
    if (!map || typeof window.L === "undefined") return null;

    const imagery = window.L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 19, attribution: "Imagery © Esri" }
    );

    const roads = window.L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 19, opacity: 0.85, attribution: "Roads © Esri" }
    );

    const places = window.L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 19, opacity: 0.9, attribution: "Labels © Esri" }
    );

    imagery.addTo(map);
    roads.addTo(map);
    places.addTo(map);

    return { imagery, roads, places };
  }

  window.addGcsMapBaseLayers = addGcsMapBaseLayers;
})();
