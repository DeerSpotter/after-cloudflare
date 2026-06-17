// Phase 3 operator polish: draggable living topology and cockpit style metrics.
// Loaded after app.js so these functions intentionally override selected renderers.

let topologyDrag = null;

function injectCockpitTopologyStyles() {
  if (document.getElementById("cockpitTopologyStyles")) return;
  const style = document.createElement("style");
  style.id = "cockpitTopologyStyles";
  style.textContent = `
    .topology-svg{touch-action:none;user-select:none}.topo-node{cursor:grab}.topo-node.dragging{cursor:grabbing}.topology-grab-hint{fill:#91a4b5;font:11px Consolas}.topology-node-core{transition:r .16s ease,stroke-width .16s ease}.topology-node-ring{pointer-events:none}.topology-count-badge{fill:#0b1520;stroke:rgba(119,238,202,.36)}
    .cockpit-grid{display:grid!important;grid-template-columns:minmax(0,1.08fr) minmax(0,1fr) minmax(0,1fr);grid-auto-rows:minmax(248px,auto);gap:14px;height:100%;min-height:0;overflow:auto;padding-right:4px;align-content:start}.cockpit-panel{background:radial-gradient(circle at 50% 30%,rgba(83,162,255,.08),rgba(5,12,20,.96));border:1px solid rgba(119,238,202,.22);border-radius:14px;padding:14px;min-height:0;min-width:0;box-shadow:inset 0 0 30px rgba(98,200,255,.04),0 0 22px rgba(0,0,0,.20);overflow:hidden;display:flex;flex-direction:column}.cockpit-panel b{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#dff8ff}.cockpit-panel small{display:block;color:#91a4b5;margin-top:3px}.cockpit-wide{grid-row:span 2}.cockpit-panel-head{display:flex;align-items:flex-start;gap:8px}.cockpit-panel-head div{min-width:0;flex:1}.widget-remove{border:1px solid rgba(255,255,255,.12);background:#101820;color:#91a4b5;border-radius:999px;padding:2px 8px;font-size:12px}.widget-remove:hover{color:#fff;border-color:#f04455}.instrument-stack{flex:1;min-height:0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:repeat(2,minmax(0,1fr));gap:10px;margin-top:10px;align-items:center;justify-items:center}.gauge{position:relative;width:min(100%,clamp(86px,13vh,148px));max-width:148px;aspect-ratio:1;border-radius:50%;background:conic-gradient(from 225deg,#46f0a0 0 var(--value),rgba(255,255,255,.08) var(--value) 270deg,transparent 270deg 360deg);border:1px solid rgba(255,255,255,.12);display:grid;place-items:center;box-shadow:inset 0 0 28px rgba(0,0,0,.56);overflow:hidden}.gauge:before{content:"";position:absolute;inset:12px;border-radius:50%;background:#07111b;border:1px solid rgba(255,255,255,.08)}.gauge span{position:relative;font:800 clamp(16px,2.4vh,22px) Consolas;color:#eaf6ff}.gauge label{position:absolute;bottom:clamp(10px,1.6vh,16px);font:9px Consolas;color:#91a4b5;text-align:center}.attitude{height:190px;min-height:150px;border-radius:16px;border:1px solid rgba(255,255,255,.12);overflow:hidden;position:relative;background:linear-gradient(180deg,#153755 0 47%,#e0a44e 48% 52%,#34200f 53% 100%);box-shadow:inset 0 0 40px rgba(0,0,0,.45)}.attitude:before{content:"";position:absolute;left:50%;top:50%;width:160px;height:2px;background:#f5fff8;transform:translate(-50%,-50%);box-shadow:0 -22px 0 rgba(255,255,255,.32),0 22px 0 rgba(255,255,255,.22)}.attitude:after{content:"FLARELESS ROUTE ATTITUDE";position:absolute;left:50%;bottom:12px;transform:translateX(-50%);font:10px Consolas;color:#eaf6ff;letter-spacing:.12em}.annunciator{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:12px}.annunciator div{background:#101820;border:1px solid rgba(255,255,255,.09);border-radius:8px;padding:9px;text-align:center;color:#6e7f8f;font:11px Consolas;min-width:0}.annunciator .on{color:#06110d;background:#46f0a0;box-shadow:0 0 14px rgba(70,240,160,.32);font-weight:800}.annunciator .warn{color:#1a1100;background:#ffd784}.annunciator .fail{color:#fff;background:#f04455}.tape{flex:1;min-height:0;overflow:auto;margin-top:10px;border-radius:10px;border:1px solid rgba(255,255,255,.08);background:#06101a}.tape-row{display:grid;grid-template-columns:72px 1fr 66px;gap:8px;padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.06);font:11px Consolas}.tape-row span:nth-child(1){color:#91a4b5}.tape-row span:nth-child(3){text-align:right;color:#46f0a0}.provider-matrix{display:grid;gap:8px;margin-top:12px;overflow:auto}.matrix-row{display:grid;grid-template-columns:1.1fr .7fr .8fr;gap:8px;align-items:center;background:#07111b;border:1px solid rgba(255,255,255,.07);border-radius:9px;padding:8px 10px;font:11px Consolas}.matrix-row .active{color:#46f0a0}.matrix-row .failed{color:#f04455}.matrix-row .standby{color:#91a4b5}.mini-dials{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:12px}.mini-dial{background:#07111b;border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:10px;text-align:center}.mini-dial span{display:block;font:800 18px Consolas;color:#eaf6ff}.mini-dial label{font:10px Consolas;color:#91a4b5}.cockpit-bar{height:8px;background:#10202b;border-radius:999px;overflow:hidden;margin-top:8px}.cockpit-bar span{display:block;height:100%;background:linear-gradient(90deg,#46f0a0,#62c8ff)}.metrics-widget-controls{margin-left:auto;display:flex;gap:7px;align-items:center;flex-wrap:wrap;justify-content:flex-end}.metrics-widget-controls input,.metrics-widget-controls select{height:30px;min-width:118px}.metrics-widget-controls .custom-body{min-width:190px}.metrics-widget-controls button{height:30px;padding:5px 9px}.custom-widget-body{white-space:pre-wrap;font:12px/1.45 Segoe UI,system-ui;color:#d8e9ff;background:#07111b;border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:10px;margin-top:10px;overflow:auto;flex:1;min-height:0}.custom-widget-note{font:11px Consolas;color:#91a4b5;margin-top:10px}.widget-empty{border:1px dashed rgba(119,238,202,.25);border-radius:12px;padding:14px;color:#91a4b5;font-size:12px}.topology-edge-label{fill:#91a4b5;font:11px Consolas}.topology-edge-label.active{fill:#46f0a0}.topology-edge-label.failed{fill:#f04455}.topology-edge-label.peer-active{fill:#62c8ff}.clickable-topology{cursor:pointer}.clickable-topology:hover circle{stroke-width:5}.active-path{filter:url(#greenGlow)}.topology-live-grid{display:grid;grid-template-columns:minmax(0,1.65fr) minmax(330px,.95fr);gap:14px;height:100%;min-height:0}.topology-editor{display:grid;grid-template-rows:auto auto auto auto minmax(0,1fr) auto;gap:10px;min-height:0;background:#07111b;border:1px solid rgba(255,255,255,.07);border-radius:12px;padding:12px}.topology-editor span{font-size:11px;color:#91a4b5}.topology-editor textarea{width:100%;height:100%;resize:none;background:#050c14;color:#d8e9ff;border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:10px;font:11px Consolas,monospace}.topology-edge-metric{fill:#bcd1df;font:10px Consolas}.topology-node-shadow{opacity:.16}tr[onclick],.peer-row{cursor:pointer}@media(max-width:1500px), (max-height:860px){.cockpit-grid{grid-template-columns:minmax(0,1fr) minmax(0,1fr);grid-auto-rows:minmax(220px,auto)}.cockpit-wide{grid-row:auto}.attitude{height:150px}.gauge{width:min(100%,clamp(76px,11vh,118px))}.instrument-stack{gap:8px}.mini-dials{grid-template-columns:repeat(2,minmax(0,1fr))}.metrics-widget-controls{width:100%;justify-content:flex-start;margin-left:0}}@media(max-width:1100px), (max-height:720px){.cockpit-grid{grid-template-columns:1fr;grid-auto-rows:minmax(190px,auto)}.instrument-stack{grid-template-columns:repeat(4,minmax(0,1fr));grid-template-rows:1fr}.gauge{width:min(100%,92px)}.attitude{height:130px}.topology-live-grid{grid-template-columns:1fr}.topology-editor{display:none}}@media(max-width:760px){.instrument-stack{grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:repeat(2,minmax(0,1fr))}.metrics-widget-controls input,.metrics-widget-controls select{min-width:100%;}.metrics-widget-controls button{width:100%}}
  `;
  document.head.appendChild(style);
}

