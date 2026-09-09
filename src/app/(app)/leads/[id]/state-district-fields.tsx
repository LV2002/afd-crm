"use client";

import { useState } from "react";

import { Combobox } from "@/components/ui/combobox";
import { Field } from "@/components/ui/field";
import { districtsForState, INDIAN_STATES_DISTRICTS } from "@/lib/geo/indian-states-districts";

/**
 * The real state->district cascade, deferred from Session 6's lead list
 * (a flat, non-cascading filter there was enough for a filter bar — a
 * create/edit form is exactly the case the cascade exists for). Selecting
 * a state narrows the district list; changing state clears a district
 * that's no longer valid for it, rather than silently keeping a stale
 * value.
 *
 * Both are searchable. Thirty-six states and, for Kerala alone, fourteen
 * districts is exactly the length at which a plain dropdown stops being
 * a list you read and becomes a list you scroll — and scrolling past the
 * right answer is how somebody ends up in Kannur when they meant Kollam.
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
      <Field label="State" htmlFor={stateName}>
        <Combobox
          id={stateName}
          name={stateName}
          value={state}
          onChange={(value) => {
            setState(value);
            if (!districtsForState(value).includes(district)) setDistrict("");
          }}
          options={INDIAN_STATES_DISTRICTS.map((entry) => ({
            value: entry.state,
            label: entry.state,
          }))}
          placeholder="Choose a state"
          searchPlaceholder="Type a state…"
          clearable
        />
      </Field>

      <Field label="District" htmlFor={districtName}>
        <Combobox
          id={districtName}
          name={districtName}
          value={district}
          onChange={setDistrict}
          options={districts.map((name) => ({ value: name, label: name }))}
          disabled={!state}
          placeholder={state ? "Choose a district" : "Pick a state first"}
          searchPlaceholder="Type a district…"
          clearable
        />
      </Field>
    </>
  );
}
