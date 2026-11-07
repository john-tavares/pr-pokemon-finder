# Development guide

## Prerequisites

- Git and a GitHub account for submitting changes.
- Node.js 24 (also recorded in `.node-version`).
- pnpm 11.25.0 (pinned in `package.json`). Install it with
  `npm install --global pnpm@11.25.0` if necessary.
- Desktop VS Code 1.95.0 or newer for extension development.

Run commands from the checkout directory, not from a bare repository container.
Commands shown here work in PowerShell and POSIX shells unless indicated otherwise.

## Standard checkout

```sh
git clone https://github.com/john-tavares/pr-pokemon-finder.git
cd pr-pokemon-finder
git switch -c docs/my-change
pnpm install --frozen-lockfile
pnpm check
```

External contributors should clone their fork instead and add this repository as
an upstream remote:

```sh
git remote add upstream https://github.com/john-tavares/pr-pokemon-finder.git
git fetch upstream
git switch -c docs/my-change upstream/master
git push -u origin docs/my-change
```

`origin` is your fork in this case. Open the PR against this repository's `master`.

## Optional bare repository and worktrees

For a new local setup, start outside any existing checkout:

```sh
mkdir pr-pokemon-finder
cd pr-pokemon-finder
git clone --bare https://github.com/john-tavares/pr-pokemon-finder.git .git
git config remote.origin.fetch "+refs/heads/*:refs/remotes/origin/*"
git fetch origin
git worktree add master master
git branch --set-upstream-to=origin/master master
git worktree add -b feat/my-feature feat-my-feature origin/master
cd feat-my-feature
pnpm install --frozen-lockfile
```

Each worktree has its own files, index, and installed dependencies. Git history and
branches are shared. A branch can normally be checked out in only one worktree.
On Windows, a leading dot does not hide `.git`; optionally use `attrib +h .git`
from the container directory to hide it in Explorer.

Create additional worktrees from the container after `git fetch origin`. Once a
feature is merged and its worktree is clean, return to the container and run
`git worktree remove feat-my-feature`. Do not manually delete Git metadata. Check
`git worktree list` to see existing checkouts.

## Repository commands

| Command                                     | Purpose                                          |
| ------------------------------------------- | ------------------------------------------------ |
| `pnpm install --frozen-lockfile`            | Install exactly the committed dependency graph   |
| `pnpm check`                                | Run formatting, Markdown lint, and tooling tests |
| `pnpm format`                               | Apply repository formatting                      |
| `pnpm format:check`                         | Check formatting without editing files           |
| `pnpm lint:md`                              | Lint Markdown files                              |
| `pnpm test:tooling`                         | Test the PR title validation rules               |
| `pnpm check:pr-title "docs: explain setup"` | Validate a candidate PR title locally            |
| `git diff --check`                          | Check the patch for whitespace errors            |

Prettier formats Markdown, JSON, JavaScript, and YAML. Markdownlint checks document
structure; line-length and table-style rules are delegated to Prettier. EditorConfig
and Git attributes keep LF line endings consistent across Windows and Linux.

When updating dependencies, use `pnpm add -D --save-exact <package>@<version>`, commit
both `package.json` and `pnpm-lock.yaml`, and rerun the checks. Avoid installation
scripts from dependencies; repository tooling currently does not require them.

## Run the extension

Open the worktree folder itself in VS Code and press **F5** with the **Run Extension**
configuration. The build task compiles TypeScript and launches a separate Extension
Development Host. The extension activates after startup, including in an empty
window. Use `pnpm watch` during iterative development, then reload the development
host to pick up compiled changes.

| Command               | Purpose                                                          |
| --------------------- | ---------------------------------------------------------------- |
| `pnpm build`          | Strict TypeScript compilation for extension and tests            |
| `pnpm watch`          | Incremental TypeScript compilation                               |
| `pnpm test:unit`      | Compile and test authentication lifecycle with fake sessions     |
| `pnpm test:extension` | Download VS Code 1.95.3 and run a real Extension Host smoke test |
| `pnpm package`        | Build `dist/pr-pokemon-finder.vsix` for local installation       |

`pnpm check` now includes compilation and unit tests. The Extension Host test runs
separately because it downloads VS Code and starts a desktop process. It uses an
isolated test profile and never initiates interactive OAuth. On headless Linux,
run `xvfb-run -a pnpm test:extension`; CI uses this command. Set `VSCODE_TEST_VERSION`
to test another version, such as `stable`. For local diagnostics, set
`VSCODE_TEST_EXECUTABLE` to a VS Code executable to use an existing installation
instead of downloading one. Every run creates a fresh profile under `.vscode-test/`
and requires an explicit completion marker so early process exits cannot pass.
Do not point the test runner at a personal profile or supply credentials.

`pnpm package` excludes dependencies, tests, source maps, and development files;
the extension has no runtime npm dependencies. The package publisher field is a
local extension identity, not a claim that a Marketplace publisher is registered.
Publishing still requires separate maintainer setup.

## US-01 acceptance and manual verification