function dynamicTopologyRadius(nodeCount, configuredRadius) {
  const base = Number(configuredRadius || 38);
  if (nodeCount <= 7) return base;
  const shrink = Math.max(18, 44 - Math.ceil((nodeCount - 7) * 2.4));
  return Math.min(base, shrink);
}

function layoutTopologyNodes() {
  const raw = topologyNodes().map((node) => ({ ...node }));
  const count = raw.length;
  const margin = 42;
  for (const node of raw) {
    node.r = dynamicTopologyRadius(count, node.r || 38);
    node.x = Math.max(margin, Math.min(900 - margin, Number(node.x ?? 120)));
    node.y = Math.max(70, Math.min(420 - margin, Number(node.y ?? 120)));
  }
  return raw;
}

function topoNode(n) {
  const c = topologyColors(n.id);
  const status = topologyState(n.id).replace("peer-", "");
  const sub = n.id === state.activeProvider ? "active" : status;
  const x = n.x ?? 100;
  const y = n.y ?? 100;
  const r = n.r ?? 38;
  return `<g class="topo-node clickable-topology" data-id="${escapeHtml(n.id)}" opacity="${c.opacity}"><circle class="topology-node-shadow" cx="${x}" cy="${y}" r="${r + 12}" fill="${c.stroke}" filter="${c.glow}"/><circle class="topology-node-ring" cx="${x}" cy="${y}" r="${r + 5}" fill="none" stroke="${c.stroke}" stroke-width="1" opacity=".32"/><circle class="topology-node-core" cx="${x}" cy="${y}" r="${r}" fill="${c.fill}" stroke="${c.stroke}" stroke-width="3" filter="${c.glow}"/><text x="${x}" y="${y - 2}" text-anchor="middle" fill="${c.text}" font-size="${Math.max(10, Math.min(18, r * .42))}" font-family="Segoe UI">${escapeHtml(n.label || n.id)}</text><text x="${x}" y="${y + Math.max(15, r * .48)}" text-anchor="middle" fill="${c.stroke}" font-size="${Math.max(9, Math.min(11, r * .28))}" font-family="Consolas">${sub}</text>${status === "failed" ? `<text x="${x + r - 4}" y="${y - r + 12}" text-anchor="middle" fill="#fff" font-size="16" font-family="Segoe UI">×</text>` : ""}</g>`;
}

