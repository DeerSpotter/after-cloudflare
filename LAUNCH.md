# Launch Plan

This project needs attention from edge engineers, distributed systems engineers, CDN engineers, WebRTC engineers, browser networking engineers, and open source contributors who care about a resilient internet.

## Positioning

Flareless is not a complaint project.

It is a build.

The message is simple:

```text
For the engineers who built the edge, carried the pager, solved the incidents, and still believe the internet should be fast, resilient, programmable, and provider neutral.
```

## Target contributors

1. Former CDN and edge platform engineers.
2. Cloudflare alumni.
3. Fastly, Akamai, CloudFront, Netlify, Vercel, and Fly.io adjacent engineers.
4. WebRTC and peer to peer networking engineers.
5. Browser media and streaming engineers.
6. Open source infrastructure contributors.
7. People who care about avoiding single provider dependency.

## Best launch surfaces

1. GitHub README.
2. Hacker News Show HN.
3. Reddit open source and self hosted communities.
4. LinkedIn posts aimed at infrastructure engineers.
5. X posts aimed at edge and CDN engineers.
6. Discord and Matrix communities focused on open source infrastructure.
7. GitHub topics and issue labels.

## Launch post angle

Use builder language, not revenge language.

Good angle:

```text
Flareless is an open source edge router and runtime for programmable request handling, multi CDN failover, peer assisted fallback, and provider neutral traffic control.

It is built for engineers who still believe the internet should route around failure instead of depending on one company to stay perfect forever.
```

Avoid:

```text
This is just anti Cloudflare.
```

Use:

```text
This is pro resilient internet.
```

## First attention goal

The first goal is not stars.

The first goal is getting three serious contributors to open useful issues or pull requests.

Useful early contributors can help with:

1. Route decision reason codes.
2. Provider config examples.
3. Manifest schema.
4. WebRTC transport design.
5. Health check structure.
6. Simulation scenarios.

## GitHub setup checklist

1. Add project topics:

```text
edge-runtime
edge-computing
cdn
multi-cdn
reverse-proxy
serverless
workers
webrtc
p2p
resilient-internet
cloudflare-workers
open-source
```

2. Pin the best first issues.
3. Keep README short enough to understand quickly.
4. Make QUICKSTART visible.
5. Keep CI passing.
6. Add screenshots or terminal output after the first demo is ready.

## Suggested short post

```text
I started Flareless, an open source edge router and runtime for programmable request handling, multi CDN failover, and provider neutral traffic control.

The idea is simple: the internet should route around failure instead of depending on one provider to stay perfect forever.

Looking for edge, CDN, WebRTC, distributed systems, and open source infrastructure engineers who want to help turn this into something real.
```

## Suggested direct outreach

```text
I started an open source project called Flareless. It is a provider neutral edge routing and runtime project focused on multi CDN failover, programmable request handling, signed manifests, and peer assisted fallback.

I am looking for people with edge, CDN, WebRTC, or distributed systems experience who want to help shape the architecture before it gets too far along.

The repo is public and already has a quickstart, roadmap, architecture notes, security notes, and starter issues.
```

## First week plan

Day 1:

1. Add GitHub topics.
2. Pin starter issues.
3. Share on LinkedIn.
4. Share in one open source community.

Day 2:

1. Post a short technical thread explaining why single edge dependency is fragile.
2. Link to ARCHITECTURE.md.
3. Ask for design criticism, not stars.

Day 3:

1. Share the simulator angle.
2. Ask for WebRTC and streaming feedback.
3. Point people to issues 7 and 12.

Day 4:

1. Share the manifest and content trust angle.
2. Point people to issues 5 and 9.

Day 5:

1. Share the route decision angle.
2. Point people to issues 4 and 11.

Day 6:

1. Summarize feedback.
2. Open new issues from real comments.
3. Thank contributors publicly.

Day 7:

1. Post progress.
2. Show commits and open work.
3. Ask for one narrow contribution.

## What success looks like

1. People understand the mission in under thirty seconds.
2. Contributors know where to start.
3. The first outside pull request is small and mergeable.
4. Technical criticism becomes issues.
5. The project stays builder focused.
