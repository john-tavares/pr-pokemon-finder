# Product roadmap

This is a scope overview, not a delivery schedule. No extension feature below is
implemented by the community foundation. Track actual progress through public
[issues](https://github.com/john-tavares/pr-pokemon-finder/issues) and pull requests.

| Area               | Planned capabilities                                                 | Existing story references         |
| ------------------ | -------------------------------------------------------------------- | --------------------------------- |
| GitHub integration | Native authentication, direct API access, multi-repository discovery | US-01, US-02, US-03, US-15, US-23 |
| Synchronization    | Polling, stable identity, idempotency, merge and closure detection   | US-04 through US-08               |
| Encounters         | Assignment, deterministic selection, rarity, Shiny variants          | US-09 through US-12               |
| Persistence        | Global encounters and Pokédex across workspaces                      | US-13, US-14                      |
| Feedback           | New encounter and capture notifications                              | US-16, US-17                      |
| Extension UI       | Installation, encounters, Pokédex, capture details                   | US-18 through US-22               |
| Repository views   | Filters and statistics                                               | US-24, US-25                      |
| Visual experience  | Active Pokémon, encounter/capture animations, rare encounters        | US-26 through US-29               |
| Progression        | Encounter history, merge streaks, achievements                       | US-30 through US-32               |

Story identifiers are references from initial planning, not public specifications.
For each implementation PR, include the relevant story text and testable acceptance
criteria in its issue or description. Contributors must not need TickTick access.

Infrastructure work includes TypeScript scaffolding, tests, packaging, release
automation, and documentation as application capabilities are introduced. Adding
these should update the local commands and CI together.
