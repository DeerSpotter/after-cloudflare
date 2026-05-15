# Micro CDN Coordinator

This is the simple local coordinator for the optional micro CDN prototype.

It stores everything in memory for now.

## Run

```bash
npm start
```

Default address:

```text
http://127.0.0.1:8080
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

## Current limits

1. Memory only
2. Local development only
3. Static content only
4. No TLS automation
5. No DNS integration
6. No peer mesh
