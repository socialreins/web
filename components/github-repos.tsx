import { cacheLife } from "next/cache";
import { fetchStars, formatStars, repos } from "@/lib/github";

// A GitHub button that opens a list of the repos with their star counts. Native <details>, so no client JS.
export async function GitHubRepos({
  label,
  summaryClassName,
  align = "right",
}: {
  label: string;
  summaryClassName: string;
  align?: "left" | "right";
}) {
  "use cache";
  cacheLife("hours");
  const stars = await Promise.all(repos.map((r) => fetchStars(r.name)));

  return (
    <details className="group relative inline-block">
      <summary
        className={`cursor-pointer list-none [&::-webkit-details-marker]:hidden ${summaryClassName}`}
      >
        {label}
        <span
          aria-hidden="true"
          className="ml-1.5 inline-block transition-transform group-open:rotate-180"
        >
          ▾
        </span>
      </summary>
      <ul
        className={`absolute ${align === "left" ? "left-0" : "right-0"} z-10 mt-2 grid w-72 gap-1 rounded-2xl border-2 border-pine bg-paper p-2 text-left text-pine shadow-lg`}
      >
        {repos.map((r, i) => (
          <li key={r.name}>
            <a
              href={r.href}
              className="flex items-center justify-between gap-3 rounded-xl px-3 py-2 hover:bg-field"
            >
              <span>
                <span className="font-display font-bold">
                  socialreins/{r.name}
                </span>
                {r.main && (
                  <span className="ml-2 rounded-full bg-brass px-2 py-0.5 text-xs font-bold text-pine">
                    main
                  </span>
                )}
                <span className="block text-sm text-pine-soft">{r.blurb}</span>
              </span>
              {stars[i] !== null && (
                <span className="shrink-0 font-bold">
                  <span aria-hidden="true">★ {formatStars(stars[i])}</span>
                  <span className="sr-only">{stars[i]} stars</span>
                </span>
              )}
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}
