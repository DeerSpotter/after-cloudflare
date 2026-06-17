# Agent and Hosting Operations Model

This document describes how Flareless should prepare for a real product while keeping the current local demo safe.

## Agent selection

Flareless supports two agent paths in the local command center settings.

### Free local agent

The free local agent is the default. It runs offline and does not call an external model provider.

Supported local agent choices:

- `local-rule-agent`: deterministic route and health recommendation rules.
- `local-setup-agent`: deterministic setup assistant for hosting and install steps.
- `manual-agent`: operator only mode with no automated recommendation source.

The free agent is suitable for the local demo, release screenshots, and safety testing.

### Paid API compatible agent

The paid agent mode is for later model backed setup guidance and route analysis.

The command center settings include:

- provider type
- model name
- API key configured flag
- masked API key preview

The local demo must not persist raw API keys. It only stores that a key was configured and a masked preview. A real product should store secrets through the operating system keychain, an encrypted vault, or a hosted secrets manager.

## Recommendation naming

The user facing navigation should say `Agent Ops`, not `Approvals`.

The purpose of this section is broader than approval. It includes:

- agent recommendations
- operator decisions
- audit timeline
- setup assistant output
- future agent execution history

## Server lifetime setting

The embedded GUI has a setting named `keepServerRunningAfterGuiClose`.

- `false`: closing the GUI shuts down the local server.
- `true`: closing the GUI leaves the local server running until the operator stops the console with Ctrl+C.

Default is `false` because most users expect a desktop window close to stop the demo.

## Hosted locations

Hosted locations represent where Flareless will eventually install or patch files.

A hosted location should capture:

- name
- host type
- domain
- account or host URL
- web root path
- detected target file
- apply mode
- notes

Supported host types for planning:

- manual or unknown
- FTP
- SFTP
- cPanel file manager
- Cloudflare Pages
- static host

## Apply modes

The local demo should default to safe modes only.

### Manual instructions only

The tool gives the user step by step instructions. The user logs into the host and applies changes manually.

### Generate patch only

The tool generates a proposed file patch or replacement snippet, but does not connect to the host.

### Future credentialed apply, disabled

This is a placeholder for a real product feature. It should remain disabled until credentials, backups, diff review, and explicit operator approval are implemented.

## Automatic host changes

Automatic host modification should not happen in the demo.

A real product may later support FTP, SFTP, cPanel, Cloudflare, or host API apply. It should only apply changes when all of these are true:

1. The hosting location is configured.
2. Credentials are configured through a secure secret store.
3. The target file is detected.
4. The tool creates a backup.
5. The tool shows the proposed diff.
6. The operator explicitly approves the apply step.
7. The action is written to the audit log.
8. Rollback instructions are generated.

## Setup assistant recommendations

Agent recommendations should also cover setup, not only route failover.

Setup recommendations should include:

- what the user needs to log into
- where the web root probably is
- which file needs inspection or patching
- which backup to create
- the safest apply mode
- what cannot be automated yet
- next step instructions for the user

The local command center already treats these as instructions and patch planning, not live host mutation.

## Real product target

The eventual real tool should have a host connector boundary.

Suggested service boundary:

```text
UI -> Agent Ops -> Host Plan -> Diff Preview -> Operator Approval -> Host Connector -> Audit Log
```

The host connector should be replaceable by provider specific adapters:

- SFTP adapter
- FTP adapter
- cPanel adapter
- Cloudflare Pages adapter
- static host adapter
- manual export adapter

The first production safe connector should be `manual export adapter` because it creates files and instructions without touching the user's host.
