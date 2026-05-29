# Volunteer Fork Cache

## Status

Future work. Experimental optional mode.

## Purpose

Volunteer Fork Cache is a proposed Flareless mode where supporters help keep a public static website available by forking the project, enabling GitHub Pages on their fork, and allowing that fork to act as a verified static mirror.

The core rule is simple:

> Mirrors are not trusted because they are mirrors. They are only used when they serve bytes that match the official signed Flareless manifest.

This makes supporter forks useful for availability without letting random forks become trust anchors.

## Bottom line

The idea is technically possible for public static websites.

GitHub forks can host static sites through GitHub Pages. That means a supporter fork can become a public static mirror of the project site. The mirror should not be used blindly. Flareless should verify the official signed manifest, check asset hashes, check the mirror registry, and reject any mirror that serves stale, tampered, or unlisted content.

This should not be described as unstoppable hosting or full decentralized hosting. It is better described as:

> A verified volunteer mirror layer for public static assets.

## Recommended architecture

```text
Official project repository
        |
        | build static site
        | generate asset hashes
        | sign manifest
        | sign mirror registry
        v
Official endpoints
        |
        | primary CDN
        | secondary CDN
        | official GitHub Pages recovery site
        v
Flareless recovery loader
        |
        | verify manifest signature
        | verify mirror registry signature
        | check version and expiration
        | probe routes
        v
Route choices
        |
        | primary CDN
        | secondary CDN
        | official GitHub Pages
        | verified volunteer fork mirrors
        | optional device cache mesh
        | origin fallback if policy allows
```

## Feasibility

This is realistic for:

* Public static HTML.
* CSS.
* JavaScript.
* SVG.
* Images.
* Static JSON.
* Documentation pages.
* Immutable chunks.
* Demo files.

This is not realistic for:

* Authenticated user specific pages.
* Server rendered application state.
* Private files.
* Secret protected assets.
* Anything that requires origin side logic.
* Anything that cannot be verified through a signed manifest and hash.

## Bootstrap problem

The main limitation is bootstrap.

If the primary host is down, a returning user may still have a cached service worker or cached recovery shell. That can help the user recover.

A brand new user still needs at least one reachable entry point.

Possible bootstrap paths:

* Cached service worker for returning users.
* Official GitHub Pages recovery URL.
* Backup static recovery URL.
* Browser bookmarklet for advanced users.
* Browser extension for advanced users.
* Separate coordinator or GitHub App in a later phase.

Safe wording:

> Returning visitors may recover through cached recovery assets. First time visitors still need at least one reachable bootstrap endpoint.

## Mirror creation flow

Recommended first version:

1. User clicks `Help cache this site`.
2. Flareless generates a mirror identity, such as `flr-20260528-ab12cd`.
3. User forks the repository.
4. User enables GitHub Pages on the fork.
5. User submits the fork Pages URL through an issue form or issue comment.
6. GitHub Actions verifies the submitted mirror.
7. If verification passes, the mirror is added to `public/mirrors.json`.
8. The mirror registry is signed.
9. Flareless can use that mirror during failure simulation or future runtime recovery.

Later version:

1. User clicks `Help cache this site`.
2. GitHub App creates a fork with a generated name.
3. GitHub App enables Pages.
4. GitHub App registers the Pages URL.
5. Flareless verifies the mirror and updates the signed registry.

The later version requires a real GitHub App or backend because browser only static pages should not hold write tokens or client secrets.

## Mirror discovery options

### Best first option

Use a signed static mirror registry:

`public/mirrors.json`

This should be the runtime source of truth.

### Good maintainer side options

* GitHub Actions verifies submitted mirror URLs.
* GitHub Actions checks mirror health on a schedule.
* Issue forms collect volunteer registrations.
* Pull requests can add verified mirror entries.
* GitHub API can enrich data but should not be required by the runtime path.

### Avoid in the first version

* Browser side live fork crawling.
* Depending on unauthenticated GitHub API calls during failover.
* Depending on volunteer custom domains.
* Executing service worker code from a volunteer mirror.

## Integrity model

The origin remains authoritative.

The mirror only provides bytes.

The manifest decides truth.

Minimum security requirements:

* Signed asset manifest.
* Signed mirror registry.
* SHA 256 hash for every file.
* File size for every file.
* Manifest version.
* Mirror registry version.
* Expiration timestamps.
* Revoked mirror list.
* Rejected mirror reason codes.
* Highest seen version tracking to reduce rollback risk.

Suggested signing approach:

