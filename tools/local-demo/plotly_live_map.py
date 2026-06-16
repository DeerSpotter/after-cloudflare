#!/usr/bin/env python3
"""Generate and open the Plotly live world map for the local demo.

This intentionally uses Plotly's browser geo renderer instead of hand drawn
Tkinter polygons. The Python side remains dependency free. Plotly.js is loaded
from the CDN in the generated HTML, so the map has real coastlines, land,
ocean, country borders, and live route overlays while the local API stays on
127.0.0.1.
"""

from __future__ import annotations

import json
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
MAP_PATH = ROOT / "assets" / "flareless_plotly_live_map.html"

NODE_COORDS = {
    "client-us": {"label": "User traffic", "lat": 39.5, "lon": -98.3, "kind": "client"},
    "flareless": {"label": "Flareless", "lat": 32.0, "lon": -35.0, "kind": "director"},
    "cdn-a": {"label": "Cloudflare / cdn-a", "lat": 50.1, "lon": -5.1, "kind": "provider"},
    "cdn-b": {"label": "Fastly / cdn-b", "lat": 1.3, "lon": 103.8, "kind": "provider"},
    "cdn-c": {"label": "CloudFront / cdn-c", "lat": 35.7, "lon": 139.7, "kind": "provider"},
    "peer-assisted-edge": {"label": "Micro CDN", "lat": -23.5, "lon": 133.8, "kind": "peer"},
    "node-001": {"label": "Micro CDN node-001", "lat": 48.8, "lon": 2.3, "kind": "peer"},
    "node-disabled": {"label": "Disabled peer", "lat": 40.7, "lon": -74.0, "kind": "peer"},
    "node-offline": {"label": "Offline peer", "lat": 52.5, "lon": 13.4, "kind": "peer"},
    "origin": {"label": "Origin", "lat": 52.5, "lon": 13.4, "kind": "origin"},
}


def write_plotly_live_map(base_url: str, output_path: Path | None = None) -> Path:
    """Write the live Plotly HTML map and return its path."""
    output = output_path or MAP_PATH
    output.parent.mkdir(parents=True, exist_ok=True)
    html = HTML_TEMPLATE.replace("__BASE_URL__", json.dumps(base_url.rstrip("/")))
    html = html.replace("__NODE_COORDS__", json.dumps(NODE_COORDS, indent=2))
    output.write_text(html, encoding="utf-8")
    return output


def open_plotly_live_map(base_url: str) -> Path:
    """Create the map and open it in the default browser."""
    path = write_plotly_live_map(base_url)
    webbrowser.open(path.resolve().as_uri())
    return path


