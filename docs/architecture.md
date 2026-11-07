# Architecture

US-01 implements native GitHub authentication; US-02 adds authenticated HTTPS
API access; US-03 adds cross-repository discovery and optional private consent;
US-04 adds automatic polling and a minimal pending-encounter index. Other components below
remain planned. Capture design changes in a public issue or PR and update this
document with them.

## Implemented authentication

`src/extension.ts` owns commands, status bar presentation, activation, and disposal.
`src/auth/vscode-session-provider.ts` is the native API boundary: provider `github`,
scope `read:user` by default (plus `repo` after private-access opt-in), silent restoration, and explicit interactive sign-in. It strips
tokens before returning account information. The pure authentication controller
handles state, single-flight login, session changes, stale replies, and disposal.
Status formatting lives separately and has no VS Code runtime dependency.

The extension runs in the local UI extension host, including remote workspaces.
It stores no authentication data itself and relies on VS Code for session reuse.
Public extension exports contain connection status and an account label only.
VS Code Accounts owns sign-out and revocation; there is no custom token store or
project-wide sign-out action. Native provider failures are never printed verbatim.

Session restore is silent. Interactive login only follows a command or explicit
status-bar click. Session add/change/remove events trigger a fresh silent lookup;
events during a sign-in are reconciled after that request finishes.

