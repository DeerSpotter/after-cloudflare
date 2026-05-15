# Micro CDN Node Agent

This is the boring prototype node agent for the optional micro CDN module.

It is intentionally simple:

1. Starts a local HTTP server
2. Registers itself with the coordinator
3. Reports health periodically
4. Caches approved local files
5. Serves cached files from disk
6. Advertises cached content back to the coordinator

## Run

From this folder:

```bash
npm start
```

By default it reads:

```text
./config.example.json
```

Use a custom config:

```bash
CONFIG=./config.local.json npm start
```

On Windows PowerShell:

```powershell
$env:CONFIG = "./config.local.json"
npm start
```

## Cache a local file

```bash
curl -X POST http://127.0.0.1:8081/cache/local-file \
  -H "content-type: application/json" \
  -d '{"contentId":"hello.txt","sourcePath":"../demo-assets/hello.txt"}'
```

Windows PowerShell:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri "http://127.0.0.1:8081/cache/local-file" `
  -ContentType "application/json" `
  -Body '{"contentId":"hello.txt","sourcePath":"../demo-assets/hello.txt"}'
```

## Download cached file

```bash
curl http://127.0.0.1:8081/cache/hello.txt
```

## Health

```bash
curl http://127.0.0.1:8081/health
```

## Disable micro CDN mode

Set this in the config:

```json
"microCdnEnabled": false
```

When disabled, the node can still run, but it will not cache or serve files.
