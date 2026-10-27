export const org = "https://github.com/socialreins";

export const repos = [
  { name: "web", href: `${org}/web`, blurb: "Start here: install and self-host", main: true },
  { name: "brain", href: `${org}/brain`, blurb: "The API server, in Rust", main: false },
] as const;

// Star count from the public GitHub API, or null when it can't be read (rate limit, outage).
export async function fetchStars(repo: string): Promise<number | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/socialreins/${repo}`, {
      headers: { Accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const { stargazers_count } = (await res.json()) as { stargazers_count?: unknown };
    return typeof stargazers_count === "number" ? stargazers_count : null;
  } catch {
    return null;
  }
}

export const formatStars = (n: number) =>
  new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
