# Architecture

US-01 implements native GitHub authentication; US-02 adds authenticated HTTPS
API access; US-03 adds cross-repository discovery and optional private consent;
US-04 adds automatic polling and a minimal pending-encounter index; US-05 adds canonical
PR identities and an index migration. US-06 adds idempotent captures, separate
presentation state, and transactional local storage. Other components below
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
an omitted merge date is unknown, not proof of an unmerged closure. Merge/closure
do not affect capture rewards. No per-PR hydration is needed during discovery.

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
encounters internally, including PRs already closed when first observed. The same
transaction consumes these pending references into immutable captures (US-06).
Known canonical keys are shared across access modes, preventing requeueing when scopes change.
Missing results are never interpreted as deletion. Partial results can add known
records while retaining all previous records and showing a partial status.

`src/polling/vscode-polling.ts` adapts settings, authentication, status/queue
commands, and the transactional file store. Public-only mode hides captures and
presentations discovered in private mode; this conservatively includes public PRs
first seen with private access enabled. No tokens, raw API bodies, or workspace
paths are persisted and no data is enrolled in Settings Sync.

Storage failures or unknown/corrupt schemas are surfaced without resetting data.
State is persisted before publishing a successful check. Collection UI and the
retro pixel-art presenter are still planned. No merge/escape transition is needed.

## Implemented PR identity

`src/github/identity.ts` defines `pr:v1:<host>/<owner>/<repository>/<number>`.
Host, owner, and repository use lowercase ASCII; the positive safe-integer PR
number is serialized in decimal. Components are validated before joining, so
separators, URL escapes, whitespace, ports, and unsafe numbers cannot create
ambiguous keys. The same PR number in another owner/repository/host is distinct.
Titles, state, dates, URL fragments, and API response IDs are not part of the key.
Discovery deduplication and the polling comparison/queue use this same function.

The identity helper can distinguish DNS hosts, but network access and pending
records still support **GitHub.com only**. This does not add Enterprise support.
Identity is a canonical repository locator: repository renames/transfers require
an explicit future alias policy; they are not automatically linked by API ID.

V1 indexes are validated before migration. Pending records already contain enough
metadata to derive keys immediately, preserving their detection timestamps and
access modes. Historical records with only API IDs remain in `legacyKnownIds`
until rediscovered; their canonical keys are then recorded without requeueing.
Unseen legacy history and scope baselines are retained. Known counts include both
keyed records and unresolved legacy IDs. US-05 introduced schema v2; US-06 reads
both v1 and v2 from the original `polling.v1.account.<id>` globalState slot when
no authoritative file exists, then commits schema v3 to local global storage.
The old globalState value is left untouched as a migration backup. An existing
corrupt file is never replaced by legacy data. Do not downgrade to older builds:
they cannot see the newer authoritative file and may show stale data.

## Idempotent captures and presentation boundary

The same canonical key identifies a known PR, its capture, and its presentation
intent. Schema v3 adds immutable `captures` and separate `presentations` arrays.
A capture includes its source reference, assigned species/algorithm, and capture
timestamp. Presentation status is `pending` or `shown`; only shown records carry
an acknowledgement time. Every capture has exactly one presentation record.
Neither merge, closure, reopening, repeated polling, nor an absent search result
can reassign or remove the reward. V1/v2 queued references become captures at the
first successful v3 commit; historical known-only records are not backfilled.

`src/captures/assignment.ts` uses SHA-256 of `sha256-kanto-v1`, a newline, and the
canonical key; the full digest modulo 151 plus one selects a species number.
The initial pool is 1–151, without names, graphics, rarity, or Shiny variants.
Assignment is a small prerequisite of capture idempotency, not the complete US-09
experience. Existing stored assignments are validated and retained, not recomputed.

The controller exposes pending captures only after the transaction commits.
`confirmPresentation` records acknowledgement separately and preserves the reward
even if acknowledgement storage fails. It is an internal presenter integration
point, not an exported extension API or command. Opening a PR from the native
picker does not acknowledge it. There is no automatic presenter yet, so pending
scenes remain pending. A future presenter must acknowledge an actually displayed
or deliberately dismissed scene and coordinate a single presentation consumer
across windows; the writer lock alone does not claim an in-progress animation.
An interrupted scene before acknowledgement can be retried; an acknowledged one
is not automatically replayed. Exactly-once rendering across an abrupt crash
between display and acknowledgement is not promised.

## Transactional local storage

`src/polling/file-store.ts` serializes read/transform/write with an exclusive
`account-<id>.json.lock` file under `globalStorageUri/sync`. Every writer rereads
the latest account file inside the lock. It writes a unique temporary snapshot,
syncs the file, closes it, and atomically renames it over the previous snapshot.
No remote I/O or UI runs while holding this lock. Cancellation is rechecked inside
the transform after asynchronous reads. Different accounts have separate files.

A busy lock fails safely as `storage-error`; the next poll retries from committed
state, preventing lost updates across extension windows. Migration/read/validation/
write failures do not publish new captures or erase the prior snapshot. This is
local-filesystem process-crash protection, not a database or a power-loss guarantee.
The directory should not be shared over a network filesystem or synchronized
between machines. Orphan locks are deliberately not stolen based on timestamps
or PIDs; recovery requires closing all writers first (development guide).

## Boundaries

| Component             | Responsibility                                                                          |
| --------------------- | --------------------------------------------------------------------------------------- |
| Extension entry point | Activate components, register commands, and dispose subscriptions/timers                |
| GitHub client         | Use the VS Code session, query PRs, map API data, and handle pagination and rate limits |
| Synchronization       | Discover PRs, reconcile known records, and emit real state transitions                  |
| Encounter domain      | Deterministic assignment and guaranteed capture on new PR                               |
| Local storage         | Global data across workspaces, schema versioning, and migrations                        |
| Presentation          | Core retro encounter/capture animations, Pokédex, and coordinated feedback              |

Keep these responsibilities separate. The domain must not depend on webviews or
live GitHub calls. Inject clocks, storage, and API adapters where tests need control.

## Planned data flow

1. Obtain a native VS Code GitHub authentication session.
2. Discover eligible PRs independently of workspace Git remotes.
3. Compare remote results with persisted records using a stable global PR identity.
4. Assign and record a guaranteed capture once per eligible new PR.
5. Persist the capture and pending presentation together.
6. Present a retro encounter/capture sequence, acknowledge it, and refresh views.

Product decision (2026-11-07): there are no pending-merge or escaped reward states.
Reopening the same PR does not grant a new Pokémon; closing/merging never removes it.
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

- Policy for revoked repository access beyond preserving captured history.
- Future species-pool expansion, rarity, and Shiny odds without changing prior assignments.
- Single-consumer presentation coordination across windows and cross-profile behavior.
- Whether GitHub Enterprise is in the initial supported scope.
- Exact retro scene layout, accessibility behavior, and animation controls.
- Asset sources, distribution permissions, attribution, and offline behavior.

These are not settled requirements. Resolve the relevant decisions in an issue or
PR with acceptance criteria and regression cases before adding that behavior.
