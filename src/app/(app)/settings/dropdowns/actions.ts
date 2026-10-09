"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser } from "@/lib/auth/session";
import { INTERESTED_METADATA_KEY } from "@/lib/leads/interested-temperature";
import { kindOf } from "@/lib/leads/temperature-kinds";
import { applyTemperatureMeaning, kindChangeError } from "@/lib/leads/temperature-metadata";
import { createClient } from "@/lib/supabase/server";

export interface OptionFormState {
  error?: string;
  success?: string;
}

const optionSchema = z.object({
  value: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z][a-z0-9_]*$/, "Use lowercase letters, numbers and underscores"),
  label: z.string().trim().min(1, "Label is required"),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour")
    .optional()
    .or(z.literal("")),
});

export async function createOption(
  category: string,
  _prevState: OptionFormState,
  formData: FormData,
): Promise<OptionFormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) {
    return { error: "You don't have permission to do that." };
  }

  const parsed = optionSchema.safeParse({
    value: formData.get("value"),
    label: formData.get("label"),
    color: formData.get("color"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const supabase = await createClient();
  const { count } = await supabase
    .from("dropdown_options")
    .select("id", { count: "exact", head: true })
    .eq("category", category);

  /*
    A new temperature must say what it MEANS. Without a kind it would
    default to "being worked", which is a safe default but a silent one:
    an admin adding "Called twice, no answer" probably does mean that, and
    one adding "Enrolled elsewhere" certainly does not.

    "Took admission" cannot be the kind of a NEW temperature. The only way
    onto it is a confirmed admission, and a second option carrying it would
    be a second door nobody asked for.
  */
  let metadata: Record<string, unknown> | undefined;
  if (category === "temperature") {
    const meaning = applyTemperatureMeaning(null, {
      kind: String(formData.get("kind") ?? "open"),
      probability: String(formData.get("probability") ?? ""),
      requiresReason: formData.get("requiresReason") === "on",
      interested: formData.get("interested") === "on",
    });
    if (!meaning.ok) return { error: meaning.error };
    if (meaning.metadata.kind === "won") {
      return {
        error:
          "A new temperature cannot be 'Took admission' — that status is reached only by confirming an admission, and the existing one already is.",
      };
    }
    metadata = meaning.metadata;
  }

  const { data, error } = await supabase
    .from("dropdown_options")
    .insert({
      category,
      value: parsed.data.value,
      label: parsed.data.label,
      color: parsed.data.color || null,
      sort_order: count ?? 0,
      ...(metadata ? { metadata } : {}),
    })
    .select("id")
    .single();

  if (error) {
    return { error: error.message };
  }

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "dropdown_option.create",
    entityType: "dropdown_options",
    entityId: data.id,
    after: { category, ...parsed.data },
  });

  revalidatePath(`/settings/dropdowns/${category}`);
  revalidatePath("/settings/temperatures");
  return { success: "Added." };
}

export async function updateOption(
  optionId: string,
  category: string,
  _prevState: OptionFormState,
  formData: FormData,
): Promise<OptionFormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) {
    return { error: "You don't have permission to do that." };
  }

  const supabase = await createClient();

  const { data: current } = await supabase
    .from("dropdown_options")
    .select("value, metadata")
    .eq("id", optionId)
    .maybeSingle<{ value: string; metadata: Record<string, unknown> | null }>();
  if (!current) return { error: "That option no longer exists." };

  /*
    A temperature's VALUE is its identity, not a label.

    Leads store the value ("took_admission"), and the status rules look
    the kind up by it, so renaming one orphans every lead carrying the old
    value and detaches it from its own rules. Nobody needs to rename it —
    the label is what people read — so for temperatures the posted value
    is ignored and the stored one kept.
  */
  const parsed = optionSchema.safeParse({
    value: category === "temperature" ? current.value : formData.get("value"),
    label: formData.get("label"),
    color: formData.get("color"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  /*
    `metadata` is merged, never replaced.

    The temperature options carry keys the seed wrote, and other
    categories may grow their own. Writing a fresh object over the column
    would silently delete whatever else was in there — the kind of data
    loss that shows up months later as a feature that stopped working and
    nobody can say when.

    For every category but temperature the only key written is the
    `interested` flag, which reads as "absent" there and is harmless. For
    temperature the whole meaning (kind, chance, reason) is validated
    together — see lib/leads/temperature-metadata.ts.
  */
  let metadata: Record<string, unknown>;
  if (category === "temperature") {
    const meaning = applyTemperatureMeaning(current.metadata, {
      kind: String(formData.get("kind") ?? ""),
      probability: String(formData.get("probability") ?? ""),
      requiresReason: formData.get("requiresReason") === "on",
      interested: formData.get("interested") === "on",
    });
    if (!meaning.ok) return { error: meaning.error };

    const oldKind = kindOf(current.metadata);
    const newKind = kindOf(meaning.metadata);
    if (oldKind !== newKind && (oldKind === "won" || newKind === "won")) {
      const { count } = await supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("temperature", current.value)
        .is("deleted_at", null);
      const refusal = kindChangeError(oldKind, newKind, count ?? 0);
      if (refusal) return { error: refusal };
    }
    metadata = meaning.metadata;
  } else {
    metadata = {
      ...(current.metadata ?? {}),
      [INTERESTED_METADATA_KEY]: formData.get("interested") === "on",
    };
  }

  const { error } = await supabase
    .from("dropdown_options")
    .update({
      value: parsed.data.value,
      label: parsed.data.label,
      color: parsed.data.color || null,
      metadata,
    })
    .eq("id", optionId);

  if (error) {
    return { error: error.message };
  }

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "dropdown_option.update",
    entityType: "dropdown_options",
    entityId: optionId,
    after: { ...parsed.data, metadata },
  });

  revalidatePath(`/settings/dropdowns/${category}`);
  revalidatePath("/settings/temperatures");
  // The dashboard's Interested tile reads the flag, and every lead page and
  // list reads the kind.
  revalidatePath("/dashboard");
  revalidatePath("/leads");
  return { success: "Saved." };
}

