#!/usr/bin/env python3
"""Embedded MapLibre release console for Flareless.

This is the release quality GUI path. It starts the local demo server inside
Python and hosts a MapLibre GL command center in a pywebview window. Nothing
runs automatically after the window opens: polling is paused and scenarios only
run when the operator presses a button.
"""

from __future__ import annotations

import argparse
import threading
import time
from http.server import ThreadingHTTPServer
from typing import Any
from urllib.request import urlopen

from server import DEFAULT_HOST, DEFAULT_PORT, run_server


class FlarelessApi:
    """Small bridge exposed to JavaScript by pywebview."""

    def __init__(self, base_url: str) -> None:
        self.base_url = base_url.rstrip("/")

    def open_map(self) -> dict[str, str]:
        return {"baseUrl": self.base_url, "state": "paused"}


def run_embedded_console(host: str, port: int) -> None:
    try:
        import webview  # type: ignore[import-not-found]
    except ImportError as exc:  # pragma: no cover - depends on user environment.
        raise SystemExit(
            "pywebview is required for the embedded MapLibre GUI. Install it with: python -m pip install pywebview"
        ) from exc

    server: ThreadingHTTPServer = run_server(host, port)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    time.sleep(0.25)

    base_url = f"http://{host}:{port}"
    api = FlarelessApi(base_url)
    try:
        webview.create_window(
            "Flareless Embedded MapLibre Console",
            html=EMBEDDED_CONSOLE_HTML.replace("__BASE_URL__", base_url),
            js_api=api,
            width=1400,
            height=900,
            min_size=(1120, 740),
        )
        webview.start(debug=False)
    finally:
        server.shutdown()
        server.server_close()


