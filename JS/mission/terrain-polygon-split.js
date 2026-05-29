(function () {
  function polygonArea(polygon) {
    if (!polygon || polygon.length < 3) {
      return 0;
    }
    let sum = 0;
    for (let i = 0; i < polygon.length; i += 1) {
      const a = polygon[i];
      const b = polygon[(i + 1) % polygon.length];
      sum += a.lng * b.lat - b.lng * a.lat;
    }
    return Math.abs(sum) * 0.5;
  }

  function polygonCentroid(polygon) {
    let lat = 0;
    let lng = 0;
    (polygon || []).forEach(function (p) {
      lat += Number(p.lat);
      lng += Number(p.lng);
    });
    const n = polygon.length || 1;
    return { lat: lat / n, lng: lng / n };
  }

  function clipPolygonByLatitude(polygon, splitLat, keepNorth) {
    const out = [];
    for (let i = 0; i < polygon.length; i += 1) {
      const a = polygon[i];
      const b = polygon[(i + 1) % polygon.length];
      const aIn = keepNorth ? a.lat >= splitLat : a.lat <= splitLat;
      const bIn = keepNorth ? b.lat >= splitLat : b.lat <= splitLat;
      if (aIn) {
        out.push({ lat: a.lat, lng: a.lng });
      }
      if (aIn !== bIn) {
        const t = (splitLat - a.lat) / (b.lat - a.lat || 1e-12);
        out.push({
          lat: splitLat,
          lng: a.lng + (b.lng - a.lng) * t
        });
      }
    }
    return out.length >= 3 ? out : null;
  }

  function autoPartitionByRelief(polygon, stats, maxReliefM) {
    if (!polygon || polygon.length < 3) {
      return [];
    }
    const relief = Number(stats && stats.relief) || 0;
    if (relief <= maxReliefM) {
      return [polygon];
    }
    const lats = polygon.map(function (p) {
      return p.lat;
    });
    const midLat = (Math.min.apply(null, lats) + Math.max.apply(null, lats)) / 2;
    const north = clipPolygonByLatitude(polygon, midLat, true);
    const south = clipPolygonByLatitude(polygon, midLat, false);
    let parts = [];
    if (north) {
      parts.push(north);
    }
    if (south) {
      parts.push(south);
    }
    if (!parts.length) {
      return [polygon];
    }
    if (parts.length === 1) {
      return parts;
    }
    const next = [];
    parts.forEach(function (part) {
      const subStats = Object.assign({}, stats, {
        relief: relief / 2
      });
      if (polygonArea(part) < polygonArea(polygon) * 0.05) {
        return;
      }
      autoPartitionByRelief(part, subStats, maxReliefM).forEach(function (p) {
        next.push(p);
      });
    });
    return next.length ? next : [polygon];
  }

  window.TerrainPolygonSplit = {
    autoPartitionByRelief: autoPartitionByRelief,
    polygonArea: polygonArea,
    polygonCentroid: polygonCentroid
  };
})();
