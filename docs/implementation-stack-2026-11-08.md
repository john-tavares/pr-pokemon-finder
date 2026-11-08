# Implementation stack — 2026-11-08

Scope: the nine user stories scheduled for this date in project planning.
Unscheduled rarity, Shiny, filters, statistics, streaks and achievements remain
outside this stack. TickTick task statuses are not changed by implementation.

Each row is a separate sibling worktree and pull request. A row depends on the
previous row, beginning with the existing retro-capture PR #12. Review the delta
against that parent, then merge bottom-up into master, retargeting/rebasing the
remaining PRs as needed. Do not merge child PRs into feature parents.

| Story | Pull request                                                     | Delivered acceptance criteria                                                                          |
| ----- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| US 10 | [#17](https://github.com/john-tavares/pr-pokemon-finder/pull/17) | Versioned deterministic species, saved assignments survive algorithm changes, collisions allowed       |
| US 13 | [#18](https://github.com/john-tavares/pr-pokemon-finder/pull/18) | Global durable rewards + independent presentation state, non-destructive snapshot reads and migrations |
| US 14 | [#19](https://github.com/john-tavares/pr-pokemon-finder/pull/19) | Account-global collection, offline restore, immediate rewards and account/scope isolation              |
| US 15 | [#20](https://github.com/john-tavares/pr-pokemon-finder/pull/20) | Direct native-authenticated GitHub GETs, safe errors/cooldowns, no backend                             |
| US 16 | [#21](https://github.com/john-tavares/pr-pokemon-finder/pull/21) | Saved-before-UI serial scenes, coalesced polling wakeups, retained manual resume                       |
| US 18 | [#22](https://github.com/john-tavares/pr-pokemon-finder/pull/22) | Verified pre-release VSIX 0.0.2 and installation/update instructions                                   |
| US 23 | [#23](https://github.com/john-tavares/pr-pokemon-finder/pull/23) | Multi-repository provenance/navigation, same PR numbers remain independent, no workspace configuration |
| US 21 | [#24](https://github.com/john-tavares/pr-pokemon-finder/pull/24) | Pokédex with all saved rewards, source/date details, paging and offline states                         |
| US 19 | Top of stack                                                     | Explicit CAPTURAR, retro sequence, completion-only Pokédex handoff, no lost rewards on close/skip      |

## Validate and try the complete build

Use the top checkout, `us-19-capture-pokedex-flow`:

1. `pnpm install --frozen-lockfile`
2. `pnpm check`
3. `pnpm test:extension`
4. `pnpm package`
5. Install `dist/pr-pokemon-finder.vsix` using **Extensions → Install from VSIX…**.
6. Run **Preview Capture Animation**, select **CAPTURAR**, then **POKéDEX**.
   Demo navigation opens example data only, never your real collection.
7. Run **Open Pokédex** for the real account-global collection. Offline reads work
   after the account has completed one successful identity-validated sync.

Rewards are committed before animation; the explicit capture button controls the
game-like presentation. No combat or merge requirement has been added.

## Screenshots and limitations

The [README gallery](../README.md#extension-gallery) and story docs contain real
production-renderer encounter/result screenshots with synthetic source PRs.
Those existing captures predate the new completion-only Pokédex button.
The new Pokédex renderer is covered by unit/client tests and native Extension Host
tab smoke tests; a fresh browser screenshot is not claimed while browser
navigation automation is unavailable.

Sprites are optional runtime downloads, not standalone packaged assets; see
[third-party notices](../THIRD_PARTY_NOTICES.md). The code's MIT license does not
license Pokémon characters/art. There is no Marketplace publication or automatic
PR merge in this stack.
