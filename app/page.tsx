import { Reins } from "@/components/reins";
import { WaitlistForm } from "@/components/waitlist-form";

const repo = "https://github.com/socialreins/socialreins";

const features = [
  {
    title: "Publish and schedule",
    body: "Send a post to Facebook Pages, Instagram, Threads, LinkedIn, Bluesky and X from one place, now or at a time you pick.",
  },
  { title: "Take posts down everywhere", body: "Remove a published post from every platform it went out on." },
  { title: "Sets and lists", body: "Group your accounts into sets and your short videos into lists." },
  { title: "Built for AI agents", body: "A REST API and an MCP server let your AI agents post for you." },
];

export default function Home() {
  return (
    <div className="mx-auto max-w-6xl px-5 sm:px-8">
      <header className="flex items-center justify-between py-6">
        <span className="font-display text-xl font-extrabold tracking-tight">SocialReins</span>
        <a href={repo} className="font-bold underline decoration-brass decoration-2 underline-offset-4 hover:text-saddle">
          GitHub
        </a>
      </header>

      <main>
        <section id="waitlist" className="grid items-center gap-10 pt-6 pb-16 md:grid-cols-[1.05fr_1fr] md:pt-14 md:pb-24">
          <div className="grid gap-6">
            <h1 className="font-display text-[clamp(2.6rem,7vw,4.9rem)] leading-[0.95] font-extrabold tracking-[-0.03em]">
              Every social account, one set of reins.
            </h1>
            <p className="max-w-[34rem] text-lg text-pine-soft">
              SocialReins is an open-source social media manager. Publish and schedule to six platforms from one place,
              and pull a post back from all of them when you need to.
            </p>
            <WaitlistForm />
          </div>
          <Reins />
        </section>

        <section aria-labelledby="features-title" className="border-t-[3px] border-pine py-14 md:py-20">
          <h2 id="features-title" className="font-display text-3xl font-extrabold tracking-tight md:text-4xl">
            What it does
          </h2>
          <dl className="mt-8 grid gap-x-12 gap-y-8 md:grid-cols-2">
            {features.map((f) => (
              <div key={f.title} className="border-l-4 border-saddle pl-5">
                <dt className="font-display text-xl font-bold">{f.title}</dt>
                <dd className="mt-1 max-w-[30rem] text-pine-soft">{f.body}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section
          aria-labelledby="oss-title"
          className="-mx-5 bg-pine px-5 py-14 text-paper sm:-mx-8 sm:px-8 md:rounded-[2.5rem] md:px-14 md:py-16"
        >
          <h2 id="oss-title" className="font-display text-3xl font-extrabold tracking-tight md:text-4xl">
            Run it yourself, or let us run it
          </h2>
          <p className="mt-4 max-w-[38rem] text-lg text-field">
            SocialReins is open source. Self-host it from GitHub today. If you would rather not run servers, join the
            waitlist for the hosted version, a paid subscription coming later.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href={repo} className="rounded-full bg-brass px-6 py-3 font-bold text-pine hover:bg-paper">
              Self-host from GitHub
            </a>
            <a href="#waitlist" className="rounded-full border-2 border-paper px-6 py-3 font-bold hover:bg-paper hover:text-pine">
              Join the waitlist
            </a>
          </div>
        </section>
      </main>

      <footer className="flex flex-wrap items-center justify-between gap-4 py-10 text-pine-soft">
        <span>Built by Bytech</span>
        <a href={repo} className="font-bold underline decoration-brass decoration-2 underline-offset-4 hover:text-saddle">
          SocialReins on GitHub
        </a>
      </footer>
    </div>
  );
}
