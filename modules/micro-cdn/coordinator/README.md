<p align="center">
  <a href="#run" title="Run the coordinator"><img src="https://img.shields.io/badge/coordinator-local-2ea44f" alt="local coordinator"></a><br>
  <a href="#persistent-state" title="Read persistent state"><img src="https://img.shields.io/badge/state-persistent-6f42c1" alt="persistent state"></a><br>
  <a href="#main-endpoints" title="Read main endpoints"><img src="https://img.shields.io/badge/API-endpoints-f9c513" alt="API endpoints"></a><br>
  <a href="#current-limits" title="Read current limits"><img src="https://img.shields.io/badge/limits-local%20dev-d73a49" alt="local dev limits"></a>
</p>

# Micro CDN Coordinator

This is the simple local coordinator for the optional micro CDN prototype.

It now stores coordinator state in a local JSON file so approved content and node mappings can survive a restart.

> [!NOTE]
> The coordinator is a local prototype control point. It is useful for testing routing behavior, not a production distributed control plane yet.

## Run

```bash
npm start
```

Default address:

```text
http://127.0.0.1:8080
```

## Persistent state

Default state file:

```text
./data/coordinator-state.json
```

Override the data folder:

```bash
DATA_DIR=./my-data npm start
```

Override the exact state file:

```bash
STATE_FILE=./my-data/state.json npm start
```

Windows PowerShell:

```powershell
$env:DATA_DIR = "./my-data"
npm start
```

> [!TIP]
> Persistent state makes restart testing easier because approved content and node mappings do not disappear every time the coordinator restarts.

## Main endpoints

```text
GET  /status
GET  /route?contentId=hello.txt
POST /nodes/register
POST /nodes/health
POST /content/approve
POST /content/advertise
```

## Purpose

The coordinator tracks:

1. Registered nodes
2. Approved static assets
3. Which node has which cached asset
4. Basic node health
5. A simple route to a healthy node
6. Persistent local prototype state

> [!IMPORTANT]
> The coordinator should route only approved static assets to nodes that have advertised matching cached content.

## Current limits

1. Local JSON persistence only
2. Local development only
3. Static content only
4. No TLS automation
5. No DNS integration
6. No peer mesh
7. No database yet

> [!WARNING]
> Do not treat the current coordinator as production ready. It is intentionally constrained to local development and clear prototype behavior.
