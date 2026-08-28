"use client";

import { useState } from "react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { districtsForState, INDIAN_STATES_DISTRICTS } from "@/lib/geo/indian-states-districts";

/**
 * The real state->district cascade, deferred from Session 6's lead list
 * (a flat, non-cascading filter there was enough for a filter bar — a
 * create/edit form is exactly the case the cascade exists for). Selecting
 * a state narrows the district list; changing state clears a district
 * that's no longer valid for it, rather than silently keeping a stale
 * value.
 */
export function StateDistrictFields({
  stateName,
  districtName,
  defaultState,
  defaultDistrict,
}: {
  stateName: string;
  districtName: string;
  defaultState: string;
  defaultDistrict: string;
}) {
  const [state, setState] = useState(defaultState);
  const [district, setDistrict] = useState(defaultDistrict);
  const districts = districtsForState(state);

  return (
    <>
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium">State</label>
        <Select
          name={stateName}
          value={state || undefined}
          onValueChange={(value) => {
            setState(value);
            if (!districtsForState(value).includes(district)) setDistrict("");
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="State" />
          </SelectTrigger>
          <SelectContent>
            {INDIAN_STATES_DISTRICTS.map((s) => (
              <SelectItem key={s.state} value={s.state}>
                {s.state}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium">District</label>
        <Select name={districtName} value={district || undefined} onValueChange={setDistrict} disabled={!state}>
          <SelectTrigger>
            <SelectValue placeholder={state ? "District" : "Select a state first"} />
          </SelectTrigger>
          <SelectContent>
            {districts.map((d) => (
              <SelectItem key={d} value={d}>
                {d}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </>
  );
}
