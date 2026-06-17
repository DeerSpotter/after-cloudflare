// Phase 3 operator polish: draggable living topology and cockpit style metrics.
// Loaded after app.js so these functions intentionally override selected renderers.

let topologyDrag = null;

function injectCockpitTopologyStyles() {
  if (document.getElementById("cockpitTopologyStyles")) return;
  const style = document.createElement("style");
  style.id = "cockpitTopologyStyles";
  style.textContent = `
    .topology-svg{touch-action:none;user-select:none}.topo-node{cursor:grab}.topo-node.dragging{cursor:grabbing}.topology-grab-hint{fill:#91a4b5;font:11px Consolas}.topology-node-core{transition:r .16s ease,stroke-width .16s ease}.topology-node-ring{pointer-events:none}.topology-count-badge{fill:#0b1520;stroke:rgba(119,238,202,.36)}
    .cockpit-grid{display:grid!important;grid-template-columns:1.1fr 1fr 1fr;grid-template-rows:1fr 1fr;gap:14px;height:100%;min-height:0}.cockpit-panel{background:radial-gradient(circle at 50% 30%,rgba(83,162,255,.08),rgba(5,12,20,.96));border:1px solid rgba(119,238,202,.22);border-radius:14px;padding:14px;min-height:0;box-shadow:inset 0 0 30px rgba(98,200,255,.04),0 0 22px rgba(0,0,0,.20)}.cockpit-panel b{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#dff8ff}.cockpit-panel small{display:block;color:#91a4b5;margin-top:3px}.cockpit-wide{grid-row:span 2}.instrument-stack{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px}.gauge{position:relative;aspect-ratio:1;border-radius:50%;background:conic-gradient(from 225deg,#46f0a0 0 var(--value),rgba(255,255,255,.08) var(--value) 270deg,transparent 270deg 360deg);border:1px solid rgba(255,255,255,.12);display:grid;place-items:center;box-shadow:inset 0 0 28px rgba(0,0,0,.56)}.gauge:before{content:"";position:absolute;inset:14px;border-radius:50%;background:#07111b;border:1px solid rgba(255,255,255,.08)}.gauge span{position:relative;font:800 22px Consolas;color:#eaf6ff}.gauge label{position:absolute;bottom:16px;font:10px Consolas;color:#91a4b5}.attitude{height:190px;border-radius:16px;border:1px solid rgba(255,255,255,.12);overflow:hidden;position:relative;background:linear-gradient(180deg,#153755 0 47%,#e0a44e 48% 52%,#34200f 53% 100%);box-shadow:inset 0 0 40px rgba(0,0,0,.45)}.attitude:before{content:"";position:absolute;left:50%;top:50%;width:160px;height:2px;background:#f5fff8;transform:translate(-50%,-50%);box-shadow:0 -22px 0 rgba(255,255,255,.32),0 22px 0 rgba(255,255,255,.22)}.attitude:after{content:"FLARELESS ROUTE ATTITUDE";position:absolute;left:50%;bottom:12px;transform:translateX(-50%);font:10px Consolas;color:#eaf6ff;letter-spacing:.12em}.annunciator{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px}.annunciator div{background:#101820;border:1px solid rgba(255,255,255,.09);border-radius:8px;padding:9px;text-align:center;color:#6e7f8f;font:11px Consolas}.annunciator .on{color:#06110d;background:#46f0a0;box-shadow:0 0 14px rgba(70,240,160,.32);font-weight:800}.annunciator .warn{color:#1a1100;background:#ffd784}.annunciator .fail{color:#fff;background:#f04455}.tape{height:100%;overflow:auto;margin-top:10px;border-radius:10px;border:1px solid rgba(255,255,255,.08);background:#06101a}.tape-row{display:grid;grid-template-columns:72px 1fr 66px;gap:8px;padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.06);font:11px Consolas}.tape-row span:nth-child(1){color:#91a4b5}.tape-row span:nth-child(3){text-align:right;color:#46f0a0}.provider-matrix{display:grid;gap:8px;margin-top:12px}.matrix-row{display:grid;grid-template-columns:1.1fr .7fr .8fr;gap:8px;align-items:center;background:#07111b;border:1px solid rgba(255,255,255,.07);border-radius:9px;padding:8px 10px;font:11px Consolas}.matrix-row .active{color:#46f0a0}.matrix-row .failed{color:#f04455}.matrix-row .standby{color:#91a4b5}.mini-dials{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:12px}.mini-dial{background:#07111b;border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:10px;text-align:center}.mini-dial span{display:block;font:800 18px Consolas;color:#eaf6ff}.mini-dial label{font:10px Consolas;color:#91a4b5}.cockpit-bar{height:8px;background:#10202b;border-radius:999px;overflow:hidden;margin-top:8px}.cockpit-bar span{display:block;height:100%;background:linear-gradient(90deg,#46f0a0,#62c8ff)}@media(max-width:1350px){.cockpit-grid{grid-template-columns:1fr 1fr}.cockpit-wide{grid-row:auto}}@media(max-width:900px){.cockpit-grid{grid-template-columns:1fr}.instrument-stack{grid-template-columns:1fr 1fr}}
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

function renderMetrics() {
  const grid = document.querySelector("#metrics .metrics-grid");
  if (!grid) return;
  grid.classList.add("cockpit-grid");
  const providers = state.providers.length ? state.providers : providerIds().map((name) => ({ name, latencyMs: "--", lastResult: "STANDBY" }));
  const active = state.activeProvider || "none";
  const failed = providers.filter((p) => providerStatusClass(p) === "failed").length;
  const latencyAvg = metricAverage(state.metrics.latency);
  const requestAvg = metricAverage(state.metrics.requests);
  const errorAvg = metricAverage(state.metrics.errors);
  const readiness = Math.max(0, 100 - failed * 28 - errorAvg * 4);
  grid.innerHTML = `
    <div class="cockpit-panel cockpit-wide"><b>Route Attitude</b><small>Operator flight deck for traffic health</small><div class="attitude"></div><div class="annunciator"><div class="${active !== "none" ? "on" : ""}">ACTIVE<br>${escapeHtml(active)}</div><div class="${failed ? "fail" : "on"}">FAILURES<br>${failed}</div><div class="${state.timer ? "on" : "warn"}">POLLING<br>${state.timer ? "LIVE" : "PAUSED"}</div></div><div class="mini-dials"><div class="mini-dial"><span>${requestAvg}</span><label>REQ AVG</label></div><div class="mini-dial"><span>${latencyAvg}</span><label>MS AVG</label></div><div class="mini-dial"><span>${errorAvg}</span><label>ERR AVG</label></div><div class="mini-dial"><span>${readiness}%</span><label>READY</label></div></div></div>
    <div class="cockpit-panel"><b>Primary Instruments</b><small>Live synthetic operating envelope</small><div class="instrument-stack"><div class="gauge" style="--value:${cockpitValue(requestAvg, 120)}"><span>${requestAvg}</span><label>REQUEST RATE</label></div><div class="gauge" style="--value:${cockpitValue(latencyAvg, 80)}"><span>${latencyAvg}</span><label>LATENCY MS</label></div><div class="gauge" style="--value:${cockpitValue(errorAvg, 12)}"><span>${errorAvg}</span><label>ERROR PRESSURE</label></div><div class="gauge" style="--value:${readiness}%"><span>${readiness}</span><label>FAILOVER READY</label></div></div></div>
    <div class="cockpit-panel"><b>Provider Matrix</b><small>Active, standby, failed states</small><div class="provider-matrix">${providers.map((p) => `<div class="matrix-row"><span>${escapeHtml(providerDisplayName(p))}</span><span class="${providerStatusClass(p)}">${escapeHtml(providerStatusClass(p))}</span><span>${escapeHtml(p.latencyMs || "--")} ms</span></div>`).join("")}</div></div>
    <div class="cockpit-panel"><b>Event Tape</b><small>Most recent cockpit messages</small><div class="tape">${state.events.slice(0, 9).map((e) => `<div class="tape-row"><span>${escapeHtml(e.time)}</span><span>${escapeHtml(e.type)}</span><span>${escapeHtml((e.payload && (e.payload.activeProvider || e.payload.scenarioId || e.payload.viewId)) || "")}</span></div>`).join("") || '<div class="tape-row"><span>--</span><span>No events yet</span><span></span></div>'}</div></div>
    <div class="cockpit-panel"><b>Traffic Distribution</b><small>Provider share and route pressure</small><div class="distribution">${providers.map((p, i) => { const pct = p.name === active ? 58 : [22, 14, 9, 6, 4][i] || 4; return `<div class="dist-row"><span>${escapeHtml(providerDisplayName(p))}</span><div class="dist-bar"><span style="width:${pct}%"></span></div><b>${pct}%</b></div>`; }).join("")}</div><div class="cockpit-bar"><span style="width:${readiness}%"></span></div><small>Overall readiness ${readiness}%</small></div>
  `;
}

injectCockpitTopologyStyles();
renderMetrics();
renderTopology();
recordEvent("COCKPIT_TOPOLOGY_READY", { draggable: true, cockpit: true });
