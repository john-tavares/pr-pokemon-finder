# US 13 — Local capture and presentation persistence

The account ledger lives in VS Code's global storage, never in the workspace.
It stores canonical PR identity, species/algorithm, source, capture date and a
separate pending/shown presentation record. A reward is committed atomically
before any scene opens. Closing a scene cannot remove its reward.

The new read-only snapshot API supports offline consumers without writing a
migration, acknowledging animations or changing the original file. Reads share
the writer lock, return detached objects and reject corrupt/future schemas.
Legacy v1/v2 data is decoded without discarding history; a successful sync writes
the upgraded v3 ledger. Busy or orphan locks fail closed, never silently reset.

Validation: restart, detached reads, account isolation, non-destructive migration,
corruption and existing atomic-write/presentation tests in `pnpm check`.

## Extension screenshot

This storage change does not change the encounter UI.

![Persisted capture confirmation, artwork disabled](images/capture-result.jpg)
