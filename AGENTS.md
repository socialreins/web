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
- `components/` UI pieces. Client components: `waitlist-form.tsx`, `login-form.tsx`, `account.tsx`, `session-link.tsx`, `security.tsx` (the `/app/security` page: set or change the password, add and remove passkeys). `components/github-repos.tsx` is the GitHub menu with star counts (`lib/github.ts`, cached hourly with `use cache`).
- `lib/waitlist.ts` calls `POST {NEXT_PUBLIC_API_URL}/v1/waitlist`. 200 means joined (a duplicate also returns 200), 422 invalid email, 429 rate limited.
- `lib/auth.ts` calls brain's `/auth/link`, `/auth/me`, `/auth/logout`, `/auth/login`, `/auth/password` and `/auth/passkeys*` with `credentials: "include"`, mapping brain's error codes to a `Failure` union. `lib/webauthn.ts` converts WebAuthn options and credentials to and from brain's base64url JSON. The session cookie is HttpOnly on the API host, so Next server code cannot see it: auth checks run in the browser.
- `NEXT_PUBLIC_API_URL` is inlined at build time. The Dockerfile refuses to build without it; Railway passes it as a build arg.
- Tests: `tests/unit` (vitest), `tests/e2e` (Playwright).
