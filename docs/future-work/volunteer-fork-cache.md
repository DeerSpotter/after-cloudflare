# Volunteer Fork Based Static Mirrors for Flareless

## Bottom line

A volunteer fork mirror system for a **public static site** is technically feasible on today’s GitHub stack, but only if Flareless treats supporter mirrors as **distribution endpoints, not trust anchors**. GitHub Pages can publish project sites directly from repositories, including forks, and GitHub exposes APIs to create forks, configure Pages, inspect Pages URLs, and inspect build and deployment status. That makes “supporter fork + GitHub Pages = potential mirror” realistic for static HTML, CSS, JS, images, fonts, and other immutable assets. It is **not** a fit for server-rendered apps, authenticated sessions, or any feature that depends on origin-side logic, because GitHub Pages is a static host and does not support server-side languages. citeturn1view1turn4view0turn28view0turn4view1

The most practical architecture is **TUF-inspired but lighter weight**: the origin publishes a signed asset manifest and a signed mirror registry; clients verify signatures, version, expiration, and per-file hashes; mirrors are only accepted if they serve bytes that match the official signed manifest. In other words, the origin remains authoritative, and mirrors only contribute availability. This is exactly the kind of threat model where signed metadata, expiry, version checks, and rollback resistance matter. citeturn8view2turn8view6turn19view0turn19view3turn19view4

The biggest non-obvious constraint is **bootstrap**. If the primary host is down, a brand-new user still needs _some_ trusted bootstrap path: a previously installed same-origin service worker can help returning users, but service workers are same-origin objects that must be registered over HTTPS, so they cannot rescue first-time visitors who never loaded the site before. Flareless therefore needs at least one independent recovery URL or recovery app, and should treat device-to-device cache sharing as optional rather than foundational. citeturn8view0turn8view1turn18view0

My final recommendation is to build this as an **experimental optional mode first**, not a core default transport. The runtime failover and signed verification model are solid and worth shipping; the onboarding and registry automation should start simple and manual, then add a minimal GitHub App backend only if the project wants one-click mirror creation later. citeturn21view0turn28view0turn30view0turn30view2

## Feasibility and the recommended architecture

GitHub Pages is purpose-built to host static sites from repositories, including project sites at `https://<owner>.github.io/<repositoryname>`. Forks are independent repositories that preserve upstream relationship metadata, which is exactly what Flareless wants for volunteer mirrors: supporters can own their own copy, Pages can publish it, and the upstream project can still discover it through GitHub’s fork network and APIs. GitHub Pages is available for public repositories on GitHub Free, and project Pages sites are first-class supported behavior. citeturn3view2turn4view0turn3view0

The key design decision is **how failover happens**. The strongest practical design is not “load random cross-origin assets into the broken canonical origin.” Instead, it is “use a trusted recovery loader to select a verified mirror, then **top-level navigate** the user to that mirror origin.” That avoids a large class of same-origin and service-worker problems. Service workers can only be registered when the script URL and scope are same-origin with the registering page, and cross-origin subresource integrity also requires CORS support from the serving origin. A top-level navigation model is much simpler and more robust than piecemeal cross-origin asset substitution. citeturn18view0turn17view0turn17view1

That leads to the following practical architecture.

```text
[Official build pipeline]
        |
        |-- build static site
        |-- hash every file
        |-- generate signed manifest.flareless.json
        |-- generate signed mirrors.json
        v
[Official endpoints]
  - Primary CDN
  - Secondary CDN
  - Official GitHub Pages / recovery site
        |
        v
[Client recovery loader]
  - embedded root public key
  - fetch signed manifest + signed mirror registry
  - verify signatures, expiry, version
  - probe candidates in order
  - choose first healthy verified route
        |
        +--> serve from official endpoint if healthy
        |
        +--> redirect to verified volunteer mirror origin
        |
        +--> optional device mesh only if separately signaled
```

The site itself should be built as a **portable static app**: relative asset paths, no hard-coded canonical asset host, no mirror-hostile absolute service-worker assumptions, and no origin-locked APIs unless there is a canonical-only degraded mode. This recommendation follows from GitHub Pages project-site URL structure and service-worker scope rules: every volunteer mirror will be at a different origin, typically under `/<repositoryname>`. citeturn4view0turn18view0

