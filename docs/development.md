# Development guide

## Prerequisites

- Git and a GitHub account for submitting changes.
- Node.js 24 (also recorded in `.node-version`).
- pnpm 11.25.0 (pinned in `package.json`). Install it with
  `npm install --global pnpm@11.25.0` if necessary.
- VS Code for future extension development. A specific minimum VS Code version
  will be set in the extension manifest when the scaffold is added.

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

## Extension implementation

There is no `src/extension.ts`, debug configuration, extension build, or VSIX
packaging command yet. Do not interpret passing repository checks as proof that an
extension runs. The scaffold must introduce these together with reproducible setup
instructions and CI checks for the new application code.

The planned stack is TypeScript with the VS Code API. Use the
[architecture guide](architecture.md) for boundaries and decisions that require
clarification before coding. Implement domain rules independently of VS Code so
unit tests can use in-memory storage and fake GitHub responses.

## Troubleshooting

- **Frozen lockfile failure:** ensure your branch has matching manifest and lockfile
  changes and you are using the pinned pnpm version. Regenerate the lockfile only
  when intentionally changing dependencies.
- **Formatting failures:** run `pnpm format`, inspect the diff, and rerun `pnpm check`.
- **Branch already checked out:** use `git worktree list`; create a new branch for a
  new worktree rather than checking out the same branch twice.
- **No runnable extension:** expected during the foundation stage; see the
  [roadmap](roadmap.md).
