import { cacheLife } from "next/cache";
import { fetchStars, formatStars, repos } from "@/lib/github";

// Star counts refresh four times a day; a failed fetch (GitHub rate limit) retries in minutes instead.
async function getStars() {
  "use cache";
  const stars = await Promise.all(repos.map((r) => fetchStars(r.name)));
  if (stars.includes(null)) cacheLife("minutes");
  else cacheLife({ stale: 300, revalidate: 6 * 3600, expire: 2 * 86400 });
  return stars;
}

const githubMark =
  "M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12";

// A GitHub button that opens a list of the repos with their star counts. Native <details>, so no client JS.
export async function GitHubRepos({
  label,
  summaryClassName,
  align = "right",
  showTotal = false,
}: {
  label: string;
  summaryClassName: string;
  align?: "left" | "right";
  // The GitHub mark and the total stars across every repo, for the site header.
  showTotal?: boolean;
}) {
  const stars = await getStars();
  // A partial sum would look like lost stars, so the total waits until every count loads.
  const total = stars.every((n) => n !== null) ? stars.reduce<number>((a, b) => a + (b ?? 0), 0) : null;

  return (
    <details className="group relative inline-block">
      <summary
        className={`cursor-pointer list-none [&::-webkit-details-marker]:hidden ${showTotal ? "inline-flex items-center gap-2 whitespace-nowrap" : ""} ${summaryClassName}`}
      >
        {showTotal && (
          <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true" fill="currentColor">
            <path d={githubMark} />
          </svg>
        )}
        <span className={showTotal ? "max-sm:sr-only" : undefined}>{label}</span>
        {showTotal && total !== null && (
          <span className="border-l border-current/25 pl-2 text-sm">
            <span aria-hidden="true">★ {formatStars(total)}</span>
            <span className="sr-only">, {total === 1 ? "1 star" : `${total} stars`}</span>
          </span>
        )}
        <span
          aria-hidden="true"
          className="ml-1.5 inline-block transition-transform group-open:rotate-180"
        >
          ▾
        </span>
      </summary>
      <ul
        className={`absolute ${align === "left" ? "left-0" : "right-0"} z-10 mt-2 grid w-72 gap-1 rounded-2xl border-2 border-ink bg-paper p-2 text-left text-ink shadow-lg`}
      >
        {repos.map((r, i) => (
          <li key={r.name}>
            <a
              href={r.href}
              className="flex items-center justify-between gap-3 rounded-xl px-3 py-2 hover:bg-canvas"
            >
              <span>
                <span className="font-display font-bold">
                  socialreins/{r.name}
                </span>
                {r.main && (
                  <span className="ml-2 rounded-full bg-signal px-2 py-0.5 text-xs font-bold text-ink">
                    main
                  </span>
                )}
                <span className="block text-sm text-ink-soft">{r.blurb}</span>
              </span>
              {stars[i] !== null && (
                <span className="shrink-0 font-bold">
                  <span aria-hidden="true">★ {formatStars(stars[i])}</span>
                  <span className="sr-only">
                    {stars[i] === 1 ? "1 star" : `${stars[i]} stars`}
                  </span>
                </span>
              )}
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}
