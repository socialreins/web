# AGENTS.md: socialreins/web

Next.js frontend for SocialReins (socialreins.com) and the main repo of the project (its README is the entry point for users): the marketing landing page with the waitlist now, the logged-in app later, in one codebase. The backend is the Rust API in github.com/socialreins/brain.

## Rules
- No em dashes in any text: copy, code comments, docs, commit messages, PR text. Use a comma, colon, full stop or two sentences. En dashes in numeric ranges are fine.
- Ship via a branch and a PR to `main`, and merge only with green CI.
- Never force-push.
- Never commit secrets. `.env*` is gitignored except `.env.example`. `NEXT_PUBLIC_*` values ship to the browser, so never put a secret in one.
- Landing copy states only confirmed product facts. No prices, user counts, testimonials or dates.

## Next.js
This is Next.js 16 (App Router, Turbopack, `cacheComponents`). APIs differ from older versions: read the guide in `node_modules/next/dist/docs/` before writing code, and heed deprecation notices.

## Run
```
cp .env.example .env.local
npm ci
npm run dev
npm run lint && npm run typecheck && npm test
npm run build && npm run test:e2e   # Playwright serves the production build on :3000
```

## Layout
- `app/page.tsx` landing page; `app/app/` the logged-in app (placeholder for now).
- `app/login/` sign in or sign up by magic link (the default), or sign in with a password or a passkey; `app/app/` checks the session client-side.
- `components/` UI pieces. Client components: `waitlist-form.tsx`, `login-form.tsx`, `account.tsx`, `session-link.tsx`, `security.tsx` (the `/app/security` page: set or change the password, add and remove passkeys), `team-switcher.tsx` (on `/app`), `team.tsx` (`/app/team`: rename, members, invitations, delete), `invitation.tsx` (`/invitations/[token]`: preview and accept). `team-ui.tsx` holds their shared messages and status line. `connections.tsx` is `/app/connections`: connected accounts, the provider grid and the Bluesky app-password form (`lib/connections.ts`). `sets.tsx` is `/app/sets`: social sets with create, rename, delete (password or fresh sign-in) and restore (`lib/sets.ts`); `/app/connections` edits each account's sets. The CSP in `proxy.ts` allows images from `https://cdn.bsky.app` for avatars only. `components/github-repos.tsx` is the GitHub menu with star counts (`lib/github.ts`, cached hourly with `use cache`).
- `lib/teams.ts` calls brain's `/v1/teams`, `/v1/current-team`, `/v1/team*` and `/v1/invitations/{token}` through `api()` in `lib/auth.ts`. `mayChange` and `grantable` mirror brain's role rules so the UI hides what the caller's role can't do. Brain's magic link always lands on `/app`, so an invitation asks a signed-out visitor to sign in and open the link again.
- `lib/waitlist.ts` calls `POST {apiUrl}/v1/waitlist`. 200 means joined (a duplicate also returns 200), 422 invalid email, 429 rate limited.
- `lib/auth.ts` calls brain's `/auth/link`, `/auth/me`, `/auth/logout`, `/auth/login`, `/auth/password` and `/auth/passkeys*` with `credentials: "include"`, mapping brain's error codes to a `Failure` union. `lib/webauthn.ts` converts WebAuthn options and credentials to and from brain's base64url JSON. The session cookie is HttpOnly on the API host, so Next server code cannot see it: auth checks run in the browser.
- brain's URL is the run-time `BRAIN_URL` (`lib/brain-url.ts`), never baked into the build: `app/config.js/route.ts` sets `window.__BRAIN_URL`, which the root layout loads with `beforeInteractive` so `apiUrl` in `lib/waitlist.ts` sees it, and `proxy.ts` puts its origin in the CSP `connect-src`.
- Self-host: `docker-compose.yml` and `.env.example` (every variable), documented in README "Self-host". `.github/workflows/image.yml` publishes `ghcr.io/socialreins/web`.
- Tests: `tests/unit` (vitest), `tests/e2e` (Playwright).
