# Agent Runtime and Hosted Location Setup Plan

Flareless should become a real operator assisted tool without silently changing a user's hosting account. The local demo now exposes the first version of the setup flow in Settings.

## Agent runtime model

The product should support two agent paths:

1. **Free local agent**
   - No API key.
   - Runs deterministic rule based recommendations.
   - Safe for offline demos.
   - Good for setup guidance, topology validation, and explaining what changed.

2. **Paid API agent**
   - User selects a paid compatible provider.
   - User enters an API key.
   - The current local demo does not persist raw API keys. It stores only `apiKeyConfigured` and a masked preview.
   - Production should use the operating system credential vault or a dedicated encrypted secrets store.

## Rename Approvals

The former Approvals page should be treated as an **Agent Operations** page:

- recommendation inbox
- operator decision
- audit trail
- setup recommendations
- safe apply gating

The internal route name may remain `approvals` until the UI routing is refactored, but user facing labels should say Agent Ops or Agent Operations.

## Hosted locations model

Hosted locations describe where Flareless needs to be installed or configured. A hosted location should include:

```json
{
  "id": "host-production",
  "name": "Production site",
  "type": "sftp | ftp | cpanel | cloudflare-pages | static-host | manual",
  "domain": "example.com",
  "host": "host.example.com or dashboard URL",
  "path": "/public_html or /dist",
  "detectedFile": "index.html, _headers, worker.js, or another target",
  "applyMode": "manual-instructions | generate-patch | future-sftp-apply-disabled",
  "notes": "operator notes"
}
```

## Safe apply rule

Automatic host changes should stay disabled until all are true:

1. Host credentials are configured.
2. The target file is detected.
3. A backup is created.
4. Flareless shows a diff.
5. The operator explicitly approves the change.
6. The action is written to audit history.

Until then, the tool should generate instructions and patches only.

## Setup recommendation flow

The setup assistant should inspect each hosted location and recommend next steps:

- missing domain
- missing host login URL
- missing web root path
- missing detected target file
- whether manual or patch only mode is active
- what the user must log into
- what file they should back up
- what changes Flareless recommends

## Future integration options

Flareless can later add credentialed connectors:

- SFTP apply
- FTP apply
- cPanel file manager API
- Cloudflare Pages / Workers API
- GitHub Pages repository commit flow
- Static host deploy hook

Every connector should be operator approved and diff based. Silent writes to a host should not be allowed.
