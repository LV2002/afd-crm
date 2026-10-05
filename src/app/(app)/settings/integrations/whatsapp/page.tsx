import { AccessDenied } from "@/components/layout/access-denied";
import { RecentDeliveries } from "@/components/integrations/recent-deliveries";
import { can, getCurrentUser } from "@/lib/auth/session";
import { recentWebhookDeliveries } from "@/lib/integrations/recent-deliveries";
import { createClient } from "@/lib/supabase/server";

import { getWhatsAppConnectionStatus } from "./actions";
import { WhatsAppCredentialsForm } from "./whatsapp-credentials-form";
import {
  WhatsAppNumbers,
  type CounsellorOption,
  type WhatsAppNumberView,
} from "./whatsapp-numbers";

export default async function WhatsAppIntegrationPage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) return <AccessDenied />;

  const supabase = await createClient();
  const deliveries = await recentWebhookDeliveries(supabase, "whatsapp");

  const status = await getWhatsAppConnectionStatus();

  const [{ data: numberRows }, { data: staffRows }] = await Promise.all([
    supabase
      .from("whatsapp_numbers")
      .select(
        "id, phone_number_id, display_phone_number, label, mode, counsellor_id, creates_leads, is_active, history_completed_at, history_message_count, profiles(full_name)",
      )
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .returns<
        Array<{
          id: string;
          phone_number_id: string;
          display_phone_number: string | null;
          label: string;
          mode: "api" | "coexistence";
          counsellor_id: string | null;
          creates_leads: boolean;
          is_active: boolean;
          history_completed_at: string | null;
          history_message_count: number;
          profiles: { full_name: string } | null;
        }>
      >(),
    supabase
      .from("profiles")
      .select("id, full_name")
      .eq("is_active", true)
      .order("full_name")
      .returns<Array<{ id: string; full_name: string }>>(),
  ]);

  const numbers: WhatsAppNumberView[] = (numberRows ?? []).map((row) => ({
    id: row.id,
    phoneNumberId: row.phone_number_id,
    displayPhoneNumber: row.display_phone_number,
    label: row.label,
    mode: row.mode,
    counsellorId: row.counsellor_id,
    counsellorName: row.profiles?.full_name ?? null,
    createsLeads: row.creates_leads,
    isActive: row.is_active,
    historyCompletedAt: row.history_completed_at,
    historyMessageCount: row.history_message_count,
  }));

  const counsellors: CounsellorOption[] = (staffRows ?? []).map((row) => ({
    id: row.id,
    name: row.full_name,
  }));

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">WhatsApp</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          One WhatsApp Business API number for the whole institute, used for marketing and
          broadcasts. Replies to it are matched to the lead they belong to and that lead&apos;s
          counsellor is notified; a reply from a number nobody has entered shows up under
          &quot;Not in the CRM&quot; on the WhatsApp screen rather than becoming a lead of its
          own.
        </p>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          A number used to be one thing or the other — registered to the API, or in use by the
          WhatsApp Business app on somebody&apos;s phone, never both.{" "}
          <strong>Coexistence changed that.</strong> A counsellor&apos;s own number can now run
          the app and the API at the same time: they keep their phone and their chats, and
          everything they send and receive mirrors into the CRM. Register each number below and
          say which kind it is.
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Webhook URL</h2>
        <p className="max-w-lg text-sm text-muted-foreground">
          Paste this into Meta App Dashboard → WhatsApp → Configuration → Webhook, alongside the
          Verify Token below.
        </p>
        <pre className="w-fit rounded-md bg-muted px-3 py-2 font-mono text-sm">/api/webhooks/whatsapp</pre>
        <p className="text-xs text-muted-foreground">
          Prefix with this CRM&apos;s domain — e.g. <code>https://your-domain.com/api/webhooks/whatsapp</code>.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Credentials</h2>
        <WhatsAppCredentialsForm status={status} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Numbers</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Which numbers belong to this institute, and what each one is for. The rule that
          differs most between them is whether a message from somebody new creates a lead —
          right for a counsellor&apos;s own phone, wrong for the broadcast number.
        </p>
        <WhatsAppNumbers numbers={numbers} counsellors={counsellors} />

        {/*
          Said here rather than buried in the manual, because it is the
          part that needs doing in Meta and it has a queue: the three
          Coexistence fields deliver nothing until they are subscribed,
          and onboarding a counsellor's number is a flow in Meta that
          this CRM cannot start.
        */}
        <div className="mt-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">To put a counsellor&apos;s number on Coexistence</p>
          <ol className="mt-2 flex list-decimal flex-col gap-1.5 pl-5">
            <li>
              The counsellor needs the free <strong>WhatsApp Business app</strong> on that
              number — not ordinary WhatsApp. Same number, same chats.
            </li>
            <li>
              Onboard the number through Meta&apos;s <strong>Embedded Signup</strong>, choosing
              the WhatsApp Business app flow. The counsellor scans a QR code from their phone
              and consents to syncing history.
            </li>
            <li>
              Subscribe three extra webhook fields on the WhatsApp Business Account:{" "}
              <code className="font-mono">smb_message_echoes</code>,{" "}
              <code className="font-mono">history</code> and{" "}
              <code className="font-mono">smb_app_state_sync</code>. Without them the number
              connects and nothing mirrors.
            </li>
            <li>Register the number above with its Phone number ID and its owner.</li>
          </ol>
          <p className="mt-2">
            Up to <strong>180 days</strong> of one-to-one chats arrive in the following minutes
            and attach to leads the CRM already holds. Group chats never sync, and the
            phone&apos;s address book is recorded but deliberately not imported as leads.
          </p>
        </div>
      </section>


      {/*
        The one question worth asking when leads are not arriving, and
        until now the only place it could be answered was a SQL console.
        Every delivery is written down before it is processed (CLAUDE.md
        non-negotiable #9), so an empty list here is not missing data —
        it is the answer.
      */}
      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Recent deliveries</h2>
        <RecentDeliveries
          deliveries={deliveries}
          emptyHint="Meta has never called this CRM for WhatsApp. Check the Callback URL and Verify Token in App Dashboard → WhatsApp → Configuration, and that the messages field is subscribed."
        />
      </section>
    </div>
  );
}
