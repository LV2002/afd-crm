"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Echo } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { formatINR } from "@/lib/format/currency";
import { normalizePhone } from "@/lib/identity/normalize-phone";
import { cn } from "@/lib/utils";

/**
 * Inputs that say back what they understood.
 *
 * Every one of these wraps a plain `<input>` that still posts to the
 * server exactly as before — the server-side parsing is unchanged and
 * remains the thing that decides. What they add is an echo underneath, so
 * a mistake is visible while the person is still looking at the field
 * rather than three screens later when a fee is wrong or a number
 * doesn't ring.
 */

/**
 * A fee, a payment, a discount.
 *
 * Money is the highest-consequence typing anybody does here, and the
 * mistake is always the same one: a missing or extra zero. `45000` and
 * `4500` are indistinguishable at a glance in a text box and utterly
 * different in words — so the field says "₹45,000" underneath as you go.
 */
export function MoneyInput({
  name,
  id,
  defaultValue = "",
  value: controlledValue,
  onValueChange,
  required,
  disabled,
  placeholder = "45000",
  className,
  ...rest
}: Omit<React.ComponentProps<"input">, "value" | "onChange" | "type"> & {
  value?: string;
  onValueChange?: (value: string) => void;
}) {
  const isControlled = controlledValue !== undefined;
  const [uncontrolled, setUncontrolled] = React.useState(String(defaultValue ?? ""));
  const raw = isControlled ? controlledValue : uncontrolled;

  const cleaned = raw.replace(/[,\s₹]/g, "");
  const isNumber = cleaned !== "" && /^\d+(\.\d{1,2})?$/.test(cleaned);
  const paise = isNumber ? Math.round(Number(cleaned) * 100) : null;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
          ₹
        </span>
        <Input
          {...rest}
          id={id}
          name={name}
          value={raw}
          required={required}
          disabled={disabled}
          placeholder={placeholder}
          inputMode="decimal"
          autoComplete="off"
          aria-invalid={raw !== "" && !isNumber}
          onChange={(event) => {
            const next = event.target.value;
            if (!isControlled) setUncontrolled(next);
            onValueChange?.(next);
          }}
          className={cn("pl-7 tabular", className)}
        />
      </div>
      {raw !== "" &&
        (isNumber ? (
          <Echo tone="neutral">{formatINR(paise!)}</Echo>
        ) : (
          <Echo tone="bad">That isn&rsquo;t an amount — digits only, no words.</Echo>
        ))}
    </div>
  );
}

/**
 * A phone number.
 *
 * Everything downstream hangs off this: duplicate detection, the WhatsApp
 * thread, the suppression list. A number saved wrong is a lead nobody can
 * ring and a person the system will never recognise again — so the field
 * shows the E.164 form it will actually store, which is also how a nine-
 * digit number gives itself away.
 */
export function PhoneInput({
  name,
  id,
  defaultValue = "",
  value: controlledValue,
  onValueChange,
  required,
  disabled,
  placeholder = "98471 23456",
  className,
  ...rest
}: Omit<React.ComponentProps<"input">, "value" | "onChange" | "type"> & {
  value?: string;
  onValueChange?: (value: string) => void;
}) {
  const isControlled = controlledValue !== undefined;
  const [uncontrolled, setUncontrolled] = React.useState(String(defaultValue ?? ""));
  const raw = isControlled ? controlledValue : uncontrolled;

  const normalised = raw.trim() ? normalizePhone(raw) : null;

  return (
    <div className="flex flex-col gap-1.5">
      <Input
        {...rest}
        id={id}
        name={name}
        value={raw}
        required={required}
        disabled={disabled}
        placeholder={placeholder}
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        aria-invalid={raw.trim() !== "" && !normalised}
        onChange={(event) => {
          const next = event.target.value;
          if (!isControlled) setUncontrolled(next);
          onValueChange?.(next);
        }}
        className={cn("tabular", className)}
      />
      {raw.trim() !== "" &&
        (normalised ? (
          <Echo tone="good">Saved as {normalised}</Echo>
        ) : (
          <Echo tone="bad">
            That isn&rsquo;t a number we can dial — a 10-digit Indian mobile, or one with
            +91 in front.
          </Echo>
        ))}
    </div>
  );
}

/** Adds whole days to today in Asia/Kolkata and returns `yyyy-MM-dd`. */
function istDatePlus(days: number): string {
  const nowIST = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }),
  );
  nowIST.setDate(nowIST.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${nowIST.getFullYear()}-${pad(nowIST.getMonth() + 1)}-${pad(nowIST.getDate())}`;
}

const QUICK_DATES: Array<{ label: string; days: number }> = [
  { label: "Tomorrow", days: 1 },
  { label: "In 3 days", days: 3 },
  { label: "Next week", days: 7 },
  { label: "In 2 weeks", days: 14 },
];

/**
 * A date, with the four answers people actually give.
 *
 * Counsellors set a next-follow-up date dozens of times a day and they
 * almost never mean a specific calendar square — they mean "in three
 * days". Making them work that out and then find it in a date picker is
 * where wrong dates come from, and a follow-up set to the wrong day is a
 * lead that goes quiet.
 *
 * The date field is still there and still authoritative. The buttons just
 * fill it in.
 */
export function DateInput({
  name,
  id,
  defaultValue = "",
  required,
  disabled,
  min,
  quickPicks = true,
  className,
  ...rest
}: Omit<React.ComponentProps<"input">, "type"> & { quickPicks?: boolean }) {
  const [value, setValue] = React.useState(String(defaultValue ?? ""));
  const today = istDatePlus(0);

  return (
    <div className="flex flex-col gap-2">
      <Input
        {...rest}
        id={id}
        name={name}
        type="date"
        value={value}
        required={required}
        disabled={disabled}
        min={min}
        onChange={(event) => setValue(event.target.value)}
        className={cn("tabular", className)}
      />
      {quickPicks && !disabled && (
        <div className="flex flex-wrap gap-1.5">
          {QUICK_DATES.map((pick) => {
            const target = istDatePlus(pick.days);
            return (
              <Button
                key={pick.label}
                type="button"
                variant={value === target ? "secondary" : "outline"}
                size="sm"
                onClick={() => setValue(target)}
              >
                {pick.label}
              </Button>
            );
          })}
          {value && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setValue("")}>
              Clear
            </Button>
          )}
        </div>
      )}
      {value && value < today && (
        <Echo tone="bad">That date has already passed.</Echo>
      )}
    </div>
  );
}
