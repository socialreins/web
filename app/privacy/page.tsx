import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, Mail } from "@/components/legal-page";

export const metadata: Metadata = { title: "Privacy Policy: SocialReins" };

export default function Privacy() {
  return (
    <LegalPage title="Privacy Policy">
      <p>
        SocialReins is an open-source social media manager made by Bytech. This page explains what the hosted service at
        socialreins.com stores about you, why, and how to have it deleted. If you have a question, write to <Mail />.
      </p>

      <h2>What we store</h2>
      <ul>
        <li>Your account: your email address and name.</li>
        <li>
          If you sign in with Google: your Google account id, email address, name and profile picture link, the basics Google
          shares for sign-in.
        </li>
        <li>Sign-in data: your sessions, passkeys (their public keys, never your fingerprint or face) and short-lived email sign-in links.</li>
        <li>Your teams: their names, members, roles and invitations.</li>
        <li>
          Connected social accounts: each account&apos;s handle, display name, avatar link, and the tokens or app passwords
          that let SocialReins post for you. Tokens and app passwords are encrypted before they are stored and are never
          shown back to anyone.
        </li>
        <li>Your posts: their text, the links to their images, when they are scheduled, and where they were published.</li>
        <li>Basic security records, such as counts of recent attempts used for rate limits.</li>
      </ul>

      <h2>Why we store it</h2>
      <p>
        Only to run SocialReins for you: to sign you in, keep your account secure, let your team work together, and
        publish, schedule and take down your posts on the accounts you connect. We do not sell your data, share it with
        advertisers, or use it for ads.
      </p>

      <h2>Google user data</h2>
      <p>
        When you choose &quot;Continue with Google&quot;, SocialReins asks Google only for the openid, email and profile
        scopes. We use that data solely to sign you in and to create or find your account. We do not read your Gmail,
        contacts, files or anything else in your Google account.
      </p>
      <p>
        SocialReins&apos; use and transfer of information received from Google APIs to any other app will adhere to the{" "}
        <a
          href="https://developers.google.com/terms/api-services-user-data-policy"
          className="font-bold underline decoration-signal decoration-2 underline-offset-4 hover:text-signal-deep"
        >
          Google API Services User Data Policy
        </a>
        , including the Limited Use requirements. We do not transfer Google user data to others except as needed to run
        the service, to comply with the law, or with your consent, and no person reads it unless you ask us to for
        support or the law requires it.
      </p>

      <h2>Who helps us run it</h2>
      <p>
        The hosted service runs on providers that process data for us only to run SocialReins: Railway hosts the servers
        and database, and Resend sends sign-in and invitation emails. When you publish, your post goes to the platform you
        chose, such as Bluesky, under that platform&apos;s own terms.
      </p>

      <h2>Keeping and deleting data</h2>
      <ul>
        <li>We keep your account data for as long as your account exists.</li>
        <li>Email sign-in links expire after 15 minutes and sessions end when you sign out or they expire.</li>
        <li>Disconnecting a social account deletes its stored token or app password at once.</li>
        <li>A deleted set can be restored for 30 days, then it is purged for good.</li>
        <li>
          To delete your account and its data, email <Mail /> from the address on your account, and we will confirm
          when it is done.
        </li>
      </ul>

      <h2>Self-hosted SocialReins</h2>
      <p>
        SocialReins is open source, so anyone can run their own copy. A self-hosted instance is controlled by its
        operator, not by Bytech, and this policy does not cover it. Ask that operator how they handle your data.
      </p>

      <h2>Changes</h2>
      <p>
        If this policy changes, we update the date at the top of this page. See also our <Link href="/terms" className="font-bold underline decoration-signal decoration-2 underline-offset-4 hover:text-signal-deep">Terms of Service</Link>.
      </p>
    </LegalPage>
  );
}
