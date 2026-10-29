import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, Mail } from "@/components/legal-page";

export const metadata: Metadata = { title: "Terms of Service: SocialReins" };

export default function Terms() {
  return (
    <LegalPage title="Terms of Service">
      <p>
        These terms cover the hosted SocialReins service at socialreins.com, run by Bytech. By creating an account or
        using the service, you agree to them. Questions go to <Mail />.
      </p>

      <h2>The software</h2>
      <p>
        SocialReins is open-source software. The code is offered under its license, and the service is provided as is,
        without warranties of any kind. We work to keep it running and your data safe, but we can&apos;t promise it will
        always be available or free of errors, and we are not liable for losses from using it, as far as the law allows.
      </p>

      <h2>Your account</h2>
      <p>
        Keep your sign-in methods to yourself and tell us if you think someone else got into your account. You are
        responsible for what your team publishes through SocialReins, and you must have the right to use every social
        account you connect.
      </p>

      <h2>Acceptable use</h2>
      <ul>
        <li>Follow the rules of every platform you post to, such as Bluesky&apos;s.</li>
        <li>No spam, harassment, illegal content, or content that infringes other people&apos;s rights.</li>
        <li>No attempts to break, overload or get around the limits of the service or other people&apos;s accounts.</li>
      </ul>

      <h2>Ending an account</h2>
      <p>
        You can stop using SocialReins at any time and ask us to delete your account by email. We may suspend or close
        an account that breaks these terms or puts the service or other people at risk, and we will tell you why when we
        can.
      </p>

      <h2>Plans</h2>
      <p>
        The hosted service is free for now. A paid hosted plan will come later; we will announce its prices before
        charging anything, and you can always run SocialReins yourself instead.
      </p>

      <h2>Changes</h2>
      <p>
        We may update these terms. When we do, we change the date at the top of this page. Our{" "}
        <Link href="/privacy" className="font-bold underline decoration-signal decoration-2 underline-offset-4 hover:text-signal-deep">
          Privacy Policy
        </Link>{" "}
        explains how we handle your data.
      </p>
    </LegalPage>
  );
}
