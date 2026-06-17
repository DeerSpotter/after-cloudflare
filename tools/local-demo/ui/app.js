const state = {
  baseUrl: window.FLARELESS_BASE_URL || "http://127.0.0.1:8765",
  timer: null,
  map: null,
  mapReady: false,
};

const nodes = {
  "client-us": { label: "User traffic", lat: 39.5, lon: -98.3, kind: "client" },
  flareless: { label: "Flareless", lat: 32.0, lon: -35.0, kind: "director" },
  "cdn-a": { label: "Cloudflare", lat: 50.1, lon: -5.1, kind: "provider" },
  "cdn-b": { label: "Fastly", lat: 1.3, lon: 103.8, kind: "provider" },
  "cdn-c": { label: "CloudFront", lat: 35.7, lon: 139.7, kind: "provider" },
  "peer-assisted-edge": { label: "Micro CDN", lat: -23.5, lon: 133.8, kind: "peer" },
  origin: { label: "Origin", lat: 52.5, lon: 13.4, kind: "origin" },
};

function $(id) {
  return document.getElementById(id);
}

async function api(path, body) {
  const options = body
    ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
    : { cache: "no-store" };
  const response = await fetch(state.baseUrl + path, options);
  if (!response.ok) throw new Error(`${path} ${response.status}`);
  return response.json();
}

function routeArc(from, to) {
  const output = [];
  const dx = to.lon - from.lon;
  const lift = Math.min(32, Math.max(8, Math.abs(dx) * 0.12));
  for (let step = 0; step <= 48; step += 1) {
    const t = step / 48;
    output.push([
      from.lon + dx * t,
      from.lat + (to.lat - from.lat) * t + Math.sin(Math.PI * t) * lift,
    ]);
  }
  return output;
}

function isGood(result) {
  return (result || "").includes("SUCCESS") || (result || "").includes("ADVERTISES_CONTENT");
}

function nodeColor(id, result, activeProvider) {
  if (id === activeProvider) return "#46f0a0";
  if ((result || "").match(/TIMEOUT|BLOCKED|ERROR|OFFLINE|DISABLED|NO_HEALTHY/)) return "#f04455";
  if (nodes[id]?.kind === "director") return "#f6b44c";
  if (nodes[id]?.kind === "peer") return "#62c8ff";
  return "#dbe7ff";
}

function routeSegments(trace) {
  const attempts = trace.attempts || [];
  const activeProvider = (trace.finalStatus || {}).provider || "";
  const segments = [{ from: "client-us", to: "flareless", result: "PROVIDER_SUCCESS" }];
  let last = "flareless";
  for (const attempt of attempts) {
    if (!nodes[attempt.provider]) continue;
    segments.push({ from: last, to: attempt.provider, result: attempt.result || "UNKNOWN" });
    last = attempt.provider;
  }
  if (activeProvider && nodes[activeProvider]) {
    segments.push({ from: activeProvider, to: "client-us", result: "PROVIDER_SUCCESS" });
  }
  return segments;
}

function buildMapGeoJson(trace, providers) {
  const attempts = trace.attempts || [];
  const activeProvider = (trace.finalStatus || {}).provider || "";
  const resultByProvider = Object.fromEntries(attempts.map((attempt) => [attempt.provider, attempt.result]));
  const features = [];

  for (const segment of routeSegments(trace)) {
    const from = nodes[segment.from];
    const to = nodes[segment.to];
    features.push({
      type: "Feature",
      geometry: { type: "LineString", coordinates: routeArc(from, to) },
      properties: {
        kind: "route",
        good: isGood(segment.result),
        label: `${from.label} to ${to.label}: ${segment.result}`,
      },
    });
  }

  const visibleNodes = new Set(["client-us", "flareless", "origin"]);
  providers.forEach((provider) => visibleNodes.add(provider.name));
  attempts.forEach((attempt) => visibleNodes.add(attempt.provider));
  if (trace.selectedFallback === "peer-fallback") visibleNodes.add("peer-assisted-edge");

  visibleNodes.forEach((id) => {
    const node = nodes[id];
    if (!node) return;
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [node.lon, node.lat] },
      properties: {
        kind: "node",
        id,
        label: node.label,
        result: resultByProvider[id] || node.kind,
        color: nodeColor(id, resultByProvider[id], activeProvider),
      },
    });
  });

  return { type: "FeatureCollection", features };
}

function initMap() {
  state.map = new maplibregl.Map({
    container: "map",
    style: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
    center: [18, 18],
    zoom: 1.35,
    attributionControl: false,
    interactive: true,
  });
  state.map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
  state.map.on("load", addMapLayers);
}

