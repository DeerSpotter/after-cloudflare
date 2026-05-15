# Micro CDN Prototype Test Results

## Test date

2026-05-15

## Scope tested

This test covered the boring local prototype for the optional micro CDN module after upgrading from raw cache paths to public micro CDN paths and then adding deadline based hedged failover routing.

The tested flow was:

```text
approve public content path
cache local file by content ID
store cached bytes by SHA256
advertise content
route content by public path
serve content from /mcdn path
track manifest data
persist coordinator state
persist node cache manifest
restart coordinator
restart node agent
re advertise cached content
delete cached content by public path
unadvertise deleted content
verify route failure after delete
request deadline based route plan
return primary and backup candidates
race backup node after delay
verify fastest valid node wins
verify SHA256 after hedged fetch
report success and timeout timing back to coordinator
```

## Test environment note

The default prototype ports are:

```text
coordinator: 8080
node agent: 8081
```

The local tests used alternate ports because port 8080 may already be occupied in some environments.

```text
coordinator: 18080
fast node agent: 18081
slow node fixture: 18082
```

The same code path was tested. Only the port values were changed.

## Public path tested

```text
/mcdn/demo/hello.txt
```

## Content identity tested

```text
demo/hello.txt
```

## Hash storage path verified

```text
cache/sha256/6a/6abf984b2dbbd2235cc76d0231faab579115ece25039a8f84bf3d29fd147dae7
```

## Result summary

```text
PASS: Coordinator starts
PASS: Node agent starts
PASS: Node registers with coordinator
PASS: Content approval works with namespace and display path
PASS: Public path is generated as /mcdn/demo/hello.txt
PASS: Local file cache works
PASS: SHA256 verification works
PASS: Cached bytes are stored under cache/sha256
PASS: Coordinator route works by public path
PASS: Route response returns /mcdn/demo/hello.txt node download URL
PASS: Download from selected node works through /mcdn path
PASS: Node manifest records contentId and publicPath
PASS: Manifest hit count increments after download
PASS: Coordinator content mapping exists
PASS: Coordinator persistence survives restart
PASS: Node manifest persistence survives restart
PASS: Node re advertises cached content after restart
PASS: Route still works after restart
PASS: Download still works after restart
PASS: DELETE /mcdn/demo/hello.txt works
PASS: Node removes manifest entry
PASS: Node removes cached file
PASS: Coordinator unadvertise works
PASS: Route fails after delete when no node serves the file
PASS: Coordinator content mapping becomes empty after delete
PASS: Deadline based route response returns candidates array
PASS: Two node route returns slow primary and fast backup
PASS: Hedged fetch races backup after configured delay
PASS: Fast backup wins before slow primary completes
PASS: Hedged fetch verifies SHA256 before accepting winner
PASS: Hedged fetch writes expected output file
PASS: Coordinator receives success report for fast node
PASS: Coordinator receives timeout report for slow node
PASS: Slow node no longer reports false success after timeout
```

## Fresh test output highlights

```text
sha256: 6abf984b2dbbd2235cc76d0231faab579115ece25039a8f84bf3d29fd147dae7
publicPath: /mcdn/demo/hello.txt
downloadUrl: http://127.0.0.1:18081/mcdn/demo/hello.txt
routeAfterDeleteStatus: 404
routeAfterDeleteBody: no healthy node currently serves this content
```

## Hedged failover test output highlights

The two node failover test used:

```text
coordinator: http://127.0.0.1:18080
fast node: http://127.0.0.1:18081
slow node: http://127.0.0.1:18082
slow node delay: 500 ms
first byte timeout: 250 ms
backup race delay: 75 ms
deadline: 1200 ms
```

Actual winning response:

```json
{
  "role": "backup",
  "nodeId": "node-001",
  "url": "http://127.0.0.1:18081/mcdn/demo/hello.txt",
  "firstByteMs": 5,
  "bytes": 140,
  "sha256": "6abf984b2dbbd2235cc76d0231faab579115ece25039a8f84bf3d29fd147dae7"
}
```

Actual node reports after the hedged fetch fix:

```json
[
  {
    "nodeId": "node-001",
    "success": true,
    "timeout": false,
    "firstByteMs": 5
  },
  {
    "nodeId": "node-slow",
    "success": false,
    "timeout": true,
    "firstByteMs": 250
  }
]
```

## Bug found during hedged failover testing

The first hedged fetch test exposed a quality scoring bug.

The slow node originally reported a timeout and then later reported success after the response finally completed.

That would have polluted the coordinator quality score because the same candidate could count as both failed and successful.

Fix applied:

```text
hedged-fetch.mjs now reports each candidate result only once
late success after timeout is ignored
strict deadline handling now races against all candidate attempts
```

Fix commit:

```text
00a7e0e475df6065591c5c2a21f7f28c8f15aea9
```

## Persistence verification

Coordinator restart showed that persistent state was loaded correctly:

```text
loaded coordinator state from data/coordinator-state.json
micro cdn coordinator listening on http://127.0.0.1:18080
```

Node restart showed that the cache manifest was loaded correctly:

```text
loaded node cache manifest from /mnt/data/mcdn-fresh/node-agent/cache/manifest.json
micro cdn node agent listening on http://127.0.0.1:18081
```

## Delete verification

After deleting the cached asset by public path, the expected final state was reached:

```text
DELETE /mcdn/demo/hello.txt: PASS
manifest_after_delete: 0
route_after_delete_http: 404
contentNodes_after_delete: []
```

## Timing note

The manifest hit counter updates after the file stream completes.

During automated tests, wait briefly after the download before checking the manifest hit count.

The hedged failover test also depends on timing. The slow node fixture uses an intentional response delay so the backup race path can be verified deterministically.

## Confirmed current lifecycle

The prototype currently supports this full local lifecycle:

```text
approve public path
cache by content ID
store by SHA256
advertise
route by public path
serve by /mcdn path
track
persist
restart
recover
re advertise
delete by public path
unadvertise
verify empty mapping
return deadline based candidate route plan
race backup candidate
verify hash
report node timing result
update coordinator quality stats
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

The next useful test should use two full node agents instead of one full node agent plus one slow fixture.

Goal:

1. Cache the same approved asset on two real node agents
2. Confirm the coordinator maps one content ID to two nodes
3. Add artificial delay support to one node agent
4. Confirm hedged fetch selects the faster node
5. Delete the asset from one node
6. Confirm the route still succeeds through the remaining node
7. Delete from the second node
8. Confirm the route then fails
