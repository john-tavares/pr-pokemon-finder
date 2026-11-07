# Product roadmap

This is a scope overview, not a delivery schedule. US-01 native GitHub authentication
and US-02 authenticated API access plus US-03 manual authored-PR discovery with
optional private access, plus US-04 automatic polling and pending encounter detection,
US-05 canonical PR identity with legacy-index migration, and US-06 idempotent
capture storage with a minimal deterministic species assignment,
are implemented. The initial US-09/16/19/27/28 visual flow now adds names, runtime
sprites, automatic retro encounter/capture scenes, queued acknowledgement, and preview.
Full collection UI, rarity/Shiny, and other capabilities remain planned. Track progress through public
[issues](https://github.com/john-tavares/pr-pokemon-finder/issues) and pull requests.

| Area               | Planned capabilities                                                 | Existing story references         |
| ------------------ | -------------------------------------------------------------------- | --------------------------------- |
| GitHub integration | Native authentication, direct API access, multi-repository discovery | US-01, US-02, US-03, US-15, US-23 |
| Synchronization    | Polling, stable identity, idempotent capture and presentation state  | US-04, US-05, US-06               |
| Encounters         | Assignment, deterministic selection, rarity, Shiny variants          | US-09 through US-12               |
| Persistence        | Global encounters and Pokédex across workspaces                      | US-13, US-14                      |
| Feedback           | One coordinated new-capture presentation                             | US-16                             |
| Extension UI       | Installation, encounters, Pokédex, capture details                   | US-18, US-19, US-21, US-22        |
| Repository views   | Filters and statistics                                               | US-24, US-25                      |
| Visual experience  | Active Pokémon, encounter/capture animations, rare encounters        | US-26 through US-29               |
| Progression        | Capture history, PR-opening streaks, achievements                    | US-30 through US-32               |

Story identifiers are references from initial planning, not public specifications.
For each implementation PR, include the relevant story text and testable acceptance
criteria in its issue or description. Contributors must not need TickTick access.

TypeScript scaffolding, authentication tests, an Extension Host smoke test, and local
VSIX packaging accompany US-01. Publishing and release automation remain planned.
New capabilities must update local commands, tests, and CI together.

## Revised reward rule (2026-11-07)

A newly opened eligible PR grants exactly one Pokémon immediately when discovered.
Persist the capture, then present a retro pixel-art encounter and guaranteed capture
sequence. Later merge, closure, or reopening never grants/removes a Pokémon.
US-07, US-08, US-17, and US-20 were removed; identifiers are not renumbered.
US-27 and US-28 are P0 core features, not optional post-release polish. Their first
implementation now uses original CSS/JS animation and a runtime sprite, including
skip/close, reduced motion, and a clear offline fallback.
US-26 now selects a companion from the captured collection; US-31 counts PR-opening days.

The US-06 species-number allocator anticipates a dependency of US-09/US-10; it does
not alone complete the user-facing encounter experience. The new visual flow adds
names/sprites and automatic scene presentation; Pokédex UI, rarity, Shiny variants,
and rights review before Marketplace release remain follow-up work.
