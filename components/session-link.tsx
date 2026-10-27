"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getMe } from "@/lib/auth";

// "Sign in" for everyone; switches to the app once the API says this browser has a session.
export function SessionLink({ className }: { className: string }) {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    getMe().then((r) => setSignedIn(typeof r === "object"));
  }, []);
  return signedIn ? (
    <Link href="/app" className={className}>
      Open the app
    </Link>
  ) : (
    <Link href="/login" className={className}>
      Sign in
    </Link>
  );
}
