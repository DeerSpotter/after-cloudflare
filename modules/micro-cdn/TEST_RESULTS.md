# Micro CDN Prototype Test Results

## Test date

2026-05-15

## Scope tested

This test covered the boring local prototype for the optional micro CDN module.

The tested flow was:

```text
approve content
cache content
advertise content
route content
serve content
track manifest data
persist coordinator state
persist node cache manifest
restart coordinator
restart node agent
re advertise cached content
delete cached content
unadvertise deleted content
verify route failure after delete
```

## Test environment note

The default prototype ports are:

```text
coordinator: 8080
node agent: 8081
```

The local test used alternate ports because port 8080 was already occupied in the test environment.

```text
coordinator: 18080
node agent: 18081
```

The same code path was tested. Only the port values were changed.

## Result summary

```text
PASS: Coordinator starts
PASS: Node agent starts
PASS: Node registers with coordinator
PASS: Content approval works
PASS: Local file cache works
PASS: SHA256 verification works
PASS: Coordinator route works
PASS: Download from selected node works
PASS: Node manifest records cached asset
PASS: Manifest hit count increments after download
PASS: Coordinator persistence survives restart
PASS: Node manifest persistence survives restart
PASS: Node re advertises cached content after restart
PASS: DELETE /cache/hello.txt works
PASS: Node removes manifest entry
PASS: Node removes cached file
PASS: Coordinator unadvertise works
PASS: Route fails after delete when no node serves the file
PASS: Coordinator content mapping becomes empty after delete
```

## Persistence verification

Coordinator restart showed that persistent state was loaded correctly:

```text
loaded coordinator state from data/coordinator-state.json
micro cdn coordinator listening on http://127.0.0.1:18080
```

Node restart showed that the cache manifest was loaded correctly:

```text
loaded node cache manifest from /mnt/data/micro-cdn-test/node-agent/cache/manifest.json
micro cdn node agent listening on http://127.0.0.1:18081
```

## Delete verification

After deleting the cached asset, the expected final state was reached:

```text
manifest_after_delete: 0
route_after_delete_http: 404
contentNodes_after_delete: []
```

## Confirmed current lifecycle

The prototype currently supports this full local lifecycle:

```text
approve
cache
advertise
route
serve
track
delete
unadvertise
persist
restart
recover
```

## Known limitation found during testing

Port 8080 may already be used on some systems.

The coordinator already supports overriding the port:

```powershell
$env:PORT = "18080"
npm start
```

The node can use a custom config with a different port and matching coordinator URL.

## Next recommended test

The next useful test should use two node agents at the same time.

Goal:

1. Cache the same approved asset on two nodes
2. Confirm the coordinator maps one content ID to two nodes
3. Delete the asset from one node
4. Confirm the route still succeeds through the remaining node
5. Delete from the second node
6. Confirm the route then fails
