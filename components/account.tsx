"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getMe, signOut, type MeResult } from "@/lib/auth";

// The session cookie is on the API host, invisible to Next server code, so the check runs here.
export function Account() {
  const router = useRouter();
  const [me, setMe] = useState<MeResult | null>(null);
  const [signOutFailed, setSignOutFailed] = useState(false);

  useEffect(() => {
    getMe().then((r) => {
      if (r === "signed_out") router.replace("/login");
      else setMe(r);
    });
  }, [router]);

  if (me === null || me === "signed_out") return <p className="text-pine-soft">Checking your sign-in...</p>;
  if (me === "error") return <p role="alert" className="waitlist-error">Sign-in couldn&apos;t be checked. Reload to try again.</p>;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <p>
        Signed in as <strong>{me.user.email}</strong>
      </p>
      <button
        type="button"
        className="font-bold underline decoration-brass decoration-2 underline-offset-4 hover:text-saddle"
        onClick={async () => {
          if (await signOut()) router.push("/");
          else setSignOutFailed(true);
        }}
      >
        Sign out
      </button>
      {signOutFailed && (
        <p role="alert" className="waitlist-error">
          Sign out didn&apos;t go through. Try again in a moment.
        </p>
      )}
    </div>
  );
}
