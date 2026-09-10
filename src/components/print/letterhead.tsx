import { contactLine, formatAddress, type Brand } from "@/lib/brand/get-brand";

/**
 * The top of every document this system puts on paper.
 *
 * One component rather than a header per document, because the failure it
 * replaces was three documents with three different ideas of the brand —
 * two printing a name and logo, and the fee agreement carrying the mark,
 * the tagline and the accent colour typed into its own source. Changing
 * the logo in Settings changed the first two and did nothing to the one a
 * family signs.
 *
 * ## Everything optional is genuinely optional
 *
 * An institute part-way through filling in its details should get a
 * plainer letterhead, never a broken one: no blank rows, no stray commas,
 * no empty box where a logo will eventually go. Each line renders only if
 * it has content.
 *
 * ## The centre, when a centre issued it
 *
 * A receipt printed at Kannur carries Kannur's address and phone. Sending
 * somebody with a question about their receipt to the wrong office is a
 * small thing that makes an institute look disorganised at precisely the
 * moment it is handling their money.
 */
export interface LetterheadCentre {
  name: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
}

export function Letterhead({
  brand,
  centre,
  title,
  reference,
  compact = false,
}: {
  brand: Brand;
  centre?: LetterheadCentre | null;
  /** The document's own name — "Fee Receipt", "Installment Payment Agreement". */
  title?: string;
  /** Receipt number, form number, whatever this copy is identified by. */
  reference?: string;
  /** Tighter spacing, for a document that has to fit a fixed sheet. */
  compact?: boolean;
}) {
  const address = formatAddress(brand);
  const contact = contactLine(brand);
  const centreContact = centre
    ? [centre.address, centre.phone, centre.email].filter(Boolean).join("  ·  ")
    : "";

  return (
    <header
      className={compact ? "mb-3 border-b-2 pb-2" : "mb-5 border-b-2 pb-3"}
      style={{ borderColor: brand.primaryColor }}
    >
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          {brand.logoUrl ? (
            // A signed Storage URL or an arbitrary external one; next/image
            // would need every possible host allow-listed in next.config,
            // and this is a logo on a page that is about to be printed.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={brand.logoUrl}
              alt={brand.name}
              className={compact ? "mb-1 max-h-9 w-auto" : "mb-1.5 max-h-12 w-auto"}
            />
          ) : (
            <p
              className={compact ? "text-base font-bold" : "text-xl font-bold"}
              style={{ color: brand.primaryColor }}
            >
              {brand.name}
            </p>
          )}

          {brand.tagline && (
            <p className="text-[8px] uppercase tracking-wider text-gray-600">{brand.tagline}</p>
          )}

          {/* With a logo the name has not been said in words yet, and a
              document should name the institute in text as well as in a
              picture — a photocopy of a photocopy loses the logo first. */}
          {brand.logoUrl && (
            <p className="mt-0.5 text-[10px] font-semibold text-gray-800">
              {brand.legalName ?? brand.name}
            </p>
          )}

          {address && <p className="text-[9px] leading-snug text-gray-600">{address}</p>}
          {contact && <p className="text-[9px] leading-snug text-gray-600">{contact}</p>}
          {brand.gstin && <p className="text-[9px] text-gray-600">GSTIN: {brand.gstin}</p>}
        </div>

        {(title || reference || centre) && (
          <div className="shrink-0 text-right">
            {title && (
              <h1
                className={compact ? "text-base font-bold uppercase" : "text-lg font-bold uppercase"}
                style={{ color: brand.primaryColor }}
              >
                {title}
              </h1>
            )}
            {reference && <p className="text-[10px] text-gray-600">{reference}</p>}
            {centre && (
              <>
                <p className="mt-1 text-[10px] font-semibold text-gray-800">{centre.name}</p>
                {centreContact && (
                  <p className="max-w-[42mm] text-[9px] leading-snug text-gray-600">
                    {centreContact}
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </header>
  );
}

/**
 * The matching foot: whatever the institute wants on the bottom of every
 * document, plus when it was printed.
 *
 * The printed-on line is not decoration. These documents get scanned,
 * filed and argued about months later, and "which copy is this?" is
 * unanswerable without it.
 */
export function DocumentFooter({
  brand,
  printedOn,
  note,
}: {
  brand: Brand;
  /** Already formatted, so the caller decides the timezone and the format. */
  printedOn: string;
  note?: string;
}) {
  const line = note ?? brand.documentFooter;
  return (
    <footer className="mt-4 border-t pt-1.5 text-[8px] leading-snug text-gray-500">
      {line && <p>{line}</p>}
      <p>
        {brand.legalName ?? brand.name} · printed {printedOn}
      </p>
    </footer>
  );
}
