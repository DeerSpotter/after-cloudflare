# Quickstart

This guide gets a contributor from clone to local runtime checks.

## Requirements

* Node 24 or newer.
* Go 1.22 or newer.
* npm.

## Install

```bash
npm install
```

## Run tests

```bash
npm test
go test ./...
go build ./...
```

## Run the local edge runtime

```bash
npm run local
```

The runtime listens on:

```text
http://127.0.0.1:8787
```

## Try the health endpoint

```text
http://127.0.0.1:8787/health
```

Expected result:

* Status is `ok`.
* Protocol is `mgp-edge`.
* Providers are listed.

## Try the manifest endpoint

```text
http://127.0.0.1:8787/manifest?path=/video/test/v1/seg_00001.m4s
```

Expected result:

* Protocol is `mgp-manifest-v1`.
* Asset path is normalized.
* Provider URLs are generated.

## Try peer room info

```text
http://127.0.0.1:8787/peer/room-info?asset=test&peerId=peerA
```

Expected result:

* Room name is stable.
* Peer and asset names are normalized.

## Run the offline simulator

```bash
npm run simulate
```

Useful simulator flags:

```bash
npm run simulate -- --users=500 --segments=200 --requests=10000
npm run simulate -- --cdnABlocked=true
npm run simulate -- --cdnABlocked=true --cdnBBlocked=true
npm run simulate -- --peerFailureRate=0.10 --invalidPeerRate=0.01
```

## Repo layout

```text
src/          Worker runtime prototype
services/     Go control plane scaffold
public/       Browser side peer logic
scripts/      Local runner and simulation tools
tests/        Node test suite
```

## Next reading

* `ROADMAP.md`
* `ARCHITECTURE.md`
* `CONTRIBUTING.md`
* `SECURITY.md`
