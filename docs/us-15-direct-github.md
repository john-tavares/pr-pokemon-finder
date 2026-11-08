# US 15 — Direct GitHub access

All PR/user requests go directly to `https://api.github.com` as authenticated
HTTPS GETs. VS Code's native authentication supplies each credential; tokens and
response bodies are never persisted or included in error messages.
There is no hosted application API, webhook server or external database.

Run **Show Network and Privacy Policy** for the fixed origin, API version and
timeout. Redirects are rejected so credentials cannot follow a moved endpoint.
PR responses must match the requested owner, repository and number, ignoring
GitHub's case differences. Rate-limit cooldowns are bounded to one day, preventing
malformed server headers from permanently blocking synchronization.

Unavailable services, expired authentication, malformed responses and rate limits
produce sanitized errors. The existing local collection is not deleted on failure.
Optional sprite downloads are separate credential-free public image requests and
can be disabled in settings.

Validation: direct-request headers, model mapping, mismatched repository URLs,
extreme cooldown headers and existing outage/authentication tests in `pnpm check`.

## Extension screenshot

Network hardening leaves the presentation unchanged.

![Capture result using offline artwork fallback](images/capture-result.jpg)
