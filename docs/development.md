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