EMBEDDED_CONSOLE_HTML = r'''<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Flareless Embedded MapLibre Console</title>
  <link href="https://unpkg.com/maplibre-gl@5.8.0/dist/maplibre-gl.css" rel="stylesheet" />
  <script src="https://unpkg.com/maplibre-gl@5.8.0/dist/maplibre-gl.js"></script>
  <style>
    :root { color-scheme: dark; --bg:#07101f; --panel:#0d1724; --muted:#8ba1b4; --line:rgba(126,241,205,.35); --green:#14f09a; --red:#ff465a; --gold:#d7b739; --cyan:#24dce9; }
    html, body { height: 100%; margin: 0; background: var(--bg); color: #e7f3ff; font-family: Segoe UI, system-ui, sans-serif; overflow: hidden; }
    .app { height: 100%; display: grid; grid-template-rows: auto 1fr; }
    header { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-bottom: 1px solid rgba(255,255,255,.08); background: #07101f; }
    h1 { font-size: 20px; margin: 0 12px 0 0; }
    .kicker { color: var(--green); font: 12px Consolas, monospace; margin-right: auto; }
    button, select { background:#162438; color:#eef8ff; border:1px solid rgba(255,255,255,.10); border-radius:8px; padding:8px 12px; }
    button.primary { background:#1ed998; color:#061019; font-weight:700; }
    button.danger { background:#6e2330; color:#fff; }
    button:disabled { opacity:.45; }
    .main { display:grid; grid-template-columns: 1fr 390px; gap:12px; padding:12px; min-height:0; }
    .mapPanel, .side { min-height:0; border:1px solid var(--line); border-radius:14px; background:rgba(8,15,25,.86); box-shadow:0 0 28px rgba(63,202,255,.14), inset 0 0 20px rgba(48,255,177,.04); overflow:hidden; }
    #map { width:100%; height:100%; }
    .side { display:grid; grid-template-rows:auto auto 1fr auto; padding:14px; box-sizing:border-box; gap:10px; }
    .card { background:#0b1420; border:1px solid rgba(255,255,255,.08); border-radius:10px; padding:10px; }
    .label { color:var(--muted); font-size:11px; }
    .value { color:#9cf4bd; font:700 18px Consolas, monospace; margin-top:3px; word-break:break-word; }
    pre { margin:0; white-space:pre-wrap; overflow:auto; color:#d8e9ff; font:12px Consolas, monospace; max-height:260px; }
    .small { color:var(--muted); font-size:12px; line-height:1.4; }
    .dot { display:inline-block; width:10px; height:10px; border-radius:50%; margin-right:7px; }
  </style>
</head>
<body>
<div class="app">
  <header>
    <h1>Flareless Release Console</h1>
    <div class="kicker">MapLibre embedded in Python · paused on startup · operator controlled</div>
    <select id="scenario">
      <option>healthy-route</option><option>http-status-failover</option><option>timeout-failover</option><option>blocked-provider</option><option>all-providers-failed</option><option>origin-blocked</option><option>microcdn-hello</option><option>microcdn-no-healthy-node</option>
    </select>
    <button class="primary" id="run">Run selected</button>
    <button id="refresh">Refresh once</button>
    <button id="poll">Start polling</button>
    <button class="danger" id="pause" disabled>Pause</button>
    <button id="reset">Reset</button>
  </header>
  <main class="main">
    <section class="mapPanel"><div id="map"></div></section>
    <aside class="side">
      <div class="card"><div class="label">Startup state</div><div class="value" id="state">paused</div></div>
      <div class="card"><div class="label">Route</div><div class="value" id="route">not loaded</div></div>
      <div class="card"><div class="label">Provider health and attempts</div><pre id="attempts">Press Refresh once or Run selected.</pre></div>
      <div class="small"><span class="dot" style="background:#14f09a"></span>success &nbsp; <span class="dot" style="background:#ff465a"></span>failed &nbsp; <span class="dot" style="background:#d7b739"></span>director &nbsp; <span class="dot" style="background:#24dce9"></span>Micro CDN</div>
    </aside>
  </main>
</div>
<script>
const BASE_URL = '__BASE_URL__';
let timer = null;
const nodeCoords = {
  'client-us': { label:'User traffic', lat:39.5, lon:-98.3, kind:'client' },
  'flareless': { label:'Flareless', lat:32.0, lon:-35.0, kind:'director' },
  'cdn-a': { label:'Cloudflare / cdn-a', lat:50.1, lon:-5.1, kind:'provider' },
  'cdn-b': { label:'Fastly / cdn-b', lat:1.3, lon:103.8, kind:'provider' },
  'cdn-c': { label:'CloudFront / cdn-c', lat:35.7, lon:139.7, kind:'provider' },
  'peer-assisted-edge': { label:'Micro CDN', lat:-23.5, lon:133.8, kind:'peer' },
  'origin': { label:'Origin', lat:52.5, lon:13.4, kind:'origin' }
};
const map = new maplibregl.Map({ container:'map', style:'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json', center:[8,18], zoom:1.45, attributionControl:false });
map.addControl(new maplibregl.NavigationControl({ visualizePitch:true }), 'top-right');
async function api(path, body) {
  const opts = body ? { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(body) } : { cache:'no-store' };
  const res = await fetch(BASE_URL + path, opts);
  if (!res.ok) throw new Error(path + ' ' + res.status);
  return res.json();
}
function arc(a,b) { const out=[]; const dx=b.lon-a.lon; const lift=Math.min(32, Math.max(8, Math.abs(dx)*.12)); for(let i=0;i<=48;i++){const t=i/48; out.push([a.lon+dx*t, a.lat+(b.lat-a.lat)*t+Math.sin(Math.PI*t)*lift]);} return out; }
function good(result) { return (result||'').includes('SUCCESS') || (result||'').includes('ADVERTISES_CONTENT'); }
function color(id, result, active) { if(id===active) return '#14f09a'; if((result||'').match(/TIMEOUT|BLOCKED|ERROR|OFFLINE|DISABLED|NO_HEALTHY/)) return '#ff465a'; if(nodeCoords[id]?.kind==='director') return '#d7b739'; if(nodeCoords[id]?.kind==='peer') return '#24dce9'; return '#dbe7ff'; }
function segments(trace) { const attempts=trace.attempts||[]; const active=(trace.finalStatus||{}).provider||''; const s=[{from:'client-us',to:'flareless',result:'PROVIDER_SUCCESS'}]; let last='flareless'; for(const a of attempts){ if(nodeCoords[a.provider]){s.push({from:last,to:a.provider,result:a.result||'UNKNOWN'}); last=a.provider; }} if(active && nodeCoords[active]) s.push({from:active,to:'client-us',result:'PROVIDER_SUCCESS'}); return s; }
function geo(trace, providers) { const attempts=trace.attempts||[]; const active=(trace.finalStatus||{}).provider||''; const by=Object.fromEntries(attempts.map(a=>[a.provider,a.result])); const features=[]; for(const s of segments(trace)){ const a=nodeCoords[s.from], b=nodeCoords[s.to]; features.push({type:'Feature', geometry:{type:'LineString', coordinates:arc(a,b)}, properties:{kind:'route', good:good(s.result), label:`${a.label} to ${b.label}: ${s.result}`}}); } const ids=new Set(['client-us','flareless','origin']); providers.forEach(p=>ids.add(p.name)); attempts.forEach(a=>ids.add(a.provider)); if(trace.selectedFallback==='peer-fallback') ids.add('peer-assisted-edge'); ids.forEach(id=>{const n=nodeCoords[id]; if(n) features.push({type:'Feature', geometry:{type:'Point', coordinates:[n.lon,n.lat]}, properties:{kind:'node', id, label:n.label, result:by[id]||n.kind, color:color(id, by[id], active)}});}); return {type:'FeatureCollection', features}; }
function addLayers(){ map.addSource('flareless-live',{type:'geojson',data:{type:'FeatureCollection',features:[]}}); map.addLayer({id:'route-shadow',type:'line',source:'flareless-live',filter:['==',['get','kind'],'route'],paint:{'line-color':'#052d29','line-width':8,'line-opacity':.72}}); map.addLayer({id:'routes',type:'line',source:'flareless-live',filter:['==',['get','kind'],'route'],paint:{'line-color':['case',['==',['get','good'],true],'#14f09a','#ff465a'],'line-width':['case',['==',['get','good'],true],3,2],'line-dasharray':['case',['==',['get','good'],true],['literal',[1,0]],['literal',[2,2]]]}}); map.addLayer({id:'nodes',type:'circle',source:'flareless-live',filter:['==',['get','kind'],'node'],paint:{'circle-radius':['case',['==',['get','id'],'flareless'],11,8],'circle-color':['get','color'],'circle-stroke-color':'#fff','circle-stroke-width':1.3}}); map.addLayer({id:'labels',type:'symbol',source:'flareless-live',filter:['==',['get','kind'],'node'],layout:{'text-field':['get','label'],'text-size':12,'text-offset':[1.2,-.7],'text-anchor':'left'},paint:{'text-color':'#e7f3ff','text-halo-color':'#07101f','text-halo-width':1.2}}); }
async function refresh(){ const [status, tracePayload, providerPayload]=await Promise.all([api('/status'),api('/route/trace'),api('/providers')]); const trace=tracePayload.routeTrace||{}; const providers=providerPayload.providers||[]; map.getSource('flareless-live').setData(geo(trace,providers)); document.getElementById('state').textContent = timer ? 'polling' : 'paused'; document.getElementById('route').textContent = status.routeReason || '--'; document.getElementById('attempts').textContent = `Scenario: ${status.scenarioId}\nActive: ${status.activeProvider || 'none'}\n\n` + providers.map(p=>`${p.name.padEnd(7)} ${String(p.status).padEnd(9)} ${p.lastResult}`).join('\n') + '\n\n' + (trace.attempts||[]).map(a=>`${a.provider}: ${a.result}`).join('\n'); }
async function runScenario(){ await api('/route/simulate',{scenarioId:document.getElementById('scenario').value}); await refresh(); }
function startPolling(){ if(timer) return; timer=setInterval(refresh,1000); document.getElementById('poll').disabled=true; document.getElementById('pause').disabled=false; refresh(); }
function pausePolling(){ if(timer) clearInterval(timer); timer=null; document.getElementById('poll').disabled=false; document.getElementById('pause').disabled=true; document.getElementById('state').textContent='paused'; }
async function reset(){ await api('/state/reset',{}); await refresh(); }
document.getElementById('run').onclick=runScenario; document.getElementById('refresh').onclick=refresh; document.getElementById('poll').onclick=startPolling; document.getElementById('pause').onclick=pausePolling; document.getElementById('reset').onclick=reset;
map.on('load', addLayers);
</script>
</body>
</html>
'''


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the embedded MapLibre Flareless console.")
    parser.add_argument("--host", default=DEFAULT_HOST)
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    args = parser.parse_args()
    run_embedded_console(args.host, args.port)


if __name__ == "__main__":
    main()