As a user, authenticate using VS Code's native GitHub provider so the extension can
later query PRs without a hosted backend or GitHub App. Acceptance criteria:

1. Use `vscode.authentication` with the `github` provider.
2. Request only needed scopes: `read:user` for this identity-only story. Repository
   permissions must be designed and consented to with GitHub API integration.
3. Reuse an existing authorized session between activations with a silent lookup.
4. Display disconnected state and offer sign-in again after logout or cancellation.

Unit tests cover silent restoration, login, cancellation, session changes,
concurrent requests, disposal, and safe status messages. The Extension Host smoke
test verifies real activation, command registration, and signed-out startup.
Interactive OAuth must be verified manually with a test account:

1. Start the development host with no authorized session. Verify the status bar
   offers sign-in and no browser prompt opens automatically.
2. Run **PR Pokémon Finder: Sign in to GitHub**. Cancel consent; verify the extension
   stays disconnected and the command can be retried.
3. Retry and complete GitHub consent. Verify **PR Pokémon: Connected** and the
   account label in the tooltip/status command.
4. Reload the development host. Verify the connection restores without a new prompt.
5. Sign out or remove access in VS Code's Accounts menu. Verify the indicator returns
   to sign-in, then authenticate again.
6. Disable the built-in GitHub Authentication extension in a test profile, reload,
   and verify an actionable unavailable state instead of an unhandled error.

No raw session/token is exposed in status, logs, extension exports, or local
project storage. OAuth is owned by VS Code. GitHub Enterprise and private repository
access are outside US-01. See [architecture](architecture.md) before adding those.

## US-02 acceptance and manual verification

As a system, use the VS Code session to query GitHub's API directly without hosted
infrastructure. Acceptance criteria:

1. Obtain the access token from the current native session for every request.
2. Send authenticated HTTPS requests directly to GitHub.
3. Handle invalid/expired tokens with disconnected status and explicit native
   reauthentication, rather than silently reusing the rejected credential.
4. Never persist tokens in a project-managed file, database, state, or log.

The implementation exposes a connection check (`GET /user`) and a known public
PR lookup (`GET /repos/{owner}/{repo}/pulls/{number}`). It intentionally retains
`read:user`; support for private-repository permissions belongs to discovery work.

Unit tests inject token providers and HTTP responses. They cover fresh token lookup,
headers, allowed origins/URLs, missing/expired credentials, permission errors,
invalid responses, timeouts/network failures, rate-limit cooldowns, and explicit
reauthentication. They make no live GitHub requests. The Extension Host smoke test
checks registration of both API commands without starting OAuth or network calls.

Manual verification with a test account:

1. In the development host, run **Check GitHub API Connection** while signed out;
   verify it offers login and does not perform an anonymous request.
2. Complete native sign-in, rerun the connection check, and verify the account name.
3. Run **Inspect Pull Request** with a public PR URL. Check title and status against
   GitHub. Repeat with a nonexistent PR and verify an actionable not-found message.
4. Enter an HTTP/non-GitHub URL; verify validation prevents submission.
5. Disable network access and retry; verify a safe error and unchanged auth status.
6. Revoke the token from the test account and run the connection check. If GitHub
   returns 401 before VS Code removes the session, verify disconnected status and
   that retry explicitly asks VS Code for a new session. Cancellation remains retryable.

Do not deliberately exhaust the live API rate limit. Cooldown behavior is tested
with fake headers and an injected clock.

## US-03 acceptance and manual verification

As a user, discover my PRs across repositories without configuring each project.
Acceptance criteria:

1. Query PRs associated with the authenticated account. For this implementation,
   "my PRs" means PRs authored by that account, including open and closed PRs.
2. Work independently of the currently open workspace or Git remotes.
3. Record owner, repository, number, URL, state, and relevant dates in typed results.
4. Include private repositories when the account authorizes the required scope
   and GitHub/organization policies allow access.

Run **Discover My Pull Requests** from the Command Palette. Results are a manual,
in-memory snapshot; US-04 adds polling and US-13 addresses durable persistence.
The global application setting `prPokemonFinder.includePrivateRepositories`
defaults to false. **Enable Private Repository Access** explains the broad `repo`
scope, requests native consent, and enables the setting only after success.
Changing this setting resets connection lookup for the newly selected scopes.
The extension never starts interactive consent automatically.

Tests use fake search responses to cover cross-repository mapping, public/private
query filters, page boundaries and sequencing, the search ceiling, malformed data,
incomplete/changing results, duplicates, cancellation, and account switching.
Scope-policy tests ensure public mode does not request `repo`. No test requires
access to private repositories or a real GitHub account.

Manual verification with a test account:

1. Open an empty development-host window or a folder with no Git remote. Sign in,
   run discovery, and verify authored public PRs from different repositories appear.
2. Select a result, inspect its repository/state/dates, and use **Open on GitHub**.
3. Run private-access enablement and cancel consent. Verify the preference remains
   false and public discovery still works.
4. Enable private access successfully and verify authored PRs in an accessible
   private repository appear. Check organization authorization/SSO where applicable.