See the [development guide](development.md) for the public US-01 criteria and tests,
and the [VS Code authentication API](https://code.visualstudio.com/api/references/vscode-api#authentication)
for provider behavior.

## Implemented GitHub API access

`src/github/client.ts` owns fixed-origin HTTPS GET requests and validated account/PR
models. It reads an access token from the native session provider per request;
tokens never enter authentication state, extension exports, files, or logs. The
provider still strips tokens from the separate UI account lookup.

The client uses a ten-second timeout, explicit REST version/media headers, and
blocks redirects to prevent credential forwarding. Repository moves therefore
require the current canonical URL. Known PR URLs must use HTTPS on GitHub.com;
neither an arbitrary API host nor an API path is accepted from command input.

`src/github/commands.ts` exposes explicit connection-check and PR-lookup actions.
Only a 401 or absent session leads to disconnected state and a user-offered login.
A rejected session requires `forceNewSession` on the next explicit login so the
same invalid credential is not reused. Reauthentication can be canceled and retried.
403/404 responses do not invalidate the account: they can mean denied access or
a hidden private resource. No raw response bodies or provider errors reach users.

Rate limits use Retry-After/reset metadata and a minimum sixty-second fallback.
The client keeps only an in-memory cooldown timestamp and blocks new requests until
it expires. It does not automatically retry. Network/server failures preserve
authentication state. US-03 supplies discovery and US-04 schedules automatic checks.

Reference: [GitHub REST troubleshooting](https://docs.github.com/en/rest/using-the-rest-api/troubleshooting-the-rest-api).

## Implemented cross-repository discovery

`src/github/discovery.ts` searches `is:pr author:<authenticated-login>` through
the fixed-origin REST search endpoint. Public-only mode adds `is:public`; private
mode relies on the repositories accessible to the native `repo` session. The
definition of "my PRs" is authored PRs, not assignments or review requests.
The service never inspects workspace folders, Git remotes, or a repository allowlist.

Search pages run sequentially, up to 100 items per page and ten pages. A batch
records host, API ID, owner, repository, number, URL, title, open/closed state, and
created/updated/closed timestamps. Optional merge dates are preserved when present;
an omitted merge date is unknown, not proof of an unmerged closure. Stable merge
transition handling belongs to US-07. No per-PR hydration is needed during discovery.

Results carry the reported total and a completeness flag. Incomplete responses,
changing totals, duplicate/short pages, or the 1,000-item ceiling prevent claiming
completeness. Invalid records and HTTP failures reject the batch. Consumers must
never treat missing search results as deleted PRs. Even a complete batch is limited
by GitHub search indexing, permissions, and search-scope limits.

`src/github/discovery-commands.ts` owns progress, cancellation, private consent,
and a native quick picker. User identity is checked before and after pagination;
auth/scope changes cancel or discard stale results and close an active picker.
Only the opt-in boolean is stored by VS Code Settings (application scope). PR
manual discovery records stay in memory. US-04 persists a smaller comparison index
and pending references; full encounter persistence still belongs to US-13.

Private consent happens only after a user action. `repo` is a broad OAuth scope,
not a read-only permission, but the client only sends GET requests. Turning off
private discovery changes the requested session scopes and search filter without
revoking GitHub permissions. Revoke those through native account management.

References: [GitHub search API](https://docs.github.com/en/rest/search/search),
[OAuth scopes](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps).

## Implemented polling

`src/polling/controller.ts` schedules immediate discovery when connected and a new
check sixty seconds after the previous one finishes. A single in-flight request
is shared with manual checks. Generation checks discard stale replies after
configuration/auth changes or disposal; an old request completes before a new
configuration starts another one. Logout or invalid credentials pause monitoring.
Background errors never open authentication dialogs. Rate limits extend the delay.

`src/polling/index.ts` reconciles validated results with an additive account-scoped
index. Each public/private access mode gets a baseline at its first successful
query's start time. Unknown PRs older than that cutoff become known without
retroactive encounters. Unknown PRs created since the cutoff queue pending
encounters automatically, including PRs already closed when first observed.
Known IDs are shared across access modes, preventing requeueing when scopes change.
Missing results are never interpreted as deletion. Partial results can add known
records while retaining all previous records and showing a partial status.

`src/polling/vscode-polling.ts` adapts VS Code settings, authentication state,
timers, status/queue commands, and `globalState`. Keys use the GitHub account ID;
schema version 1 stores API IDs, separate scope baselines, and minimal pending
references/detection timestamps. Tokens, raw API bodies, and workspace paths are
not stored. No keys are enrolled in Settings Sync. Public-only mode hides pending
records discovered in private mode; this conservatively includes public PRs first
seen with private access enabled.

Storage failures or unknown/corrupt schemas are surfaced without resetting data.
State is persisted before publishing a successful check. The queue is preparation
for US-09; Pokémon generation, merge/escape transitions, collection UI, and full
encounter storage are not implemented here. The first implementation targets one
active polling window; it does not provide an inter-process storage lock. Cross-window
coordination belongs with stronger synchronization/idempotency work.

## Boundaries

| Component             | Responsibility                                                                          |
| --------------------- | --------------------------------------------------------------------------------------- |
| Extension entry point | Activate components, register commands, and dispose subscriptions/timers                |
| GitHub client         | Use the VS Code session, query PRs, map API data, and handle pagination and rate limits |
| Synchronization       | Discover PRs, reconcile known records, and emit real state transitions                  |
| Encounter domain      | Deterministic assignment and encounter/capture/escape rules                             |
| Local storage         | Global data across workspaces, schema versioning, and migrations                        |
| Presentation          | Encounters, Pokédex, notifications, and optional animations                             |

Keep these responsibilities separate. The domain must not depend on webviews or
live GitHub calls. Inject clocks, storage, and API adapters where tests need control.

## Planned data flow

1. Obtain a native VS Code GitHub authentication session.
2. Discover eligible PRs independently of workspace Git remotes.
3. Compare remote results with persisted records using a stable global PR identity.
4. Create encounters or apply transitions idempotently.
5. Persist state before presenting a capture or encounter.
6. Refresh views and issue appropriate notifications.

Planned states are `ACTIVE` for an open PR, `CAPTURED` after merge, and `ESCAPED`
after closing without merge. A reopened PR policy still needs a documented decision.
Do not erase records because a request failed or a result page is incomplete.

## Constraints

- No hosted project backend, WebSocket server, or external database is required.
- Authenticated access goes directly from the extension to GitHub.
- Monitoring runs only while the extension is active.
- Encounters and the Pokédex use extension-global storage across workspaces.
- Record the originating host, repository, PR identity, URL, and relevant dates.
- Include a storage schema version and preserve existing assignments during migrations.
- Repeated synchronization and restarts must not duplicate encounters or captures.
- Store no raw tokens in project-managed storage or logs.

## Decisions still to make

- Which PR relationship qualifies: author, assignee, reviewer, or a configurable set?
- Initial import/backfill and reconciliation of PRs changed while VS Code was closed.
- Reopened PR behavior and the policy for revoked repository access.
- Deterministic seed, algorithm versioning, species pool, rarity, and Shiny odds.
- Account switching, multiple VS Code windows, profiles, and remote extension hosts.
- Whether GitHub Enterprise is in the initial supported scope.
- Exact UI surfaces, accessibility behavior, and animation controls.
- Asset sources, distribution permissions, attribution, and offline behavior.

These are not settled requirements. Resolve the relevant decisions in an issue or
PR with acceptance criteria and regression cases before adding that behavior.
