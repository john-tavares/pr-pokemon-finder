# Contributing to PR Pokémon Finder

Thank you for helping build PR Pokémon Finder. Read our
[code of conduct](CODE_OF_CONDUCT.md) before participating.

## Find or propose work

Search existing issues and pull requests before opening a new one. Use the bug
report or feature request form and explain the problem, expected behavior, and
acceptance criteria. Discuss major changes before implementing them.

Public GitHub issues are the contribution-facing source of requirements. Planning
notes may exist elsewhere, but contributors must not need access to private tools.
When working from a numbered user story, copy its relevant requirements and
acceptance criteria into the public issue or PR. Never copy private repository data.

English is the default for documentation, code identifiers, commit messages, and
PR titles so international contributors can participate. Portuguese issue reports
and discussion are welcome; maintainers can help translate them.

## Make a change

1. Fork the repository if you do not have write access.
2. Create a branch from the latest `master`, using `feat/`, `fix/`, `docs/`, or `chore/`
   followed by a short kebab-case description.
3. Follow the [development guide](docs/development.md) to install dependencies.
4. Keep the change focused. Update affected documentation and add meaningful tests
   for behavior changes. Explain why tests do not apply to documentation-only work.
5. Run `pnpm check` and inspect `git diff --check` before pushing.
6. Open a PR against `master` and complete the template.

Do not commit generated build output, dependency directories, credentials, personal
paths, or user data. Commit `pnpm-lock.yaml` when dependencies change. Use pnpm as
the single package manager; do not add npm or Yarn lockfiles.

## Commits and PR titles

Use Conventional Commit titles:

```text
feat(encounters): persist captured pokemon
fix(sync): avoid duplicate encounters after restart
docs: explain local development
ci: validate pull request titles
```

Allowed types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`,
`ci`, `chore`, and `revert`. A scope is optional and uses lowercase letters,
numbers, `/`, or `-`. Add `!` before the colon for a breaking change and explain
the migration in the PR description. The description must be nonempty; the whole
title must be one line, at most 72 characters, without surrounding whitespace.

CI enforces the PR title because squash merging uses it as the final commit
subject. Individual commit messages should follow the same convention; they are
not currently checked automatically.

## Review and merge

- Explain the problem and resulting behavior, link the relevant issue or user story,
  and provide concrete validation results.
- Include screenshots or a short recording for UI changes and describe accessibility
  considerations. Use sanitized fixtures for GitHub data.
- Mark unfinished work as a draft. Resolve review conversations before requesting
  another review and rerun checks after changes.
- Maintainers review correctness, scope, test coverage, security, and documentation.
  A maintainer merges after checks pass and required reviews are satisfied.
- Use squash merge into `master`, then delete the remote feature branch.
- Never bypass a failing check just to merge. If a check is incorrect, fix it in a
  reviewable change.

Do not force-push a shared branch without coordinating with its collaborators.
External contributors can update their own PR branch; ask before rewriting someone
else's work.

## Development principles

- Prefer small, typed modules with explicit boundaries; avoid unrelated refactors.
- Keep GitHub access, domain rules, persistence, and presentation separate.
- Use VS Code's authentication session; never persist raw tokens in files or logs.
- Preserve local progress on network failures and process repeated PR data idempotently.
- Avoid introducing a hosted backend or external database without an agreed design change.
- Use fake data in tests. Live GitHub credentials must not be required for CI.
- Document the origin, permission, and attribution for every third-party asset.
- AI-assisted contributions follow the same review and validation requirements.
  Contributors remain responsible for correctness, provenance, and confidentiality.

For vulnerabilities, follow [SECURITY.md](SECURITY.md) instead of opening a public issue.