function addMapLayers() {
  state.mapReady = true;
  state.map.addSource("flareless-live", {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });
  state.map.addLayer({
    id: "route-shadow",
    type: "line",
    source: "flareless-live",
    filter: ["==", ["get", "kind"], "route"],
    paint: { "line-color": "#053a2f", "line-width": 8, "line-opacity": 0.75 },
  });
  state.map.addLayer({
    id: "routes",
    type: "line",
    source: "flareless-live",
    filter: ["==", ["get", "kind"], "route"],
    paint: {
      "line-color": ["case", ["==", ["get", "good"], true], "#46f0a0", "#f04455"],
      "line-width": 3,
      "line-opacity": 0.98,
    },
  });
  state.map.addLayer({
    id: "nodes",
    type: "circle",
    source: "flareless-live",
    filter: ["==", ["get", "kind"], "node"],
    paint: {
      "circle-radius": ["case", ["==", ["get", "id"], "flareless"], 10, 7],
      "circle-color": ["get", "color"],
      "circle-stroke-color": "#e8f5ff",
      "circle-stroke-width": 1.2,
    },
  });
  state.map.addLayer({
    id: "labels",
    type: "symbol",
    source: "flareless-live",
    filter: ["==", ["get", "kind"], "node"],
    layout: { "text-field": ["get", "label"], "text-size": 11, "text-offset": [1.1, -0.7], "text-anchor": "left" },
    paint: { "text-color": "#eaf6ff", "text-halo-color": "#07101f", "text-halo-width": 1.2 },
  });
  state.map.on("click", "nodes", (event) => {
    const feature = event.features?.[0];
    if (!feature) return;
    new maplibregl.Popup()
      .setLngLat(feature.geometry.coordinates)
      .setHTML(`<b>${feature.properties.label}</b><br>${feature.properties.result}`)
      .addTo(state.map);
  });
}

async function refresh() {
  const [status, tracePayload, providerPayload, recommendations, audit] = await Promise.all([
    api("/status"),
    api("/route/trace"),
    api("/providers"),
    api("/agent/recommendations"),
    api("/agent/audit-log"),
  ]);
  const trace = tracePayload.routeTrace || {};
  const providers = providerPayload.providers || [];

  if (state.mapReady) {
    state.map.getSource("flareless-live")?.setData(buildMapGeoJson(trace, providers));
  }

  updateHeader(status);
  $("routeReason").textContent = status.routeReason || "None";
  $("trafficText").textContent = formatTraffic(status, trace, providers);
  $("traceText").textContent = JSON.stringify(trace, null, 2);
  $("auditText").textContent = JSON.stringify(audit.auditLog || [], null, 2);
  $("approvalText").textContent = formatRecommendations(recommendations.recommendations || []);
  $("diffText").textContent = formatDiff(status, trace);
}

function updateHeader(status) {
  const globalStatus = $("globalStatus");
  const reason = status.routeReason || "";
  globalStatus.classList.remove("degraded", "failed");
  if (reason.includes("SUCCESS")) {
    globalStatus.textContent = "STATUS: OPTIMAL";
  } else if (reason.includes("FAILED") || reason.includes("BLOCKED")) {
    globalStatus.textContent = "STATUS: FAILED";
    globalStatus.classList.add("failed");
  } else {
    globalStatus.textContent = "STATUS: DEGRADED";
    globalStatus.classList.add("degraded");
  }

  const liveState = $("liveState");
  liveState.textContent = state.timer ? "live" : "paused";
  liveState.className = state.timer ? "live-state" : "live-state paused";
}

function formatTraffic(status, trace, providers) {
  return `Scenario: ${status.scenarioId}\nActive: ${status.activeProvider || "none"}\n\n${providers
    .map((provider) => `${provider.name.padEnd(7)} ${String(provider.status).padEnd(9)} ${provider.lastResult}`)
    .join("\n")}\n\n${(trace.attempts || []).map((attempt) => `${attempt.provider}: ${attempt.result}`).join("\n")}`;
}

function formatRecommendations(items) {
  if (!items.length) return "No recommendations loaded.";
  return items
    .map((item) => `${item.recommendationId} · ${item.status} · ${item.severity}\n${item.summary}\n${JSON.stringify(item.proposedAction, null, 2)}`)
    .join("\n\n---\n\n");
}

function formatDiff(status, trace) {
  const attempts = trace.attempts || [];
  const failed = attempts.filter((item) => item.result !== "PROVIDER_SUCCESS").map((item) => item.provider);
  return `before:\n  activeProvider: primary\n  cooldown: []\n\nafter:\n  routeReason: ${status.routeReason || "unknown"}\n  activeProvider: ${status.activeProvider || "none"}\n  cooldown: ${JSON.stringify(failed)}\n  livePolicyMutation: false`;
}

async function runScenario() {
  await api("/route/simulate", { scenarioId: $("scenarioSelect").value });
  await refresh();
}

async function applyOutage() {
  $("scenarioSelect").value = "http-status-failover";
  await runScenario();
}

function startPolling() {
  if (state.timer) return;
  state.timer = setInterval(refresh, 1000);
  $("pollBtn").disabled = true;
  $("pauseBtn").disabled = false;
  refresh();
}

function pausePolling() {
  if (state.timer) clearInterval(state.timer);
  state.timer = null;
  $("pollBtn").disabled = false;
  $("pauseBtn").disabled = true;
  updateHeader({ routeReason: $("routeReason").textContent });
}

function showView(viewId) {
  document.querySelectorAll(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.view === viewId));
  document.querySelectorAll(".view").forEach((view) => view.classList.toggle("active", view.id === viewId));
  if (viewId === "dashboard") setTimeout(() => state.map?.resize(), 50);
}

function bindEvents() {
  $("runScenarioBtn").addEventListener("click", runScenario);
  $("refreshBtn").addEventListener("click", refresh);
  $("pollBtn").addEventListener("click", startPolling);
  $("pauseBtn").addEventListener("click", pausePolling);
  $("applyOutageBtn").addEventListener("click", applyOutage);
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.addEventListener("click", () => showView(button.dataset.view));
  });
}

bindEvents();
initMap();
