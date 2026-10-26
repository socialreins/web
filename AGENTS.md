# AGENTS.md: socialreins/web

Next.js frontend for SocialReins (socialreins.com): the marketing landing page with the waitlist now, the logged-in app later, in one codebase. The backend is the Rust API in github.com/socialreins/brain.

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
- `components/` UI pieces; `components/waitlist-form.tsx` is the only client component.
- `lib/waitlist.ts` calls `POST {NEXT_PUBLIC_API_URL}/v1/waitlist`. 200 means joined (a duplicate also returns 200), 422 invalid email, 429 rate limited.
- `NEXT_PUBLIC_API_URL` is inlined at build time. The Dockerfile refuses to build without it; Railway passes it as a build arg.
- Tests: `tests/unit` (vitest), `tests/e2e` (Playwright).
