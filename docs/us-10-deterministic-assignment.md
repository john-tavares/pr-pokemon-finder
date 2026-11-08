# US 10 — Deterministic assignments

Each canonical GitHub PR key is hashed as UTF-8:
`sha256-kanto-v1\n<key>`. The full SHA-256 digest modulo 151, plus one,
selects the National Pokédex species. There are no rarity or Shiny tiers yet.

Saved assignments are authoritative: sync, restart, close/reopen and a future
algorithm upgrade never reroll an existing capture. Versioned retired algorithm
identifiers remain readable; malformed identifiers and invalid species fail closed.
Different PRs can legitimately produce the same species.

Validation: golden-vector and collision tests, assignment validation, and the
existing reconciliation/restart tests in `pnpm check`.

## Extension screenshot

The encounter UI is unchanged by this domain change. This is the real extension
renderer with remote artwork disabled, not a mockup.

![Capture result with persisted assignment](images/capture-result.jpg)