* Use deterministic JSON canonicalization before signing.
* Use Ed25519 or another modern detached signature scheme.
* Keep the root public key pinned in the recovery loader.
* Keep signing keys out of the repository.
* Rotate keys through documented root metadata.

## Example manifest

```json
{
  "signed": {
    "_type": "flareless-targets/v1",
    "site": "flareless-demo",
    "version": 12,
    "generated_at": "2026-05-28T16:00:00Z",
    "expires": "2026-06-04T16:00:00Z",
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

## Example mirror registry

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

## Failover order

Recommended order:

1. Primary CDN.
2. Secondary CDN.
3. Official GitHub Pages recovery site.
4. Verified volunteer fork mirrors.
5. Device cache mesh if a coordinator or signaling path exists.
6. Direct origin fallback only if policy allows it.

Route rules:

* Skip routes marked unhealthy during cooldown.
* Reject mirrors with expired metadata.
* Reject mirrors with stale manifest versions.
* Reject mirrors with hash mismatches.
* Reject mirrors not listed in the signed registry.
* Prefer official endpoints before volunteer mirrors.
* Use volunteer mirrors only for public static assets.

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

## GitHub Pages limitations to respect

Known practical limits to design around:

* GitHub Pages is static hosting.
* Pages is not a dynamic application server.
* Published site size and bandwidth limits still matter.
* GitHub API rate limits make browser side live discovery fragile.
* Repository renames can break project Pages URLs.
* Pages builds can take time.
* Actions can be delayed.
* Volunteer custom domains introduce takeover and ownership risks.
* Workflow security matters when accepting registrations from forks or issues.

Design consequence:

> Use GitHub Pages mirrors as verified recovery endpoints, not as an infinite CDN or a trusted control plane.

## Implementation phases

### Phase 1: Local static mirror simulation

* Build the site locally.
* Serve it from two local origins.
* Generate a manifest with hashes.
* Verify that the recovery loader rejects changed files.
* Verify that the recovery loader accepts exact hash matches.

### Phase 2: Manual fork mirror registration

* Add `Help cache this site` documentation.
* Add an issue form for mirror registration.
* Accept a GitHub Pages URL.
* Verify the URL manually or through a script.
* Add the mirror to the registry.

### Phase 3: Signed manifest and hash verification

* Add `scripts/build-manifest.mjs`.
* Add `scripts/sign-manifest.mjs`.
* Add runtime verification helpers.
* Add tests for valid and invalid mirror content.

### Phase 4: Automatic mirror health checks

* Add scheduled GitHub Actions checks.
* Probe each registered mirror.
* Mark unhealthy mirrors.
* Keep revoked mirrors out of active routing.

### Phase 5: GitHub Actions registry update

* Parse issue form submissions.
* Run mirror verification.
* Update `public/mirrors.json`.
* Open a pull request or commit through a maintainer controlled path.

### Phase 6: Demo UI

* Add `Help cache this site` panel.
* Show a generated fake mirror identity.
* Show a simulated GitHub fork and Pages registration.
* Show route health.
* Show verified and rejected mirror examples.
* Animate failover from CDN to official recovery to volunteer mirror.

### Phase 7: Optional device cache mesh integration

* Treat device mesh as a separate transport.
* Require signaling or coordinator path.
* Keep signed manifest verification mandatory.
* Do not depend on device mesh for the first working version.

## Recommended repo files

Future implementation should consider adding:

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

The demo page should include:

* `Help cache this site` section.
* Fake generated fork name.
* Mirror registration simulation.
* Failure route animation.
* Hash verified asset indicator.
* Rejected mirror example.
* Route health panel.
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

Safe claim:

> Flareless can use verified volunteer GitHub Pages mirrors to improve availability for public static sites. Mirrors are not trusted by default. They are only used when they match the official signed manifest.

Safe claim:

> Returning visitors may recover through cached recovery assets. First time visitors still need at least one reachable bootstrap endpoint.

Safe claim:

> This is an availability layer for public static content, not a replacement for dynamic origin infrastructure.

Avoid these claims:

* This makes the site unstoppable.
* No backend is required at all.
* Any supporter fork can automatically keep the site online.
* This is full decentralized hosting.
* GitHub Pages becomes a peer to peer mesh.

## Recommendation

This should become an experimental optional Flareless feature first.

The first real implementation should be:

* GitHub Pages mirror mode.
* Signed asset manifest.
* Signed mirror registry.
* Manual mirror registration.
* Verification script.
* Demo UI.
* Clear warnings about bootstrap and static only limitations.

The verification model should eventually become core. The volunteer mirror network should stay optional until the project proves onboarding, health checks, abuse handling, and registry maintenance can stay simple.