A subtle but important operational detail is that if you plan to let mirrors carry unique repository names, the chosen repository name should be treated as stable. GitHub documents that renaming a repository redirects most repository resources, **but not project site URLs**, and specifically recommends a custom domain if you want a Pages URL not to change during renames. For volunteer mirrors, that is a strong argument either for a stable repo name from the start or for using a separate `mirror_id` that is distinct from the repository name. citeturn33view0turn3view1

## Bootstrap and failover behavior

The bootstrap problem is the hard boundary between “interesting demo” and “actual resilience.” A returning user who already visited the site can benefit from a service worker and device-local cache; MDN explicitly describes service workers as acting like a proxy and enabling offline-first behavior by serving cached assets when the network is unavailable. But that same mechanism only works after prior installation on the same origin, and service-worker registration requires HTTPS and same-origin script URLs. As a result, **existing users** can sometimes recover via cache alone, while **new users** still need a reachable bootstrap endpoint somewhere else. citeturn8view0turn8view1turn18view0

For Flareless, the practical bootstrap stack should be:

- a normal canonical site with a cached recovery shell for returning users,
- an **independent recovery URL** controlled by the project,
- an official GitHub Pages recovery site or other static fallback on a different delivery path,
- optional bookmarklet or browser extension for power users,
- optional device mesh only after there is already a trusted bootstrap and discovery path. citeturn8view0turn18view0turn20search2turn20search3

The routing order I would implement is this:

```text
1. Primary CDN
2. Secondary CDN
3. Official GitHub Pages recovery site
4. Verified volunteer fork mirrors
5. Device cache mesh, only if coordinator/signaling exists
6. Direct origin fallback, only if policy explicitly allows it
```

The logic behind that order is straightforward. Official endpoints should be preferred because they are operator-controlled. Verified volunteer mirrors come after official recovery because they improve availability but are still untrusted hosts. Device mesh comes later because WebRTC data channels can move arbitrary peer-to-peer data, but peer discovery and signaling are separate problems and should not be required for the first working version. citeturn20search0turn20search2turn20search3

I would also make the health model explicit:

- mark a route unhealthy on timeout, network error, `429`, or repeated hash mismatch,
- skip unhealthy routes until a backoff window expires,
- permanently reject a mirror for the current registry version if the manifest or asset hashes fail verification,
- require an exact manifest version match for volunteer mirrors,
- allow stale-but-signed content only for an explicitly designed offline mode shown to previously cached users. citeturn1view0turn11search2turn8view2turn19view4

Example failover pseudocode:

```js
async function resolveFlarelessRoute(path) {
  const bootstrap = await getTrustedBootstrap(); // cached SW or recovery host
  const manifest = await fetchAndVerifyManifest(bootstrap);
  const registry = await fetchAndVerifyMirrorRegistry(bootstrap);

  const candidates = [
    primaryCdnUrl(path),
    secondaryCdnUrl(path),
    officialPagesUrl(path),
    ...registry.mirrors
      .filter(m => m.status === "active" && m.manifest_version === manifest.version)
      .map(m => joinUrl(m.url, path)),
    ...(deviceMeshAvailable() ? [meshUrl(path)] : []),
    ...(allowOriginFallback ? [originUrl(path)] : []),
  ];

  for (const url of candidates) {
    if (isTemporarilyUnhealthy(url)) continue;

    try {
      const res = await fetchWithTimeout(url, 5000);
      if (!res.ok) throw new Error(`bad-status:${res.status}`);

      const bytes = await res.arrayBuffer();
      const expected = manifest.targets[path];
      if (!expected) throw new Error("path-not-in-manifest");

      const actual = await sha256(bytes);
      if (actual !== expected.sha256) throw new Error("hash-mismatch");

      markHealthy(url);
      return new Response(bytes, { headers: { "Content-Type": expected.content_type } });
    } catch (err) {
      markUnhealthy(url, err.message);
    }
  }

  throw new Error("No verified route available");
}
```

For volunteer mirrors specifically, I would use this pseudocode at **recovery-loader time** to select a mirror, then **navigate** to the mirror origin for full-site rendering, instead of trying to keep substituting cross-origin assets forever. That is the cleaner operational model. citeturn17view0turn18view0

## Mirror creation and discovery

The supporter flow is easiest to understand if you separate **runtime discovery** from **mirror onboarding**.