function renderTopology() {
  const tNodes = layoutTopologyNodes();
  const nodeMap = new Map(tNodes.map((n) => [n.id, n]));
  const links = topologyLinks();
  const attempts = state.routeTrace.attempts || [];
  const failedCount = attempts.filter((a) => isFailed(a.result)).length;
  const activeLabel = state.activeProvider ? (nodeMap.get(state.activeProvider)?.label || state.activeProvider) : "none";
  const averageRadius = Math.round(tNodes.reduce((sum, n) => sum + (n.r || 0), 0) / Math.max(1, tNodes.length));
  const defs = `<defs><filter id="greenGlow"><feGaussianBlur stdDeviation="4" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter><filter id="redGlow"><feGaussianBlur stdDeviation="4" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter><filter id="blueGlow"><feGaussianBlur stdDeviation="4" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`;
  const linksSvg = links.map((link) => topoLink(link, nodeMap)).join("");
  const nodesSvg = tNodes.map(topoNode).join("");
  $("topologySvg").innerHTML = `${defs}<rect x="0" y="0" width="900" height="420" fill="#06101a"/><text x="24" y="34" fill="#eaf6ff" font-size="16" font-family="Segoe UI" font-weight="700">Live Topology</text><text x="24" y="56" class="topology-grab-hint">drag nodes anywhere · active=${escapeHtml(activeLabel)} · nodes=${tNodes.length} · radius=${averageRadius} · failed=${failedCount}</text>${linksSvg}${nodesSvg}<g transform="translate(24 350)"><rect class="topology-count-badge" width="455" height="44" rx="10"/><circle cx="20" cy="22" r="6" fill="#46f0a0"/><text x="34" y="26" fill="#dcecff" font-size="12">active path</text><circle cx="128" cy="22" r="6" fill="#43515e"/><text x="142" y="26" fill="#dcecff" font-size="12">standby</text><circle cx="226" cy="22" r="6" fill="#f04455"/><text x="240" y="26" fill="#dcecff" font-size="12">failed</text><circle cx="306" cy="22" r="6" fill="#62c8ff"/><text x="320" y="26" fill="#dcecff" font-size="12">peer</text><text x="382" y="26" fill="#91a4b5" font-size="11">auto shrink</text></g>`;
  attachTopologyDragHandlers();
}

