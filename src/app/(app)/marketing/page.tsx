import { and, asc, eq, gte, inArray, isNotNull, isNull, lte, max } from "drizzle-orm";
import { DatabaseZap } from "lucide-react";
import Link from "next/link";

import { AccessDenied } from "@/components/layout/access-denied";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { can, getCurrentUser } from "@/lib/auth/session";
import { db, isDatabaseUnreachable, isDeadlineExceeded, withDeadline } from "@/lib/db/client";
import { adSpendDaily, enquiries, enrolments, leads, payments } from "@/lib/db/schema";
import { formatINR } from "@/lib/format/currency";
import {
  attributeLeads,
  combinePerformance,
  formatMultiple,
  formatPercent,
  performanceTotals,
  type AttributedLead,
  type SpendRow,
} from "@/lib/reports/ad-performance";

import { hasIntegrationCredential } from "@/lib/integrations/credentials";
import {
  AD_PLATFORMS,
  isAdPlatform,
  platformLabel,
  platformShort,
} from "@/lib/integrations/platforms";

import { DateRangeControls } from "./date-range-controls";
import { PlatformTabs } from "./platform-tabs";

/**
 * What the advertising cost and what it produced.
 *
 * `ad_spend_daily` has been syncing nightly from Meta and Google since
 * those integrations shipped and nothing read it until now. Every figure
 * on this page is that table joined to the leads and admissions the spend
 * produced; the arithmetic lives in lib/reports/ad-performance.ts, tested
 * against worked examples, because it decides a budget.
 *
 * ## Why this page needs org-wide report access
 *
 * Spend is not attributable to a centre. `ad_spend_daily` records what
 * Meta and Google charged for a campaign, and a campaign's leads land in
 * Kochi and Kannur both. There is no honest way to tell a centre head what
 * "their" share of a campaign cost — apportioning by lead count would
 * produce a confident number with nothing behind it. So the page is gated
 * on `report.org` rather than showing a centre-scoped version that quietly
 * makes something up. (Insights remains centre-scoped: counting leads per
 * centre is a question that has a real answer.)
 *
 * Runs on the direct db client for the same reason Insights does: report
 * permissions are meant to grant aggregates to roles that may not hold
 * `lead.read` at all. No individual lead appears on this page — only
 * counts and sums per campaign.
 */
export const maxDuration = 30;

