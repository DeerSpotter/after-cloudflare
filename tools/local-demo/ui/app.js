const state = {
  baseUrl: window.FLARELESS_BASE_URL || "http://127.0.0.1:8765",
  timer: null,
  map: null,
  mapReady: false,
  currentPage: "dashboard",
  scenarioId: "healthy-route",
  activeProvider: null,
  routeTrace: {},
  providers: [],
  recommendations: [],
  auditLog: [],
  headers: {},
  micro: {},
  policyFormat: "yaml",
  conditions: ["HTTP status is 5xx", "Provider is primary CDN"],
  providerMarkers: {},
  animationTick: 0,
  history: [],
  events: [],
  metrics: { requests: [62, 66, 74, 70, 82, 91, 88, 97], latency: [18, 22, 16, 28, 31, 20, 15, 19], errors: [1, 1, 2, 3, 8, 4, 2, 1] },
  replayIndex: 0,
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

function $(id) { return document.getElementById(id); }
function nowTime() { return new Date().toLocaleTimeString(); }

function recordEvent(type, payload = {}) {
  state.events.unshift({ time: nowTime(), type, payload });
  state.events = state.events.slice(0, 80);
}

async function api(path, body) {
  const options = body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" };
  const response = await fetch(state.baseUrl + path, options);
  if (!response.ok) throw new Error(`${path} ${response.status}`);
  return response.json();
}

function toast(message) {
  const box = $("toast");
  if (!box) return;
  box.textContent = message;
  box.classList.add("show");
  setTimeout(() => box.classList.remove("show"), 2200);
}

function routeArc(from, to) {
  const output = [];
  const dx = to.lon - from.lon;
  const lift = Math.min(32, Math.max(8, Math.abs(dx) * 0.12));
  for (let step = 0; step <= 48; step += 1) {
    const t = step / 48;
    output.push([from.lon + dx * t, from.lat + (to.lat - from.lat) * t + Math.sin(Math.PI * t) * lift]);
  }
  return output;
}

function isGood(result) { return (result || "").includes("SUCCESS") || (result || "").includes("ADVERTISES_CONTENT"); }
function isFailed(result) { return (result || "").match(/TIMEOUT|BLOCKED|ERROR|OFFLINE|DISABLED|NO_HEALTHY|HTTP_/); }

function nodeColor(id, result, activeProvider) {
  if (id === activeProvider) return "#46f0a0";
  if (isFailed(result)) return "#f04455";
  if (nodes[id]?.kind === "director") return "#f6b44c";
  if (nodes[id]?.kind === "peer") return "#62c8ff";
  return "#dbe7ff";
}

function replayTrace(trace = state.routeTrace, index = null) {
  if (index === null) return trace;
  const attempts = trace.attempts || [];
  const partialAttempts = attempts.slice(0, Math.max(0, index));
  const finalAttempt = partialAttempts[partialAttempts.length - 1];
  return { ...trace, attempts: partialAttempts, finalStatus: finalAttempt ? { provider: finalAttempt.provider, reason: finalAttempt.result, outcome: isGood(finalAttempt.result) ? "success" : "in-progress" } : { provider: "flareless", reason: "WAITING", outcome: "in-progress" } };
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
  if (activeProvider && nodes[activeProvider]) segments.push({ from: activeProvider, to: "client-us", result: "PROVIDER_SUCCESS" });
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
    features.push({ type: "Feature", geometry: { type: "LineString", coordinates: routeArc(from, to) }, properties: { kind: "route", good: isGood(segment.result), label: `${from.label} to ${to.label}: ${segment.result}` } });
  }
  const visibleNodes = new Set(["client-us", "flareless", "origin"]);
  providers.forEach((provider) => visibleNodes.add(provider.name));
  attempts.forEach((attempt) => visibleNodes.add(attempt.provider));
  if (trace.selectedFallback === "peer-fallback") visibleNodes.add("peer-assisted-edge");
  visibleNodes.forEach((id) => {
    const node = nodes[id];
    if (!node) return;
    features.push({ type: "Feature", geometry: { type: "Point", coordinates: [node.lon, node.lat] }, properties: { kind: "node", id, label: node.label, result: resultByProvider[id] || node.kind, color: nodeColor(id, resultByProvider[id], activeProvider) } });
  });
  return { type: "FeatureCollection", features };
}