At runtime, Flareless should prefer a **signed static mirror registry** over live GitHub API discovery. GitHub’s REST API can be called cross-origin from a browser, and the public `List forks` and Pages endpoints are available for public data, but the fork listing is paginated with a maximum of 100 results per page and unauthenticated REST use is only 60 requests per hour per IP. That makes browser-side fork discovery brittle for production failover, especially if the project becomes popular. A precomputed signed `mirrors.json` is much more dependable. citeturn6view1turn1view2turn15view0turn15view1

For onboarding, I would rank the options this way.

The **best MVP** is: user clicks **Help cache this site**, the UI explains the flow, the user forks manually through GitHub, enables Pages, and then registers the mirror through an issue form or issue comment. GitHub Actions in the main repo can parse the registration, verify the mirror, and open or update a pull request that changes `public/mirrors.json`. This keeps the control plane almost entirely static and avoids introducing a secret-bearing backend too early. GitHub supports issue comments through the REST API, and workflows can run on `issue_comment` events from the default branch. citeturn16view0turn23view0

The **best automated future flow** is a very small GitHub App service. GitHub’s REST API can create forks, including with a new `name`, and can create or update GitHub Pages for the resulting repository. GitHub also has repository `fork` webhooks and `page_build` webhooks that can drive automation. But this path **requires a backend** because GitHub’s token flows still require a client secret, and GitHub explicitly warns that web applications should not leak that secret. A purely static site can read public GitHub data cross-origin, but it cannot safely do one-click authenticated writes to a user’s account without a server-held secret. citeturn21view0turn28view0turn26view0turn27view1turn30view0turn30view2

That distinction matters for the supporter story:

### Recommended supporter workflow

1. The user clicks **Help cache this site** on the Flareless demo page.
2. The page generates a **mirror identity** for UI purposes, such as `mirror_id = flr-20260528-ab12cd`.
3. The page opens the upstream repo’s **Fork** action or a prebuilt instructions page.
4. The user enables GitHub Pages on the fork, ideally using the same Pages workflow shipped by upstream.
5. The user returns and submits the fork URL.
6. Flareless verifies it and, if valid, publishes the mirror into the signed registry. citeturn3view0turn28view0turn16view0turn23view0

If the project later wants a generated _repository_ name as well as a generated mirror ID, GitHub’s fork API supports a `name` parameter for the fork, so that can be automated once a GitHub App exists. Until then, I would keep `mirror_id` and repo name separate. GitHub repository names are capped at 100 characters, and repo renames do not preserve project Pages URLs. citeturn21view0turn3view1turn33view0

### Discovery options compared

A **signed `mirrors.json` in the main repo** is the best runtime discovery mechanism because it is cheap to fetch, cacheable, easy to version, and easy to sign. A **GitHub API-based crawler** is useful for maintainer-side enrichment and verification, not for end-user failover selection. A **GitHub Actions workflow** can keep the registry fresh using `issue_comment`, `fork`, `page_build`, `repository_dispatch`, and scheduled checks. A **PR-based registration** also works, but it needs tighter workflow security because pull requests from forks are a sensitive area in GitHub Actions. DNS-based mirror lists are possible in theory, but I would keep them out of MVP because the rest of the system already has a simpler signed-static-files control plane. citeturn23view0turn26view0turn27view0turn16view2turn24view1

## Integrity and the security model

The correct trust statement for Flareless is:

> **Mirrors are never trusted because they are mirrors. They are trusted only when they serve bytes that match the current official signed manifest.**

That model should be enforced mechanically. The official build pipeline should hash every asset, generate a canonical JSON payload, sign it, and publish it with the site. The client should pin a root public key, verify the signature, verify expiration, compare version numbers against the highest version it has previously trusted, and then verify every fetched file by hash. This is exactly the pattern TUF uses to defend against rollback, freeze, fast-forward, and mix-and-match attacks. citeturn8view2turn8view6turn19view0turn19view3turn19view4

For the JSON format itself, I recommend using a deterministic serialization scheme before signing. RFC 8785 defines the JSON Canonicalization Scheme specifically so JSON can be transformed into a stable, hashable byte representation suitable for cryptographic operations. For signatures, Ed25519 is a good fit: the EdDSA specification documents it, and MDN documents `SubtleCrypto.verify()` with `Ed25519` among the supported algorithms. citeturn9search0turn9search1turn8view5

