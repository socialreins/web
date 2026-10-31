import type { Metadata } from "next";
import Link from "next/link";
import { ContactForm } from "@/components/contact-form";
import { LogoMark } from "@/components/logo";

export const metadata: Metadata = {
  title: "Contact: SocialReins",
  description: "Send the SocialReins team a message. We reply by email.",
};

export default function Contact() {
  return (
    <main className="mx-auto grid w-full max-w-2xl gap-8 px-5 py-12">
      <Link href="/" className="flex items-center gap-2.5 justify-self-start font-display text-xl font-extrabold tracking-tight">
        <LogoMark className="size-9" />
        SocialReins
      </Link>
      <div className="grid gap-2">
        <h1 className="font-display text-4xl font-extrabold tracking-tight">Contact us</h1>
        <p className="text-ink-soft">Questions, account deletion or anything else: send a message and we reply by email.</p>
      </div>
      <ContactForm />
    </main>
  );
}
