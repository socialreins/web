import Link from "next/link";
import { GitHubRepos } from "@/components/github-repos";
import { LogoMark } from "@/components/logo";
import { PlatformIcon, platforms } from "@/components/platform-icons";
import { Reins } from "@/components/reins";
import { SessionLink } from "@/components/session-link";
import { WaitlistForm } from "@/components/waitlist-form";

const repo = "https://github.com/socialreins/web";

const headerLink = "whitespace-nowrap font-bold underline decoration-signal decoration-2 underline-offset-4 hover:text-signal-deep";

const features = [
  {
    title: "Publish and schedule",
    soon: true,
    body: "Write once and send it to every account in a set, now or at a time you pick.",
  },
  {
    title: "A caption for each platform",
    soon: true,
    body: "Give X a short line, LinkedIn a longer one and a PDF, and the rest your images, in one post.",
  },
  {
    title: "Take posts down everywhere",
    soon: true,
    body: "Pull a published post back from every platform it went out on, in one step.",
  },
  {
    title: "Sets and lists",
    soon: true,
    body: "Group accounts into sets, like one per language or brand, and posts into ordered lists.",
  },
  {
    title: "Teams",
    body: "Invite people as admins or members. Sign in with Google, an email link or a passkey.",
  },
  {
    title: "Built for AI agents",
    soon: true,
    body: "A REST API and an MCP server let your agents post for you, limited to the sets you choose.",
  },
];

const compose = `git clone https://github.com/socialreins/web
cd web && cp .env.example .env
# edit .env: POSTGRES_PASSWORD, BRAIN_URL, WEB_URL
docker compose up -d`;

export default function Home() {
  return (
    <div className="mx-auto max-w-6xl px-5 sm:px-8">
      <header className="flex items-center justify-between gap-3 py-6">
        <Link href="/" className="flex items-center gap-2.5 font-display text-xl font-extrabold tracking-tight">
          <LogoMark className="size-9" />
          SocialReins
        </Link>
        <nav aria-label="Site" className="flex items-center gap-4 sm:gap-6">
          <GitHubRepos
            label="GitHub"
            showTotal
            summaryClassName="rounded-full border-2 border-ink px-3.5 py-1.5 font-bold hover:bg-ink hover:text-paper"
          />
          <SessionLink className={headerLink} />
        </nav>
      </header>

      <main>
        <section id="waitlist" className="grid items-center gap-12 pt-8 pb-14 md:grid-cols-[1.05fr_1fr] md:pt-16 md:pb-20">
          <div className="grid gap-6">
            <p className="flex flex-wrap gap-2 text-sm font-bold">
              <span className="rounded-full bg-ink px-3 py-1 text-paper">Open source</span>
              <span className="rounded-full border-2 border-ink px-3 py-0.5">Self-hostable</span>
              <span className="rounded-full border-2 border-signal-deep px-3 py-0.5 text-signal-deep">In development</span>
            </p>
            <h1 className="font-display text-[clamp(2.6rem,7vw,4.9rem)] leading-[0.95] font-extrabold tracking-[-0.03em]">
              Every social account, one set of reins.
            </h1>
            <p className="max-w-[34rem] text-lg text-ink-soft">
              SocialReins is an open-source social media manager. It will publish and schedule your posts to eight
              platforms from one place, and pull a post back from all of them when you need to. Sign-in, teams and
              self-hosting work today; publishing comes next.
            </p>
            <WaitlistForm />
          </div>
          <Reins />
        </section>

        <section aria-labelledby="platforms-title" className="border-y-2 border-ink/10 py-8">
          <h2 id="platforms-title" className="text-sm font-bold tracking-wide text-ink-soft uppercase">
            Coming to
          </h2>
          <ul className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 sm:flex sm:flex-wrap sm:justify-between">
            {platforms.map((p) => (
              <li key={p.id} className="flex items-center gap-2.5 font-display font-bold">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-ink/10 bg-paper" style={{ color: p.color }}>
                  <PlatformIcon platform={p} className="size-5" />
                </span>
                {p.name}
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="features-title" className="py-14 md:py-20">
          <h2 id="features-title" className="font-display text-3xl font-extrabold tracking-tight md:text-4xl">
            What it does
          </h2>
          <dl className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div key={f.title} className="rounded-3xl border border-ink/10 bg-paper p-6">
                <dt className="grid justify-items-start gap-3 font-display text-xl font-bold">
                  <span
                    className={`rounded-full px-2.5 py-0.5 font-body text-xs font-bold ${f.soon ? "bg-canvas text-signal-deep" : "bg-ink text-paper"}`}
                  >
                    {f.soon ? "Coming soon" : "Live now"}
                  </span>
                  {f.title}
                </dt>
                <dd className="mt-2 text-ink-soft">{f.body}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section
          aria-labelledby="oss-title"
          className="-mx-5 grid gap-10 bg-ink px-5 py-14 text-paper sm:-mx-8 sm:px-8 md:grid-cols-2 md:items-center md:rounded-[2.5rem] md:px-14 md:py-16"
        >
          <div>
            <h2 id="oss-title" className="font-display text-3xl font-extrabold tracking-tight md:text-4xl">
              Run it yourself, or let us run it
            </h2>
            <p className="mt-4 max-w-[34rem] text-lg text-canvas">
              SocialReins is open source. A few commands start it on your own server with Postgres, and every
              platform is optional. If you would rather not run servers, join the waitlist for the hosted version, a
              paid subscription coming later.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <GitHubRepos
                label="Follow on GitHub"
                align="left"
                summaryClassName="rounded-full bg-signal px-6 py-3 font-bold text-ink hover:bg-paper"
              />
              <a href="#waitlist" className="rounded-full border-2 border-paper px-6 py-3 font-bold hover:bg-paper hover:text-ink">
                Join the waitlist
              </a>
            </div>
          </div>
          <figure className="min-w-0">
            <pre className="overflow-x-auto rounded-2xl bg-paper/10 p-5 font-mono text-sm leading-relaxed">
              <code>{compose}</code>
            </pre>
            <figcaption className="mt-3 text-sm text-canvas/80">
              Full steps in the{" "}
              <a href={`${repo}#self-host`} className="font-bold underline decoration-signal decoration-2 underline-offset-4">
                README
              </a>
              .
            </figcaption>
          </figure>
        </section>
      </main>

      <footer className="flex flex-wrap items-center justify-between gap-4 py-10 text-ink-soft">
        <span className="flex items-center gap-2">
          <LogoMark className="size-6" />
          Built by Bytech
        </span>
        <span className="flex flex-wrap gap-x-6 gap-y-2">
          <Link href="/privacy" className={headerLink}>
            Privacy
          </Link>
          <Link href="/terms" className={headerLink}>
            Terms
          </Link>
          <Link href="/contact" className={headerLink}>
            Contact
          </Link>
          <a href={repo} className={headerLink}>
            SocialReins on GitHub
          </a>
        </span>
      </footer>
    </div>
  );
}
