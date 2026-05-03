# AnimeKai Public Stack Review

This note records public, browser visible engineering observations from `https://anikai.to/home` and safe improvements that can be applied to Open Edge Router.

This is not a piracy integration guide. Do not copy media sources, signed URLs, tokens, private JavaScript bundles, bypass logic, or unauthorized content.

## Publicly Observed Product Patterns

The homepage exposes several useful UX and routing patterns:

```text
genre filters
type filters
new releases
updates
ongoing
recent
random
watch together
latest updates
sub and dub filters
new releases rail
upcoming rail
completed rail
top trending by now, day, week, and month
A to Z index
alternate domain notice
```

## Publicly Reported Technology Signals

Public technology reports identify the following stack characteristics:

```text
Cloudflare
cdnjs
Bootstrap
jQuery
Popper
HTTP/3
Open Graph
PWA
```

These are useful signals for legitimate architecture design:

```text
Cloudflare style edge delivery
public library CDN usage
installable web app behavior
social preview metadata
mobile friendly UI framework
HTTP/3 capable transport
```

## Safe Improvements Applied To This Repo

Open Edge Router now includes a PWA manifest and service worker layer.

Relevant files:

```text
public/manifest.webmanifest
public/mgpServiceWorker.js
```

## Recommended Additional Enhancements

### 1. Catalog Surface

Add a catalog API shape that supports:

```text
genres
types
latest updates
new releases
upcoming
completed
trending now
tending day
trending week
trending month
A to Z index
random asset
watch together room creation
```

### 2. Trending Cache

Trending should not hit the database every request.

Use short TTL buckets:

```text
now: 1 minute
Day: 15 minutes
Week: 1 hour
Month: 6 hours
```

### 3. Mobile First Shell

Public traffic estimates for this category can be heavily mobile weighted, so the player shell should prioritize:

```text
fast first paint
small JavaScript bundle
responsive cards
touch friendly controls
poster lazy loading
minimal layout shift
```

### 4. PWA Installability

The app should include:

```text
web manifest
service worker
icons
standalone display mode
theme color
background color
start URL
```

### 5. Open Graph Metadata

Every asset page should include:

```text
og:title
og:description
og:image
og:type
og:url
twitter:card
```

### 6. Alternate Domain Notice

For legitimate resilience, provide an emergency status object:

```json
{
  "primaryDomain": "example.com",
  "statusDomain": "status.example.com",
  "mirrorDomains": [
    "mirror1.example.com",
    "mirror2.example.com"
  ],
  "onion": "optional-onion-address"
}
```

### 7. Watch Together

Watch together can be implemented safely as synchronized playback state, not content redistribution.

Minimum room state:

```json
{
  "roomId": "room-id",
  "assetId": "asset-id",
  "hostPeerId": "peer-id",
  "positionSeconds": 125.4,
  "paused": false,
  "updatedAt": 1770000000000
}
```

### 8. Sub and Dub Track Model

The manifest should support multiple audio and subtitle tracks:

```json
{
  "audioTracks": [
    { "id": "sub", "label": "Japanese", "language": "ja" },
    { "id": "dub", "label": "English", "language": "en" }
  ],
  "subtitleTracks": [
    { "id": "en-vtt", "label": "English", "language": "en", "url": "https://cdn-a.example.com/subs/en.vtt", "sha256Hex": "..." }
  ]
}
```

## Boundary

Use these observations only for authorized content delivery, public domain content, licensed media, internal training media, or creator owned libraries.
