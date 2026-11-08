# US 18 — Install the extension

This is a pre-release VSIX, not a Marketplace release. Install VS Code 1.95 or
newer. Node/pnpm are required only to build from source, not to use the package.

## Build and install

1. In the desired stack checkout, run `pnpm install --frozen-lockfile`.
2. Run `pnpm check`, then `pnpm package`.
3. In VS Code, open Extensions, choose **… → Install from VSIX…**, and select
   `dist/pr-pokemon-finder.vsix` from that checkout.
4. Reload the window if prompted. Check the installed version is **0.0.2**.
5. Run **PR Pokémon Finder: Preview Capture Animation**. The demo needs no login,
   uses no real PR and never changes the collection. Select **CAPTURAR**.
6. Sign in using **PR Pokémon Finder: Sign in to GitHub**, wait for the initial
   baseline, then create a new authored PR to test a real encounter.

Alternatively: `code --install-extension <absolute-path-to-vsix>`.
To update an existing local installation use the Extensions UI or append
`--force` to the CLI command. This replaces extension code, not global progress.
Do not uninstall/delete VS Code's global storage to update.

## Package and smoke checks

`pnpm package` inspects the generated ZIP itself, validating the entry point,
runtime media/font/licenses and absence of test/source-map/dependency files.
Missing resources fail the build. CI additionally runs an isolated VS Code 1.95.3
Extension Host smoke test before packaging. A later stack checkout includes all
parent features; install the top package to try the entire stack.

If commands are missing, verify the right VS Code profile, installed version and
that the extension is enabled. Enable built-in GitHub Authentication for real PRs.
Offline artwork fallback does not mean the reward was lost.

## Extension screenshot

This screenshot uses the real capture renderer with optional artwork disabled.

![Installed extension capture confirmation](images/capture-result.jpg)
