# Authorized Streaming Site Analysis Guide

This guide explains how to analyze an existing streaming website for legitimate engineering lessons without copying private code, bypassing access controls, or enabling piracy.

Use this only for authorized analysis, public behavior observation, or your own properties.

## What To Capture

Open browser developer tools and inspect only public browser visible behavior.

### Network

Record:

```text
manifest type
segment format
segment duration
CDN hostnames
HTTP status codes
cache headers
CORS headers
range request support
content type
content length
initial page payload size
subtitle formats
image formats
```

### Playback

Record:

```text
startup time
buffer ahead target
quality switch behavior
stall recovery behavior
prefetch behavior
seek behavior
subtitles loaded
thumbnail preview support
```

### Caching

Record:

```text
service worker present
Cache API usage
localStorage keys
IndexedDB usage
segment cache behavior
manifest cache behavior
```

### Resilience

Record:

```text
how many CDN hostnames are used
whether failed segment requests retry
whether quality drops on errors
whether alternate mirrors are offered
whether player retries same URL or alternate URL
```

## Common Streaming Site Features Worth Implementing

Modern streaming sites often have useful engineering patterns:

```text
lazy loaded home page cards
image CDN resizing
webp or avif posters
subtitle track loading
continue watching state
resume playback position
manifest prefetch
next episode prefetch
service worker cache
multi host fallback
short segment duration
ABR quality switching
error based mirror switching
```

## What Not To Copy

Do not copy:

```text
private JavaScript bundles
session tokens
signed URLs
scraping logic
DRM bypass logic
ad blocker bypass logic
anti debug code
source site branding
unauthorized media URLs
```

## How Open Edge Router Can Use These Lessons

### Service Worker Cache

Use a service worker for repeat segment access.

```text
manifest requests: network first
segment requests: cache first with background refresh
poster images: cache first
```

### Multi CDN Mirror Logic

Represent mirrors as provider neutral URLs in the manifest.

```json
{
  "chunkId": "show1-ep1-720p-seg-00001",
  "cdnUrls": [
    "https://cdn-a.example.com/video/show1/ep1/v1/720p/seg_00001.m4s",
    "https://cdn-b.example.com/video/show1/ep1/v1/720p/seg_00001.m4s",
    "https://cdn-c.example.com/video/show1/ep1/v1/720p/seg_00001.m4s"
  ]
}
```

### Next Episode Prefetch

When the current episode is nearly finished, fetch the next episode manifest.

```text
currentTime greater than 80 percent of duration
load next manifest
warm image and first segments
```

### Subtitle Support

Keep subtitles outside peer transfer unless they are public and hash verified.

Recommended formats:

```text
WebVTT
ASS converted to WebVTT for browser native tracks
```

### Poster and Thumbnail Optimization

Use image variants:

```text
poster 320 wide
poster 640 wide
poster 960 wide
banner 1280 wide
webp or avif preferred
```

### Playback Resume

Store resume state locally.

```json
{
  "assetId": "show1-ep1",
  "positionSeconds": 842,
  "updatedAt": 1770000000000
}
```

## Suggested Repo Enhancements

The following enhancements are safe and useful:

```text
service worker segment cache
subtitle manifest fields
poster and artwork manifest fields
next episode prefetch fields
resume playback helper
mirror error telemetry
player diagnostics overlay
```

## Manual Checklist For Comparing A Site

Use this checklist when looking at an authorized streaming site.

```text
1. Open developer tools
2. Start playback
3. Filter network by m3u8, mpd, m4s, ts, vtt, json
4. Record segment duration
5. Record CDN hostnames
6. Record fallback behavior by blocking one hostname locally
7. Check if a service worker exists
8. Check cache headers on segments
9. Check if subtitles are VTT or ASS
10. Check if posters use webp or avif
11. Check if player preloads next episode
12. Check if playback resumes after refresh
13. Convert observations into generic architecture improvements
```

## Important Legal Boundary

Only use observations that are visible through normal browser behavior and do not bypass access controls. Do not use the system to distribute unauthorized copyrighted content.
