import type { ReactNode } from "react";
import Link from "next/link";

// Line icons on a 24x24 grid, drawn for the app. Decorative: every icon sits next to text or an aria-label.
const paths = {
  posts: "M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5v-11ZM4 9.5h16M8.5 2.5v3M15.5 2.5v3M8 13h3M8 16.5h6",
  inbox: "M4 13.5 6.2 5.6A2 2 0 0 1 8.1 4h7.8a2 2 0 0 1 1.9 1.6L20 13.5v4A2.5 2.5 0 0 1 17.5 20h-11A2.5 2.5 0 0 1 4 17.5v-4ZM4 13.5h4.5l1 2.5h5l1-2.5H20",
  automations: "M13 3 5 13.5h6.5L10.5 21 19 10.5h-6.5L13 3Z",
  accounts: "M9.5 14.5a4.5 4.5 0 0 1 0-6.4l2-2a4.5 4.5 0 0 1 6.4 6.4l-1.2 1.2M14.5 9.5a4.5 4.5 0 0 1 0 6.4l-2 2a4.5 4.5 0 0 1-6.4-6.4l1.2-1.2",
  sets: "m12 3.5 8.5 4.5-8.5 4.5L3.5 8 12 3.5ZM3.5 12l8.5 4.5 8.5-4.5M3.5 16l8.5 4.5 8.5-4.5",
  team: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM2.5 20a6.5 6.5 0 0 1 13 0M16 4.3a3.5 3.5 0 0 1 0 6.4M18 14.3a6.5 6.5 0 0 1 3.5 5.7",
  security: "M14.5 9.5a5 5 0 1 0-4.1 4.9L12 16h2v2h2v2.5h4V17l-5.6-5.6c.07-.3.1-.6.1-.9ZM7.75 8.25h.01",
  key: "M8 20a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9ZM11.2 12.3 20 3.5M16.5 7l2.5 2.5M14 9.5l2 2",
  edit: "M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4ZM13.5 6.5l4 4",
  plus: "M12 5v14M5 12h14",
  left: "m14.5 6-6 6 6 6",
  right: "m9.5 6 6 6-6 6",
  menu: "M4 7h16M4 12h16M4 17h16",
  close: "M6 6l12 12M18 6 6 18",
  image: "M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5v-11ZM4 16l4.5-4.5L14 17M13 13l2.5-2.5L20 15M15.5 8.5h.01",
  out: "M14 4h4.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H14M10 16l-4-4 4-4M6 12h10",
  external: "M14 4h6v6M20 4l-9 9M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10",
  trash: "M4.5 7h15M10 11v6M14 11v6M6.5 7l1 12.5A1.5 1.5 0 0 0 9 21h6a1.5 1.5 0 0 0 1.5-1.5l1-12.5M9.5 7V4.5A1.5 1.5 0 0 1 11 3h2a1.5 1.5 0 0 1 1.5 1.5V7",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7.5V12l3 2",
  send: "M20.5 3.5 10 14M20.5 3.5 14 20.5l-4-6.5-6.5-4 17-6.5Z",
};
export type IconName = keyof typeof paths;

export function Icon({ name, className = "size-5" }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`shrink-0 ${className}`} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={paths[name]} />
    </svg>
  );
}

// A page's title with its main action on the right; `back` adds a link up one level.
export function PageHeader({ title, back, children }: { title: string; back?: { href: string; label: string }; children?: ReactNode }) {
  return (
    <div className="mb-8 grid gap-1">
      {back && (
        <Link href={back.href} className="flex items-center gap-1 justify-self-start text-sm font-bold text-ink-soft hover:text-ink">
          <Icon name="left" className="size-4" />
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">{title}</h1>
        {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
      </div>
    </div>
  );
}
