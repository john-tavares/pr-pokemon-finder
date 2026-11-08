# US 23 — Multiple repositories without configuration

Discovery searches PRs authored by the authenticated account, not workspace
remotes. A workspace with no Git repository works too. No repository allowlist,
per-folder setting or registration is required.

**Browse Repository Captures** groups the global collection by source repository.
Choose a repository, then a reward, to open its canonical source PR. Repository
provenance stays attached to every reward after restart. Account/scope changes
invalidate open selections; private rewards are hidden in public-only mode.

PR number 1 in two repositories is two independent rewards because the identity
includes host, owner, repository and number. Species collisions are allowed.
All repositories share one serial presentation queue and one account ledger.
Closing, merging or removing a PR from search cannot remove an existing reward.

Validation: same-number cross-repository persisted fixtures, source URLs,
privacy isolation, detached grouping and existing workspace-independent discovery
and serial presentation tests in `pnpm check`.

## Extension screenshot

The shared scene displays the source repository and PR; the same renderer serves
all repositories.

![Cross-repository encounter renderer](images/capture-result.jpg)
