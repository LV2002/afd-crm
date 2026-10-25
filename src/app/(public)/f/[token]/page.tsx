import { getPublicBrand, type PublicBrand } from "@/lib/brand/get-public-brand";
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

  const brand = await getPublicBrand();

  if (lookup.status !== "ok") {
    return (
      <Shell brand={brand} narrow>
        <h1 className="text-xl font-semibold">Form not found</h1>
        <p className="text-sm text-muted-foreground">
          This link isn&apos;t valid. Please check it, or contact your centre for a new one.
        </p>
      </Shell>
    );
  }

  if (lookup.form.alreadySubmitted) {
    return (
      <Shell brand={brand} narrow>
        <h1 className="text-xl font-semibold">Already submitted</h1>
        <p className="text-sm text-muted-foreground">
          Thank you — we have your details. Contact your centre if anything needs changing.
        </p>
      </Shell>
    );
  }

  return (
    <Shell brand={brand}>
      <div className="flex flex-col gap-1 text-left">
        <p
          className="text-xs font-semibold uppercase tracking-widest"
          style={{ color: brand.primaryColor }}
        >
          Admission · Step 1
        </p>
        <h1 className="text-2xl font-semibold">Student Profile Form</h1>
        <p className="text-sm text-muted-foreground">
          Hello <strong className="text-foreground">{lookup.form.studentName}</strong> — please
          complete your details below. It takes a few minutes, and you can attach photos from your
          phone.
        </p>
      </div>
      <ProfileFormFields token={token} fields={lookup.form.fields} accent={brand.primaryColor} />
    </Shell>
  );
}

/**
 * The branded frame every state of this page sits in: logo and name on top,
 * a card for the content, the centre's contact line underneath. A student
 * opening a link from a message should see who it is from before anything
 * else.
 */
function Shell({
  brand,
  narrow = false,
  children,
}: {
  brand: PublicBrand;
  narrow?: boolean;
  children: React.ReactNode;
}) {
  const contact = [brand.phone, brand.email, brand.website].filter(Boolean).join("  ·  ");
  return (
    <div className="min-h-screen bg-muted/40">
      <div style={{ backgroundColor: brand.primaryColor }} className="h-1.5" />
      <main
        className={`mx-auto flex w-full flex-col gap-6 px-4 py-8 sm:py-12 ${narrow ? "max-w-lg" : "max-w-2xl"}`}
      >
        <header className="flex items-center gap-3">
          {brand.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- a signed storage URL; next/image would need the host allow-listed
            <img
              src={brand.logoUrl}
              alt={`${brand.name} logo`}
              className="h-12 w-auto max-w-40 object-contain"
            />
          )}
          <div className="flex flex-col leading-tight">
            <span className="text-lg font-semibold">{brand.name}</span>
            {brand.tagline && (
              <span className="text-xs text-muted-foreground">{brand.tagline}</span>
            )}
          </div>
        </header>

        <div
          className={`flex flex-col gap-6 rounded-xl border bg-background p-5 shadow-sm sm:p-8 ${narrow ? "items-center text-center" : ""}`}
        >
          {children}
        </div>

        {contact && <p className="text-center text-xs text-muted-foreground">{contact}</p>}
      </main>
    </div>
  );
}
