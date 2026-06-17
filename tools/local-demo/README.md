# Flareless Local Demo Console

![Flareless local demo screenshot](./Screenshot%202026-06-16%20161950.png)

The local Python console is the release focused first run experience for Flareless.

It can run as either the original Tkinter console or the embedded MapLibre GUI. The embedded GUI starts the local server inside Python and shows the real MapLibre command map inside the Python application window.

## Recommended release launcher

Use this for the release quality GUI:

```text
tools/local-demo/start.bat
```

`start.bat` launches the embedded MapLibre command center. The legacy Tkinter launcher is:

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

## Install requirements

If the embedded GUI says pywebview is missing, run:

```text
tools/local-demo/install_requirements.bat
```

or:

```bash
python -m pip install -r tools/local-demo/requirements.txt
```

## Build release ZIP

To stage a standalone local demo folder and ZIP it:

```text
tools/local-demo/build_release_zip.bat
```

Output:

```text
tools/local-demo/release/flareless-local-demo.zip
```

The ZIP includes launchers, UI files, scenario fixtures, screenshots, README, and Python runtime files.

## Embedded UI source layout

```text
tools/local-demo/ui/index.html
tools/local-demo/ui/styles.css
tools/local-demo/ui/app.js
tools/local-demo/webview_console.py
tools/local-demo/server.py
tools/local-demo/requirements.txt
```

`webview_console.py` starts the local API server, reads the UI files, injects the local base URL, and opens the pywebview window.

## Operational UI features

Implemented:

```text
real app shell with top bar and left navigation
no auto polling on startup
no scenario run on startup
MapLibre route map inside Python GUI
animated route overlay layer
provider cards anchored to map coordinates
clickable MapLibre nodes and provider cards
details drawer for provider, Micro CDN, topology, and origin nodes
status colors for optimal, degraded, failed, standby, active, and peer active
separate Traffic, Providers, Policies, Scenario Builder, Approvals, Peers, Evidence, Replay, Incidents, Metrics, Events, Topology, History, Logs, and Settings views
shared front end state object
provider health table
approval inbox cards with approve/reject actions
policy builder controls with add/remove conditions
YAML/JSON policy preview
Scenario Builder with custom failover chain
custom scenario JSON/YAML export
custom scenario execution against the local API
local JSON persistence for history/events
evidence headers and route trace views
live topology with clickable nodes, active path labels, edge labels, and animated packet flow
toast notifications
release ZIP builder
```

## Local persistence

The UI saves run history and events to:

```text
tools/local-demo/state/local-ui-state.json
```

This file is created at runtime and is intentionally local only.

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

Plotly map option:

```text
tools/local-demo/start_plotly_map.bat
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

## What it demonstrates

```text
failure aware route control plus agent assisted recommendations
```

It shows provider health, route attempts, route trace JSON, failure points, agent recommendation, operator approval or rejection, audit log, and Micro CDN trust model boundaries.

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

```text
v0.1.0-local-demo-console
```

Suggested release title:

```text
Flareless v0.1.0: Failure Aware Route Control Demo
```

Suggested release description:

```text
A local Python command center that shows provider failure, route traces, agent assisted recommendations, operator approval, audit logging, Micro CDN trust boundaries, a live topology, a scenario builder, local history persistence, and release packaging helpers.
```