The minimum viable security features should be:

- **Signed manifest** with file hashes and sizes.
- **Signed mirror registry** with active/revoked state.
- **Version pinning** and “highest seen” persistence.
- **Expiration timestamps** on both manifest and mirror registry.
- **Revocation support** for mirrors and signing keys.
- **Rejection logging** for hash mismatch, expiry, stale version, or signature failure. citeturn19view3turn19view4turn8view6

A full TUF deployment would use separate root, timestamp, snapshot, and targets roles. I would not require that on day one. For Flareless, a **TUF-lite** model is the best tradeoff:

- an **offline root key** pinned in clients,
- an **online signing key** in a sign-only vault or other protected signer for the current manifest and mirror registry,
- short expirations,
- strict monotonic version checks,
- documented key rotation and emergency revocation. citeturn31view0turn8view6turn19view3turn19view4

GitHub’s own guidance supports strong key hygiene. GitHub App private keys are described as the single most valuable secret for an app; GitHub recommends vault storage and even sign-only handling so the raw key cannot be read back. That same discipline should be applied to the Flareless manifest signer, whether or not the project uses a GitHub App. citeturn31view0

One thing I would **explicitly avoid** is letting the site register or run arbitrary service-worker code from supporter-provided URLs. MDN warns that registering service workers from untrusted URLs is a serious XSS and request-interception risk, and registration also requires same-origin anyway. Flareless should verify content, not execute mirror-controlled bootstrap logic. citeturn18view0

I would also avoid volunteer custom domains in the first release. GitHub specifically recommends custom-domain verification to prevent takeover attacks, and custom domain ownership adds operational complexity that is not needed for a mirror. The safest first version uses the default `github.io` Pages URLs for volunteer mirrors. citeturn1view7turn32search1

### Example signed manifest

The exact schema can evolve, but this is the shape I would use:

```json
{
  "signed": {
    "_type": "flareless-targets/v1",
    "site": "flareless-demo",
    "version": 12,
    "generated_at": "2026-05-28T16:00:00Z",
    "expires": "2026-06-04T16:00:00Z",
    "root_key_id": "ed25519:root-2026-01",
    "targets": {
      "/index.html": {
        "sha256": "3f6b...d1",
        "bytes": 18437,
        "content_type": "text/html; charset=utf-8"
      },
      "/assets/app.7d0d4d.js": {
        "sha256": "8c84...9a",
        "bytes": 58192,
        "content_type": "application/javascript"
      },
      "/assets/app.2f0b77.css": {
        "sha256": "fa11...13",
        "bytes": 8123,
        "content_type": "text/css"
      }
    }
  },
  "signatures": [
    {
      "keyid": "ed25519:targets-2026-01",
      "sig": "base64url-detached-signature"
    }
  ]
}
```

### Example signed mirror registry

```json
{
  "signed": {
    "_type": "flareless-mirrors/v1",
    "site": "flareless-demo",
    "version": 9,
    "generated_at": "2026-05-28T16:05:00Z",
    "expires": "2026-06-01T16:05:00Z",
    "mirrors": [
      {
        "mirror_id": "gh:alice/flareless-cache-ab12cd",
        "url": "https://alice.github.io/flareless-cache-ab12cd/",
        "kind": "github-pages-project",
        "manifest_version": 12,
        "registered_at": "2026-05-28T15:58:00Z",
        "status": "active"
      }
    ],
    "revoked_mirrors": [
      "gh:bob/flareless-cache-old1"
    ]
  },
  "signatures": [
    {
      "keyid": "ed25519:registry-2026-01",
      "sig": "base64url-detached-signature"
    }
  ]
}
```

## GitHub Pages realities and the operational constraints that matter

There are real GitHub Pages limits here, and Flareless should design around them rather than hand-wave them away. GitHub documents a **1 GB published site size limit**, a **10 minute deployment timeout**, and a **soft bandwidth limit of 100 GB per month** per Pages site. GitHub also says Pages may not be appropriate for some high-bandwidth uses. That means fork mirrors are a credible resilience layer for medium-size public static sites, but they are not a free infinite CDN. citeturn1view0turn11search1

