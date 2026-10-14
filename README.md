# FinSight Security Foundation

This folder contains cybersecurity foundation for the FinSight project. It is a local security-focused working copy, not a deployed application or a complete authentication system.

## What is included

- `lib/server/security/authorization.ts` — server-side role/action/resource authorization policy, including owner-scoped checks for grouped persistence attempts.
- `lib/server/security/audit.ts` — allowlisted, validated audit-event construction. It does not write events to a database or logging service.
- `tests/security/` — focused tests for authorization decisions and audit-event validation.
- `docs/security/phase-3-security-foundation.md` — decisions, assumptions, limitations, and remaining integration work.
- `scripts/verify-server-boundary.mjs` — verifies the `server-only` guard for security modules.

## Run checks

Use Node.js and pnpm, then run:

```powershell
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test:security
pnpm check:server-boundary
```

The Vitest suites are focused policy/helper tests. They do not exercise a live API, Supabase Auth, or a hosted database.

## Important limitations

- Authentication, verified organization membership, and role lookup are not implemented here.
- No API routes call the authorization policy yet.
- Audit events are validated in memory; there is no persistent audit sink.
- The grouped-persistence table currently has no owner or organization field. The owner-scoped policy needs a trusted server-side ownership mapping before it can be connected to real records.
- MFA, session controls, rate limiting, production file scanning, and hosted Supabase policy/deployment are not implemented by this foundation.
- Do not put real financial data, credentials, or hosted secrets in tests or logs.

This work is intended to be reviewed and integrated into Jason's cybersecurity branch. It has not been pushed from this folder.