function svgPoint(svg, event) {
  const pt = svg.createSVGPoint();
  pt.x = event.clientX;
  pt.y = event.clientY;
  return pt.matrixTransform(svg.getScreenCTM().inverse());
}

function attachTopologyDragHandlers() {
  const svg = $("topologySvg");
  if (!svg) return;
  svg.querySelectorAll(".topo-node").forEach((nodeEl) => {
    nodeEl.addEventListener("click", (event) => {
      const id = nodeEl.dataset.id;
      if (!topologyDrag?.moved && id) openDetailsDrawer(id);
      event.stopPropagation();
    });
    nodeEl.addEventListener("mousedown", (event) => {
      const id = nodeEl.dataset.id;
      const node = state.topologyConfig.nodes.find((item) => item.id === id);
      if (!node) return;
      const p = svgPoint(svg, event);
      topologyDrag = { id, startX: p.x, startY: p.y, nodeX: Number(node.x || 0), nodeY: Number(node.y || 0), moved: false };
      nodeEl.classList.add("dragging");
      event.preventDefault();
      event.stopPropagation();
    });
  });
}

window.addEventListener("mousemove", (event) => {
  if (!topologyDrag) return;
  const svg = $("topologySvg");
  const p = svgPoint(svg, event);
  const dx = p.x - topologyDrag.startX;
  const dy = p.y - topologyDrag.startY;
  const node = state.topologyConfig.nodes.find((item) => item.id === topologyDrag.id);
  if (!node) return;
  node.x = Math.round(Math.max(38, Math.min(862, topologyDrag.nodeX + dx)));
  node.y = Math.round(Math.max(64, Math.min(382, topologyDrag.nodeY + dy)));
  topologyDrag.moved = Math.abs(dx) + Math.abs(dy) > 3;
  renderTopology();
  renderTopologyEditor();
});

window.addEventListener("mouseup", () => {
  if (!topologyDrag) return;
  if (topologyDrag.moved) {
    recordEvent("TOPOLOGY_NODE_DRAGGED", { nodeId: topologyDrag.id });
    toast("Topology node moved locally. Press Save Topology to persist.");
  }
  topologyDrag = null;
});

function cockpitValue(value, max) {
  const pct = Math.max(0, Math.min(100, Math.round((Number(value || 0) / Math.max(1, max)) * 100)));
  return `${pct}%`;
}

function metricAverage(values) {
  return Math.round((values || []).reduce((a, b) => a + Number(b || 0), 0) / Math.max(1, (values || []).length));
}

function defaultMetricWidgets() {
  return [
    { id: "route-attitude", type: "route-attitude", title: "Route Attitude", locked: false },
    { id: "primary-instruments", type: "primary-instruments", title: "Primary Instruments", locked: false },
    { id: "provider-matrix", type: "provider-matrix", title: "Provider Matrix", locked: false },
    { id: "event-tape", type: "event-tape", title: "Event Tape", locked: false },
    { id: "traffic-distribution", type: "traffic-distribution", title: "Traffic Distribution", locked: false },
    { id: "operator-notes", type: "custom", title: "User Widget Bay", body: "Write your own local widget notes here. Add more custom widgets from the Metrics header.", locked: false },
  ];
}

function loadMetricWidgets() {
  if (Array.isArray(state.metricsWidgets)) return;
  try {
    const saved = JSON.parse(localStorage.getItem("flareless.metrics.widgets") || "[]");
    state.metricsWidgets = Array.isArray(saved) && saved.length ? saved : defaultMetricWidgets();
  } catch {
    state.metricsWidgets = defaultMetricWidgets();
  }
}

