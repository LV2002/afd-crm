/**
 * What to do when the CRM cannot send email, written for the person
 * reading it.
 *
 * ## Two wrong versions of this, both now fixed
 *
 * The first said "your developer needs to set RESEND_API_KEY and
 * EMAIL_FROM in the hosting environment" — which tells the institute's
 * administrator to go and find somebody, names two variables without
 * saying where they come from, and puts the blocker on developer time.
 *
 * The second, written in its place, said to verify afdindia.com as a
 * sending domain and called that step unavoidable. Also wrong, and wrong
 * in a more expensive way: it sends somebody off to edit DNS records
 * before they have seen a single email arrive.
 *
 * Domain verification is about the address mail comes **from**, not the
 * address it goes **to**. A mail provider will not accept mail claiming
 * to be from afdindia.com unless afdindia.com has published a record
 * saying who may send on its behalf — that is what SPF and DKIM are, and
 * without them the mail is rejected or spam-binned. None of which applies
 * if the mail comes from the email service's own address instead.
 *
 * So there are two paths, and the quick one is genuinely enough for
 * platform alerts to one person's inbox. Saying so is the difference
 * between email working this afternoon and a DNS task nobody gets to.
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
        Sending mail is the one thing the CRM cannot do on its own — it needs an account with an
        email service. There are two ways to do it, and the first takes about five minutes.
      </p>

      <div className="mt-3 rounded-md border bg-background p-3">
        <p className="font-medium">Just to your own inbox — no DNS, five minutes</p>
        <ol className="mt-1.5 flex list-decimal flex-col gap-1 pl-5">
          <li>
            Sign up at <strong>resend.com</strong> <em>with the address you want the mail to
            arrive at</em>. Free.
          </li>
          <li>Copy the API key it gives you.</li>
          <li>
            Those go into the hosting settings as <code className="font-mono">RESEND_API_KEY</code>{" "}
            and <code className="font-mono">EMAIL_FROM</code> ={" "}
            <code className="font-mono">onboarding@resend.dev</code>. Send the key over and this
            part can be done for you.
          </li>
        </ol>
        <p className="mt-1.5 text-muted-foreground">
          Until a domain is verified the service will only deliver to the address the account was
          created with — so this covers platform alerts to you, and nothing else. Put that same
          address in <strong>Settings → Organisation → Send platform alerts to</strong>.
        </p>
      </div>

      <div className="mt-2 rounded-md border bg-background p-3">
        <p className="font-medium">To staff and families — verify the domain</p>
        <p className="mt-1.5 text-muted-foreground">
          In the same Resend account, add <strong>afdindia.com</strong> as a domain and put the two
          records it shows you wherever the domain is managed. That is what lets mail come{" "}
          <em>from</em> the institute rather than from a stranger&apos;s address, and it is what
          makes it arrive at all instead of in a spam folder.
        </p>
        <p className="mt-1.5 text-muted-foreground">
          Then change <code className="font-mono">EMAIL_FROM</code> to something like{" "}
          <code className="font-mono">AFD India &lt;crm@afdindia.com&gt;</code>. Needs access to
          the domain, so this half is nobody else&apos;s to do — but nothing is waiting on it in
          the meantime.
        </p>
      </div>

      <p className="mt-3 text-muted-foreground">
        Optional, afterwards: <code className="font-mono">NEXT_PUBLIC_APP_URL</code> set to the
        CRM&apos;s real address. Links inside emails already work without it, but they point at
        whichever deployment sent the mail rather than at a stable address.
      </p>
    </div>
  );
}
