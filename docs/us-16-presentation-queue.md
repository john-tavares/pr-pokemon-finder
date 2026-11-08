# US 16 — Present saved captures after synchronization

Each eligible new PR receives one durable reward before a scene can open.
Scenes show the Pokémon name and PR source and run serially, including bursts
across repositories. A cross-window account gate rechecks the authoritative
pending record before opening a scene. Acknowledged scenes do not replay.

The coalescing presentation queue retains manual resume requests arriving during
an active scene. Repeated polling wakeups join one drain instead of overlapping
panels or dropping a newly queued request. Disposal cancels later wakeups, while
presentation failures leave the durable reward and pending record recoverable.

Closing before selecting CAPTURAR defers that scene for this window session.
**Show Pending Capture Animations** explicitly resumes it. Search indexing and
polling introduce detection delay; there is no WebSocket or hosted backend.

Validation: queue concurrency, coalescing, manual resume, disposal and retry tests,
plus persistent acknowledgement and manual-capture tests in `pnpm check`.

## Extension screenshot

The queue uses the existing encounter renderer without changing its layout.

![Sequential capture result](images/capture-result.jpg)
