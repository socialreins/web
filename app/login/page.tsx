import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LoginForm, LoginFormWithError } from "@/components/login-form";
import { LogoMark } from "@/components/logo";

export const metadata: Metadata = { title: "Sign in to SocialReins" };

export default function Login() {
  return (
    <main className="mx-auto grid min-h-dvh max-w-xl content-center gap-6 px-5">
      <Link href="/" className="flex items-center gap-2.5 font-display text-xl font-extrabold tracking-tight">
        <LogoMark className="size-9" />
        SocialReins
      </Link>
      <h1 className="font-display text-4xl font-extrabold tracking-tight">Sign in or sign up</h1>
      <p className="text-ink-soft">
        Enter your email and we will send you a sign-in link.
      </p>
      {/* ?error= is only known in the browser, so the prerendered HTML carries the same form without it. */}
      <Suspense fallback={<LoginForm linkError={null} />}>
        <LoginFormWithError />
      </Suspense>
    </main>
  );
}