HTML_TEMPLATE = r'''<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Flareless Plotly Live World Map</title>
  <script src="https://cdn.plot.ly/plotly-2.35.2.min.js"></script>
  <style>
    :root { color-scheme: dark; }
    body {
      margin: 0;
      background: radial-gradient(circle at 20% 20%, #182638 0, #07101f 36%, #020611 100%);
      color: #e7f2ff;
      font-family: Segoe UI, system-ui, sans-serif;
      overflow: hidden;
    }
    .shell {
      position: fixed;
      inset: 0;
      display: grid;
      grid-template-columns: 1fr 360px;
      gap: 12px;
      padding: 14px;
      box-sizing: border-box;
    }
    .panel {
      border: 1px solid rgba(107, 232, 199, .55);
      border-radius: 14px;
      background: rgba(6, 13, 23, .86);
      box-shadow: 0 0 28px rgba(56, 198, 255, .18), inset 0 0 22px rgba(35, 255, 180, .05);
      overflow: hidden;
    }
    #map { width: 100%; height: 100%; }
    aside { padding: 16px; }
    h1 { margin: 0 0 4px; font-size: 20px; }
    .sub { color: #7df7bd; font-family: Consolas, monospace; font-size: 12px; margin-bottom: 16px; }
    .stat { border: 1px solid rgba(255,255,255,.08); border-radius: 10px; background: #0d1724; padding: 12px; margin-bottom: 10px; }
    .label { font-size: 11px; color: #9fb4c7; }
    .value { margin-top: 4px; color: #8ff0b7; font: 700 20px Consolas, monospace; word-break: break-word; }
    pre { white-space: pre-wrap; color: #d7e9ff; background: #07111c; border-radius: 10px; padding: 10px; max-height: 220px; overflow: auto; }
    .warn { color: #ffd76b; font-size: 12px; line-height: 1.4; }
  </style>
</head>
<body>
  <div class="shell">
    <main class="panel"><div id="map"></div></main>
    <aside class="panel">
      <h1>Flareless Live World Map</h1>
      <div class="sub">Plotly geo renderer · real coastlines · live localhost route trace</div>
      <div class="stat"><div class="label">Scenario</div><div class="value" id="scenario">--</div></div>
      <div class="stat"><div class="label">Route result</div><div class="value" id="route">--</div></div>
      <div class="stat"><div class="label">Active provider</div><div class="value" id="provider">--</div></div>
      <div class="stat"><div class="label">Provider health</div><pre id="providers">--</pre></div>
      <div class="warn">Change scenarios in the Tkinter release console. This map polls the local demo API and redraws the real world map automatically.</div>
    </aside>
  </div>
  <script>
    const BASE_URL = __BASE_URL__;
    const NODES = __NODE_COORDS__;
    const okColor = '#18f09a';
    const failColor = '#ff4d5e';
    const standbyColor = '#dbe7ff';
    const peerColor = '#24dce9';
    const directorColor = '#d7b739';

    async function getJson(path) {
      const response = await fetch(BASE_URL + path, { cache: 'no-store' });
      if (!response.ok) throw new Error(path + ' -> ' + response.status);
      return await response.json();
    }

    function nodeColor(id, result, activeProvider) {
      if (id === activeProvider) return okColor;
      if ((result || '').includes('TIMEOUT') || (result || '').includes('BLOCKED') || (result || '').includes('ERROR') || (result || '').includes('OFFLINE') || (result || '').includes('DISABLED')) return failColor;
      if ((NODES[id] || {}).kind === 'peer') return peerColor;
      if ((NODES[id] || {}).kind === 'director') return directorColor;
      return standbyColor;
    }

    function curveBetween(a, b) {
      const steps = 32;
      const lons = [];
      const lats = [];
      const dx = b.lon - a.lon;
      const lift = Math.min(28, Math.max(8, Math.abs(dx) * 0.10));
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        lons.push(a.lon + dx * t);
        lats.push(a.lat + (b.lat - a.lat) * t + Math.sin(Math.PI * t) * lift);
      }
      return { lons, lats };
    }

    function routeTrace(attempts, finalProvider) {
      const routes = [];
      let last = 'client-us';
      routes.push([last, 'flareless', 'PROVIDER_SUCCESS']);
      last = 'flareless';
      for (const attempt of attempts) {
        const provider = attempt.provider;
        if (!NODES[provider]) continue;
        routes.push([last, provider, attempt.result || 'UNKNOWN']);
        last = provider;
      }
      if (finalProvider && NODES[finalProvider]) routes.push([finalProvider, 'client-us', 'PROVIDER_SUCCESS']);
      return routes;
    }

    function buildTraces(status, trace, providers) {
      const finalStatus = trace.finalStatus || {};
      const attempts = trace.attempts || [];
      const activeProvider = finalStatus.provider || '';
      const resultByProvider = Object.fromEntries(attempts.map(x => [x.provider, x.result]));
      const data = [];

      for (const [from, to, result] of routeTrace(attempts, activeProvider)) {
        const a = NODES[from];
        const b = NODES[to];
        if (!a || !b) continue;
        const curve = curveBetween(a, b);
        const good = result.includes('SUCCESS') || result.includes('ADVERTISES_CONTENT');
        data.push({
          type: 'scattergeo',
          mode: 'lines',
          lon: curve.lons,
          lat: curve.lats,
          line: { color: good ? okColor : failColor, width: good ? 3 : 2, dash: good ? 'solid' : 'dot' },
          hoverinfo: 'text',
          text: `${from} → ${to}<br>${result}`,
          showlegend: false
        });
      }

      const nodeIds = Object.keys(NODES).filter(id => id === 'client-us' || id === 'flareless' || id === 'origin' || providers.some(p => p.name === id) || attempts.some(a => a.provider === id));
      data.push({
        type: 'scattergeo',
        mode: 'markers+text',
        lon: nodeIds.map(id => NODES[id].lon),
        lat: nodeIds.map(id => NODES[id].lat),
        text: nodeIds.map(id => NODES[id].label),
        textposition: 'top right',
        textfont: { color: '#e7f2ff', size: 12, family: 'Consolas' },
        marker: {
          size: nodeIds.map(id => id === 'flareless' ? 18 : 13),
          color: nodeIds.map(id => nodeColor(id, resultByProvider[id], activeProvider)),
          line: { color: '#ffffff', width: 1 }
        },
        hovertext: nodeIds.map(id => `${NODES[id].label}<br>${resultByProvider[id] || NODES[id].kind}`),
        hoverinfo: 'text',
        showlegend: false
      });
      return data;
    }

    async function redraw() {
      try {
        const [status, tracePayload, providerPayload] = await Promise.all([
          getJson('/status'), getJson('/route/trace'), getJson('/providers')
        ]);
        const trace = tracePayload.routeTrace || {};
        const providers = providerPayload.providers || [];
        document.getElementById('scenario').textContent = status.scenarioId || '--';
        document.getElementById('route').textContent = status.routeReason || '--';
        document.getElementById('provider').textContent = status.activeProvider || 'none';
        document.getElementById('providers').textContent = providers.map(p => `${p.name.padEnd(8)} ${String(p.status).padEnd(9)} ${p.lastResult}`).join('\n') || '--';
        Plotly.react('map', buildTraces(status, trace, providers), layout(status), { displayModeBar: false, responsive: true });
      } catch (error) {
        document.getElementById('route').textContent = 'waiting for local server';
      }
    }

    function layout(status) {
      return {
        margin: { l: 0, r: 0, t: 0, b: 0 },
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        geo: {
          scope: 'world',
          projection: { type: 'natural earth' },
          bgcolor: 'rgba(0,0,0,0)',
          showland: true,
          landcolor: '#151f2a',
          showocean: true,
          oceancolor: '#06101b',
          showcountries: true,
          countrycolor: '#38586a',
          showcoastlines: true,
          coastlinecolor: '#7d94a5',
          coastlinewidth: 0.9,
          showlakes: true,
          lakecolor: '#071321',
          showframe: false,
          lonaxis: { showgrid: true, gridcolor: '#132b3a', dtick: 30 },
          lataxis: { showgrid: true, gridcolor: '#132b3a', dtick: 20 }
        },
        annotations: [{
          xref: 'paper', yref: 'paper', x: 0.02, y: 0.96, showarrow: false,
          text: 'Global Smart Traffic & Failover Map',
          font: { color: '#ffffff', size: 18, family: 'Segoe UI' },
          align: 'left'
        }]
      };
    }

    redraw();
    setInterval(redraw, 1000);
  </script>
</body>
</html>
'''


if __name__ == "__main__":
    path = write_plotly_live_map("http://127.0.0.1:8765")
    print(path)
