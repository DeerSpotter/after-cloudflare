(() => {
  const BASE_URL = window.FLARELESS_BASE_URL || "http://127.0.0.1:8765";
  const CARTO_STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
  const FALLBACK_SOURCE = "flareless-fallback-live";

  const fallbackNodes = {
    "client-us": { label: "Client", lat: 39.5, lon: -98.3, kind: "client" },
    flareless: { label: "Flareless", lat: 32.0, lon: -35.0, kind: "director" },
    "cdn-a": { label: "Cloudflare", lat: 50.1, lon: -5.1, kind: "provider" },
    "cdn-b": { label: "Fastly", lat: 1.3, lon: 103.8, kind: "provider" },
    "cdn-c": { label: "CloudFront", lat: 35.7, lon: 139.7, kind: "provider" },
    "peer-assisted-edge": { label: "Micro CDN", lat: -23.5, lon: 133.8, kind: "peer" },
    origin: { label: "Origin", lat: 52.5, lon: 13.4, kind: "origin" },
  };

  function isFailed(result) {
    return String(result || "").match(/TIMEOUT|BLOCKED|ERROR|OFFLINE|DISABLED|NO_HEALTHY|HTTP_/);
  }

  function isGood(result) {
    const text = String(result || "");
    return text.includes("SUCCESS") || text.includes("ADVERTISES_CONTENT");
  }

  function nodeColor(id, result, activeProvider) {
    if (id === activeProvider) return "#46f0a0";
    if (isFailed(result)) return "#f04455";
    if (fallbackNodes[id]?.kind === "director") return "#f6b44c";
    if (fallbackNodes[id]?.kind === "peer") return "#62c8ff";
    return "#dbe7ff";
  }

  function routeArc(from, to) {
    const points = [];
    const dx = to.lon - from.lon;
    const lift = Math.min(32, Math.max(8, Math.abs(dx) * 0.12));
    for (let step = 0; step <= 48; step += 1) {
      const t = step / 48;
      points.push([
        from.lon + dx * t,
        from.lat + (to.lat - from.lat) * t + Math.sin(Math.PI * t) * lift,
      ]);
    }
    return points;
  }

  function buildFallbackGeoJson(status, tracePayload, providerPayload) {
    const routeTrace = tracePayload?.routeTrace || {};
    const attempts = routeTrace.attempts || [];
    const activeProvider = status?.activeProvider || routeTrace.finalStatus?.provider || "";
    const resultByProvider = Object.fromEntries(attempts.map((attempt) => [attempt.provider, attempt.result]));
    const features = [];
    const segments = [{ from: "client-us", to: "flareless", result: "PROVIDER_SUCCESS" }];
    let last = "flareless";
    for (const attempt of attempts) {
      if (!fallbackNodes[attempt.provider]) continue;
      segments.push({ from: last, to: attempt.provider, result: attempt.result || "UNKNOWN" });
      last = attempt.provider;
    }
    if (activeProvider && fallbackNodes[activeProvider]) {
      segments.push({ from: activeProvider, to: "client-us", result: "PROVIDER_SUCCESS" });
    }
    for (const segment of segments) {
      const from = fallbackNodes[segment.from];
      const to = fallbackNodes[segment.to];
      if (!from || !to) continue;
      features.push({
        type: "Feature",
        geometry: { type: "LineString", coordinates: routeArc(from, to) },
        properties: { kind: "route", good: isGood(segment.result), result: segment.result },
      });
    }
    const visibleNodes = new Set(["client-us", "flareless", "origin"]);
    for (const provider of providerPayload?.providers || []) visibleNodes.add(provider.name);
    for (const attempt of attempts) if (attempt.provider) visibleNodes.add(attempt.provider);
    if (routeTrace.selectedFallback === "peer-fallback") visibleNodes.add("peer-assisted-edge");
    for (const id of visibleNodes) {
      const node = fallbackNodes[id];
      if (!node) continue;
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [node.lon, node.lat] },
        properties: { kind: "node", id, label: node.label, result: resultByProvider[id] || node.kind, color: nodeColor(id, resultByProvider[id], activeProvider) },
      });
    }
    return { type: "FeatureCollection", features };
  }

  async function refreshFallbackMap(map) {
    try {
      const [status, tracePayload, providerPayload] = await Promise.all([
        fetch(`${BASE_URL}/status`, { cache: "no-store" }).then((response) => response.json()),
        fetch(`${BASE_URL}/route/trace`, { cache: "no-store" }).then((response) => response.json()),
        fetch(`${BASE_URL}/providers`, { cache: "no-store" }).then((response) => response.json()),
      ]);
      const source = map.getSource(FALLBACK_SOURCE);
      if (source) source.setData(buildFallbackGeoJson(status, tracePayload, providerPayload));
    } catch (error) {
      console.warn("Flareless fallback map refresh failed", error);
    }
  }

  function hasMapCanvas() {
    const mapDiv = document.getElementById("map");
    return Boolean(mapDiv && mapDiv.querySelector(".maplibregl-canvas"));
  }

  function ensureDashboardMap() {
    const mapDiv = document.getElementById("map");
    if (!mapDiv || !window.maplibregl || hasMapCanvas()) {
      if (window.__flarelessMapSafetyMap?.resize) window.__flarelessMapSafetyMap.resize();
      return;
    }

    mapDiv.innerHTML = "";
    const map = new maplibregl.Map({
      container: "map",
      style: CARTO_STYLE,
      center: [18, 18],
      zoom: 1.35,
      attributionControl: false,
      interactive: true,
    });
    window.__flarelessMapSafetyMap = map;
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    map.on("load", () => {
      map.addSource(FALLBACK_SOURCE, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({ id: "fallback-route-shadow", type: "line", source: FALLBACK_SOURCE, filter: ["==", ["get", "kind"], "route"], paint: { "line-color": "#053a2f", "line-width": 8, "line-opacity": 0.72 } });
      map.addLayer({ id: "fallback-routes", type: "line", source: FALLBACK_SOURCE, filter: ["==", ["get", "kind"], "route"], paint: { "line-color": ["case", ["==", ["get", "good"], true], "#46f0a0", "#f04455"], "line-width": 3, "line-opacity": 0.9 } });
      map.addLayer({ id: "fallback-node-glow", type: "circle", source: FALLBACK_SOURCE, filter: ["==", ["get", "kind"], "node"], paint: { "circle-radius": ["case", ["==", ["get", "id"], "flareless"], 22, 15], "circle-color": ["get", "color"], "circle-opacity": 0.16, "circle-blur": 0.65 } });
      map.addLayer({ id: "fallback-nodes", type: "circle", source: FALLBACK_SOURCE, filter: ["==", ["get", "kind"], "node"], paint: { "circle-radius": ["case", ["==", ["get", "id"], "flareless"], 10, 7], "circle-color": ["get", "color"], "circle-stroke-color": "#e8f5ff", "circle-stroke-width": 1.2 } });
      map.addLayer({ id: "fallback-labels", type: "symbol", source: FALLBACK_SOURCE, filter: ["==", ["get", "kind"], "node"], layout: { "text-field": ["get", "label"], "text-size": 11, "text-offset": [1.1, -0.7], "text-anchor": "left" }, paint: { "text-color": "#eaf6ff", "text-halo-color": "#07101f", "text-halo-width": 1.2 } });
      refreshFallbackMap(map);
    });
  }

  window.addEventListener("load", () => {
    setTimeout(ensureDashboardMap, 350);
    setTimeout(() => window.__flarelessMapSafetyMap?.resize?.(), 900);
  });
  window.addEventListener("resize", () => {
    setTimeout(ensureDashboardMap, 80);
    setTimeout(() => window.__flarelessMapSafetyMap?.resize?.(), 160);
  });
  document.addEventListener("click", (event) => {
    if (event.target?.matches?.('[data-view="dashboard"]')) {
      setTimeout(ensureDashboardMap, 80);
      setTimeout(() => window.__flarelessMapSafetyMap?.resize?.(), 180);
    }
  });
})();
