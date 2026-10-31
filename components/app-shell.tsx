"use client";

import { createContext, Suspense, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { getMe, type MeResult, type Team, type User } from "@/lib/auth";
import { Account } from "@/components/account";
import { LogoMark } from "@/components/logo";
import { TeamSwitcher } from "@/components/team-switcher";
import { Icon, type IconName } from "@/components/ui";

type Session = { user: User; setTeam: (t: Team) => void; refresh: () => Promise<void> };
const SessionContext = createContext<Session | null>(null);

// The signed-in user, checked once by the shell. Only for components rendered under /app.
export function useSession() {
  const s = useContext(SessionContext);
  if (!s) throw new Error("useSession needs AppShell");
  return s;
}

const nav: { href: string; label: string; icon: IconName }[] = [
  { href: "/app/posts", label: "Posts", icon: "posts" },
  { href: "/app/inbox", label: "Inbox", icon: "inbox" },
  { href: "/app/automations", label: "Automations", icon: "automations" },
  { href: "/app/connections", label: "Accounts", icon: "accounts" },
  { href: "/app/sets", label: "Sets", icon: "sets" },
  { href: "/app/team", label: "Team", icon: "team" },
  { href: "/app/api-tokens", label: "API tokens", icon: "key" },
  { href: "/app/security", label: "Security", icon: "security" },
];

// The session cookie is on the API host, invisible to Next server code, so the check runs here, once for every app page.
export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [me, setMe] = useState<MeResult | null>(null);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    getMe().then((r) => {
      if (r === "signed_out") router.replace("/login");
      else setMe(r);
    });
  }, [router]);

  const user = typeof me === "object" && me ? me.user : null;
  const session: Session | null = user && {
    user,
    setTeam: (t) => setMe({ user: { ...user, current_team: t } }),
    refresh: async () => {
      const r = await getMe();
      if (r === "signed_out") router.replace("/login");
      else setMe(r);
    },
  };

  function closeMenu() {
    flushSync(() => setOpen(false));
    menuRef.current?.focus();
  }

  const content =
    me === "error" ? (
      <p role="alert" className="waitlist-error">
        Sign-in couldn&apos;t be checked. Reload to try again.
      </p>
    ) : session ? (
      // A new current team remounts the page, so it loads that team's data.
      <div key={session.user.current_team.id}>{children}</div>
    ) : (
      <div aria-busy="true" className="grid gap-6">
        <p role="status" className="sr-only">
          Checking your sign-in...
        </p>
        <div className="h-9 w-48 rounded-xl bg-ink/5 motion-safe:animate-pulse" />
        <div className="h-64 rounded-2xl bg-ink/5 motion-safe:animate-pulse" />
        <div className="h-24 rounded-2xl bg-ink/5 motion-safe:animate-pulse" />
      </div>
    );

  return (
    <SessionContext.Provider value={session}>
      <div className="min-h-dvh md:grid md:grid-cols-[16rem_minmax(0,1fr)]">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-20 focus:rounded-full focus:bg-paper focus:px-4 focus:py-2 focus:font-bold">
          Skip to content
        </a>
        <aside
          className="sticky top-0 z-10 border-b border-ink/10 bg-canvas md:h-dvh md:border-r md:border-b-0"
          onKeyDown={(e) => {
            if (e.key === "Escape" && open) closeMenu();
          }}
        >
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between gap-3 px-4 py-3 md:px-5 md:pt-6 md:pb-5">
              <Link href="/app/posts" className="flex items-center gap-2.5 font-display text-lg font-extrabold tracking-tight">
                <LogoMark className="size-8" />
                SocialReins
              </Link>
              <button
                ref={menuRef}
                type="button"
                className="icon-btn md:hidden"
                aria-expanded={open}
                aria-controls="app-menu"
                aria-label="Menu"
                onClick={() => setOpen(!open)}
              >
                <Icon name={open ? "close" : "menu"} />
              </button>
            </div>
            <div
              id="app-menu"
              className={`${open ? "flex" : "hidden"} max-h-[calc(100dvh-4rem)] flex-1 flex-col gap-6 overflow-y-auto px-3 pb-5 md:flex md:max-h-none`}
            >
              {/* Following a link closes the menu on small screens. */}
              <nav aria-label="App" onClick={(e) => (e.target as Element).closest("a") && setOpen(false)}>
                <Suspense fallback={<NavLinks path="" />}>
                  <CurrentNavLinks />
                </Suspense>
              </nav>
              {/* minmax(0,1fr): a long team name or email truncates instead of widening the sidebar. */}
              <div className="mt-auto grid grid-cols-[minmax(0,1fr)] gap-4">
                {session ? (
                  <>
                    <TeamSwitcher />
                    <Account />
                  </>
                ) : (
                  <div className="h-28 rounded-2xl bg-ink/5 motion-safe:animate-pulse" />
                )}
              </div>
            </div>
          </div>
        </aside>
        <main id="main" tabIndex={-1} className="app-main mx-auto w-full max-w-6xl px-4 py-8 focus:outline-none sm:px-8 md:py-10">
          {content}
        </main>
      </div>
    </SessionContext.Provider>
  );
}

function CurrentNavLinks() {
  return <NavLinks path={usePathname()} />;
}

function NavLinks({ path }: { path: string }) {
  return (
    <ul className="grid gap-0.5">
      {nav.map((item) => {
        const active = path === item.href || path.startsWith(`${item.href}/`);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 rounded-xl px-3 py-2 font-bold ${
                active ? "bg-ink text-paper" : "text-ink-soft hover:bg-ink/5 hover:text-ink"
              }`}
            >
              <Icon name={item.icon} className={`size-5 ${active ? "text-signal" : ""}`} />
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
