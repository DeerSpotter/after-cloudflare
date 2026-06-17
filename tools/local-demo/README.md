# Flareless Local Demo Console

![Flareless local demo screenshot](./Screenshot%202026-06-16%20161950.png)

The local Python console is the release focused first run experience for Flareless.

It can run as either the original Tkinter console or the new embedded MapLibre GUI. The embedded GUI starts the local server inside Python and shows the real MapLibre command map inside the Python application window.

## Recommended release launcher

Use this for the release quality GUI:

```text
tools/local-demo/start.bat
```

`start.bat` now launches the embedded MapLibre command center. The legacy Tkinter launcher moved to:

```text
tools/local-demo/start_tkinter.bat
```

Startup is intentionally paused. Nothing starts polling and no scenario is run from the UI until the operator presses one of these controls:

```text
Run
Refresh
Live
Pause
```

If the embedded GUI says pywebview is missing, install it with:

```bash
python -m pip install -r tools/local-demo/requirements.txt
```

## Embedded UI source layout

The embedded MapLibre UI is split into front end component files instead of one large Python string:

```text
tools/local-demo/ui/index.html
tools/local-demo/ui/styles.css
tools/local-demo/ui/app.js
tools/local-demo/webview_console.py
tools/local-demo/requirements.txt
```

`webview_console.py` starts the local API server, reads the UI files, injects the local base URL, and opens the pywebview window.

## Phase 1 UI scope

Phase 1 focuses on command center visual parity and navigable release UI scaffolding before deeper backend capabilities are added.

Implemented:

```text
real app shell with top bar and left navigation
no auto polling on startup
no scenario run on startup
MapLibre route map inside Python GUI
animated route overlay layer
provider cards anchored to map coordinates
clickable node popups
status colors for optimal, degraded, and failed
separate Traffic, Providers, Policies, Approvals, Peers, Evidence, Logs, and Settings views
shared front end state object
provider health table
approval inbox cards with approve/reject actions
policy builder controls with add/remove conditions
YAML/JSON policy preview
test policy action
save disabled until backend persistence exists
Micro CDN peer list, rejected peer handling, and trust boundary display
evidence headers and route trace views
toast notifications
```

## What changed for the release build

The Python console includes:

```text
embedded MapLibre real world map
paused startup
operator controlled scenario execution
normalized provider health
route attempt chain
visual route policy builder
YAML and JSON policy export
agent recommendation inbox
operator approve or reject flow
micro CDN trust dashboard
generated x-flareless-* evidence headers
route trace JSON
audit log
```

## MapLibre real world command map

The hand drawn Tkinter canvas map is now only a fallback. For the release visual, use the embedded MapLibre GUI. It uses a real MapLibre GL basemap with coastlines, land, ocean, country detail, route arcs, node labels, and local API data.

Fallback browser launcher:

```text
tools/local-demo/start_maplibre_map.bat
```

The generated browser file is:

```text
tools/local-demo/assets/flareless_maplibre_live_map.html
```

## Plotly real world map

A Plotly map option is still available, but MapLibre is the preferred visual for the command map.

```text
tools/local-demo/start_plotly_map.bat
```

## OSIRIS 2D map asset reuse

The Tkinter fallback map still keeps OSIRIS style metadata from `DeerSpotter/osiris-v2`, but it is now a fallback only. The embedded MapLibre map is the intended real world visual map for the release build.

The copied metadata lives in:

```text
tools/local-demo/osiris_map_assets.py
```

## Run it

### Windows double click launchers

Preferred embedded MapLibre command center:

```text
tools/local-demo/start.bat
```

Legacy Tkinter console:

```text
tools/local-demo/start_tkinter.bat
```

Fallback browser MapLibre map:

```text
tools/local-demo/start_maplibre_map.bat
```

### Command line

Embedded MapLibre GUI:

```bash
python tools/local-demo/webview_console.py
```

Original Tkinter console:

```bash
python tools/local-demo/run_demo.py
```

Alternative two terminal flow:

```bash
python tools/local-demo/server.py
```

Then:

```bash
python tools/local-demo/client.py
```

The server listens at:

```text
http://127.0.0.1:8765
```

## Test it

From the repository root:

```bash
python tools/local-demo/run_tests.py
```

The test runner performs these checks:

```text
compile all local demo Python files
validate scenario fixture contracts
run unittest API and lifecycle coverage
```

The local demo tests also cover the Python 3.12 import path used by CI.

## What it demonstrates

The console demonstrates the strongest current identity of Flareless:

```text
failure aware route control plus agent assisted recommendations
```

It shows:

```text
provider health
route attempts
route trace JSON
failure points
agent recommendation
operator approval or rejection
audit log
micro CDN trust model boundaries
```

## What it does not claim

The local demo does not implement:

```text
real peer chunk transfer
distributed health checks
detached manifest signatures
production control plane
external CDN API integration
```

Those remain future work.

## Release recommendation

Use this as the first release artifact:

```text
v0.1.0-local-demo-console
```

Suggested release title:

```text
Flareless v0.1.0: Failure Aware Route Control Demo
```

Suggested release description:

```text
A local Python command center that shows provider failure, route traces, agent assisted recommendations, operator approval, audit logging, and Micro CDN trust boundaries.
```
