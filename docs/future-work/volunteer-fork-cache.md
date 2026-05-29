# Volunteer Fork Based Static Mirrors for Flareless

## Bottom line

A volunteer fork mirror system for a public static site is technically feasible on today’s GitHub stack, but only if Flareless treats supporter mirrors as distribution endpoints, not trust anchors. GitHub Pages can publish project sites directly from repositories, including forks, and GitHub exposes APIs to create forks, configure Pages, inspect Pages URLs, and inspect build and deployment status. That makes supporter fork plus GitHub Pages a realistic potential mirror model for static HTML, CSS, JavaScript, images, fonts, and other immutable public assets. It is not a fit for server rendered apps, authenticated sessions, or features that depend on origin side logic, because GitHub Pages is a static host.[^github-pages][^github-pages-api][^github-create-fork]

The most practical architecture is TUF inspired but lighter weight: the origin publishes a signed asset manifest and a signed mirror registry; clients verify signatures, version, expiration, and per file hashes; mirrors are only accepted if they serve bytes that match the official signed manifest. The origin remains authoritative, and mirrors only contribute availability.[^tuf][^rfc8785][^rfc8032]

The biggest non obvious constraint is bootstrap. If the primary host is down, a brand new user still needs some trusted bootstrap path. A previously installed same origin service worker can help returning users, but service workers are same origin objects that must be registered over HTTPS, so they cannot rescue first time visitors who never loaded the site before. Flareless therefore needs at least one independent recovery URL or recovery app, and should treat device to device cache sharing as optional rather than foundational.[^service-workers][^service-worker-register]

Final recommendation: build this as an experimental optional mode first, not a core default transport. The runtime failover and signed verification model are solid and worth shipping. The onboarding and registry automation should start simple and manual, then add a minimal GitHub App backend only if the project wants one click mirror creation later.[^github-app-auth][^github-oauth]

## Feasibility and recommended architecture

GitHub Pages is purpose built to host static sites from repositories, including project sites at `https://<owner>.github.io/<repositoryname>`. Forks are independent repositories that preserve upstream relationship metadata, which is useful for volunteer mirrors because supporters can own their own copy, Pages can publish it, and the upstream project can still discover it through GitHub’s fork network and APIs.[^github-pages][^github-list-forks]

The strongest practical design is not to load random cross origin assets into the broken canonical origin. The better design is to use a trusted recovery loader to select a verified mirror, then top level navigate the user to that mirror origin. That avoids a large class of same origin, service worker, Subresource Integrity, and CORS problems.[^service-worker-register][^sri][^cors]

```text
[Official build pipeline]
        |
        | build static site
        | hash every file
        | generate signed manifest.flareless.json
        | generate signed mirrors.json
        v
[Official endpoints]
  * Primary CDN
  * Secondary CDN
  * Official GitHub Pages recovery site
        |
        v
[Client recovery loader]
  * embedded root public key
  * fetch signed manifest and signed mirror registry
  * verify signatures, expiry, and version
  * probe candidates in order
  * choose first healthy verified route
        |
        +--> serve from official endpoint if healthy
        |
        +--> redirect to verified volunteer mirror origin
        |
        +--> optional device mesh only if separately signaled
```

The site should be built as a portable static app: relative asset paths, no hard coded canonical asset host, no mirror hostile absolute service worker assumptions, and no origin locked APIs unless there is a canonical only degraded mode. Every volunteer mirror will be at a different origin, typically under `/<repositoryname>`.[^github-pages][^service-worker-register]

If mirrors carry unique repository names, the chosen repository name should be treated as stable. GitHub documents that renaming a repository redirects many repository resources, but project Pages URLs are a special operational concern. For volunteer mirrors, use a stable repository name or use a separate `mirror_id` that is distinct from the repository name.[^github-rename-repo][^github-custom-domain]

## Bootstrap and failover behavior

A returning user who already visited the site can benefit from a service worker and device local cache. A first time user still needs a reachable bootstrap endpoint somewhere else.[^service-workers][^service-worker-register]

Recommended bootstrap stack:

* A normal canonical site with a cached recovery shell for returning users.
* An independent recovery URL controlled by the project.
* An official GitHub Pages recovery site or other static fallback on a different delivery path.
* Optional bookmarklet or browser extension for power users.
* Optional device mesh only after there is already a trusted bootstrap and discovery path.

Recommended routing order:

```text
1. Primary CDN
2. Secondary CDN
3. Official GitHub Pages recovery site
4. Verified volunteer fork mirrors
5. Device cache mesh, only if coordinator or signaling exists
6. Direct origin fallback, only if policy explicitly allows it
```

