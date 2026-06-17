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

The ZIP includes launchers, UI files, scenario fixtures, screenshots, README, release notes, docs, and Python runtime files. Runtime state is created in the included empty `state` folder.

## Embedded UI source layout

```text
tools/local-demo/ui/index.html
tools/local-demo/ui/styles.css
tools/local-demo/ui/app.js
tools/local-demo/ui/cockpit_topology.js
tools/local-demo/webview_console.py
tools/local-demo/server.py
tools/local-demo/requirements.txt
```

`webview_console.py` starts the local API server, reads the UI files, injects the local base URL, and opens the pywebview window. The optional `cockpit_topology.js` extension adds the draggable living topology and cockpit style metrics after the base UI loads.

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
saved named custom scenarios
custom scenario JSON/YAML export
custom scenario execution against the local API
local JSON persistence for history/events
topology visual editor controls for nodes and links
drag and drop topology nodes inside the topology canvas
automatic topology node shrinking as node count increases
topology JSON editor for advanced edits
topology snapshots and restore
health check simulation settings per provider
provider registry derived from topology
live topology with clickable nodes, active path labels, edge labels, and animated packet flow
cockpit style metrics dashboard with route attitude, gauges, annunciators, event tape, and provider matrix
evidence headers and route trace views
toast notifications
release ZIP builder
```

## Local persistence

Runtime files are created under:

```text
tools/local-demo/state/
```

Current runtime state files:

```text
local-ui-state.json
topology-config.json
topology-snapshots.json
custom-scenarios.json
health-settings.json
provider-registry.json
```

These files are intentionally local only.

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
