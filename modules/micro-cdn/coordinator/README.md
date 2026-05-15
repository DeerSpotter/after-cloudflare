# Micro CDN Coordinator

This is the simple local coordinator for the optional micro CDN prototype.

It now stores coordinator state in a local JSON file so approved content and node mappings can survive a restart.

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

## Current limits

1. Local JSON persistence only
2. Local development only
3. Static content only
4. No TLS automation
5. No DNS integration
6. No peer mesh
7. No database yet
