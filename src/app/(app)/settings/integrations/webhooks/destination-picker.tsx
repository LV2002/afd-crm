"use client";

import { useState } from "react";

import { Label } from "@/components/ui/label";

export interface ListChoice {
  id: string;
  name: string;
}

/**
 * "Send these to: Leads / A database", and which database.
 *
 * A lead enters the sales pipeline and gets an owner; a database entry is
 * just a person on a list (retargeting audiences, purchased exam lists) and
 * can be turned into a lead later.
 */
export function DestinationPicker({
  idPrefix,
  lists,
  destination,
  contactListId,
}: {
  idPrefix: string;
  lists: ListChoice[];
  destination?: string;
  contactListId?: string | null;
}) {
  const [value, setValue] = useState(destination === "contact_list" ? "contact_list" : "lead");

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={`${idPrefix}-destination`}>Send these to</Label>
      <select
        id={`${idPrefix}-destination`}
        name="destination"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        className="h-9 rounded-md border bg-transparent px-3 text-sm"
      >
        <option value="lead">Leads (the sales pipeline)</option>
        <option value="contact_list">A database (contact list)</option>
      </select>
      {value === "contact_list" && (
        <>
          <select
            id={`${idPrefix}-list`}
            name="contactListId"
            defaultValue={contactListId ?? ""}
            required
            aria-label="Database"
            className="h-9 rounded-md border bg-transparent px-3 text-sm"
          >
            <option value="" disabled>
              {lists.length === 0 ? "No databases yet — create one under Database" : "Choose a database…"}
            </option>
            {lists.map((list) => (
              <option key={list.id} value={list.id}>
                {list.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            Each delivery adds the person to this database — no lead is made and nobody is assigned.
            Needs a name and a phone or an email. Someone already in the database is not duplicated.
          </p>
        </>
      )}
    </div>
  );
}