function initMap() {
  state.map = new maplibregl.Map({ container: "map", style: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json", center: [18, 18], zoom: 1.35, attributionControl: false, interactive: true });
  state.map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
  state.map.on("load", addMapLayers);
}

function addMapLayers() {
  state.mapReady = true;
  state.map.addSource("flareless-live", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  state.map.addLayer({ id: "route-shadow", type: "line", source: "flareless-live", filter: ["==", ["get", "kind"], "route"], paint: { "line-color": "#053a2f", "line-width": 8, "line-opacity": 0.72 } });
  state.map.addLayer({ id: "routes", type: "line", source: "flareless-live", filter: ["==", ["get", "kind"], "route"], paint: { "line-color": ["case", ["==", ["get", "good"], true], "#46f0a0", "#f04455"], "line-width": 3, "line-opacity": 0.9 } });
  state.map.addLayer({ id: "routes-flow", type: "line", source: "flareless-live", filter: ["==", ["get", "kind"], "route"], paint: { "line-color": ["case", ["==", ["get", "good"], true], "#b5ffd8", "#ff8793"], "line-width": 2, "line-opacity": 0.9, "line-dasharray": [0.1, 2.2] } });
  state.map.addLayer({ id: "node-glow", type: "circle", source: "flareless-live", filter: ["==", ["get", "kind"], "node"], paint: { "circle-radius": ["case", ["==", ["get", "id"], "flareless"], 22, 15], "circle-color": ["get", "color"], "circle-opacity": 0.16, "circle-blur": 0.65 } });
  state.map.addLayer({ id: "nodes", type: "circle", source: "flareless-live", filter: ["==", ["get", "kind"], "node"], paint: { "circle-radius": ["case", ["==", ["get", "id"], "flareless"], 10, 7], "circle-color": ["get", "color"], "circle-stroke-color": "#e8f5ff", "circle-stroke-width": 1.2 } });
  state.map.addLayer({ id: "labels", type: "symbol", source: "flareless-live", filter: ["==", ["get", "kind"], "node"], layout: { "text-field": ["get", "label"], "text-size": 11, "text-offset": [1.1, -0.7], "text-anchor": "left" }, paint: { "text-color": "#eaf6ff", "text-halo-color": "#07101f", "text-halo-width": 1.2 } });
  state.map.on("click", "nodes", (event) => {
    const feature = event.features?.[0];
    if (!feature) return;
    new maplibregl.Popup().setLngLat(feature.geometry.coordinates).setHTML(`<b>${feature.properties.label}</b><br>${feature.properties.result}`).addTo(state.map);
  });
  animateRouteArcs();
}

function animateRouteArcs() {
  setInterval(() => {
    if (!state.mapReady || !state.map.getLayer("routes-flow")) return;
    state.animationTick = (state.animationTick + 1) % 18;
    state.map.setPaintProperty("routes-flow", "line-dasharray", [0.1 + state.animationTick * 0.08, 2.2, 0.1, 1.6]);
  }, 140);
}

function providerDisplayName(provider) { return nodes[provider.name]?.label || provider.name; }
function providerStatusClass(provider) { if ((provider.lastResult || "").match(/TIMEOUT|BLOCKED|HTTP_|ERROR|OFFLINE/)) return "failed"; if (provider.status && provider.status !== "healthy") return "degraded"; return "healthy"; }
function providerBadge(provider) { const cls = providerStatusClass(provider); if (cls === "failed") return '<span class="badge fail">failed</span>'; if (cls === "degraded") return '<span class="badge warn">degraded</span>'; return '<span class="badge">healthy</span>'; }

function updateProviderMarkers(providers) {
  if (!state.mapReady) return;
  for (const provider of providers) {
    const node = nodes[provider.name];
    if (!node) continue;
    const statusClass = providerStatusClass(provider);
    const content = `<b>${providerDisplayName(provider)}</b><div class="marker-row"><span class="marker-dot"></span>${provider.latencyMs || "--"} ms · ${provider.lastResult || "standby"}</div>`;
    if (!state.providerMarkers[provider.name]) {
      const element = document.createElement("div");
      element.className = `provider-marker ${statusClass}`;
      element.innerHTML = content;
      state.providerMarkers[provider.name] = new maplibregl.Marker({ element, anchor: "left", offset: [12, -12] }).setLngLat([node.lon, node.lat]).addTo(state.map);
    } else {
      const markerElement = state.providerMarkers[provider.name].getElement();
      markerElement.className = `provider-marker ${statusClass}`;
      markerElement.innerHTML = content;
      state.providerMarkers[provider.name].setLngLat([node.lon, node.lat]);
    }
    state.providerMarkers[provider.name].getElement().style.borderColor = provider.name === state.activeProvider ? "rgba(70,240,160,.85)" : "rgba(255,255,255,.14)";
  }
}

async function refresh() {
  const [status, tracePayload, providerPayload, recommendations, audit, micro] = await Promise.all([api("/status"), api("/route/trace"), api("/providers"), api("/agent/recommendations"), api("/agent/audit-log"), api("/micro-cdn/status")]);
  state.scenarioId = status.scenarioId;
  state.activeProvider = status.activeProvider;
  state.routeTrace = tracePayload.routeTrace || {};
  state.providers = providerPayload.providers || [];
  state.recommendations = recommendations.recommendations || [];
  state.auditLog = audit.auditLog || [];
  state.headers = tracePayload.headers || {};
  state.micro = micro || {};
  if (state.mapReady) { state.map.getSource("flareless-live")?.setData(buildMapGeoJson(state.routeTrace, state.providers)); updateProviderMarkers(state.providers); }
  renderAll(status);
  recordEvent("ROUTE_TRACE_UPDATED", { scenarioId: status.scenarioId, activeProvider: status.activeProvider });
}

function renderAll(status) {
  updateHeader(status);
  $("routeReason").textContent = status.routeReason || "None";
  $("activeProviderPill").textContent = `active: ${status.activeProvider || "none"}`;
  $("trafficText").textContent = formatTraffic(status, state.routeTrace, state.providers);
  $("traceText").textContent = JSON.stringify(state.routeTrace, null, 2);
  $("traceEvidenceText").textContent = JSON.stringify(state.routeTrace, null, 2);
  $("headersText").textContent = formatHeaders(state.headers);
  $("auditText").textContent = JSON.stringify(state.auditLog, null, 2);
  $("diffText").textContent = formatDiff(status, state.routeTrace);
  renderProviders(); renderApprovals(); renderPeers(); renderPolicyCode(); renderReplay(); renderIncidents(); renderMetrics(); renderEvents(); renderTopology(); renderHistory(); renderExplanation(status);
}

function updateHeader(status) {
  const globalStatus = $("globalStatus");
  const reason = status.routeReason || "";
  globalStatus.classList.remove("degraded", "failed");
  if (!reason || reason === "UNKNOWN") globalStatus.textContent = "STATUS: PAUSED";
  else if (reason.includes("SUCCESS") || reason.includes("ADVERTISES_CONTENT")) globalStatus.textContent = "STATUS: OPTIMAL";
  else if (reason.includes("FAILED") || reason.includes("BLOCKED") || reason.includes("NO_HEALTHY")) { globalStatus.textContent = "STATUS: FAILED"; globalStatus.classList.add("failed"); }
  else { globalStatus.textContent = "STATUS: DEGRADED"; globalStatus.classList.add("degraded"); }
  const liveState = $("liveState");
  liveState.textContent = state.timer ? "live" : "paused";
  liveState.className = state.timer ? "live-state" : "live-state paused";
}

function renderProviders() { $("providersTable").innerHTML = state.providers.map((p) => `<tr><td>${providerDisplayName(p)}</td><td>${providerBadge(p)}</td><td>${p.latencyMs || "--"} ms</td><td>${p.lastResult || "--"}</td><td>${p.name === state.activeProvider ? "active" : "standby"}</td></tr>`).join(""); }
function renderApprovals() {
  const container = $("approvalCards");
  if (!state.recommendations.length) container.textContent = "No recommendations loaded.";
  else container.innerHTML = state.recommendations.map((item) => `<div class="approval-card"><b>${item.summary}</b><div class="approval-meta">${item.recommendationId} · ${item.status} · ${item.severity} · ${item.createdAt || ""}</div><div>${(item.reasonCodes || []).join(", ") || "No reason codes"}</div></div>`).join("");
  $("recommendationTimeline").innerHTML = buildRecommendationTimeline();
}
function buildRecommendationTimeline() {
  if (!state.recommendations.length) return '<div class="timeline-item">No recommendation timeline yet.</div>';
  return state.recommendations.map((item) => `<div class="timeline-item ${item.severity === "error" ? "fail" : "warn"}"><b>${item.createdAt || nowTime()} · Recommendation</b>${item.summary}</div><div class="timeline-item"><b>Operator</b>${item.status === "pending" ? "Waiting for approval" : item.status}</div><div class="timeline-item"><b>Result</b>${state.activeProvider || "none"}</div>`).join("");
}
function renderPeers() {
  const rows = [["hashed3365627006...", "Online", "250MB", "Hash 100%", "ok"], ["hashed5964045005...", "Online", "250MB", "Hash 100%", "ok"], ["hashed3320052003...", "Online", "500MB", "Hash 100%", "ok"]];
  const microText = JSON.stringify(state.micro);
  if (microText.includes("NODE_DISABLED")) rows.push(["candidate-disabled", "Rejected", "0MB", "NODE_DISABLED", "fail"]);
  if (microText.includes("NODE_OFFLINE")) rows.push(["candidate-offline", "Rejected", "0MB", "NODE_OFFLINE", "fail"]);
  $("peerList").innerHTML = rows.map((row) => `<div class="peer-row"><span class="hash">${row[0]}</span><span class="${row[4]}">${row[1]}</span><span>${row[2]}</span><span class="${row[4]}">${row[3]}</span></div>`).join("");
  $("trustBoundaryText").textContent = JSON.stringify(state.micro, null, 2);
}
function renderPolicyCode() {
  const policy = { policy: "video-public-peer-assisted-failover", when: state.conditions, then: ["route_to_next_healthy_cdn", "route_to_hash_verified_micro_cdn"], safeguards: { operatorApproval: true, hashVerification: true, livePolicyMutation: false, saveEnabled: false } };
  $("policyCode").textContent = state.policyFormat === "json" ? JSON.stringify(policy, null, 2) : `policy: ${policy.policy}\nwhen:\n${state.conditions.map((item) => `  - ${item}`).join("\n")}\nthen:\n  - route_to_next_healthy_cdn\n  - route_to_hash_verified_micro_cdn\nsafeguards:\n  operatorApproval: true\n  hashVerification: true\n  livePolicyMutation: false\n  saveEnabled: false`;
}
function renderConditions() { $("conditionList").innerHTML = state.conditions.map((item, index) => `<div class="rule-line"><button>Condition ${index + 1}</button><span>${item}</span></div>`).join(""); renderPolicyCode(); }
function renderReplay() {
  const attempts = state.routeTrace.attempts || [];
  const slider = $("replaySlider");
  slider.max = String(attempts.length);
  slider.value = String(Math.min(state.replayIndex, attempts.length));
  const partial = replayTrace(state.routeTrace, Number(slider.value));
  const step = attempts[Number(slider.value) - 1];
  $("replayStep").textContent = step ? `Step ${slider.value}: ${step.provider} -> ${step.result}` : "Step 0: traffic enters Flareless";
  $("replayJson").textContent = JSON.stringify(partial, null, 2);
}
function renderIncidents() {
  const attempts = state.routeTrace.attempts || [];
  const items = attempts.map((a) => `<div class="timeline-item ${isFailed(a.result) ? "fail" : ""}"><b>${nowTime()} · ${a.provider}</b>${a.result}</div>`);
  if (state.recommendations.length) items.push(`<div class="timeline-item warn"><b>${nowTime()} · Agent</b>Recommendation generated</div>`);
  items.push(`<div class="timeline-item"><b>${nowTime()} · Result</b>${state.activeProvider || "none"}</div>`);
  $("incidentTimeline").innerHTML = items.join("");
}
function renderMetrics() { renderSpark("requestSpark", state.metrics.requests); renderSpark("latencySpark", state.metrics.latency); renderSpark("errorSpark", state.metrics.errors); renderDistribution(); }
function renderSpark(id, values) { const max = Math.max(...values, 1); $(id).innerHTML = values.map((value) => `<span style="height:${Math.max(8, (value / max) * 100)}%"></span>`).join(""); }
function renderDistribution() { const providers = state.providers.length ? state.providers : [{ name: "cdn-a" }, { name: "cdn-b" }, { name: "cdn-c" }]; $("providerDistribution").innerHTML = providers.map((p, i) => { const pct = p.name === state.activeProvider ? 58 : [25, 17, 12][i] || 10; return `<div class="dist-row"><span>${providerDisplayName(p)}</span><div class="dist-bar"><span style="width:${pct}%"></span></div><b>${pct}%</b></div>`; }).join(""); }
function renderEvents() { $("eventsTable").innerHTML = state.events.map((event) => `<tr><td>${event.time}</td><td>${event.type}</td><td><code>${JSON.stringify(event.payload)}</code></td></tr>`).join(""); }
function renderTopology() {
  const failed = new Set((state.routeTrace.attempts || []).filter((a) => isFailed(a.result)).map((a) => a.provider));
  const active = state.activeProvider;
  const nodeClass = (id) => id === "peer-assisted-edge" ? "topology-node peer" : failed.has(id) ? "topology-node failed" : "topology-node";
  $("topologySvg").innerHTML = `<line class="topology-link" x1="110" y1="210" x2="300" y2="210"/><line class="topology-link" x1="300" y1="210" x2="520" y2="100"/><line class="topology-link" x1="300" y1="210" x2="520" y2="210"/><line class="topology-link" x1="300" y1="210" x2="520" y2="320"/><line class="topology-link" x1="520" y1="210" x2="760" y2="210"/><circle class="topology-node" cx="110" cy="210" r="38"/><text class="topology-label" x="82" y="215">Client</text><circle class="topology-node" cx="300" cy="210" r="46"/><text class="topology-label" x="270" y="215">Flareless</text><circle class="${nodeClass("cdn-a")}" cx="520" cy="100" r="38"/><text class="topology-label" x="488" y="105">Cloudflare</text><circle class="${nodeClass("cdn-b")}" cx="520" cy="210" r="38"/><text class="topology-label" x="500" y="215">Fastly</text><circle class="${nodeClass("cdn-c")}" cx="520" cy="320" r="38"/><text class="topology-label" x="488" y="325">CloudFront</text><circle class="${active === "peer-assisted-edge" ? "topology-node peer" : "topology-node"}" cx="760" cy="120" r="38"/><text class="topology-label" x="730" y="125">Micro CDN</text><circle class="topology-node" cx="760" cy="210" r="38"/><text class="topology-label" x="738" y="215">Origin</text>`;
}
function renderHistory() { $("historyTable").innerHTML = state.history.map((item) => `<tr><td>${item.time}</td><td>${item.scenario}</td><td>${item.result}</td><td>${item.provider || "none"}</td></tr>`).join(""); }
function renderExplanation(status) { const attempts = state.routeTrace.attempts || []; const failed = attempts.filter((a) => isFailed(a.result)); $("explanationText").textContent = `Why did routing change?\n\n${failed.length ? failed.map((a) => `${a.provider} returned ${a.result}.`).join("\n") : "The primary provider path is healthy."}\n\nSelected provider: ${status.activeProvider || "none"}.\nNo live policy mutations occurred.`; }

function formatHeaders(headers) { return Object.entries(headers || {}).map(([key, value]) => `${key}: ${value}`).join("\n") || "No headers loaded."; }
function formatTraffic(status, trace, providers) { return `Scenario: ${status.scenarioId}\nActive: ${status.activeProvider || "none"}\n\n${providers.map((provider) => `${provider.name.padEnd(7)} ${String(provider.status).padEnd(9)} ${provider.lastResult}`).join("\n")}\n\n${(trace.attempts || []).map((attempt) => `${attempt.provider}: ${attempt.result}`).join("\n")}`; }
function formatDiff(status, trace) { const failed = (trace.attempts || []).filter((item) => item.result !== "PROVIDER_SUCCESS").map((item) => item.provider); return `before:\n  activeProvider: primary\n  cooldown: []\n\nafter:\n  routeReason: ${status.routeReason || "unknown"}\n  activeProvider: ${status.activeProvider || "none"}\n  cooldown: ${JSON.stringify(failed)}\n  livePolicyMutation: false`; }

function latestPendingRecommendation() { return [...state.recommendations].reverse().find((item) => item.status === "pending"); }
async function decideLatest(action) { const item = latestPendingRecommendation(); if (!item) return toast("No pending recommendation."); await api(`/agent/recommendations/${item.recommendationId}/${action}`, { operator: "local-operator", note: `${action} from UI phase two` }); recordEvent(action === "approve" ? "RECOMMENDATION_APPROVED" : "RECOMMENDATION_REJECTED", { recommendationId: item.recommendationId }); await refresh(); toast(`Recommendation ${action}d.`); }
async function runScenario() { await api("/route/simulate", { scenarioId: $("scenarioSelect").value }); await refresh(); state.history.unshift({ time: nowTime(), scenario: state.scenarioId, result: state.routeTrace.finalStatus?.reason || "unknown", provider: state.activeProvider }); state.history = state.history.slice(0, 40); recordEvent("SCENARIO_RUN", { scenarioId: state.scenarioId }); renderHistory(); toast("Scenario applied."); }
async function applyOutage() { $("scenarioSelect").value = "http-status-failover"; await runScenario(); }
function startPolling() { if (state.timer) return; state.timer = setInterval(refresh, 1000); $("pollBtn").disabled = true; $("pauseBtn").disabled = false; recordEvent("POLLING_STARTED", {}); refresh(); }
function pausePolling() { if (state.timer) clearInterval(state.timer); state.timer = null; $("pollBtn").disabled = false; $("pauseBtn").disabled = true; recordEvent("POLLING_PAUSED", {}); updateHeader({ routeReason: $("routeReason").textContent }); renderEvents(); }
function showView(viewId) { state.currentPage = viewId; document.querySelectorAll(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.view === viewId)); document.querySelectorAll(".view").forEach((view) => view.classList.toggle("active", view.id === viewId)); recordEvent("PAGE_CHANGED", { viewId }); renderEvents(); if (viewId === "dashboard") setTimeout(() => state.map?.resize(), 50); }
function updateReplayFromSlider() { state.replayIndex = Number($("replaySlider").value); const partial = replayTrace(state.routeTrace, state.replayIndex); if (state.mapReady) state.map.getSource("flareless-live")?.setData(buildMapGeoJson(partial, state.providers)); renderReplay(); recordEvent("REPLAY_STEP_CHANGED", { replayIndex: state.replayIndex }); }

function bindEvents() {
  $("runScenarioBtn").addEventListener("click", runScenario); $("refreshBtn").addEventListener("click", refresh); $("pollBtn").addEventListener("click", startPolling); $("pauseBtn").addEventListener("click", pausePolling); $("applyOutageBtn").addEventListener("click", applyOutage);
  $("addConditionBtn").addEventListener("click", () => { state.conditions.push("New condition == true"); renderConditions(); toast("Condition added."); });
  $("removeConditionBtn").addEventListener("click", () => { if (state.conditions.length > 1) state.conditions.pop(); renderConditions(); toast("Condition removed."); });
  $("yamlBtn").addEventListener("click", () => { state.policyFormat = "yaml"; $("yamlBtn").classList.add("active"); $("jsonBtn").classList.remove("active"); renderPolicyCode(); });
  $("jsonBtn").addEventListener("click", () => { state.policyFormat = "json"; $("jsonBtn").classList.add("active"); $("yamlBtn").classList.remove("active"); renderPolicyCode(); });
  $("testPolicyBtn").addEventListener("click", () => toast("Policy test passed in local simulation. Save remains disabled."));
  $("approveBtn").addEventListener("click", () => decideLatest("approve")); $("rejectBtn").addEventListener("click", () => decideLatest("reject"));
  $("replaySlider").addEventListener("input", updateReplayFromSlider);
  document.querySelectorAll(".nav-item").forEach((button) => button.addEventListener("click", () => showView(button.dataset.view)));
}

bindEvents(); renderConditions(); renderMetrics(); renderEvents(); renderTopology(); initMap(); recordEvent("UI_READY", { paused: true });
