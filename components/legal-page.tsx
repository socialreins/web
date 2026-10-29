import type { ReactNode } from "react";
import Link from "next/link";
import { LogoMark } from "@/components/logo";

export const contact = "hello@socialreins.com";
export const updated = "29 October 2026";

// Shared frame for /privacy and /terms: plain reading text, one column.
export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto grid w-full max-w-2xl gap-8 px-5 py-12">
      <Link href="/" className="flex items-center gap-2.5 justify-self-start font-display text-xl font-extrabold tracking-tight">
        <LogoMark className="size-9" />
        SocialReins
      </Link>
      <div className="grid gap-2">
        <h1 className="font-display text-4xl font-extrabold tracking-tight">{title}</h1>
        <p className="text-ink-soft">Last updated {updated}</p>
      </div>
      <div className="legal grid gap-4 leading-relaxed">{children}</div>
    </main>
  );
}

export const Mail = () => (
  <a href={`mailto:${contact}`} className="font-bold underline decoration-signal decoration-2 underline-offset-4 hover:text-signal-deep">
    {contact}
  </a>
);