Repository shape matters too. GitHub recommends small objects in Git repositories and enforces a 100 MB single-object ceiling; it also recommends a 1 GB source-repository limit for Pages. If Flareless wants volunteer fork mirrors to work smoothly, the mirrorable site should keep giant binaries, videos, and other bulky assets out of Git where possible. citeturn1view0turn1view5

The best Pages publishing mode for this project is a **custom GitHub Actions workflow**, not a simple branch build. GitHub Pages documents that the 10-builds-per-hour soft limit does **not** apply when you build and publish with a custom Pages workflow, and GitHub also documents a common trap: commits pushed by a workflow using `GITHUB_TOKEN` do not trigger a branch-based Pages build. That makes the workflow-based Pages path the cleaner and less surprising standard for official and volunteer mirrors alike. Public-repo Actions usage for Pages is also free. citeturn1view0turn3view0turn4view1

Registry automation on GitHub Actions is feasible, but it also has limits. Scheduled workflows can run as often as every five minutes, but GitHub warns that scheduled workflows can be delayed around periods of high load, especially at the start of the hour, and public-repository scheduled workflows are automatically disabled after 60 days without repository activity. That means health checks are fine as a convenience layer, but they should not be your only source of truth. Signed registry files and last-known-good client cache still matter. citeturn23view3

GitHub’s APIs are helpful, but they should be used in the right place. `List forks` is paginated and capped at 100 results per page, public unauthenticated REST use is 60 requests per hour per IP, authenticated user and app flows are higher, and GitHub also enforces secondary rate limits. That makes the API a good **maintainer-side** discovery mechanism and a weak **client-side** failover mechanism. citeturn1view2turn15view0turn15view3turn6view2

Workflow security deserves special care. GitHub explicitly warns that `pull_request_target` runs in the context of the trusted base branch and can run regardless of fork-approval settings, while workflows from public forks can otherwise require approval. GitHub also recommends least privilege for `GITHUB_TOKEN`, pinning third-party actions to a full commit SHA, and using CODEOWNERS to monitor changes to workflow files. For Flareless, that means registry verification workflows should parse **data only**, avoid checking out or executing untrusted fork code, and pin all reused actions to immutable SHAs. citeturn24view1turn24view0turn25view0turn25view2

One area that remains incomplete in the public GitHub Pages documentation reviewed here is **arbitrary response-header control on github.com-hosted Pages**. GitHub Enterprise Server explicitly documents configurable Pages response headers, but that does not establish equivalent header control for public GitHub Pages. Because of that uncertainty, I would not make the Flareless architecture depend on custom mirror response headers for CORS or cache behavior; use content hashing, signed manifests, and top-level mirror navigation instead. citeturn34search5turn34search8turn17view1

## Implementation roadmap, repo changes, demo design, and the final recommendation

### Recommended technical design

The design I would actually build is:

1. **Portable static build** with relative asset paths and a mirror-safe base path.
2. **Recovery loader** with a pinned root public key.
3. **Signed manifest** and **signed mirror registry** generated at build or release time.
4. **Official recovery endpoints** hosted separately from the primary CDN.
5. **Volunteer mirrors on GitHub Pages** serving the same static build.
6. **Client-side verification** of signature, version, expiry, and file hashes.
7. **Top-level redirect to a verified mirror** when official endpoints fail.
8. **Optional WebRTC/device mesh** only after the rest works and only with separate signaling. citeturn4view0turn18view0turn20search2turn20search3turn8view2

### Minimal viable implementation plan

**Phase 1** should be a local static mirror simulation. Build the site twice under two origins, generate a signed manifest, and prove that the recovery loader can verify the mirror bytes before rendering. This validates the security model before any GitHub-specific work.

**Phase 2** should be manual fork registration. Add a “Help cache this site” UI, publish instructions, and accept mirror registrations through an issue form or issue comment. Let GitHub Actions verify and update a static registry from the main repo. That keeps the system nearly backendless while avoiding unsafe browser auth hacks. citeturn16view0turn23view0turn30view2

**Phase 3** should add signed manifest and hash verification everywhere. This is the point where mirrors stop being “just copies” and become verified caches.

**Phase 4** should add automatic mirror health checks. Use scheduled Actions plus the Pages API and HTTP probes, but keep the signed registry authoritative. Avoid top-of-hour schedules and assume some delay or occasional gaps. citeturn14view0turn14view1turn23view3

