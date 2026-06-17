# Host profiles and responsibility metrics

Flareless needs to understand every host a user is responsible for before it can become a real operational tool.

## Host profile purpose

A host profile is the local record for a website, host, or deployment target that the user owns or manages.

Each profile tracks:

```text
name
domain
platform
environment
criticality
status
issue count
web root path
detected target file
notes
```

These profiles are stored with the app settings in:

```text
tools/local-demo/state/app-settings.json
```

Raw credentials are not stored in the demo.

## Metrics purpose

The Metrics page now has a Host Responsibility widget. It summarizes all host profiles the user is responsible for:

```text
total hosts
critical or high priority hosts
hosts needing setup
degraded or offline hosts
open issue count
average risk percentage
```

Risk is currently a local readiness signal based on:

```text
criticality
status
issue count
missing domain
missing web root path
missing detected file
```

## Product direction

This prepares the product for real hosted locations without jumping straight to remote file modification.

Correct future flow:

```text
Host profile -> Setup assistant -> detected file -> backup -> diff preview -> user approval -> host connector -> audit log
```

Automatic host modification must remain disabled until credentials, backup, diff preview, and explicit user approval are implemented.
