"use client";

import { CheckCircle2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ProfileFormField } from "@/lib/profile-form/get-form";
import { ALLOWED_EXTENSIONS, MAX_FILE_BYTES, MAX_UPLOAD_BYTES } from "@/lib/storage/shared";
import { submitProfileForm, type ProfileSubmitState } from "@/lib/profile-form/submit";

/**
 * One request carries every file, and the platform refuses a request over
 * about 4 MB outright — as a crash, not a message. So a phone photo is
 * shrunk in the browser first (a 5 MB camera shot becomes a few hundred KB,
 * still perfectly clear for a face or an ID card), and the total is checked
 * before anything is sent.
 */
const SHRINK_ABOVE_BYTES = 700 * 1024;
const MAX_EDGE = 1800;
// Room for the other answers and the multipart framing.
const BODY_BUDGET_BYTES = MAX_UPLOAD_BYTES - 200 * 1024;

async function shrinkImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size <= SHRINK_ABOVE_BYTES) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.82),
    );
    if (!blob || blob.size >= file.size) return file;
    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg" });
  } catch {
    // An odd format the browser cannot decode: send it as it is.
    return file;
  }
}

/**
 * Plain HTML inputs rather than the app's DynamicFieldInput: a student
 * fills this in on a phone, often on a poor connection. Native `required`,
 * `type="tel"` and `<select>` give better mobile keyboards and validation
 * than a custom widget, and the page works with almost no JavaScript.
 */
