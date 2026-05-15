# Micro CDN Node Agent

This is the boring prototype node agent for the optional micro CDN module.

It is intentionally simple:

1. Starts a local HTTP server
2. Registers itself with the coordinator
3. Reports health periodically
4. Caches approved local files
5. Serves cached files from disk
6. Advertises cached content back to the coordinator
7. Persists a local cache manifest
8. Re advertises cached content after restart
9. Deletes cached content cleanly
10. Unadvertises deleted content from the coordinator

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

## Persistent cache manifest

Default manifest file:

```text
./cache/manifest.json
```

The manifest stores:

1. Content ID
2. Safe local file name
3. SHA256 hash
4. Cached file path
5. File size
6. Source path
7. Cached time
8. Last verified time
9. Hit count
10. Bytes served

On startup, the node:

1. Loads the manifest
2. Checks that cached files still exist
3. Removes missing files from the manifest
4. Registers with the coordinator
5. Re advertises cached content

## View manifest

```bash
curl http://127.0.0.1:8081/manifest
```

Windows PowerShell:

```powershell
Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:8081/manifest"
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

## Delete cached file

```bash
curl -X DELETE http://127.0.0.1:8081/cache/hello.txt
```

Windows PowerShell:

```powershell
Invoke-RestMethod -Method Delete -Uri "http://127.0.0.1:8081/cache/hello.txt"
```

Deleting cached content removes the local cache file, removes the manifest entry, and calls the coordinator unadvertise endpoint.

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