Official endpoints should be preferred because they are operator controlled. Verified volunteer mirrors come after official recovery because they improve availability but are still untrusted hosts. Device mesh comes later because WebRTC data channels can move peer to peer data, but peer discovery and signaling are separate problems and should not be required for the first working version.[^webrtc-datachannel][^webrtc-signaling]

Health rules:

* Mark a route unhealthy on timeout, network error, `429`, or repeated hash mismatch.
* Skip unhealthy routes until a backoff window expires.
* Reject a mirror for the current registry version if the manifest or asset hashes fail verification.
* Require an exact manifest version match for volunteer mirrors.
* Allow stale but signed content only for a deliberate offline mode shown to previously cached users.

## Failover pseudocode

```js
async function resolveFlarelessRoute(path) {
  const bootstrap = await getTrustedBootstrap();
  const manifest = await fetchAndVerifyManifest(bootstrap);
  const registry = await fetchAndVerifyMirrorRegistry(bootstrap);

  const candidates = [
    primaryCdnUrl(path),
    secondaryCdnUrl(path),
    officialPagesUrl(path),
    ...registry.mirrors
      .filter((mirror) => mirror.status === "active")
      .filter((mirror) => mirror.manifest_version === manifest.version)
      .map((mirror) => joinUrl(mirror.url, path)),
    ...(deviceMeshAvailable() ? [meshUrl(path)] : []),
    ...(allowOriginFallback ? [originUrl(path)] : [])
  ];

  for (const url of candidates) {
    if (isTemporarilyUnhealthy(url)) {
      continue;
    }

    try {
      const response = await fetchWithTimeout(url, 5000);

      if (!response.ok) {
        throw new Error(`bad-status:${response.status}`);
      }

      const bytes = await response.arrayBuffer();
      const expected = manifest.targets[path];

      if (!expected) {
        throw new Error("path-not-in-manifest");
      }

      const actual = await sha256(bytes);

      if (actual !== expected.sha256) {
        throw new Error("hash-mismatch");
      }

      markHealthy(url);
      return new Response(bytes, {
        headers: {
          "Content-Type": expected.content_type
        }
      });
    } catch (error) {
      markUnhealthy(url, error.message);
    }
  }

  throw new Error("No verified route available");
}
```

For volunteer mirrors, use this logic at recovery loader time to select a mirror, then navigate to the mirror origin for full site rendering instead of trying to keep substituting cross origin assets forever.

## Mirror creation and discovery

The supporter flow should separate runtime discovery from mirror onboarding.

At runtime, Flareless should prefer a signed static mirror registry over live GitHub API discovery. GitHub’s REST API is useful, but public unauthenticated API use is rate limited, fork listing is paginated, and live browser side discovery would be brittle for production failover. A precomputed signed `mirrors.json` is more dependable.[^github-list-forks][^github-rate-limits]

Best MVP flow:

1. User clicks `Help cache this site`.
2. The UI explains the fork and Pages setup.
3. The user forks manually through GitHub.
4. The user enables GitHub Pages on the fork.
5. The user registers the Pages URL through an issue form or issue comment.
6. GitHub Actions verifies the mirror.
7. A maintainer controlled workflow updates `public/mirrors.json`.
8. The mirror registry is signed.

GitHub supports issue comments through the REST API, and workflows can run on `issue_comment` events from the default branch.[^github-issue-comments][^github-actions-events]

Best future automated flow:

1. User clicks `Help cache this site`.
2. A GitHub App creates a fork with a generated name.
3. The GitHub App enables Pages.
4. The GitHub App registers the Pages URL.
5. Flareless verifies the mirror and updates the signed registry.

This requires a backend because browser only static pages should not hold write tokens or client secrets.[^github-create-fork][^github-pages-api][^github-app-auth][^github-oauth]

## Integrity and security model

Correct trust statement:

> Mirrors are never trusted because they are mirrors. They are trusted only when they serve bytes that match the current official signed manifest.

Minimum viable security features:

* Signed manifest with file hashes and sizes.
* Signed mirror registry with active and revoked state.
* Version pinning and highest seen persistence.
* Expiration timestamps on both manifest and mirror registry.
* Revocation support for mirrors and signing keys.
* Rejection reasons for hash mismatch, expiry, stale version, or signature failure.

The JSON should use deterministic serialization before signing. RFC 8785 defines JSON Canonicalization Scheme for stable cryptographic JSON serialization. Ed25519 is a good fit for signatures, and browser verification can use Web Crypto where supported.[^rfc8785][^rfc8032][^subtlecrypto]