function Field({ field }: { field: ProfileFormField }) {
  const id = `field-${field.key}`;
  const required = field.isRequired;

  const input = (() => {
    switch (field.type) {
      case "long_text":
        return <Textarea id={id} name={field.key} required={required} rows={3} />;
      case "select":
        return (
          <select
            id={id}
            name={field.key}
            required={required}
            defaultValue=""
            className="flex h-10 w-full rounded-md border border-input bg-card px-3 text-base shadow-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring sm:text-[0.9375rem]"
          >
            <option value="" disabled>
              Select…
            </option>
            {field.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        );
      case "multiselect":
        return (
          <div className="grid gap-2 sm:grid-cols-2">
            {field.options.map((option) => (
              <label
                key={option.value}
                className="flex min-h-10 items-center gap-2 rounded-md border bg-card px-3 text-sm"
              >
                <Checkbox name={field.key} value={option.value} />
                {option.label}
              </label>
            ))}
          </div>
        );
      case "boolean":
        return (
          <label
            htmlFor={id}
            className="flex min-h-10 items-center gap-2 rounded-md border bg-card px-3 text-sm"
          >
            <Checkbox id={id} name={field.key} /> Yes
          </label>
        );
      case "date":
        return <Input id={id} name={field.key} type="date" required={required} />;
      case "number":
      case "currency":
        return <Input id={id} name={field.key} type="number" required={required} />;
      case "phone":
        return <Input id={id} name={field.key} type="tel" inputMode="tel" required={required} />;
      case "email":
        return <Input id={id} name={field.key} type="email" inputMode="email" required={required} />;
      // Without this a `file` field fell through to the text box below, so
      // asking a student for their ID proof produced a line of typing
      // instead of a photograph — and the value then crashed the parser,
      // which has no idea what to do with a File.
      //
      // `capture` is deliberately absent: a student photographing an ID
      // card usually already has the picture in their gallery, and forcing
      // the camera hides it.
      case "file":
        return (
          <Input
            id={id}
            name={field.key}
            type="file"
            accept={ALLOWED_EXTENSIONS}
            required={required}
            className="file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm"
          />
        );
      default:
        return <Input id={id} name={field.key} required={required} />;
    }
  })();

  // Wide controls take the whole row; the rest sit two to a row. Mixing them
  // in one two-column grid is what made the old form look ragged.
  const wide =
    field.type === "long_text" ||
    field.type === "multiselect" ||
    field.type === "file" ||
    Boolean(field.helpText);

  return (
    <div className={`flex flex-col gap-1.5 ${wide ? "sm:col-span-2" : ""}`}>
      <Label htmlFor={id} className="text-sm font-medium">
        {field.label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      {input}
      {field.helpText && <p className="text-xs text-muted-foreground">{field.helpText}</p>}
      {field.type === "file" && (
        <p className="text-xs text-muted-foreground">
          A photo or PDF, up to {MAX_FILE_BYTES / 1024 / 1024} MB. A clear picture from your
          phone is fine.
        </p>
      )}
    </div>
  );
}

export function ProfileFormFields({
  token,
  fields,
  accent,
}: {
  token: string;
  fields: ProfileFormField[];
  /** The institute's brand colour, for section headings and the submit button. */
  accent: string;
}) {
  const [state, setState] = useState<ProfileSubmitState>({});
  const [pending, setPending] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);

  async function submit(form: HTMLFormElement) {
    setPending(true);
    setState({});
    try {
      const data = new FormData(form);

      // Shrink photos, then make sure the whole request will fit.
      let total = 0;
      for (const [key, value] of [...data.entries()]) {
        if (value instanceof File && value.size > 0) {
          const smaller = await shrinkImage(value);
          data.set(key, smaller);
          total += smaller.size;
        }
      }
      if (total > BODY_BUDGET_BYTES) {
        setState({
          error: `Your files add up to ${(total / 1024 / 1024).toFixed(1)} MB and the limit is ${(BODY_BUDGET_BYTES / 1024 / 1024).toFixed(1)} MB in total. Please attach smaller photos or a PDF.`,
        });
        return;
      }

      setState(await submitProfileForm({}, data));
    } catch {
      // The request itself failed — a dropped connection, or the server
      // refusing it. Say so on the page and keep everything typed; never
      // let it take the form away.
      setState({
        error:
          "We couldn't send your details just now. Nothing was lost — please check your connection and press Submit again. If it keeps happening, try smaller photos or tell your centre.",
      });
    } finally {
      setPending(false);
    }
  }

  // A long form: the message is at the bottom, and a student who pressed
  // Submit from the middle would not see why nothing happened.
  useEffect(() => {
    if (state.error) errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [state]);

  if (state.success) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-10 text-center">
        <CheckCircle2 className="size-8 text-emerald-600" />
        <p className="text-sm font-medium">{state.success}</p>
        <p className="text-xs text-muted-foreground">
          Your centre will be in touch about the next step, which is the fee payment.
        </p>
      </div>
    );
  }

  // Grouped by the section each field belongs to, so a 30-field form reads
  // as a few short blocks rather than one intimidating column.
  const sections = [...new Set(fields.map((f) => f.section))];

  return (
    <form
      /*
        `onSubmit`, not `action={…}`.

        React 19 resets an uncontrolled form to its blank starting values
        after every form *action* finishes — including when the server
        answered with an error. A student who mistyped one field lost the
        whole form and had to attach their documents again. Submitting
        by hand runs the same server action without the reset, so when a
        value is refused everything typed and every file chosen stays where
        it was, and only the message appears.
      */
      onSubmit={(event) => {
        event.preventDefault();
        void submit(event.currentTarget);
      }}
      className="flex flex-col gap-8"
    >
      <input type="hidden" name="token" value={token} />

      <div className="hidden" aria-hidden="true">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      {sections.map((section) => (
        <section key={section} className="flex flex-col gap-4">
          <h2
            className="border-b pb-2 text-xs font-semibold uppercase tracking-widest"
            style={{ color: accent, borderColor: `${accent}33` }}
          >
            {section}
          </h2>
          <div className="grid items-start gap-x-4 gap-y-5 sm:grid-cols-2">
            {fields
              .filter((f) => f.section === section)
              .map((field) => (
                <Field key={field.key} field={field} />
              ))}
          </div>
        </section>
      ))}

      <div ref={errorRef}>{state.error && <FormMessage error={state.error} />}</div>

      <Button
        type="submit"
        disabled={pending}
        size="lg"
        className="w-full text-white"
        style={{ backgroundColor: accent }}
      >
        {pending ? "Submitting…" : "Submit my details"}
      </Button>
      <p className="text-xs text-muted-foreground">
        Your details are used only for your admission and course records.
      </p>
    </form>
  );
}
