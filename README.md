# SocialReins web

The website and, later, the web app for [SocialReins](https://socialreins.com), an open-source social media manager. Publish and schedule to Facebook Pages, Instagram, Threads, LinkedIn, Bluesky and X from one place.

The product itself lives at [socialreins/socialreins](https://github.com/socialreins/socialreins). The API behind this site is [socialreins/brain](https://github.com/socialreins/brain).

## Develop

Requires Node 24 (the version CI and the Dockerfile use).

```
cp .env.example .env.local   # set NEXT_PUBLIC_API_URL
npm ci
npm run dev                  # http://localhost:3000
```

Checks:

```
npm run lint
npm run typecheck
npm test                     # vitest
npm run build && npm run test:e2e   # Playwright against the production build
```

## Deploy

`Dockerfile` builds a standalone Next.js server; `railway.json` deploys it on Railway. Pass `NEXT_PUBLIC_API_URL` as a build arg (production: `https://api.socialreins.com`).

## License

[AGPL-3.0](LICENSE)
