"use client";

import { useActionState, useState, useTransition } from "react";
import { ChevronDown, ChevronRight, Plus, UserPlus, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { dayName, formatTime } from "@/lib/faculty/availability";

import {
  addAvailabilityWindow,
  addLeave,
  archiveFaculty,
  removeFacultyRow,
  saveFaculty,
  setFacultyCenters,
  setFacultySubjects,
  type FacultyFormState,
} from "./actions";

interface Option {
  value: string;
  label: string;
}

interface WindowRow {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

interface LeaveRow {
  id: string;
  startDate: string;
  endDate: string;
  reason: string | null;
}

export interface Person {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  employmentType: string | null;
  availabilityMode: "always" | "by_window";
  profileId: string | null;
  notes: string | null;
  isActive: boolean;
  subjects: string[];
  centerIds: string[];
  windows: WindowRow[];
  leave: LeaveRow[];
}

const EMPTY: FacultyFormState = {};

export function FacultyRoster({
  people,
  centres,
  subjectOptions,
  typeOptions,
  linkableUsers,
  canEdit,
}: {
  people: Person[];
  centres: Array<{ id: string; name: string }>;
  subjectOptions: Option[];
  typeOptions: Option[];
  linkableUsers: Array<{ id: string; fullName: string | null }>;
  canEdit: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const centreName = new Map(centres.map((c) => [c.id, c.name]));
  const subjectLabel = new Map(subjectOptions.map((o) => [o.value, o.label]));
  const typeLabel = new Map(typeOptions.map((o) => [o.value, o.label]));

  return (
    <div className="flex flex-col gap-4">
      {canEdit ? (
        adding ? (
          <Card>
            <CardHeader>
              <CardTitle>Add someone</CardTitle>
            </CardHeader>
            <CardContent>
              <PersonForm
                typeOptions={typeOptions}
                linkableUsers={linkableUsers}
                onDone={(id) => {
                  setAdding(false);
                  if (id) setOpenId(id);
                }}
              />
            </CardContent>
          </Card>
        ) : (
          <Button type="button" className="self-start" onClick={() => setAdding(true)}>
            <UserPlus className="size-4" />
            Add faculty
          </Button>
        )
      ) : null}

      {people.length === 0 ? (
        <p className="rounded-lg border py-10 text-center text-sm text-muted-foreground">
          Nobody on the roster yet. A name is all it takes to start.
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        {people.map((person) => {
          const isOpen = openId === person.id;
          return (
            <div key={person.id} className="rounded-lg border">
              <button
                type="button"
                onClick={() => setOpenId(isOpen ? null : person.id)}
                aria-expanded={isOpen}
                className="flex w-full flex-wrap items-center gap-2 p-3 text-left"
              >
                {isOpen ? (
                  <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                )}
                <span className="font-medium">{person.fullName}</span>

                {!person.isActive ? <Badge variant="outline">Not teaching</Badge> : null}
                {person.employmentType ? (
                  <Badge variant="secondary">
                    {typeLabel.get(person.employmentType) ?? person.employmentType}
                  </Badge>
                ) : null}

                <span className="text-sm text-muted-foreground">
                  {person.subjects.length > 0
                    ? person.subjects
                        .map((s) => subjectLabel.get(s) ?? s)
                        .join(", ")
                    : "No subjects yet"}
                </span>

                <span className="ml-auto text-sm text-muted-foreground">
                  {person.centerIds.length > 0
                    ? person.centerIds.map((id) => centreName.get(id) ?? "?").join(" · ")
                    : "No centre"}
                </span>
              </button>

              {isOpen ? (
                <div className="flex flex-col gap-6 border-t bg-muted/30 p-4">
                  {canEdit ? (
                    <>
                      <PersonForm
                        person={person}
                        typeOptions={typeOptions}
                        linkableUsers={linkableUsers}
                      />
                      <ChipPicker
                        title="Teaches"
                        help="Which subjects this person can take. The timetable only offers them blocks in these."
                        options={subjectOptions}
                        selected={person.subjects}
                        onSave={(values) => setFacultySubjects(person.id, values)}
                      />
                      <ChipPicker
                        title="Works at"
                        help="A visiting faculty member can be at both centres."
                        options={centres.map((c) => ({ value: c.id, label: c.name }))}
                        selected={person.centerIds}
                        onSave={(values) => setFacultyCenters(person.id, values)}
                      />
                      <Windows person={person} />
                      <Leave person={person} />
                    </>
                  ) : (
                    <ReadOnlyDetail person={person} subjectLabel={subjectLabel} />
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PersonForm({
  person,
  typeOptions,
  linkableUsers,
  onDone,
}: {
  person?: Person;
  typeOptions: Option[];
  linkableUsers: Array<{ id: string; fullName: string | null }>;
  onDone?: (id?: string) => void;
}) {
  const [state, action, pending] = useActionState(saveFaculty, EMPTY);
  const [mode, setMode] = useState(person?.availabilityMode ?? "always");
  const [busy, startBusy] = useTransition();

  if (state.success && onDone) queueMicrotask(() => onDone(state.facultyId));

  const prefix = person?.id ?? "new";

  return (
    <form action={action} className="flex flex-col gap-4">
      {person ? <input type="hidden" name="id" value={person.id} /> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${prefix}-name`}>Name</Label>
          <Input
            id={`${prefix}-name`}
            name="fullName"
            required
            defaultValue={person?.fullName ?? ""}
            placeholder="Athira Menon"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${prefix}-type`}>Type</Label>
          <select
            id={`${prefix}-type`}
            name="employmentType"
            defaultValue={person?.employmentType ?? ""}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="">Not set</option>
            {typeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${prefix}-phone`}>Phone</Label>
          <Input id={`${prefix}-phone`} name="phone" defaultValue={person?.phone ?? ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${prefix}-email`}>Email</Label>
          <Input
            id={`${prefix}-email`}
            name="email"
            type="email"
            defaultValue={person?.email ?? ""}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${prefix}-mode`}>Availability</Label>
          <select
            id={`${prefix}-mode`}
            name="availabilityMode"
            value={mode}
            onChange={(e) => setMode(e.target.value as "always" | "by_window")}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="always">Available any time</option>
            <option value="by_window">Only these hours</option>
          </select>
          <p className="text-xs text-muted-foreground">
            {mode === "always"
              ? "Schedulable whenever, apart from clashes and leave."
              : "Only offered slots inside the windows below."}
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${prefix}-login`}>Login</Label>
          <select
            id={`${prefix}-login`}
            name="profileId"
            defaultValue={person?.profileId ?? ""}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="">No login</option>
            {linkableUsers.map((account) => (
              <option key={account.id} value={account.id}>
                {account.fullName ?? account.id.slice(0, 8)}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            Only needed if they sign in to grade work. Create the account in Settings → Users
            first.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${prefix}-notes`}>Notes</Label>
        <Textarea id={`${prefix}-notes`} name="notes" rows={2} defaultValue={person?.notes ?? ""} />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="isActive"
          className="size-4"
          defaultChecked={person?.isActive ?? true}
        />
        Currently teaching
      </label>

      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      {state.success && !onDone ? (
        <p className="text-sm text-muted-foreground">{state.success}</p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : person ? "Save" : "Add"}
        </Button>
        {onDone ? (
          <Button type="button" size="sm" variant="ghost" onClick={() => onDone()}>
            Cancel
          </Button>
        ) : null}
        {person ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy}
            className="ml-auto text-destructive"
            onClick={() => {
              if (!window.confirm(`Remove ${person.fullName} from the roster?`)) return;
              startBusy(async () => {
                await archiveFaculty(person.id);
              });
            }}
          >
            Remove
          </Button>
        ) : null}
      </div>
    </form>
  );
}

/**
 * A multi-select that saves on its own button rather than on each click.
 *
 * Saving per click means a mis-tap is a write, and on a slow connection
 * the chips flicker back to where they were. One explicit save is both
 * calmer and cheaper.
 */
function ChipPicker({
  title,
  help,
  options,
  selected,
  onSave,
}: {
  title: string;
  help: string;
  options: Option[];
  selected: string[];
  onSave: (values: string[]) => Promise<FacultyFormState>;
}) {
  const [values, setValues] = useState<string[]>(selected);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, startBusy] = useTransition();

  const dirty =
    values.length !== selected.length || values.some((value) => !selected.includes(value));

  return (
    <div className="flex flex-col gap-2">
      <div>
        <h3 className="text-sm font-medium">{title}</h3>
        <p className="text-xs text-muted-foreground">{help}</p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {options.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing to choose from yet — add options in Settings → Dropdowns.
          </p>
        ) : null}
        {options.map((option) => {
          const on = values.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={on}
              onClick={() =>
                setValues((current) =>
                  on ? current.filter((v) => v !== option.value) : [...current, option.value],
                )
              }
              className={`rounded-full border px-2.5 py-1 text-sm transition-colors ${
                on
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input hover:bg-muted"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {dirty ? (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            disabled={busy}
            onClick={() =>
              startBusy(async () => {
                const result = await onSave(values);
                setMessage(result.error ?? result.success ?? null);
              })
            }
          >
            {busy ? "Saving…" : "Save"}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setValues(selected)}>
            Undo
          </Button>
        </div>
      ) : null}

      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
    </div>
  );
}

function Windows({ person }: { person: Person }) {
  const [state, action, pending] = useActionState(addAvailabilityWindow, EMPTY);
  const [busy, startBusy] = useTransition();

  if (person.availabilityMode === "always") {
    return (
      <p className="text-sm text-muted-foreground">
        Available any time — no hours to set. Switch to &ldquo;Only these hours&rdquo; above if
        that changes.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">Hours they can teach</h3>

      {person.windows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No hours yet — and with &ldquo;Only these hours&rdquo; set, that means they will never
          be offered a slot. Add at least one.
        </p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {person.windows.map((window) => (
            <li
              key={window.id}
              className="flex items-center gap-1 rounded-full border bg-background px-2.5 py-1 text-sm"
            >
              {dayName(window.dayOfWeek, true)} {formatTime(window.startTime)}–
              {formatTime(window.endTime)}
              <button
                type="button"
                aria-label="Remove this window"
                disabled={busy}
                className="text-muted-foreground hover:text-destructive"
                onClick={() =>
                  startBusy(async () => {
                    await removeFacultyRow("window", window.id);
                  })
                }
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <form action={action} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="facultyId" value={person.id} />
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${person.id}-dow`} className="text-xs">
            Day
          </Label>
          <select
            id={`${person.id}-dow`}
            name="dayOfWeek"
            defaultValue="6"
            className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
          >
            {[0, 1, 2, 3, 4, 5, 6].map((day) => (
              <option key={day} value={day}>
                {dayName(day)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${person.id}-from`} className="text-xs">
            From
          </Label>
          <Input
            id={`${person.id}-from`}
            name="startTime"
            type="time"
            defaultValue="10:00"
            className="h-8 w-28"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${person.id}-to`} className="text-xs">
            To
          </Label>
          <Input
            id={`${person.id}-to`}
            name="endTime"
            type="time"
            defaultValue="13:00"
            className="h-8 w-28"
          />
        </div>
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          <Plus className="size-3.5" />
          {pending ? "…" : "Add"}
        </Button>
        {state.error ? <p className="w-full text-sm text-destructive">{state.error}</p> : null}
      </form>
    </div>
  );
}

function Leave({ person }: { person: Person }) {
  const [state, action, pending] = useActionState(addLeave, EMPTY);
  const [busy, startBusy] = useTransition();

  return (
    <div className="flex flex-col gap-2">
      <div>
        <h3 className="text-sm font-medium">Away</h3>
        <p className="text-xs text-muted-foreground">
          Dates they cannot teach. The timetable will not put them in a class on these days.
        </p>
      </div>

      {person.leave.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {person.leave.map((row) => (
            <li
              key={row.id}
              className="flex items-center gap-1 rounded-full border bg-background px-2.5 py-1 text-sm"
            >
              {row.startDate === row.endDate ? row.startDate : `${row.startDate} → ${row.endDate}`}
              {row.reason ? (
                <span className="text-muted-foreground">· {row.reason}</span>
              ) : null}
              <button
                type="button"
                aria-label="Remove this leave"
                disabled={busy}
                className="text-muted-foreground hover:text-destructive"
                onClick={() =>
                  startBusy(async () => {
                    await removeFacultyRow("leave", row.id);
                  })
                }
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <form action={action} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="facultyId" value={person.id} />
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${person.id}-leave-from`} className="text-xs">
            From
          </Label>
          <Input
            id={`${person.id}-leave-from`}
            name="startDate"
            type="date"
            required
            className="h-8"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${person.id}-leave-to`} className="text-xs">
            To
          </Label>
          <Input id={`${person.id}-leave-to`} name="endDate" type="date" required className="h-8" />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${person.id}-leave-why`} className="text-xs">
            Reason
          </Label>
          <Input
            id={`${person.id}-leave-why`}
            name="reason"
            placeholder="Optional"
            className="h-8"
          />
        </div>
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          <Plus className="size-3.5" />
          {pending ? "…" : "Add"}
        </Button>
        {state.error ? <p className="w-full text-sm text-destructive">{state.error}</p> : null}
      </form>
    </div>
  );
}

function ReadOnlyDetail({
  person,
  subjectLabel,
}: {
  person: Person;
  subjectLabel: Map<string, string>;
}) {
  return (
    <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
      <div>
        <dt className="text-muted-foreground">Teaches</dt>
        <dd>
          {person.subjects.length > 0
            ? person.subjects.map((s) => subjectLabel.get(s) ?? s).join(", ")
            : "—"}
        </dd>
      </div>
      <div>
        <dt className="text-muted-foreground">Contact</dt>
        <dd>{person.phone ?? person.email ?? "—"}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground">Availability</dt>
        <dd>
          {person.availabilityMode === "always"
            ? "Any time"
            : person.windows
                .map(
                  (w) =>
                    `${dayName(w.dayOfWeek, true)} ${formatTime(w.startTime)}–${formatTime(w.endTime)}`,
                )
                .join(", ") || "No hours set"}
        </dd>
      </div>
      <div>
        <dt className="text-muted-foreground">Away</dt>
        <dd>
          {person.leave.length > 0
            ? person.leave.map((l) => `${l.startDate} → ${l.endDate}`).join(", ")
            : "—"}
        </dd>
      </div>
    </dl>
  );
}
