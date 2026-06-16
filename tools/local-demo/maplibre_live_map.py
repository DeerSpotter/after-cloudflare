#!/usr/bin/env python3
"""MapLibre HTML map for the Flareless local demo server."""

from __future__ import annotations

MAPLIBRE_HTML = r'''<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Flareless MapLibre Command Map</title>
  <link href="https://unpkg.com/maplibre-gl@5.8.0/dist/maplibre-gl.css" rel="stylesheet" />
  <script src="https://unpkg.com/maplibre-gl@5.8.0/dist/maplibre-gl.js"></script>
  <style>
    :root { color-scheme: dark; }
    html, body, #map { height: 100%; width: 100%; margin: 0; background: #050b14; }
    body { font-family: Segoe UI, system-ui, sans-serif; overflow: hidden; }
    .hud {
      position: absolute;
      left: 16px;
      top: 16px;
      z-index: 5;
      min-width: 290px;
      padding: 14px 16px;
      border: 1px solid rgba(117, 246, 204, .58);
      border-radius: 14px;
      background: linear-gradient(180deg, rgba(8, 17, 28, .92), rgba(8, 14, 23, .84));
      box-shadow: 0 0 28px rgba(63, 202, 255, .16), inset 0 0 20px rgba(48, 255, 177, .04);
      color: #e7f3ff;
      backdrop-filter: blur(10px);
    }
    .hud h1 { margin: 0 0 2px; font-size: 17px; letter-spacing: .01em; }
    .sub { color: #6df0b2; font: 12px Consolas, monospace; margin-bottom: 10px; }
    .row { display: grid; grid-template-columns: 98px 1fr; gap: 8px; font: 12px Consolas, monospace; margin: 5px 0; }
    .key { color: #9db3c6; }
    .value { color: #e9f7ff; word-break: break-word; }
    .legend {
      position: absolute;
      right: 18px;
      bottom: 18px;
      z-index: 5;
      color: #dcecff;
      background: rgba(8, 15, 25, .86);
      border: 1px solid rgba(117, 246, 204, .34);
      border-radius: 12px;
      padding: 12px 14px;
      font: 12px Consolas, monospace;
    }
    .dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 8px; }
  </style>
</head>
<body>
  <div id="map"></div>
  <section class="hud">
    <h1>Flareless Command Map</h1>
    <div class="sub">MapLibre GL · real basemap · live route trace</div>
    <div class="row"><span class="key">Scenario</span><span id="scenario" class="value">waiting</span></div>
    <div class="row"><span class="key">Route</span><span id="route" class="value">waiting</span></div>
    <div class="row"><span class="key">Provider</span><span id="provider" class="value">waiting</span></div>
    <div class="row"><span class="key">Attempts</span><span id="attempts" class="value">waiting</span></div>
  </section>
  <section class="legend">
    <div><span class="dot" style="background:#14f09a"></span>successful route</div>
    <div><span class="dot" style="background:#ff465a"></span>failed attempt</div>
    <div><span class="dot" style="background:#d7b739"></span>Flareless director</div>
    <div><span class="dot" style="background:#24dce9"></span>Micro CDN</div>
  </section>
  <script>
    const nodeCoords = {
      'client-us': { label: 'User traffic', lat: 39.5, lon: -98.3, kind: 'client' },
      'flareless': { label: 'Flareless', lat: 32.0, lon: -35.0, kind: 'director' },
      'cdn-a': { label: 'Cloudflare / cdn-a', lat: 50.1, lon: -5.1, kind: 'provider' },
      'cdn-b': { label: 'Fastly / cdn-b', lat: 1.3, lon: 103.8, kind: 'provider' },
      'cdn-c': { label: 'CloudFront / cdn-c', lat: 35.7, lon: 139.7, kind: 'provider' },
      'peer-assisted-edge': { label: 'Micro CDN', lat: -23.5, lon: 133.8, kind: 'peer' },
      'node-001': { label: 'Micro CDN node-001', lat: 48.8, lon: 2.3, kind: 'peer' },
      'node-disabled': { label: 'Disabled peer', lat: 40.7, lon: -74.0, kind: 'peer' },
      'node-offline': { label: 'Offline peer', lat: 52.5, lon: 13.4, kind: 'peer' },
      'origin': { label: 'Origin', lat: 52.5, lon: 13.4, kind: 'origin' }
    };

    const map = new maplibregl.Map({
      container: 'map',
      style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
      center: [8, 18],
      zoom: 1.45,
      pitch: 0,
      bearing: 0,
      attributionControl: false
    });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');

    async function api(path) {
      const response = await fetch(path, { cache: 'no-store' });
      if (!response.ok) throw new Error(path + ' ' + response.status);
      return response.json();
    }

    function arc(from, to) {
      const steps = 48;
      const coords = [];
      const dx = to.lon - from.lon;
      const lift = Math.min(32, Math.max(8, Math.abs(dx) * 0.12));
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        coords.push([
          from.lon + dx * t,
          from.lat + (to.lat - from.lat) * t + Math.sin(Math.PI * t) * lift
        ]);
      }
      return coords;
    }

    function routeSegments(trace) {
      const attempts = trace.attempts || [];
      const finalProvider = (trace.finalStatus || {}).provider || '';
      const segments = [];
      let last = 'client-us';
      segments.push({ from: last, to: 'flareless', result: 'PROVIDER_SUCCESS' });
      last = 'flareless';
      for (const attempt of attempts) {
        if (!nodeCoords[attempt.provider]) continue;
        segments.push({ from: last, to: attempt.provider, result: attempt.result || 'UNKNOWN' });
        last = attempt.provider;
      }
      if (finalProvider && nodeCoords[finalProvider]) {
        segments.push({ from: finalProvider, to: 'client-us', result: 'PROVIDER_SUCCESS' });
      }
      return segments;
    }

    function isGood(result) {
      return result.includes('SUCCESS') || result.includes('ADVERTISES_CONTENT');
    }

    function nodeColor(id, result, active) {
      if (id === active) return '#14f09a';
      if ((result || '').match(/TIMEOUT|BLOCKED|ERROR|OFFLINE|DISABLED|NO_HEALTHY/)) return '#ff465a';
      if ((nodeCoords[id] || {}).kind === 'director') return '#d7b739';
      if ((nodeCoords[id] || {}).kind === 'peer') return '#24dce9';
      return '#dbe7ff';
    }

    function buildGeoJson(trace, providers) {
      const attempts = trace.attempts || [];
      const active = (trace.finalStatus || {}).provider || '';
      const resultByProvider = Object.fromEntries(attempts.map(a => [a.provider, a.result]));
      const features = [];
      for (const seg of routeSegments(trace)) {
        const from = nodeCoords[seg.from];
        const to = nodeCoords[seg.to];
        if (!from || !to) continue;
        features.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: arc(from, to) },
          properties: { kind: 'route', result: seg.result, good: isGood(seg.result), label: `${from.label} → ${to.label}: ${seg.result}` }
        });
      }
      const wanted = new Set(['client-us', 'flareless', 'origin']);
      for (const p of providers) wanted.add(p.name);
      for (const a of attempts) wanted.add(a.provider);
      if (trace.selectedFallback === 'peer-fallback') wanted.add('peer-assisted-edge');
      for (const id of wanted) {
        const node = nodeCoords[id];
        if (!node) continue;
        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [node.lon, node.lat] },
          properties: { kind: 'node', id, label: node.label, color: nodeColor(id, resultByProvider[id], active), result: resultByProvider[id] || node.kind }
        });
      }
      return { type: 'FeatureCollection', features };
    }

    function setData(id, data) {
      const source = map.getSource(id);
      if (source) source.setData(data);
    }

    function addLayers() {
      map.addSource('flareless-live', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'flareless-route-shadow',
        type: 'line',
        source: 'flareless-live',
        filter: ['==', ['get', 'kind'], 'route'],
        paint: { 'line-color': '#052d29', 'line-width': 8, 'line-opacity': 0.72 }
      });
      map.addLayer({
        id: 'flareless-routes',
        type: 'line',
        source: 'flareless-live',
        filter: ['==', ['get', 'kind'], 'route'],
        paint: {
          'line-color': ['case', ['==', ['get', 'good'], true], '#14f09a', '#ff465a'],
          'line-width': ['case', ['==', ['get', 'good'], true], 3, 2],
          'line-opacity': 0.96,
          'line-dasharray': ['case', ['==', ['get', 'good'], true], ['literal', [1, 0]], ['literal', [2, 2]]]
        }
      });
      map.addLayer({
        id: 'flareless-nodes',
        type: 'circle',
        source: 'flareless-live',
        filter: ['==', ['get', 'kind'], 'node'],
        paint: {
          'circle-radius': ['case', ['==', ['get', 'id'], 'flareless'], 11, 8],
          'circle-color': ['get', 'color'],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1.3,
          'circle-blur': 0.05
        }
      });
      map.addLayer({
        id: 'flareless-labels',
        type: 'symbol',
        source: 'flareless-live',
        filter: ['==', ['get', 'kind'], 'node'],
        layout: { 'text-field': ['get', 'label'], 'text-size': 12, 'text-offset': [1.2, -0.7], 'text-anchor': 'left' },
        paint: { 'text-color': '#e7f3ff', 'text-halo-color': '#07101f', 'text-halo-width': 1.2 }
      });
      map.on('click', 'flareless-nodes', (event) => {
        const feature = event.features && event.features[0];
        if (!feature) return;
        new maplibregl.Popup({ closeButton: true })
          .setLngLat(feature.geometry.coordinates)
          .setHTML(`<strong>${feature.properties.label}</strong><br>${feature.properties.result}`)
          .addTo(map);
      });
    }

    async function refresh() {
      try {
        const [status, tracePayload, providerPayload] = await Promise.all([api('/status'), api('/route/trace'), api('/providers')]);
        const trace = tracePayload.routeTrace || {};
        const providers = providerPayload.providers || [];
        setData('flareless-live', buildGeoJson(trace, providers));
        document.getElementById('scenario').textContent = status.scenarioId || '--';
        document.getElementById('route').textContent = status.routeReason || '--';
        document.getElementById('provider').textContent = status.activeProvider || 'none';
        document.getElementById('attempts').textContent = (trace.attempts || []).map(a => `${a.provider}:${a.result}`).join('  ') || '--';
      } catch (error) {
        document.getElementById('route').textContent = 'waiting for local API';
      }
    }

    map.on('load', () => {
      addLayers();
      refresh();
      setInterval(refresh, 1000);
    });
  </script>
</body>
</html>
'''


if __name__ == "__main__":
    print(MAPLIBRE_HTML)