const QUERY_TIMEOUT_MS = 10_000;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** An Asia/Kolkata calendar date, which is what "the 3rd" means to everybody using this. */
function istDate(daysAgo: number): string {
  const now = new Date(Date.now() - daysAgo * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(now);
}

async function timed<T>(label: string, run: () => Promise<T>): Promise<T> {
  const started = Date.now();
  try {
    const result = await withDeadline(run(), QUERY_TIMEOUT_MS, `Ad performance "${label}" query`);
    console.log(`[marketing] ${label}: ok in ${Date.now() - started}ms`);
    return result;
  } catch (error) {
    console.error(`[marketing] ${label}: FAILED after ${Date.now() - started}ms`, error);
    throw error;
  }
}

function Unavailable({ slow }: { slow: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-12 text-center">
      <DatabaseZap className="size-8 text-muted-foreground" />
      <p className="text-sm font-medium">
        {slow ? "The database didn't respond in time." : "Can't reach the database."}
      </p>
      <p className="max-w-prose text-xs text-muted-foreground">
        This page reads directly from Postgres rather than through Supabase&apos;s API. See
        docs/GETTING-STARTED.md, and run <code className="font-mono">npm run db:check</code> to
        test the connection.
      </p>
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border p-4">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-2xl font-semibold tabular-nums">{value}</span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}

/** Money, or a dash when the ratio behind it could not be worked out. */
function money(paise: number | null): string {
  return paise === null ? "—" : formatINR(paise);
}

interface SpendSource {
  platform: string;
  connected: boolean;
  lastSyncedDate: string | null;
}

/**
 * What an empty spend column actually means.
 *
 * There are three different situations behind "this page shows no spend",
 * and they need three different things done about them: nobody has
 * entered the ad credentials, they have been entered but the nightly sync
 * has not run yet, or everything is working and the chosen dates have no
 * spend in them. The page used to show the same sentence for all three,
 * which left the only question worth asking — is this broken, or is it
 * just empty? — unanswerable from the screen.
 *
 * Shown above the numbers rather than under them: a zero somebody has
 * already read is a zero they have already believed.
 */
function SpendSourceNotice({ sources }: { sources: SpendSource[] }) {
  const unconnected = sources.filter((s) => !s.connected);
  const neverSynced = sources.filter((s) => s.connected && !s.lastSyncedDate);
  if (unconnected.length === 0 && neverSynced.length === 0) return null;

  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
      {unconnected.length > 0 && (
        <p>
          <strong>
            No spend is being imported from {unconnected.map((s) => platformLabel(s.platform)).join(" or ")}.
          </strong>{" "}
          The nightly sync needs an ads access token and an ad account id, and they are not set
          yet — so every cost, cost-per-lead and ROAS figure below is missing that platform&apos;s
          money, not reporting that it spent nothing.{" "}
          <Link href="/settings/integrations" className="underline">
            Settings → Integrations
          </Link>
          .
        </p>
      )}
      {neverSynced.length > 0 && (
        <p className={unconnected.length > 0 ? "mt-2" : undefined}>
          <strong>
            {neverSynced.map((s) => platformLabel(s.platform)).join(" and ")} is connected but has
            never synced.
          </strong>{" "}
          The sync runs once a night, at 10:00 IST, so numbers appear tomorrow morning. To pull
          history in now instead of waiting, a backfill can be run by hand — see
          docs/ADS-SETUP.md § Pulling past spend in.
        </p>
      )}
    </div>
  );
}

export default async function MarketingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  // `report.ads` is this screen's own primitive, so an admin can withhold
  // the ad budget from a role without also taking away every other
  // org-wide report. The sidebar entry is gated on the same thing, so a
  // role that cannot open this never sees the link either.
  if (!user || !can(user, "report.ads")) return <AccessDenied />;
  // See the module comment: spend cannot honestly be split by centre.
  if (!can(user, "report.org")) {
    return (
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Ad performance</h1>
        <p className="max-w-prose text-sm text-muted-foreground">
          This screen needs organisation-wide report access. Advertising spend is charged per
          campaign, and a campaign&apos;s leads arrive at every centre, so there is no honest way
          to show one centre&apos;s share of it. Insights has the per-centre lead numbers.
        </p>
      </div>
    );
  }

  const params = await searchParams;
  const readOne = (key: string): string => {
    const raw = params[key];
    const value = Array.isArray(raw) ? raw[0] : raw;
    return typeof value === "string" && DATE_ONLY.test(value.trim()) ? value.trim() : "";
  };

  // Ninety days by default, not thirty: a lead that arrives in March
  // typically enrols in May, so a thirty-day window would show almost no
  // admissions against any of the spend in it.
  const from = readOne("from") || istDate(90);
  const to = readOne("to") || istDate(0);

  // An unknown platform reads as "all" rather than 404ing or showing an empty
  // table: the value comes off a URL somebody may have typed or kept from
  // before a platform was renamed, and an empty screen would look broken.
  const platformParam = Array.isArray(params.platform) ? params.platform[0] : params.platform;
  const platform = typeof platformParam === "string" && isAdPlatform(platformParam) ? platformParam : "";

  const presets = [
    { label: "Last 30 days", from: istDate(30), to: istDate(0) },
    { label: "Last 90 days", from: istDate(90), to: istDate(0) },
    { label: "Last 12 months", from: istDate(365), to: istDate(0) },
  ];

  // Asked of the credential store and of the spend table itself, not of
  // the rows in the chosen date range: "nothing in these dates" and
  // "nothing has ever arrived" are different answers, and only one of
  // them is anybody's job to fix. See SpendSourceNotice.
  const sources: SpendSource[] = [];

  let spendRows: SpendRow[];
  let attributed: AttributedLead[];

  try {
    // Spend is stored per day as a plain date, so the range is compared as
    // dates rather than instants — no timezone conversion to get wrong.
    spendRows = await timed("spend", () =>
      db
        .select({
          platform: adSpendDaily.platform,
          campaignId: adSpendDaily.campaignId,
          campaignName: adSpendDaily.campaignName,
          spendPaise: adSpendDaily.spendPaise,
          impressions: adSpendDaily.impressions,
          clicks: adSpendDaily.clicks,
        })
        .from(adSpendDaily)
        .where(
          and(
            gte(adSpendDaily.date, from),
            lte(adSpendDaily.date, to),
            platform ? eq(adSpendDaily.platform, platform) : undefined,
          ),
        ),
    );

    const syncedRows = await timed("spend-sync-state", () =>
      db
        .select({ platform: adSpendDaily.platform, lastDate: max(adSpendDaily.date) })
        .from(adSpendDaily)
        .groupBy(adSpendDaily.platform),
    );
    const lastSyncedByPlatform = new Map(syncedRows.map((row) => [row.platform, row.lastDate]));

    for (const { key: name } of AD_PLATFORMS) {
      if (platform && name !== platform) continue;
      // The ads token is the one the spend sync actually uses — a Page
      // token is enough for lead delivery and cannot read ad account
      // spend, so "Meta is connected" on the integrations index is not
      // the same question as "can we read what Meta charged".
      const tokenKey = name === "meta" ? "ads_access_token" : "refresh_token";
      sources.push({
        platform: name,
        connected:
          (await hasIntegrationCredential(name, tokenKey)) &&
          (await hasIntegrationCredential(name, name === "meta" ? "ad_account_id" : "customer_id")),
        lastSyncedDate: lastSyncedByPlatform.get(name) ?? null,
      });
    }

    const leadRows = await timed("leads", () =>
      db
        .select({ id: leads.id })
        .from(leads)
        .where(
          and(
            isNull(leads.deletedAt),
            gte(leads.createdAt, new Date(`${from}T00:00:00+05:30`)),
            lte(leads.createdAt, new Date(`${to}T23:59:59.999+05:30`)),
          ),
        ),
    );
    const leadIds = leadRows.map((row) => row.id);

    // First enquiry per lead decides the campaign. CLAUDE.md is explicit
    // that first-touch is never overwritten: the campaign that FOUND the
    // person earned the admission, even if they later filled in a form on
    // the website. Ordered ascending so the first row seen per lead wins.
    const enquiryRows = leadIds.length
      ? await timed("enquiries", () =>
          db
            .select({
              leadId: enquiries.leadId,
              source: enquiries.source,
              campaignId: enquiries.campaignId,
              adPlatform: enquiries.adPlatform,
            })
            .from(enquiries)
            .where(inArray(enquiries.leadId, leadIds))
            .orderBy(asc(enquiries.receivedAt)),
        )
      : [];

    // An admission is an enrolment past the sales→accounts gate that has
    // not been dropped. A dropped student is not a conversion — the same
    // rule the Insights outcome column uses, so the two agree.
    const enrolmentRows = leadIds.length
      ? await timed("enrolments", () =>
          db
            .select({
              id: enrolments.id,
              leadId: enrolments.leadId,
              netFeePaise: enrolments.netFeePaise,
            })
            .from(enrolments)
            .where(
              and(
                inArray(enrolments.leadId, leadIds),
                isNull(enrolments.deletedAt),
                isNull(enrolments.droppedAt),
                isNotNull(enrolments.salesToAccountsAt),
              ),
            ),
        )
      : [];

    const enrolmentIds = enrolmentRows.map((row) => row.id);
    const paymentRows = enrolmentIds.length
      ? await timed("payments", () =>
          db
            .select({
              enrolmentId: payments.enrolmentId,
              amountPaise: payments.amountPaise,
              direction: payments.direction,
            })
            .from(payments)
            .where(inArray(payments.enrolmentId, enrolmentIds)),
        )
      : [];

    // Every rule about what these rows mean — first enquiry wins, a
    // refund reduces what was collected, a second enrolment is the same
    // person — lives in attributeLeads() where it is tested.
    attributed = attributeLeads({ leadIds, enquiryRows, enrolmentRows, paymentRows });
  } catch (error) {
    if (isDeadlineExceeded(error)) return <Unavailable slow />;
    if (isDatabaseUnreachable(error)) return <Unavailable slow={false} />;
    throw error;
  }

  // Filtering the spend alone would leave the other platform's campaigns on
  // screen with no spend against them, which reads as "this campaign cost
  // nothing" rather than "wrong tab". Both sides get filtered.
  const platformLeads = platform
    ? attributed.filter((lead) => lead.platform === platform)
    : attributed;

  const rows = combinePerformance(spendRows, platformLeads);
  const totals = performanceTotals(rows);

  // Counted from the unfiltered set on purpose: a walk-in belongs to no
  // platform, so on a single-platform tab it is not zero but
  // not-applicable — and the tile is hidden rather than showing a nought
  // somebody would read as "we got no referrals".
  const organicLeads = attributed.filter((lead) => lead.campaignId === null).length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Ad performance</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          {platform
            ? `What ${platformLabel(platform)} charged, and what it turned into. `
            : "What each platform charged, and what it turned into. "}
          Spend is counted in the dates below; a lead is counted if it arrived in them, and its
          admission counts whenever it happened — so a recent period&apos;s admissions are
          genuinely incomplete and will keep rising for weeks.
        </p>
      </div>

      <SpendSourceNotice sources={sources} />

      <PlatformTabs platforms={AD_PLATFORMS} active={platform} />

      <DateRangeControls from={from} to={to} presets={presets} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Ad spend" value={formatINR(totals.spendPaise)} hint={`${from} to ${to}`} />
        <Metric
          label="Cost per lead"
          value={money(totals.costPerLeadPaise)}
          hint={`${totals.leads} lead${totals.leads === 1 ? "" : "s"} from ads`}
        />
        <Metric
          label="Cost per admission"
          value={money(totals.costPerAdmissionPaise)}
          hint={`${totals.admissions} admission${totals.admissions === 1 ? "" : "s"} · ${formatPercent(totals.conversionRate)} of leads`}
        />
        <Metric
          label="Return on ad spend"
          value={formatMultiple(totals.roas)}
          hint={`${formatINR(totals.bookedPaise)} booked, ${formatINR(totals.collectedPaise)} collected`}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Metric
          label="LTV : CAC"
          value={formatMultiple(totals.ltvToCac)}
          hint={`Average fee ${money(totals.averageAdmissionValuePaise)} against ${money(totals.costPerAdmissionPaise)} to win it`}
        />
        {platform ? null : (
          <Metric
            label="Leads not from ads"
            value={String(organicLeads)}
            hint="Walk-ins, referrals, the website — no campaign, so no cost against them here"
          />
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">By campaign</h2>
        {rows.length === 0 ? (
          <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            No advertising spend and no ad-sourced leads in this period. If that is a surprise,
            check that the Meta and Google integrations are connected in Settings → Integrations
            — the nightly spend sync is what fills this page.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign</TableHead>
                  <TableHead className="text-right">Spend</TableHead>
                  <TableHead className="text-right">Leads</TableHead>
                  <TableHead className="text-right">Cost / lead</TableHead>
                  <TableHead className="text-right">Admissions</TableHead>
                  <TableHead className="text-right">Cost / admission</TableHead>
                  <TableHead className="text-right">Booked</TableHead>
                  <TableHead className="text-right">ROAS</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={`${row.platform}:${row.campaignId}`}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{platformShort(row.platform)}</Badge>
                        <span className="font-medium">{row.campaignName}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatINR(row.spendPaise)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{row.leads}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money(row.costPerLeadPaise)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{row.admissions}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money(row.costPerAdmissionPaise)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatINR(row.bookedPaise)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMultiple(row.roas)}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="border-t-2 font-semibold">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatINR(totals.spendPaise)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{totals.leads}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(totals.costPerLeadPaise)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{totals.admissions}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(totals.costPerAdmissionPaise)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatINR(totals.bookedPaise)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMultiple(totals.roas)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <p className="max-w-3xl text-xs text-muted-foreground">
        <strong>Booked</strong> is the net fee agreed on those admissions;{" "}
        <strong>collected</strong> is what has actually been received against them, which for
        instalment plans is always lower. ROAS is booked revenue over spend. A campaign with
        spend and no leads still appears — that is the row worth finding. A dash means the sum
        has no answer yet, not zero.
      </p>
    </div>
  );
}