function saveMetricWidgets() {
  localStorage.setItem("flareless.metrics.widgets", JSON.stringify(state.metricsWidgets || []));
}

function ensureMetricsWidgetControls() {
  const head = document.querySelector("#metrics .card-head");
  if (!head || document.getElementById("metricWidgetType")) return;
  const controls = document.createElement("div");
  controls.className = "metrics-widget-controls";
  controls.innerHTML = `<select id="metricWidgetType"><option value="custom">Custom written widget</option><option value="primary-instruments">Primary Instruments</option><option value="provider-matrix">Provider Matrix</option><option value="event-tape">Event Tape</option><option value="traffic-distribution">Traffic Distribution</option><option value="route-attitude">Route Attitude</option></select><input id="metricWidgetTitle" placeholder="widget title"/><input id="metricWidgetBody" class="custom-body" placeholder="custom widget text"/><button id="addMetricWidgetBtn">Add Widget</button><button id="resetMetricWidgetsBtn">Reset</button>`;
  head.appendChild(controls);
  document.getElementById("addMetricWidgetBtn").addEventListener("click", addMetricWidgetFromControls);
  document.getElementById("resetMetricWidgetsBtn").addEventListener("click", () => { state.metricsWidgets = defaultMetricWidgets(); saveMetricWidgets(); renderMetrics(); toast("Metrics widgets reset."); });
}

function addMetricWidgetFromControls() {
  loadMetricWidgets();
  const type = document.getElementById("metricWidgetType")?.value || "custom";
  const titleInput = document.getElementById("metricWidgetTitle");
  const bodyInput = document.getElementById("metricWidgetBody");
  const title = titleInput?.value.trim() || ({ custom: "Custom Widget", "primary-instruments": "Primary Instruments", "provider-matrix": "Provider Matrix", "event-tape": "Event Tape", "traffic-distribution": "Traffic Distribution", "route-attitude": "Route Attitude" }[type] || "Metric Widget");
  const body = bodyInput?.value.trim() || "Custom written widget content. Use this for operator notes, runbook links, or site specific counters.";
  state.metricsWidgets.push({ id: `${type}-${Date.now()}`, type, title, body, locked: false });
  if (titleInput) titleInput.value = "";
  if (bodyInput) bodyInput.value = "";
  saveMetricWidgets();
  renderMetrics();
  recordEvent("METRIC_WIDGET_ADDED", { type, title });
  toast("Metric widget added.");
}

function removeMetricWidget(id) {
  loadMetricWidgets();
  state.metricsWidgets = state.metricsWidgets.filter((widget) => widget.id !== id);
  saveMetricWidgets();
  renderMetrics();
  recordEvent("METRIC_WIDGET_REMOVED", { id });
  toast("Metric widget removed.");
}

function cockpitPanel(id, title, subtitle, body, extraClass = "") {
  return `<div class="cockpit-panel ${extraClass}" data-widget-id="${escapeHtml(id)}"><div class="cockpit-panel-head"><div><b>${escapeHtml(title)}</b>${subtitle ? `<small>${escapeHtml(subtitle)}</small>` : ""}</div><button class="widget-remove" onclick="removeMetricWidget('${escapeHtml(id)}')">×</button></div>${body}</div>`;
}