export async function setOptionActive(optionId: string, category: string, isActive: boolean): Promise<void> {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) return;

  const supabase = await createClient();
  const { error } = await supabase.from("dropdown_options").update({ is_active: isActive }).eq("id", optionId);
  if (error) return;

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: isActive ? "dropdown_option.activate" : "dropdown_option.deactivate",
    entityType: "dropdown_options",
    entityId: optionId,
  });

  revalidatePath(`/settings/dropdowns/${category}`);
  revalidatePath("/settings/temperatures");
}

export async function deleteOption(optionId: string, category: string): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) {
    return { error: "You don't have permission to do that." };
  }

  const supabase = await createClient();

  /*
    A temperature somebody is carrying cannot be deleted out from under
    them.

    The lead keeps the stored value, but the option is what gives it a
    label, a colour and — above all — a KIND. Delete "Took admission" and
    every confirmed admission is suddenly an unclassified lead; delete
    "Negative" and every closed lead goes back to looking open. Switching
    it off is the safe version: the leads keep it, new ones cannot be given
    it, and it can be switched back on.
  */
  if (category === "temperature") {
    const { data: option } = await supabase
      .from("dropdown_options")
      .select("value, label")
      .eq("id", optionId)
      .maybeSingle<{ value: string; label: string }>();
    if (option) {
      const { count } = await supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("temperature", option.value)
        .is("deleted_at", null);
      if ((count ?? 0) > 0) {
        return {
          error: `${count} lead${count === 1 ? " is" : "s are"} on "${option.label}". Switch it off instead — they keep it, but it can't be chosen for anyone else.`,
        };
      }
    }
  }

  // Soft delete (CLAUDE.md non-negotiable #5: nothing is hard-deleted) —
  // dropdown_options has a deleted_at column for exactly this. Also clears
  // is_active so the option stops appearing anywhere is_active=true is
  // already filtered (getDropdownOptions, temperature rule forms, etc).
  const { error } = await supabase
    .from("dropdown_options")
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq("id", optionId);
  if (error) {
    return { error: error.message };
  }

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "dropdown_option.delete",
    entityType: "dropdown_options",
    entityId: optionId,
  });

  revalidatePath(`/settings/dropdowns/${category}`);
  revalidatePath("/settings/temperatures");
  return {};
}

export async function moveOption(
  optionId: string,
  category: string,
  direction: "up" | "down",
): Promise<void> {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) return;

  const supabase = await createClient();
  const { data: options } = await supabase
    .from("dropdown_options")
    .select("id, sort_order")
    .eq("category", category)
    .order("sort_order")
    .returns<Array<{ id: string; sort_order: number }>>();

  if (!options) return;

  const index = options.findIndex((o) => o.id === optionId);
  const swapIndex = direction === "up" ? index - 1 : index + 1;
  if (index === -1 || swapIndex < 0 || swapIndex >= options.length) return;

  const current = options[index];
  const swap = options[swapIndex];

  await supabase.from("dropdown_options").update({ sort_order: swap.sort_order }).eq("id", current.id);
  await supabase.from("dropdown_options").update({ sort_order: current.sort_order }).eq("id", swap.id);

  revalidatePath(`/settings/dropdowns/${category}`);
  revalidatePath("/settings/temperatures");
}

const categorySchema = z.object({
  key: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z][a-z0-9_]*$/, "Use lowercase letters, numbers and underscores"),
  label: z.string().trim().min(1, "Label is required"),
});

export interface CategoryFormState {
  error?: string;
  success?: string;
}

export async function createCategory(
  _prevState: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) {
    return { error: "You don't have permission to do that." };
  }

  const parsed = categorySchema.safeParse({ key: formData.get("key"), label: formData.get("label") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("dropdown_categories").insert(parsed.data);
  if (error) {
    return { error: error.message };
  }

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "dropdown_category.create",
    entityType: "dropdown_categories",
    entityId: parsed.data.key,
    after: parsed.data,
  });

  revalidatePath("/settings/dropdowns");
  return { success: "Category created." };
}
