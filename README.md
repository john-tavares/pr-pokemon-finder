# PR Pokémon Finder

Turn your GitHub pull requests into Pokémon encounters inside Visual Studio Code.

**Status: pre-release / authentication prototype.** US-01 is implemented: sign in
with GitHub through VS Code, restore an authorized session, and view connection
status. There is no Marketplace release yet. PR discovery, encounters, and the
Pokédex below are planned features, not working functionality.

## Try GitHub authentication

After the setup below, open the checkout folder in VS Code and press **F5** to
launch an Extension Development Host. Click **PR Pokémon: Sign in** in the status
bar, or run **PR Pokémon Finder: Sign in to GitHub** from the Command Palette.
The native GitHub provider handles browser authentication and consent.

The extension requests `read:user` for account identity only. It does not request
repository access or store tokens. On restart, it silently asks VS Code for the
existing authorized session. Use the VS Code **Accounts** menu to sign out or
revoke this extension's access; the status indicator updates accordingly.
Use **PR Pokémon Finder: Show Authentication Status** to inspect the current state.
Canceled sign-in can be retried without reloading the extension.

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
VSIX...**. It contains the authentication prototype only.

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
