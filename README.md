# SocialReins

SocialReins is an open-source social media manager.

- Publish and schedule posts to Facebook Pages, Instagram, Threads, LinkedIn, Bluesky and X.
- Take down published posts.
- Group accounts into sets, and posts into ordered lists.
- Drive it all from a REST API or an MCP server.

Self-host it, or join the waitlist for the hosted version at [socialreins.com](https://socialreins.com).

This repo is the starting point: the website and the app, built with Next.js. The API server is [socialreins/brain](https://github.com/socialreins/brain), written in Rust.

| Repo | What it is |
|---|---|
| [web](https://github.com/socialreins/web) | This repo: the website, the app and the docs |
| [brain](https://github.com/socialreins/brain) | The API server, written in Rust |

## Self-host

Coming soon. The quick start lands here once brain and web ship the full app.

## Contributing

See [CONTRIBUTING.md](https://github.com/socialreins/.github/blob/main/CONTRIBUTING.md) and the [Code of Conduct](https://github.com/socialreins/.github/blob/main/CODE_OF_CONDUCT.md). To report a vulnerability, follow [SECURITY.md](https://github.com/socialreins/.github/blob/main/SECURITY.md).

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

`Dockerfile` builds a standalone Next.js server; `railway.json` deploys it on Railway. Pass `NEXT_PUBLIC_API_URL` as a build arg (production: `https://brain.socialreins.com`).

## License

[AGPL-3.0](LICENSE)
