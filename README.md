# PR Pokémon Finder

Turn your GitHub pull requests into Pokémon encounters inside Visual Studio Code.

**Status: pre-release / PR monitoring prototype.** US-01 through US-04 are implemented:
native sign-in, API access, cross-repository discovery, and automatic polling with
a pending-encounter queue. There is no Marketplace release yet. Pokémon generation,
capture processing, and the Pokédex remain planned.

## Try GitHub authentication

After the setup below, open the checkout folder in VS Code and press **F5** to
launch an Extension Development Host. Click **PR Pokémon: Sign in** in the status
bar, or run **PR Pokémon Finder: Sign in to GitHub** from the Command Palette.
The native GitHub provider handles browser authentication and consent.

By default, the extension requests `read:user` for account identity and public
PR access. Optional private access requires additional consent, described below.
The extension does not store tokens. On restart, it silently asks VS Code for the
existing authorized session. Use the VS Code **Accounts** menu to sign out or
revoke this extension's access; the status indicator updates accordingly.
Use **PR Pokémon Finder: Show Authentication Status** to inspect the current state.
Canceled sign-in can be retried without reloading the extension.

## Try GitHub API access

After signing in, run **PR Pokémon Finder: Check GitHub API Connection** to verify
the session against GitHub. Run **PR Pokémon Finder: Inspect Pull Request** and
paste a public PR URL, for example
`https://github.com/john-tavares/pr-pokemon-finder/pull/1`, to see its title and
open/closed/merged status. Requests are authenticated HTTPS GETs directly to
GitHub; they do not modify PRs or start monitoring.

The token is obtained silently from VS Code for each request and never persisted
by the extension. If GitHub rejects it, the extension marks the session disconnected
and offers a new native login. Network failures and rate limits show actionable
messages; rate-limited requests pause until the cooldown ends.

Polling starts automatically after an authorized session is restored. Login and
private-scope consent are never prompted automatically.

## Discover your pull requests

Run **PR Pokémon Finder: Discover My Pull Requests** to find PRs authored by your
authenticated GitHub account across repositories, including repositories not open
in VS Code. No Git remote or per-repository configuration is required. Select a PR
to inspect its metadata and optionally open it on GitHub.

Results include owner, repository, PR number, URL, open/closed state, and creation,
update, and closure dates. Discovery is an explicit snapshot, not background
monitoring or durable storage. Search results are paginated up to GitHub's
1,000-result limit. Partial, shifting, or capped results show a warning and must not
be interpreted as a complete history. GitHub search indexing and access restrictions
can also affect results. Merge processing comes in a later story.

Public repositories are the default. To include private repositories, run
**PR Pokémon Finder: Enable Private Repository Access**. The command explains
GitHub's broad `repo` OAuth scope, then opens native consent; this scope permits
both read and write access, although this extension only makes read requests.
Only successful consent enables the global private-discovery preference. Account
and organization/SSO policies still apply.

To return to public-only discovery, disable **PR Pokémon Finder: Include Private
Repositories** in Settings. This does not revoke existing OAuth permissions;
manage those through VS Code Accounts/GitHub. Tokens remain managed by VS Code.

## Automatic monitoring

Once connected, the extension checks authored PRs immediately and then waits
60 seconds after each completed check before running again. It works in an empty
window and across repositories. Use **Show Monitoring Status**, **Check for New
Pull Requests Now**, and **Show Pending Encounters** from the Command Palette.

The first successful query in each access mode establishes its starting reference: historical
PRs are recorded as known, and unseen PRs created since that query began enter
a pending-encounter queue. This includes PRs closed between checks. The small
account-scoped index and queue survive restarts in VS Code global storage. API
errors and incomplete search results never erase known records. Partial results
remain visibly flagged; search indexing can delay detection or miss capped results.

Polling pauses on logout, rejected credentials, disabling the feature, or extension
shutdown. It never starts an interactive login in the background. Rate-limit
responses extend the next delay. Change **Polling: Enabled** or **Polling: Interval
Seconds** in PR Pokémon Finder Settings (60–3600 seconds).

The queue prepares new PRs for later Pokémon generation; it does not generate or
capture Pokémon yet. Saved private-mode queue entries are hidden in public-only
mode, but disabling private access does not delete them. The current index is
intended for one active monitoring window; cross-window coordination and full
encounter persistence remain follow-up work.

## Planned experience

- Discover your pull requests across repositories, independently of the open workspace.
- Encounter a Pokémon when a new pull request is discovered.
- Capture it when the pull request is merged; mark it as escaped when closed without merging.
- Keep encounters and a shared Pokédex locally across workspaces.
- Show encounters, captures, notifications, and later animations and achievements.

The planned implementation uses TypeScript, native VS Code GitHub authentication,
direct GitHub API requests, polling, and local extension storage. It requires no
project-hosted backend. Monitoring will run while the extension is active; it is
not an always-on service when VS Code is closed.

## Start developing

Install Node.js 24 and pnpm 11.25.0. To install the pinned package manager with npm:

```sh
npm install --global pnpm@11.25.0
git clone https://github.com/john-tavares/pr-pokemon-finder.git
cd pr-pokemon-finder
pnpm install --frozen-lockfile
pnpm check
```

Development requires Node.js 24; the extension supports desktop VS Code 1.95.0 or
newer. Run `pnpm build` to compile TypeScript, `pnpm test:extension` for an isolated
Extension Host smoke test, or `pnpm package` to produce
`dist/pr-pokemon-finder.vsix`. Install that file using **Extensions: Install from
VSIX...**. It contains authentication, API lookup, discovery, and polling.

## Contribute

Start with [CONTRIBUTING.md](CONTRIBUTING.md). Issues and documentation improvements
are welcome, including contributions from first-time contributors.

| Guide                                 | What it covers                                                   |
| ------------------------------------- | ---------------------------------------------------------------- |
| [Development](docs/development.md)    | Setup, commands, branches, forks, worktrees, and troubleshooting |
| [Architecture](docs/architecture.md)  | Planned components, data boundaries, and open design decisions   |
| [Roadmap](docs/roadmap.md)            | Product scope and public requirement tracking                    |
| [Maintainers](docs/maintainers.md)    | Review, repository settings, releases, and automation            |
| [Code of conduct](CODE_OF_CONDUCT.md) | Community expectations and reporting                             |
| [Security](SECURITY.md)               | Private vulnerability reporting and support policy               |

## License and assets

The repository's original code and documentation are licensed under the
[MIT License](LICENSE). Contributors must identify the source and license of any
third-party material they add.

Pokémon names, characters, and artwork belong to their respective owners. This is
an independent fan project with no affiliation or endorsement. The MIT license
does not grant rights to third-party trademarks or artwork. No Pokémon sprites
are bundled in this foundation; asset sources and permissions must be documented
before assets are distributed.
