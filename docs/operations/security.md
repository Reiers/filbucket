# Security & responsible disclosure

## Scope

- `filbucket.ai` and all subdomains
- The `Reiers/filbucket` GitHub repo
- The macOS app distributed via GitHub releases

## What we care about

High priority:

- Auth bypasses (dev auth misuse, share-link forgery, password bypass)
- Unauthorized file access (IDOR on files, pieces, shares)
- Leakage of the ops wallet PK or derivatives
- SSRF / RCE against our ops infra
- Stored / reflected XSS on the share page
- Share-link token prediction / enumeration

Lower priority:

- Rate-limit evasion on public share endpoints
- Denial of service via large uploads (we'll fix; not a paying bug)
- UX bugs (use [GitHub issues](https://github.com/Reiers/filbucket/issues))

Out of scope:

- Anything requiring physical access to our machines
- Social engineering of our team
- 3rd-party dependencies unless we're using them in a vulnerable way

## How to report

Email **security@filbucket.ai** with:

- A clear PoC
- The impact as you see it
- Your PGP key if you want encrypted follow-up (our key is [here](https://filbucket.ai/.well-known/pgp.asc))
- How you'd like to be credited (name, handle, or anonymous)

We respond within 24 hours on weekdays.

## What to expect

1. We acknowledge within 24 hours.
2. We triage and give you a severity assessment within 72 hours.
3. We fix. Timelines depend on severity:
   - **Critical** (auth bypass, PK leak): same day
   - **High** (IDOR, unauthorized read/write): 7 days
   - **Medium** (rate-limit, minor info leak): 30 days
   - **Low**: next release
4. We issue a CVE if warranted.
5. We publish a writeup in the changelog after the fix ships.

## Bounty

We don't have a formal bug bounty program yet. For serious findings we pay out of pocket, discretionary, typically $100-$2000 depending on severity. If a formal program is important to you, let us know — we'll prioritize setting one up.

## Our own hygiene

- Ops PK lives in a secret manager (per deployment), never in git, never in logs.
- Postgres credentials are rotated.
- MinIO access keys are rotated.
- TLS everywhere (Caddy / Let's Encrypt).
- Pino redacts `authorization`, `x-dev-user`, and similar headers from logs.
- argon2id for share passwords.
- CSP + security headers on web responses (not yet set in Phase 1 — open task).

## Known Phase 1 issues

Yes, we'll flag them ourselves:

- **Dev auth** is not production-safe; do not expose a Phase 1 server to the internet.
- **No 2FA** on the dev auth path (there's no account yet).
- **Rate limiting** is in-memory token bucket; resets on server restart.
- **share_accesses** log has no retention; will grow unbounded.
- **Phase 1 delete** doesn't on-chain-terminate the rail; rails continue paying until next settle cycle.

Phase 2 addresses all of the above.
