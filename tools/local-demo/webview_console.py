#!/usr/bin/env python3
"""Embedded MapLibre release console for Flareless."""

from __future__ import annotations

import argparse
import threading
import time
from http.server import ThreadingHTTPServer

from server import DEFAULT_HOST, DEFAULT_PORT, run_server


class FlarelessApi:
    def __init__(self, base_url: str) -> None:
        self.base_url = base_url.rstrip("/")

    def open_map(self) -> dict[str, str]:
        return {"baseUrl": self.base_url, "state": "paused"}


def run_embedded_console(host: str, port: int) -> None:
    try:
        import webview  # type: ignore[import-not-found]
    except ImportError as exc:  # pragma: no cover
        raise SystemExit(
            "pywebview is required for the embedded MapLibre GUI. Install it with: python -m pip install pywebview"
        ) from exc

    server: ThreadingHTTPServer = run_server(host, port)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    time.sleep(0.25)

    base_url = f"http://{host}:{port}"
    try:
        webview.create_window(
            "Flareless Command Center",
            html=EMBEDDED_CONSOLE_HTML.replace("__BASE_URL__", base_url),
            js_api=FlarelessApi(base_url),
            width=1480,
            height=920,
            min_size=(1180, 760),
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
  <title>Flareless Command Center</title>
  <link href="https://unpkg.com/maplibre-gl@5.8.0/dist/maplibre-gl.css" rel="stylesheet" />
  <script src="https://unpkg.com/maplibre-gl@5.8.0/dist/maplibre-gl.js"></script>
  <style>
    :root{
      color-scheme:dark; --bg:#101820; --deep:#050b13; --panel:#101a25; --panel2:#0c1520; --line:rgba(119,238,202,.38); --line2:rgba(110,174,255,.42); --text:#ecf5ff; --muted:#91a4b5; --green:#46f0a0; --teal:#55e6c1; --cyan:#62c8ff; --red:#f04455; --gold:#f6b44c;
    }
    *{box-sizing:border-box} html,body{height:100%;margin:0;background:radial-gradient(circle at 75% 14%,#26323a 0,#17222a 33%,#101820 74%);color:var(--text);font-family:Inter,Segoe UI,system-ui,sans-serif;overflow:hidden}
    body:before{content:"";position:fixed;inset:0;background:linear-gradient(115deg,rgba(255,255,255,.035),transparent 38%),repeating-linear-gradient(60deg,transparent 0 160px,rgba(122,189,190,.055) 161px 162px);pointer-events:none}.app{height:100%;display:grid;grid-template-columns:88px 1fr;gap:16px;padding:18px}.rail{border:1px solid rgba(255,255,255,.08);background:rgba(6,13,21,.72);border-radius:18px;padding:14px 10px;box-shadow:inset 0 0 28px rgba(66,255,188,.035)}.brand{font-weight:800;font-size:13px;margin:2px 0 20px;display:flex;gap:7px;align-items:center}.brand i{width:14px;height:14px;background:linear-gradient(140deg,#66d6ff,#45f0a0);clip-path:polygon(0 42%,100% 0,60% 55%,42% 100%,36% 62%)}.nav{display:grid;gap:7px}.nav div{font-size:11px;color:#9caec0;padding:8px 7px;border-radius:8px}.nav .on{background:#1a2734;color:#fff}.stage{min-width:0;display:grid;grid-template-rows:auto 1fr;gap:14px}.top{display:flex;align-items:center;gap:14px}.status{font:700 14px Consolas,monospace;color:var(--green);margin-right:auto}.metric{font-size:12px;color:#c5d0d9}.pill{border:1px solid rgba(255,255,255,.12);border-radius:20px;padding:6px 10px;font-size:11px;color:#cdd8e3;background:#111a23}.grid{min-height:0;display:grid;grid-template-columns:minmax(620px,1.52fr) minmax(400px,.98fr);grid-template-rows:minmax(390px,1fr) minmax(210px,.52fr);gap:18px}.card{position:relative;min-height:0;background:linear-gradient(180deg,rgba(13,23,34,.94),rgba(8,15,24,.93));border:1px solid var(--line);border-radius:16px;box-shadow:0 0 0 1px rgba(113,154,255,.24),0 0 30px rgba(84,226,200,.14),inset 0 0 34px rgba(66,255,188,.035);overflow:hidden}.card.blue{border-color:var(--line2);box-shadow:0 0 0 1px rgba(100,207,255,.25),0 0 26px rgba(87,154,255,.16),inset 0 0 30px rgba(100,200,255,.035)}.mapcard{grid-row:1/3}.cardHead{height:50px;padding:16px 18px 8px;display:flex;align-items:center;gap:12px;z-index:4;position:relative}.title{font-weight:800;font-size:15px}.sub{font-size:11px;color:var(--muted)}.spacer{flex:1}button,select{background:#172331;color:#eef8ff;border:1px solid rgba(255,255,255,.12);border-radius:7px;padding:8px 10px;font-size:12px}button.primary{background:linear-gradient(180deg,#69e8b8,#35c890);color:#06110d;font-weight:800;border:0}button:disabled{opacity:.48}.mapWrap{position:absolute;inset:50px 0 0}#map{height:100%;width:100%;filter:saturate(.84) brightness(.8)}.mapOverlay{position:absolute;left:18px;bottom:20px;width:150px;background:rgba(13,24,33,.86);border:1px solid rgba(255,255,255,.11);border-radius:8px;padding:10px;font-size:12px;z-index:6}.ok{color:var(--green)}.floatTip{position:absolute;z-index:6;background:rgba(12,22,30,.92);border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:8px 10px;font-size:11px;box-shadow:0 8px 20px rgba(0,0,0,.38)}.tip1{left:23%;top:28%}.tip2{left:54%;top:39%}.tip3{right:26%;top:44%}.dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--green);margin-right:5px}.chart{height:160px;margin:8px 18px 0;display:flex;align-items:end;gap:24px;border-top:1px solid rgba(255,255,255,.08);border-bottom:1px solid rgba(255,255,255,.08);padding:14px 24px}.bar{width:38px;border-radius:4px 4px 0 0;background:linear-gradient(180deg,#5dffb0,#5a8cff);box-shadow:0 0 18px rgba(85,230,193,.28)}.bar:nth-child(2){height:76px}.bar:nth-child(1){height:112px}.bar:nth-child(3){height:103px}.labels{display:flex;gap:18px;margin:8px 30px;color:#a9b6c2;font-size:11px}.outage{margin:16px 18px;padding:14px;border-radius:10px;background:#0b1520;border:1px solid rgba(255,255,255,.08)}.outage select{width:100%;margin:8px 0}.builder{padding:0 18px 18px}.rule{background:#111c28;border:1px solid rgba(255,255,255,.08);border-radius:10px;margin-top:10px;padding:12px}.ruleLine{display:flex;gap:8px;align-items:center;margin:8px 0}.code{font:12px Consolas,monospace;color:#8ee9c4;background:#07111b;border-top:1px dashed rgba(125,214,255,.25);margin-top:12px;padding:12px;white-space:pre}.trust{padding:0 18px 18px}.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:4px 0 12px}.stat{background:#0b1520;border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:10px}.stat b{display:block;font-size:22px;color:#8af3b5}.row{display:grid;grid-template-columns:1.2fr .7fr .8fr 1fr;gap:8px;align-items:center;background:#111c28;border:1px solid rgba(255,255,255,.07);border-radius:9px;padding:9px;margin:7px 0;font-size:12px}.hash{color:#d8e8ff;font-family:Consolas,monospace}.tiny{font-size:10px;color:#889dad}.live{position:absolute;right:18px;top:16px;font-size:11px;color:#7fe8b1}.paused{color:#ffd784}.routeLayer{position:absolute;inset:50px 0 0;pointer-events:none;z-index:5}.node{position:absolute;width:10px;height:10px;border-radius:50%;background:var(--green);box-shadow:0 0 16px var(--green)}.arc{position:absolute;height:2px;background:linear-gradient(90deg,rgba(70,240,160,.05),rgba(70,240,160,.9),rgba(70,240,160,.05));transform-origin:left center;border-radius:3px;box-shadow:0 0 10px rgba(70,240,160,.6)}
    @media(max-width:1100px){.app{grid-template-columns:1fr}.rail{display:none}.grid{grid-template-columns:1fr;grid-template-rows:480px 280px 320px}.mapcard{grid-row:auto}.top{flex-wrap:wrap}}
  </style>
</head>
<body>
<div class="app">
  <aside class="rail"><div class="brand"><i></i>Flareless</div><div class="nav"><div class="on">Dashboard</div><div>Traffic</div><div>Policies</div><div>Peers</div><div>Logs</div><div>Settings</div></div></aside>
  <main class="stage">
    <div class="top"><h1>Flareless</h1><div class="status">STATUS: OPTIMAL</div><div class="metric">Aggregate Real Time Bandwidth: 226.2 TB</div><span class="pill">paused startup</span><span class="pill">operator controlled</span></div>
    <section class="grid">
      <article class="card mapcard">
        <div class="cardHead"><div><div class="title">Global Smart Traffic & Failover Map</div><div class="sub">Real MapLibre basemap with Flareless route overlays</div></div><div class="spacer"></div><select id="scenario"><option>healthy-route</option><option>http-status-failover</option><option>timeout-failover</option><option>blocked-provider</option><option>all-providers-failed</option><option>origin-blocked</option><option>microcdn-hello</option><option>microcdn-no-healthy-node</option></select><button class="primary" id="run">Run</button><button id="refresh">Refresh</button><button id="poll">Live</button><button id="pause" disabled>Pause</button></div>
        <div class="mapWrap"><div id="map"></div></div><div class="routeLayer"><div class="node" style="left:20%;top:48%"></div><div class="node" style="left:38%;top:43%"></div><div class="node" style="left:54%;top:36%"></div><div class="node" style="left:78%;top:58%"></div><div class="arc" style="left:21%;top:49%;width:190px;transform:rotate(-10deg)"></div><div class="arc" style="left:39%;top:44%;width:170px;transform:rotate(-23deg)"></div><div class="arc" style="left:55%;top:37%;width:250px;transform:rotate(24deg)"></div></div>
        <div class="floatTip tip1"><b>Cloudflare</b><br><span class="dot"></span>Latency 15 ms</div><div class="floatTip tip2"><b>AWS CloudFront</b><br><span class="dot"></span>Latency 22 ms</div><div class="floatTip tip3"><b>CloudFront</b><br><span class="dot"></span>Catalog 16 GB</div><div class="mapOverlay">Detected Outage:<br><span class="ok" id="route">None</span></div>
      </article>
      <aside class="card"><div class="cardHead"><div><div class="title">Provider Cost Optimization Index</div><div class="sub">Last 34 hours</div></div><span class="live paused" id="state">paused</span></div><div class="chart"><div class="bar"></div><div class="bar"></div><div class="bar"></div></div><div class="labels"><span>Cloudflare</span><span>Fastly</span><span>CloudFront</span></div><div class="outage"><b>Simulate Outage</b><br><span class="sub">Select provider to fail</span><select id="outage"><option>Cloudflare</option><option>Fastly</option><option>CloudFront</option></select><button class="primary" id="applyOutage">Apply</button></div></aside>
      <article class="card blue"><div class="cardHead"><div><div class="title">Policy & Rule Engine Builder</div><div class="sub">Automating mirrored routing and traffic routing.</div></div><button>+ New rule</button></div><div class="builder"><div class="rule"><b>IF</b><div class="ruleLine"><button>404 rate &gt; 2%</button><span>AND</span><button>Provider == CloudFront</button></div><b>THEN</b><div class="ruleLine"><button>Route to CDN X</button><span class="spacer"></span><button>YAML</button><button>JSON</button></div><div class="code">code:
  404_rate: &gt;20-x
  Provider == CDN-x;</div></div></div></article>
      <article class="card blue"><div class="cardHead"><div><div class="title">Micro CDN Trust Network</div><div class="sub">Peer integrity and offload confidence</div></div></div><div class="trust"><div class="stats"><div class="stat"><span class="tiny">Uptime</span><b>99.99%</b></div><div class="stat"><span class="tiny">Integrity</span><b>Hash</b></div><div class="stat"><span class="tiny">Saved Today</span><b>14TB</b></div></div><div id="attempts"><div class="row"><span class="hash">hashed3365627006...</span><span class="ok">Online</span><span>250MB</span><span class="ok">Hash 100%</span></div><div class="row"><span class="hash">hashed5964045005...</span><span class="ok">Online</span><span>250MB</span><span class="ok">Hash 100%</span></div><div class="row"><span class="hash">hashed3320052003...</span><span class="ok">Online</span><span>500MB</span><span class="ok">Hash 100%</span></div></div></div></article>
    </section>
  </main>
</div>
<script>
const BASE_URL='__BASE_URL__';let timer=null;const nodeCoords={'client-us':{label:'User traffic',lat:39.5,lon:-98.3,kind:'client'},'flareless':{label:'Flareless',lat:32,lon:-35,kind:'director'},'cdn-a':{label:'Cloudflare',lat:50.1,lon:-5.1,kind:'provider'},'cdn-b':{label:'Fastly',lat:1.3,lon:103.8,kind:'provider'},'cdn-c':{label:'CloudFront',lat:35.7,lon:139.7,kind:'provider'},'peer-assisted-edge':{label:'Micro CDN',lat:-23.5,lon:133.8,kind:'peer'},origin:{label:'Origin',lat:52.5,lon:13.4,kind:'origin'}};
const map=new maplibregl.Map({container:'map',style:'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',center:[18,18],zoom:1.35,attributionControl:false,interactive:true});
async function api(path,body){const opts=body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{cache:'no-store'};const res=await fetch(BASE_URL+path,opts);if(!res.ok)throw new Error(path+' '+res.status);return res.json()}
function arc(a,b){const out=[],dx=b.lon-a.lon,lift=Math.min(32,Math.max(8,Math.abs(dx)*.12));for(let i=0;i<=48;i++){const t=i/48;out.push([a.lon+dx*t,a.lat+(b.lat-a.lat)*t+Math.sin(Math.PI*t)*lift])}return out}function good(r){return(r||'').includes('SUCCESS')||(r||'').includes('ADVERTISES_CONTENT')}function c(id,r,active){if(id===active)return'#14f09a';if((r||'').match(/TIMEOUT|BLOCKED|ERROR|OFFLINE|DISABLED|NO_HEALTHY/))return'#ff465a';if(nodeCoords[id]?.kind==='director')return'#d7b739';if(nodeCoords[id]?.kind==='peer')return'#24dce9';return'#dbe7ff'}function segs(trace){const attempts=trace.attempts||[],active=(trace.finalStatus||{}).provider||'';let last='flareless';const s=[{from:'client-us',to:'flareless',result:'PROVIDER_SUCCESS'}];for(const a of attempts){if(nodeCoords[a.provider]){s.push({from:last,to:a.provider,result:a.result||'UNKNOWN'});last=a.provider}}if(active&&nodeCoords[active])s.push({from:active,to:'client-us',result:'PROVIDER_SUCCESS'});return s}function geo(trace,providers){const attempts=trace.attempts||[],active=(trace.finalStatus||{}).provider||'',by=Object.fromEntries(attempts.map(a=>[a.provider,a.result])),features=[];for(const s of segs(trace)){const a=nodeCoords[s.from],b=nodeCoords[s.to];features.push({type:'Feature',geometry:{type:'LineString',coordinates:arc(a,b)},properties:{kind:'route',good:good(s.result)}})}const ids=new Set(['client-us','flareless','origin']);providers.forEach(p=>ids.add(p.name));attempts.forEach(a=>ids.add(a.provider));if(trace.selectedFallback==='peer-fallback')ids.add('peer-assisted-edge');ids.forEach(id=>{const n=nodeCoords[id];if(n)features.push({type:'Feature',geometry:{type:'Point',coordinates:[n.lon,n.lat]},properties:{kind:'node',id,label:n.label,color:c(id,by[id],active)}})});return{type:'FeatureCollection',features}}
function addLayers(){map.addSource('flareless-live',{type:'geojson',data:{type:'FeatureCollection',features:[]}});map.addLayer({id:'route-shadow',type:'line',source:'flareless-live',filter:['==',['get','kind'],'route'],paint:{'line-color':'#053a2f','line-width':8,'line-opacity':.75}});map.addLayer({id:'routes',type:'line',source:'flareless-live',filter:['==',['get','kind'],'route'],paint:{'line-color':['case',['==',['get','good'],true],'#46f0a0','#ff465a'],'line-width':3,'line-opacity':.98}});map.addLayer({id:'nodes',type:'circle',source:'flareless-live',filter:['==',['get','kind'],'node'],paint:{'circle-radius':['case',['==',['get','id'],'flareless'],10,7],'circle-color':['get','color'],'circle-stroke-color':'#e8f5ff','circle-stroke-width':1.2}});map.addLayer({id:'labels',type:'symbol',source:'flareless-live',filter:['==',['get','kind'],'node'],layout:{'text-field':['get','label'],'text-size':11,'text-offset':[1.1,-.7],'text-anchor':'left'},paint:{'text-color':'#eaf6ff','text-halo-color':'#07101f','text-halo-width':1.2}})}
async function refresh(){const [status,tp,pp]=await Promise.all([api('/status'),api('/route/trace'),api('/providers')]);const trace=tp.routeTrace||{},providers=pp.providers||[];map.getSource('flareless-live')?.setData(geo(trace,providers));document.getElementById('state').textContent=timer?'live':'paused';document.getElementById('state').className=timer?'live':'live paused';document.getElementById('route').textContent=status.routeReason||'None';document.querySelector('.status').textContent=(status.routeReason||'STATUS: OPTIMAL').includes('SUCCESS')?'STATUS: OPTIMAL':'STATUS: DEGRADED'}
async function runScenario(){await api('/route/simulate',{scenarioId:document.getElementById('scenario').value});await refresh()}function startPolling(){if(timer)return;timer=setInterval(refresh,1000);document.getElementById('poll').disabled=true;document.getElementById('pause').disabled=false;refresh()}function pausePolling(){clearInterval(timer);timer=null;document.getElementById('poll').disabled=false;document.getElementById('pause').disabled=true;document.getElementById('state').textContent='paused';document.getElementById('state').className='live paused'}
document.getElementById('run').onclick=runScenario;document.getElementById('refresh').onclick=refresh;document.getElementById('poll').onclick=startPolling;document.getElementById('pause').onclick=pausePolling;document.getElementById('applyOutage').onclick=async()=>{document.getElementById('scenario').value='http-status-failover';await runScenario()};map.on('load',addLayers);
</script>
</body></html>'''


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the embedded MapLibre Flareless console.")
    parser.add_argument("--host", default=DEFAULT_HOST)
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    args = parser.parse_args()
    run_embedded_console(args.host, args.port)


if __name__ == "__main__":
    main()
