/**
 * What to do when the CRM cannot send email, written for the person
 * reading it.
 *
 * The previous wording said "your developer needs to set RESEND_API_KEY
 * and EMAIL_FROM in the hosting environment". Three things wrong with
 * that. It tells the institute's administrator to go and find somebody,
 * when most of the work is theirs and takes a quarter of an hour. It
 * names two environment variables without saying where they come from or
 * where they go. And it implies the blocker is a developer's time when it
 * is actually an account and two DNS records — which is the part nobody
 * else can do on their behalf.
 *
 * One component rather than the same paragraph on two screens, because
 * the two had already drifted apart once.
 */
export function EmailNotConfigured({
  /** What is specifically not happening on the screen this appears on. */
  consequence,
}: {
  consequence: string;
}) {
  return (
    <div className="rounded-lg border border-warning/40 bg-warning-subtle p-4 text-sm">
      <p className="font-medium">Email is not switched on yet.</p>
      <p className="mt-1">{consequence}</p>

      <p className="mt-3">
        It needs an account with an email service, because sending mail is the one thing the CRM
        cannot do on its own. Two steps, about twenty minutes in total:
      </p>
      <ol className="mt-2 flex list-decimal flex-col gap-2 pl-5">
        <li>
          Create an account at <strong>resend.com</strong> — free for the volume this institute
          sends — and verify <strong>afdindia.com</strong> as a sending domain. That means adding
          two DNS records wherever the domain is managed. This step is nobody else&apos;s to do:
          it needs access to the domain.
        </li>
        <li>
          Put the API key it gives you, and the address mail should come from, into the hosting
          settings as <code className="font-mono">RESEND_API_KEY</code> and{" "}
          <code className="font-mono">EMAIL_FROM</code> (for example{" "}
          <code className="font-mono">AFD India &lt;crm@afdindia.com&gt;</code>), then redeploy.
          Send the key over and this part can be done for you.
        </li>
      </ol>

      <p className="mt-3 text-muted-foreground">
        Optional, afterwards: <code className="font-mono">NEXT_PUBLIC_APP_URL</code> set to the
        CRM&apos;s real address. Links inside emails already work without it, but they point at
        whichever deployment sent the mail rather than at a stable address.
      </p>
    </div>
  );
}