5. Disable the private setting and verify public-only search resumes. Confirm no
   new consent prompt opens automatically; manage OAuth revocation separately.
6. Cancel discovery or change accounts/access settings during a query. Verify stale
   results are not displayed and an open result picker closes after an auth change.
7. For an account with no authored PRs, verify the empty-state message. Exercise
   incomplete/capped results with fixtures rather than creating thousands of PRs.

GitHub search exposes at most 1,000 matches per query and may return incomplete
or delayed indexed results. The UI warns about detected partial batches; it does
not claim a complete permanent history. Search `state` is open/closed; an absent
`mergedAt` is unknown. Do not infer capture/escape transitions from it.

## US-05 acceptance and verification

Public requirements:

1. Identify each PR using host, owner, repository, and PR number.
2. Keep equal PR numbers in different repositories distinct.
3. Resolve the same PR to the same local key across repeated checks and restarts.

The pure identity helper emits versioned, lowercase canonical keys. Discovery
and polling both use it; display metadata and API response IDs do not change a
key. Existing v1 polling records migrate to v2 while preserving baselines,
pending encounters, and unresolved historical IDs. See the architecture guide
for migration and repository-rename limitations.

Run `pnpm check`. Unit tests cover all identity components, case normalization,
URL variants, invalid inputs, cross-repository equal numbers, canonical discovery
deduplication, repeated polling/restarts, v1 migration, and malformed v2 indexes.
Use synthetic data; real credentials are not needed. For an optional live check,
create PRs with equal numbers in two test repositories, run a manual poll, and
verify both appear independently and remain single entries after reloading.
Never edit a personal VS Code storage database to test migration.

No new UI, commands, scopes, or network destinations are added by US-05.
The pnpm build policy explicitly denies the optional VSIX signing dependency's
install script, matching the existing `ignore-scripts=true` policy and allowing
clean installs without an interactive build-approval prompt. Local packaging
does not sign or publish the extension.

## US-04 acceptance and manual verification

As a user, automatically detect new PRs while the extension is active so an encounter
can be initiated without manually refreshing. Acceptance criteria:

1. Poll while the extension is active and connected, with a suggested 60-second interval.
2. Compare remote discoveries against a local reference and queue previously unknown new PRs.
3. Work independently of the current workspace.
4. Preserve known state and pending records when GitHub temporarily fails.

Monitoring is enabled by default after native session restoration. Application
settings are `prPokemonFinder.polling.enabled` and
`prPokemonFinder.polling.intervalSeconds` (60–3600). The interval is measured from
completion, so slow requests do not overlap. Rate limits can delay the next check.
**Check for New Pull Requests Now** shares any in-flight cycle. **Show Monitoring
Status** and **Show Pending Encounters** expose the current state.

The first successful query establishes a baseline per account/access mode. Historical
PRs are recorded without retroactive encounters; PRs created from that query's start
onward enter the pending queue when first discovered. The queue also records PRs
closed between checks, without processing captures yet. The minimal versioned index
is account-scoped global state, distinct from future full encounter storage. API
failures do not clear it; unsupported schemas/storage errors stop commits and show
`storage-error` rather than resetting progress.

Unit tests use fake timers and storage to verify scheduling, single-flight behavior,
automatic queueing, historical baselines, partial data, restart recovery, scope/account
isolation, rate limits, pause/disposal, and storage failure. No sleeps or live GitHub
credentials are needed. The smoke test checks that signed-out startup remains paused.

Manual verification with one active development-host window:

1. Sign in and verify the first check completes without requesting another login.
   Existing historical PRs should be known without filling the pending queue.
2. Create a test PR. Wait for a cycle or run **Check for New Pull Requests Now**.
   Verify the pending queue contains its repository and number only once.
3. Repeat the check and reload the host. Verify known/pending records persist.
4. Temporarily disconnect the network and verify an error status, retained records,
   and recovery after reconnecting. Do not intentionally trigger live rate limits.
5. Sign out, disable polling, or close the host; verify no further cycles run.
   Sign back in/enable polling and verify automatic resumption.
6. Change accounts or access modes during a request and verify stale results are
   discarded. Public-only mode must hide private-mode pending references.

Indexing lag and the existing search cap still apply. No Pokémon graphics, species,
capture transitions, or per-new-encounter notifications are added in this story.
Cross-window coordination and full encounter persistence remain follow-up work.

## Troubleshooting

- **Frozen lockfile failure:** ensure your branch has matching manifest and lockfile
  changes and you are using the pinned pnpm version. Regenerate the lockfile only
  when intentionally changing dependencies.
- **Formatting failures:** run `pnpm format`, inspect the diff, and rerun `pnpm check`.
- **Branch already checked out:** use `git worktree list`; create a new branch for a
  new worktree rather than checking out the same branch twice.
- **No sign-in provider:** enable VS Code's built-in GitHub Authentication extension
  and retry the sign-in command. Provider failures do not expose raw error details.
- **Extension Host test fails to download:** verify connectivity to VS Code's update
  service. The unit tests do not require network access or a GitHub login.
