# US 14 — Account-global Pokédex persistence

The local collection reads the same global account ledger as synchronization,
not workspace state. Rewards appear as soon as saved, including pending scenes
and PRs subsequently closed or merged. No backend or repository configuration
is involved.

The native GitHub session's opaque identity is mapped to a numeric REST account
only after successful identity-validated synchronization. That mapping permits
offline restore and reads while polling is disabled. Sign-out/account and scope
changes invalidate in-flight reads and immediately clear incompatible records.
Public-only mode hides private rewards without deleting them.

Run **PR Pokémon Finder: Show Local Collection Status** to inspect the read model.
The visual grid is a separate US 21 delivery. Storage errors preserve same-account
records already loaded, report an error and never reset the collection.

Validation: pending/closed rewards, restart, scope/account isolation, detached
snapshots, offline errors and stale asynchronous reads in `pnpm check`.

## Extension screenshot

The existing scene reflects the ledger before presentation completes.

![Capture scene with durable reward](images/capture-result.jpg)
