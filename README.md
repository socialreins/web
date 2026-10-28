<p align="center"><img src="https://raw.githubusercontent.com/socialreins/.github/main/brand/logo.svg" width="96" height="96" alt="SocialReins logo"></p>

<h1 align="center">SocialReins</h1>

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

SocialReins runs as three containers: Postgres, brain (the API) and web. You need Docker with
Compose. Images: `ghcr.io/socialreins/brain` and `ghcr.io/socialreins/web`, for `linux/amd64`
and `linux/arm64`.

### Quick start

1. Get the compose file and the settings template:

   ```sh
   mkdir socialreins && cd socialreins
   curl -fsSLO https://raw.githubusercontent.com/socialreins/web/main/docker-compose.yml
   curl -fsSL https://raw.githubusercontent.com/socialreins/web/main/.env.example -o .env
   ```

2. Edit `.env`: set `POSTGRES_PASSWORD` (`openssl rand -hex 24`), and `BRAIN_URL` and
   `WEB_URL` to where people will reach brain and web. The defaults
   (`http://localhost:8080` and `http://localhost:3000`) work on your own machine. For a
   personal install, set `REGISTRATION_DISABLED=true` and `OWNER_EMAIL` to your email, so
   nobody but you (and people you invite) can sign up. Without `OWNER_EMAIL`, whoever signs up
   first owns the install.
3. Start it:

   ```sh
   docker compose up -d
   ```

   brain creates and migrates its database on start.
4. Open `WEB_URL`, choose **Sign in**, enter your email. `.env` starts with `MAIL_LOG=true`,
   so the sign-in link is written to brain's log instead of sent:

   ```sh
   docker compose logs brain | grep auth/magic
   ```

   Open that link and you land in the app with your own team. To send real mail, set
   `RESEND_API_KEY` or `SMTP_URL`, plus `MAIL_FROM`, remove `MAIL_LOG=true` (or set it to
   `false`), then `docker compose up -d`. With no mail and no `MAIL_LOG=true`, brain refuses to
   start rather than put sign-in links in its log by surprise.

Upgrade: `docker compose pull && docker compose up -d`. Migrations only move forward and are
safe to rerun. `SOCIALREINS_VERSION` picks the image tag: `main` (the default, follows the main
branch), `latest` (the newest release) or a release such as `v0.1.0`.

Remove everything, data included: `docker compose down -v`.

### Domains and the reverse proxy

The ports are published on `127.0.0.1` only. For a public install, put a reverse proxy with
TLS in front (Caddy, nginx, Traefik) and send one hostname to each port, for example:

| Host | Proxies to | `.env` |
|---|---|---|
| `app.example.com` | `127.0.0.1:3000` (web) | `WEB_URL=https://app.example.com` |
| `api.example.com` | `127.0.0.1:8080` (brain) | `BRAIN_URL=https://api.example.com` |

web and brain must sit on the same registrable domain: `example.com` here (web on
`example.com` with brain on `api.example.com` works too). The session cookie lives on brain's host with
`SameSite=Lax`, so the browser only sends it from a web page on the same site. Two unrelated
domains, or a public suffix such as two `*.up.railway.app` hosts, will not keep you signed in.
Set `TRUST_PROXY=true` when the proxy sets `X-Forwarded-For` and brain is reachable only
through it. With Caddy:

```
app.example.com {
	reverse_proxy 127.0.0.1:3000
}
api.example.com {
	reverse_proxy 127.0.0.1:8080
}
```

### Platform apps

Every platform is optional and shows as not configured until its app credentials are in `.env`.
Connectors are being built now; brain reads these variables as each one ships. Create your own
app with each platform and register these URLs, with your `BRAIN_URL` in place of
`https://api.example.com`:

| Platform | Variables | Redirect URI |
|---|---|---|
| Meta (Facebook Pages, Instagram) | `META_APP_ID`, `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN` | `https://api.example.com/connect/meta/callback`, webhook `https://api.example.com/webhooks/meta` |
| Threads | `THREADS_APP_ID`, `THREADS_APP_SECRET` | `https://api.example.com/connect/threads/callback` |
| LinkedIn | `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` | `https://api.example.com/connect/linkedin/callback` |
| X | `X_CLIENT_ID`, `X_CLIENT_SECRET` | `https://api.example.com/connect/x/callback` |
| TikTok | `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` | `https://api.example.com/connect/tiktok/callback` |
| YouTube (Google) | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | `https://api.example.com/connect/youtube/callback` |

Bluesky needs no app: you connect it with an app password.

## Contributing

See [CONTRIBUTING.md](https://github.com/socialreins/.github/blob/main/CONTRIBUTING.md) and the [Code of Conduct](https://github.com/socialreins/.github/blob/main/CODE_OF_CONDUCT.md). To report a vulnerability, follow [SECURITY.md](https://github.com/socialreins/.github/blob/main/SECURITY.md).

## Develop

Requires Node 24 (the version CI and the Dockerfile use).

```
cp .env.example .env.local   # BRAIN_URL: where brain runs
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

`Dockerfile` builds a standalone Next.js server; `railway.json` deploys it on Railway. Set `BRAIN_URL` at run time (production: `https://brain.socialreins.com`): `/config.js` hands it to the browser and `proxy.ts` puts its origin in the CSP, so one image serves any domain. `.github/workflows/image.yml` publishes the image to GHCR.

## License

[AGPL-3.0](LICENSE)
