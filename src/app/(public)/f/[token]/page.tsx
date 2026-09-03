import { getProfileFormByToken } from "@/lib/profile-form/get-form";

import { ProfileFormFields } from "./profile-form-fields";

/**
 * The student profile form, filled in by the student themselves.
 *
 * Outside the (app) route group so it inherits none of the authenticated
 * shell, and `/f` is listed in middleware.ts's PUBLIC_PATHS. The token is
 * bound to one lead, so the form arrives already knowing whose profile it
 * is — no identity matching, and no way for an answer to land on the
 * wrong record.
 */
export default async function StudentProfileFormPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const lookup = await getProfileFormByToken(token);

  if (lookup.status !== "ok") {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-3 p-6 text-center">
        <h1 className="text-xl font-semibold">Form not found</h1>
        <p className="text-sm text-muted-foreground">
          This link isn&apos;t valid. Please check it, or contact your centre for a new one.
        </p>
      </main>
    );
  }

  if (lookup.form.alreadySubmitted) {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-3 p-6 text-center">
        <h1 className="text-xl font-semibold">Already submitted</h1>
        <p className="text-sm text-muted-foreground">
          Thank you — we have your details. Contact your centre if anything needs changing.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Student Profile Form</h1>
        <p className="text-sm text-muted-foreground">
          Hello {lookup.form.studentName} — please complete your details below. This is the first
          step of your admission.
        </p>
      </header>
      <ProfileFormFields token={token} fields={lookup.form.fields} />
    </main>
  );
}
