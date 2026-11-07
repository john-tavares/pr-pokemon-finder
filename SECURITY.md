# Security policy

## Supported versions

The project is pre-release and has no published extension versions. Security fixes
currently target `master`; no older release lines receive backports. A version
support table will be introduced with the first release.

## Report a vulnerability

Do not open a public issue containing exploit details, tokens, or private GitHub data.

Use [GitHub private vulnerability reporting](https://github.com/john-tavares/pr-pokemon-finder/security/advisories/new)
when it is enabled. If that page is unavailable, request a private reporting channel
from [@john-tavares](https://github.com/john-tavares) through a private contact on
their profile. If no private contact is listed, open a public issue containing only
a request for a private security contact, with no vulnerability details.

Include the affected commit or version, reproduction steps, potential impact, and
sanitized evidence. Never include working credentials. Coordinate disclosure with
the maintainer while a fix is prepared. No paid bounty or response deadline is promised.

## Contributor requirements

- Keep GitHub tokens inside the native VS Code authentication flow.
- Do not log tokens, authorization headers, or private PR contents.
- Validate data crossing API, storage, and webview boundaries.
- Treat webview input and repository content as untrusted.
- Scope workflow permissions narrowly and pin external actions to full commit SHAs.
- Do not use `pull_request_target` to execute code from contributor branches.
- Keep dependencies and their lockfile updated through reviewed PRs.

Local tooling and CI must run without GitHub credentials or extension user data.
