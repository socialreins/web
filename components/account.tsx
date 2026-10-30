"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "@/lib/auth";
import { useSession } from "@/components/app-shell";
import { Icon } from "@/components/ui";

// Who is signed in, and Sign out, at the foot of the app's sidebar.
export function Account() {
  const router = useRouter();
  const { user } = useSession();
  const [signOutFailed, setSignOutFailed] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  return (
    <div className="grid gap-2 border-t border-ink/10 px-2 pt-4">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full bg-ink/10 font-bold">
          {(user.name || user.email).charAt(0).toUpperCase()}
        </span>
        <p className="min-w-0 text-sm leading-snug">
          <span className="block text-ink-soft">Signed in as</span>{" "}
          <strong className="block truncate" title={user.email}>
            {user.email}
          </strong>
        </p>
      </div>
      <button
        type="button"
        disabled={signingOut}
        className="btn btn-quiet btn-sm justify-self-start"
        onClick={async () => {
          setSigningOut(true);
          setSignOutFailed(false);
          if (await signOut()) return router.push("/");
          setSignOutFailed(true);
          setSigningOut(false);
        }}
      >
        <Icon name="out" className="size-4" />
        Sign out
      </button>
      {signOutFailed && (
        <p role="alert" className="waitlist-error text-sm">
          Sign out didn&apos;t go through. Try again in a moment.
        </p>
      )}
    </div>
  );
}