A full TUF deployment uses separate roles for root, timestamp, snapshot, and targets. Flareless does not need full TUF on day one. A TUF lite model is enough for the first prototype:

* Offline root key pinned in clients.
* Online signing key for the current manifest and mirror registry.
* Short expirations.
* Strict monotonic version checks.
* Documented key rotation and emergency revocation.[^tuf]

Avoid letting the site register or run arbitrary service worker code from supporter provided URLs. Service workers are powerful request interceptors and must remain same origin and controlled by trusted project code.[^service-worker-register]

Avoid volunteer custom domains in the first release. Custom domain ownership adds takeover and verification risk that is not needed for the first mirror mode.[^github-custom-domain][^github-domain-verification]

## Example signed manifest

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

## Example signed mirror registry

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

## GitHub Pages realities and operational constraints

GitHub Pages has real limits. GitHub documents limits for site size, deployment time, and bandwidth guidance. That means fork mirrors are credible for medium size public static sites, but they are not a free infinite CDN.[^github-pages-limits]

Repository shape matters too. GitHub recommends keeping repositories and large files under documented limits. Mirrorable sites should avoid giant binaries, videos, and bulky generated assets inside Git where possible.[^github-large-files]

The cleanest Pages publishing mode is a custom GitHub Actions workflow. GitHub documents Pages deployment through Actions, and this is easier to standardize for official and volunteer mirrors than relying on branch based Pages behavior.[^github-pages-api][^github-pages-actions]

Registry automation through GitHub Actions is feasible, but scheduled workflows can be delayed or disabled after inactivity in public repositories. Health checks are useful, but signed registry files and last known good client cache still matter.[^github-schedule]

Workflow security matters. GitHub warns that `pull_request_target` runs in the trusted base context, and GitHub recommends least privilege for `GITHUB_TOKEN`. For Flareless, registry verification workflows should parse data only, avoid executing untrusted fork code, and pin reused actions where practical.[^github-pr-target][^github-token-permissions]

Do not depend on custom response headers from public GitHub Pages. GitHub Enterprise Server documents Pages response header customization, but public GitHub Pages does not clearly expose equivalent arbitrary header control. Use content hashing, signed manifests, and top level mirror navigation instead.[^github-enterprise-pages-headers]

## Implementation roadmap

### Phase 1: Local static mirror simulation

Build the site twice under two local origins, generate a signed manifest, and prove that the recovery loader can verify mirror bytes before rendering.

### Phase 2: Manual fork mirror registration

Add a `Help cache this site` UI, publish instructions, and accept mirror registrations through an issue form or issue comment.

### Phase 3: Signed manifest and hash verification

Add manifest generation, signing, verification helpers, and tests for valid and invalid mirror content.

### Phase 4: Automatic mirror health checks

Add scheduled Actions checks that probe each registered mirror and update health state through a maintainer controlled path.

### Phase 5: GitHub Actions registry update

Parse issue submissions, verify mirror URLs, and update `public/mirrors.json` through a reviewed workflow.

### Phase 6: Demo UI

Add route health, mirror registration simulation, signed asset badges, rejected mirror view, and failover animation.

### Phase 7: Optional device cache mesh integration

Add device mesh only after the GitHub Pages mirror path works and only with separate signaling.

## Recommended repo files

* `docs/future-work/volunteer-fork-cache.md`
* `docs/device-cache-mesh.md`
* `docs/security-model.md`
* `public/manifest.flareless.json`
* `public/mirrors.json`
* `public/recovery/index.html`
* `src/recovery/recovery-loader.js`
* `src/recovery/verify-manifest.js`
* `src/recovery/select-route.js`
* `scripts/build-manifest.mjs`
* `scripts/sign-manifest.mjs`
* `scripts/verify-mirror.mjs`
* `scripts/update-mirror-registry.mjs`
* `.github/workflows/update-mirrors.yml`
* `.github/workflows/verify-registration.yml`
* `.github/workflows/health-checks.yml`
* `tests/mirror-verification.test.mjs`
* `tests/failover-order.test.mjs`

## Demo design

The demo should show:

* `Help cache this site` panel.
* Generated example mirror identity.
* Manual registration simulation.
* Route health panel.
* Hash verified badge.
* Rejected mirror example.
* Failover animation.
* Returning user versus first time user explanation.

Suggested visible route labels:

```text
Primary CDN: timeout
Secondary CDN: 503
Official GitHub Pages: reachable
Volunteer mirror: verified
Rejected mirror: hash mismatch
Device mesh: not enabled
Origin fallback: blocked by policy
```

## Honest wording

Safe wording:

> Flareless can use verified volunteer GitHub Pages mirrors to improve availability for public static sites. Mirrors are not trusted by default; they are only used when they match the official signed manifest.

Safe wording:

> Returning visitors may recover through cached recovery assets; first time visitors still need at least one reachable bootstrap endpoint.

Safe wording:

> This is an availability layer for static content, not a replacement for dynamic origin infrastructure.

Avoid these claims:

* This makes the site unstoppable.
* No backend is required at all.
* Any supporter fork can automatically keep the site online.
* This is decentralized hosting.
* GitHub Pages becomes a peer to peer mesh.

## Final recommendation

This should become an experimental optional Flareless feature, not a core default mode yet. The right first release is GitHub Pages mirror mode with signed manifests, a signed mirror registry, a recovery loader, and manual registration. If users respond well and the operational burden remains low, Flareless can add a minimal GitHub App backend later for one click fork creation and Pages enrollment. What should become core over time is the verification model and failover orchestration. What should remain optional, at least initially, is the volunteer mirror network itself and any device cache mesh on top of it.

## References

[^github-pages]: GitHub Docs, About GitHub Pages. https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages

[^github-pages-api]: GitHub REST API Docs, Pages. https://docs.github.com/en/rest/pages

[^github-pages-actions]: GitHub Docs, Configuring a publishing source for your GitHub Pages site. https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site

[^github-pages-limits]: GitHub Docs, GitHub Pages limits. https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages

[^github-create-fork]: GitHub REST API Docs, Create a fork. https://docs.github.com/en/rest/repos/forks#create-a-fork

[^github-list-forks]: GitHub REST API Docs, List forks. https://docs.github.com/en/rest/repos/forks#list-forks

[^github-rate-limits]: GitHub REST API Docs, Rate limits for the REST API. https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api

[^github-issue-comments]: GitHub REST API Docs, Issue comments. https://docs.github.com/en/rest/issues/comments

[^github-actions-events]: GitHub Docs, Events that trigger workflows. https://docs.github.com/en/actions/reference/events-that-trigger-workflows

[^github-app-auth]: GitHub Docs, About authentication with a GitHub App. https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/about-authentication-with-a-github-app

[^github-oauth]: GitHub Docs, Authorizing OAuth apps. https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps

[^github-rename-repo]: GitHub Docs, Renaming a repository. https://docs.github.com/en/repositories/creating-and-managing-repositories/renaming-a-repository

[^github-custom-domain]: GitHub Docs, Managing a custom domain for your GitHub Pages site. https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site

[^github-domain-verification]: GitHub Docs, Verifying your custom domain for GitHub Pages. https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/verifying-your-custom-domain-for-github-pages

[^github-large-files]: GitHub Docs, About large files on GitHub. https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github

[^github-schedule]: GitHub Docs, Events that trigger workflows, schedule. https://docs.github.com/en/actions/reference/events-that-trigger-workflows

[^github-pr-target]: GitHub Docs, Events that trigger workflows, pull_request_target. https://docs.github.com/en/actions/reference/events-that-trigger-workflows

[^github-token-permissions]: GitHub Docs, Automatic token authentication. https://docs.github.com/en/actions/security-for-github-actions/security-guides/automatic-token-authentication

[^github-enterprise-pages-headers]: GitHub Enterprise Server Docs, Customizing HTTP response headers for GitHub Pages. https://docs.github.com/en/enterprise-server/admin/configuring-settings/configuring-github-pages-for-your-enterprise/configuring-http-response-headers-for-github-pages

[^service-workers]: MDN, Service Worker API. https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API

[^service-worker-register]: MDN, ServiceWorkerContainer.register(). https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerContainer/register

[^sri]: MDN, Subresource Integrity. https://developer.mozilla.org/en-US/docs/Web/Security/Subresource_Integrity

[^cors]: MDN, Cross Origin Resource Sharing. https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS

[^subtlecrypto]: MDN, SubtleCrypto.verify(). https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/verify

[^webrtc-datachannel]: MDN, RTCDataChannel. https://developer.mozilla.org/en-US/docs/Web/API/RTCDataChannel

[^webrtc-signaling]: MDN, WebRTC signaling and video calling. https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Signaling_and_video_calling

[^tuf]: The Update Framework, Specification. https://theupdateframework.github.io/specification/latest/

[^rfc8785]: RFC 8785, JSON Canonicalization Scheme. https://www.rfc-editor.org/rfc/rfc8785

[^rfc8032]: RFC 8032, Edwards Curve Digital Signature Algorithm. https://www.rfc-editor.org/rfc/rfc8032