function renderMetricWidget(widget, context) {
  const { providers, active, failed, latencyAvg, requestAvg, errorAvg, readiness } = context;
  const title = widget.title || widget.type;
  if (widget.type === "route-attitude") {
    return cockpitPanel(widget.id, title, "Operator flight deck for traffic health", `<div class="attitude"></div><div class="annunciator"><div class="${active !== "none" ? "on" : ""}">ACTIVE<br>${escapeHtml(active)}</div><div class="${failed ? "fail" : "on"}">FAILURES<br>${failed}</div><div class="${state.timer ? "on" : "warn"}">POLLING<br>${state.timer ? "LIVE" : "PAUSED"}</div></div><div class="mini-dials"><div class="mini-dial"><span>${requestAvg}</span><label>REQ AVG</label></div><div class="mini-dial"><span>${latencyAvg}</span><label>MS AVG</label></div><div class="mini-dial"><span>${errorAvg}</span><label>ERR AVG</label></div><div class="mini-dial"><span>${readiness}%</span><label>READY</label></div></div>`, "cockpit-wide");
  }
  if (widget.type === "primary-instruments") {
    return cockpitPanel(widget.id, title, "Live synthetic operating envelope", `<div class="instrument-stack"><div class="gauge" style="--value:${cockpitValue(requestAvg, 120)}"><span>${requestAvg}</span><label>REQUEST RATE</label></div><div class="gauge" style="--value:${cockpitValue(latencyAvg, 80)}"><span>${latencyAvg}</span><label>LATENCY MS</label></div><div class="gauge" style="--value:${cockpitValue(errorAvg, 12)}"><span>${errorAvg}</span><label>ERROR PRESSURE</label></div><div class="gauge" style="--value:${readiness}%"><span>${readiness}</span><label>FAILOVER READY</label></div></div>`);
  }
  if (widget.type === "provider-matrix") {
    return cockpitPanel(widget.id, title, "Active, standby, failed states", `<div class="provider-matrix">${providers.map((p) => `<div class="matrix-row"><span>${escapeHtml(providerDisplayName(p))}</span><span class="${providerStatusClass(p)}">${escapeHtml(providerStatusClass(p))}</span><span>${escapeHtml(p.latencyMs || "--")} ms</span></div>`).join("")}</div>`);
  }
  if (widget.type === "event-tape") {
    return cockpitPanel(widget.id, title, "Most recent cockpit messages", `<div class="tape">${state.events.slice(0, 9).map((e) => `<div class="tape-row"><span>${escapeHtml(e.time)}</span><span>${escapeHtml(e.type)}</span><span>${escapeHtml((e.payload && (e.payload.activeProvider || e.payload.scenarioId || e.payload.viewId)) || "")}</span></div>`).join("") || '<div class="tape-row"><span>--</span><span>No events yet</span><span></span></div>'}</div>`);
  }
  if (widget.type === "traffic-distribution") {
    return cockpitPanel(widget.id, title, "Provider share and route pressure", `<div class="distribution">${providers.map((p, i) => { const pct = p.name === active ? 58 : [22, 14, 9, 6, 4][i] || 4; return `<div class="dist-row"><span>${escapeHtml(providerDisplayName(p))}</span><div class="dist-bar"><span style="width:${pct}%"></span></div><b>${pct}%</b></div>`; }).join("")}</div><div class="cockpit-bar"><span style="width:${readiness}%"></span></div><small>Overall readiness ${readiness}%</small>`);
  }
  return cockpitPanel(widget.id, title, "User custom written widget", `<div class="custom-widget-body">${escapeHtml(widget.body || "Empty custom widget.")}</div><div class="custom-widget-note">Local widget. Stored in this browser/webview profile.</div>`);
}

function renderMetrics() {
  const grid = document.querySelector("#metrics .metrics-grid");
  if (!grid) return;
  injectCockpitTopologyStyles();
  ensureMetricsWidgetControls();
  loadMetricWidgets();
  grid.classList.add("cockpit-grid");
  const providers = state.providers.length ? state.providers : providerIds().map((name) => ({ name, latencyMs: "--", lastResult: "STANDBY" }));
  const active = state.activeProvider || "none";
  const failed = providers.filter((p) => providerStatusClass(p) === "failed").length;
  const latencyAvg = metricAverage(state.metrics.latency);
  const requestAvg = metricAverage(state.metrics.requests);
  const errorAvg = metricAverage(state.metrics.errors);
  const readiness = Math.max(0, 100 - failed * 28 - errorAvg * 4);
  const context = { providers, active, failed, latencyAvg, requestAvg, errorAvg, readiness };
  grid.innerHTML = state.metricsWidgets.length ? state.metricsWidgets.map((widget) => renderMetricWidget(widget, context)).join("") : '<div class="cockpit-panel"><div class="widget-empty">No metric widgets. Use Add Widget in the Metrics header.</div></div>';
}

injectCockpitTopologyStyles();
renderMetrics();
renderTopology();
recordEvent("COCKPIT_TOPOLOGY_READY", { draggable: true, cockpit: true, userWidgets: true });