**Phase 5** should add GitHub Actions registry updates. Trigger on issue comments, manual dispatch, and maintainer-approved changes. If you later add a GitHub App backend, also use `fork` and `page_build` events for smoother automation. citeturn26view0turn27view1turn16view2

**Phase 6** should add the Flareless demo experience: route health panel, mirror registration simulation, signed-asset badges, rejected-mirror view, and failover animation.

**Phase 7** should make device cache mesh optional. WebRTC data channels can carry arbitrary peer-to-peer data, but they still need signaling and NAT traversal orchestration, so they belong after the GitHub Pages mirror path is already working. citeturn20search0turn20search2turn20search3

### Repo files to add

I would add these files or directories to the Flareless repo:

- `docs/volunteer-fork-cache.md`
- `docs/device-cache-mesh.md`
- `docs/security-model.md`
- `public/manifest.flareless.json`
- `public/mirrors.json`
- `public/recovery/index.html`
- `src/recovery/recovery-loader.ts`
- `src/recovery/verify-manifest.ts`
- `src/recovery/select-route.ts`
- `scripts/build-manifest.mjs`
- `scripts/sign-manifest.mjs`
- `scripts/verify-mirror.mjs`
- `scripts/update-mirror-registry.mjs`
- `.github/workflows/update-mirrors.yml`
- `.github/workflows/verify-registration.yml`
- `.github/workflows/health-checks.yml`
- `tests/mirror-verification.test.mjs`
- `tests/failover-order.test.mjs`

The repository should also lock down sensitive paths with CODEOWNERS and treat workflow files as high-risk configuration, consistent with GitHub’s workflow security guidance. citeturn25view2

### Demo design for the Flareless page

The demo should show the mechanism honestly and visually:

- a **Help cache this site** panel with a generated example mirror identity,
- a **manual registration simulation** that shows the GitHub fork and Pages steps,
- a **route health panel** listing primary CDN, secondary CDN, official Pages, volunteer mirrors, and mesh,
- a **hash verified** badge next to served assets,
- a **rejected mirror** example that demonstrates a hash mismatch,
- a **failover animation** that shows official endpoints failing and a verified mirror taking over,
- a **returning user / new user** distinction so the bootstrap problem is understandable. citeturn8view0turn18view0turn8view2

### Honest wording and what not to overclaim

Safe wording would be along these lines:

> “Flareless can use verified volunteer GitHub Pages mirrors to improve availability for public static sites. Mirrors are not trusted by default; they are only used when they match the official signed manifest.” citeturn1view1turn8view2

> “Returning visitors may recover through cached recovery assets; first-time visitors still need at least one reachable bootstrap endpoint.” citeturn8view0turn18view0

> “This is an availability layer for static content, not a replacement for dynamic origin infrastructure.” citeturn4view1

I would avoid claims like:

- “This makes the site unstoppable.”
- “No backend is required at all.”
- “Any supporter fork can automatically keep the site online.”
- “This is decentralized hosting.”
- “GitHub Pages becomes a peer-to-peer mesh.”

Those statements overclaim. The accurate version is that Pages mirrors can improve resilience, but only within GitHub’s bandwidth/build limits, only for static assets, only with a trusted bootstrap path, and only with strong signed-manifest verification. citeturn1view0turn11search1turn30view2turn8view2

### Open questions and limitations

Two issues deserve explicit follow-up. First, the reviewed public GitHub documentation does not clearly document arbitrary response-header control for github.com-hosted Pages, so the design should continue to avoid dependence on custom Pages headers. Second, if Flareless eventually wants fully automated one-click mirror onboarding, it will need to decide whether introducing a minimal GitHub App service is worth the operational and key-management burden. GitHub’s auth flows and app-key handling requirements make that a real architecture choice, not just a UI choice. citeturn34search5turn34search8turn30view0turn31view0

### Final recommendation

This should become an **experimental optional Flareless feature**, not a core default mode yet. The right first release is a **GitHub Pages mirror mode with signed manifests, a signed mirror registry, a recovery loader, and manual registration**. If users respond well and the operational burden remains low, Flareless can add a minimal GitHub App backend later for one-click fork creation and Pages enrollment. What should become core over time is the **verification model** and **failover orchestration**. What should remain optional, at least initially, is the volunteer mirror network itself and any device-cache mesh on top of it. citeturn21view0turn28view0turn30view2turn8view2