import { getPublicForm } from "@/lib/registration/get-form";

import { RegistrationForm } from "./registration-form";

/**
 * The public registration form. Deliberately outside the (app) route group
 * so it inherits none of the authenticated shell — no sidebar, no session,
 * nothing that assumes a signed-in user. `/r` is also listed in
 * middleware.ts's PUBLIC_PATHS, or the middleware would bounce every
 * applicant to /login.
 *
 * Note what this page does NOT do: it never renders anything about
 * existing leads. The token grants exactly one capability — submit this
 * form — so even a leaked link exposes no data.
 */
export default async function PublicRegistrationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const lookup = await getPublicForm(token);

  if (lookup.status !== "ok") {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-3 p-6 text-center">
        <h1 className="text-xl font-semibold">
          {lookup.status === "closed" ? "This form is closed" : "Form not found"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {lookup.status === "closed"
            ? "This registration form is no longer accepting responses. Please contact the centre for help."
            : "This link isn't valid. Please check it, or contact the centre for a new one."}
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">{lookup.form.name}</h1>
        {lookup.form.introText && (
          <p className="text-sm text-muted-foreground">{lookup.form.introText}</p>
        )}
      </header>
      <RegistrationForm token={token} fields={lookup.form.fields} />
    </main>
  );
}
