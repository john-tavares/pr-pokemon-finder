# Changelog

## Unreleased

- Persist one immutable capture per eligible new PR, independently of merge or closure (US-06).
- Separate pending/shown presentation acknowledgements from captured rewards; no animations are added yet.
- Add an initial deterministic species-number assignment (1–151), without artwork, rarity, or Shiny variants.
- Migrate v1/v2 indexes to a v3 capture ledger with exclusive local writes and atomic snapshots.
- Align the roadmap with immediate captures and core retro pixel-art animations; remove merge/flee requirements.

- Identify PRs by a canonical host/owner/repository/number key in discovery and polling (US-05).
- Migrate the polling index to schema v2 without discarding pending encounters or legacy history.

- Poll authored PRs automatically while connected, using a default sixty-second delay (US-04).
- Keep a minimal account-scoped known-PR index and pending encounter queue, preserving state through failures and restarts.
- Add monitoring status, manual check, pending queue commands, and global polling settings.

- Discover authored PRs across repositories with pagination, metadata, and explicit partial-result warnings (US-03).
- Add opt-in native consent for private repositories, with public-only defaults and no per-repository setup.

- Add authenticated GitHub API connection checks and known public PR lookup (US-02).
- Handle expired sessions with explicit native reauthentication, sanitized API failures, and rate-limit cooldowns.

- Add native GitHub authentication (US-01), session restoration, and authentication status commands.
- Add a TypeScript extension scaffold, development host configuration, tests, and local VSIX packaging.
- Establish contribution policies, documentation, MIT licensing, and repository checks.
