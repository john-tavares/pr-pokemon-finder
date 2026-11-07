# Changelog

## Unreleased

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
