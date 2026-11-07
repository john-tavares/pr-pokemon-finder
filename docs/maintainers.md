# Maintainer guide

The current maintainer and default code owner is
[@john-tavares](https://github.com/john-tavares).

## Review and merge policy

Review scope, requirements, behavior, tests, accessibility where relevant, security,
and documentation. Use squash merge and a Conventional Commit PR title. An ordinary
contributor PR should have an independent approval. A sole maintainer cannot approve
their own PR; document any self-reviewed bootstrap change in its description and
require independent reviews when additional maintainers join.

Avoid bypassing failed checks. Require review conversations to be resolved. Changes
to workflows, dependency policy, or authentication deserve particular scrutiny.

## Repository settings to configure

These are GitHub settings, not enforced by committing these files. This foundation
does not change repository settings automatically. After merging it:

1. Add a ruleset for `master` that requires PRs and the status checks
   `Repository quality` and `PR title`. Select the exact checks after they first run.
2. Block force pushes and branch deletion. Require resolved review conversations.
3. Require one approval and code-owner review once an independent reviewer is
   available. Until then, use the documented sole-maintainer bootstrap policy.
4. Enable squash merging, use the PR title as the squash commit subject, and disable
   merge commits and rebase merging. Enable automatic deletion of merged branches.
5. Set Actions' default token permission to read-only. Retain the default approval
   requirement for first-time fork contributors; never send secrets to fork PR jobs.
6. Enable dependency graph, Dependabot alerts, available secret scanning/push
   protection, and private vulnerability reporting. Review feature availability in
   the repository's plan and visibility.
7. Ensure the maintainer profile offers a private contact route for sensitive
   community reports, or update the reporting policies with a dedicated address.

`CODEOWNERS` requests reviews; it does not enforce approval without a matching rule.
Dependabot configuration starts operating after it reaches the default branch.

## Automation

- `ci.yml`: checks formatting, Markdown, tooling tests, strict TypeScript compilation,
  authentication unit tests, the minimum-version Extension Host smoke test, and VSIX
  packaging on pushes to `master`, PRs targeting `master` or stacked `feat/**`
  branches, and manual dispatch.
- `pr-title.yml`: checks Conventional Commit titles on PR creation, edits, updates,
  reopening, and readiness for review. The title is read from the event payload,
  not interpolated into shell commands.
- `dependabot.yml`: proposes weekly tooling and action updates with a bounded number
  of open PRs. Treat bot updates as ordinary reviewed changes.

Actions are pinned to full commit SHAs and jobs use read-only repository permissions,
timeouts, cancellation of superseded runs, and no project secrets. Interactive
GitHub OAuth remains a manual check with a test account; CI never signs in.

## Releases

There is no Marketplace release or deployment workflow yet. Before the first
release, agree on a publisher, minimum VS Code version, asset distribution policy,
versioning, changelog, and supported platforms. Add a reviewed VSIX build and release
workflow, protected release credentials, and installation instructions together.
Never publish automatically from an unreviewed PR.
