import { AccessDenied } from "@/components/layout/access-denied";
import { Letterhead } from "@/components/print/letterhead";
import { can, getCurrentUser } from "@/lib/auth/session";
import { getBrand, hasLetterhead } from "@/lib/brand/get-brand";
import { createClient } from "@/lib/supabase/server";

import { OrganizationForm } from "./organization-form";

export const dynamic = "force-dynamic";

/**
 * Who the institute is, and — new — a preview of what that looks like on
 * paper.
 *
 * The preview is the point of the screen. Before this, these fields were
 * a form somebody filled in once with no visible consequence anywhere:
 * the name and logo reached two printouts, the colour reached nothing,
 * and there was no address or phone number in the system to reach
 * anything with. Showing the letterhead the fields actually produce is
 * what turns "why am I typing this?" into an answer.
 */
export default async function OrganizationSettingsPage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) return <AccessDenied />;

  const supabase = await createClient();
  const [{ data }, brand] = await Promise.all([
    supabase
      .from("org_settings")
      .select(
        "name, legal_name, tagline, logo_url, primary_color, address_line, city, state, pincode, phone, email, website, gstin, document_footer, timezone, currency, locale",
      )
      .limit(1)
      .maybeSingle(),
    // The same reader every printed document uses, so the preview cannot
    // drift from the real thing — it is literally the same component fed
    // by the same query.
    getBrand(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Organisation</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Everything here appears on the documents you hand people — receipts, fee agreements and
          profile sheets — and on the emails the system sends. Fill in what you have; anything left
          empty is simply left off.
        </p>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">How your documents look</h2>
        <div className="overflow-x-auto rounded-lg border bg-white p-5 text-black">
          <Letterhead
            brand={brand}
            title="Fee Receipt"
            reference="Receipt No: 1042"
            centre={{ name: "Your centre", address: "The centre's own address and number" }}
          />
          <p className="text-xs text-gray-500">
            A sample. Real documents fill in the student, the amount and the centre.
          </p>
        </div>
        {!hasLetterhead(brand) && (
          <p className="text-sm text-muted-foreground">
            No logo, address or contact details yet — so documents currently print your name and
            nothing else.
          </p>
        )}
      </section>

      <OrganizationForm
        values={{
          name: data?.name ?? "",
          legalName: data?.legal_name ?? "",
          tagline: data?.tagline ?? "",
          logoUrl: data?.logo_url ?? "",
          // Resolved through getBrand, so an uploaded logo previews from a
          // signed URL rather than showing a raw Storage key.
          logoPreviewUrl: brand.logoUrl,
          primaryColor: data?.primary_color ?? "#0f172a",
          addressLine: data?.address_line ?? "",
          city: data?.city ?? "",
          state: data?.state ?? "",
          pincode: data?.pincode ?? "",
          phone: data?.phone ?? "",
          email: data?.email ?? "",
          website: data?.website ?? "",
          gstin: data?.gstin ?? "",
          documentFooter: data?.document_footer ?? "",
          timezone: data?.timezone ?? "Asia/Kolkata",
          currency: data?.currency ?? "INR",
          locale: data?.locale ?? "en-IN",
        }}
      />
    </div>
  );
}
