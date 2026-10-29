import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LoginForm, LoginFormWithError } from "@/components/login-form";
import { LogoMark } from "@/components/logo";

export const metadata: Metadata = { title: "Sign in to SocialReins" };

export default function Login() {
  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-md content-center gap-8 px-5 py-12">
      <Link href="/" className="flex items-center gap-2.5 justify-self-start font-display text-xl font-extrabold tracking-tight">
        <LogoMark className="size-9" />
        SocialReins
      </Link>
      <div className="grid gap-3">
        <h1 className="font-display text-4xl font-extrabold leading-tight tracking-tight text-balance">
          Sign in or create an account
        </h1>
        <p className="text-ink-soft">One step for both. A new account starts the first time you sign in.</p>
      </div>
      {/* ?error= is only known in the browser, so the prerendered HTML carries the same form without it. */}
      <Suspense fallback={<LoginForm linkError={null} />}>
        <LoginFormWithError />
      </Suspense>
      <p className="text-sm text-ink-soft">
        By continuing you agree to the{" "}
        <Link href="/terms" className="underline underline-offset-2 hover:text-signal-deep">
          Terms
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="underline underline-offset-2 hover:text-signal-deep">
          Privacy Policy
        </Link>
        .
      </p>
    </main>
  );
}
