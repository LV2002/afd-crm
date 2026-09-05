"use client";

import { Plus, Save, Trash2 } from "lucide-react";
import { useActionState, useState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PromoDiscountType } from "@/lib/enrolment/promos";

import { deletePromo, savePromo, type PromoFormState } from "./actions";

const initialState: PromoFormState = {};

export interface PromoValues {
  id?: string;
  name: string;
  code: string;
  discountType: PromoDiscountType;
  percentValue: string;
  fixedAmount: string;
  maxDiscount: string;
  validFrom: string;
  validUntil: string;
  courses: string;
  centerIds: string;
  maxUses: string;
  isActive: boolean;
  usedCount?: number;
}

/**
 * One offer. Each saves on its own, so a mistake in the Sibling discount
 * cannot take Early Bird down with it — the same shape as the payment
 * reminder rungs and the discount limits.
 *
 * The cap field only appears on a percentage offer. A cap on a fixed
 * amount is either the same number or a smaller one pretending to be the
 * amount, and offering the field at all invites somebody to fill it in.
 */
export function PromoRow({
  values,
  courses,
  centers,
}: {
  values: PromoValues;
  courses: string[];
  centers: Array<{ id: string; name: string }>;
}) {
  const [state, action, pending] = useActionState(savePromo, initialState);
  const [removeState, removeAction] = useActionState(deletePromo, initialState);
  const [discountType, setDiscountType] = useState<PromoDiscountType>(values.discountType);
  const [selectedCourses, setSelectedCourses] = useState(
    values.courses ? values.courses.split(",").filter(Boolean) : [],
  );
  const [selectedCenters, setSelectedCenters] = useState(
    values.centerIds ? values.centerIds.split(",").filter(Boolean) : [],
  );

  function toggle(list: string[], value: string, set: (next: string[]) => void) {
    set(list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value]);
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <form action={action} className="flex flex-col gap-3">
        {values.id && <input type="hidden" name="promoId" value={values.id} />}
        <input type="hidden" name="courses" value={selectedCourses.join(",")} />
        <input type="hidden" name="centerIds" value={selectedCenters.join(",")} />

        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Name</Label>
            <Input
              name="name"
              required
              defaultValue={values.name}
              placeholder="Early Bird"
              className="h-9 w-48"
            />
          </div>

          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Code (optional)</Label>
            <Input
              name="code"
              defaultValue={values.code}
              placeholder="EARLY26"
              className="h-9 w-32"
            />
          </div>

          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Type</Label>
            <Select
              name="discountType"
              value={discountType}
              onValueChange={(value) => setDiscountType(value as PromoDiscountType)}
            >
              <SelectTrigger className="h-9 w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="percentage">A percentage off</SelectItem>
                <SelectItem value="fixed">A fixed amount off</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {discountType === "percentage" ? (
            <>
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">Percent</Label>
                <Input
                  name="percentValue"
                  type="number"
                  step="0.01"
                  min="0.01"
                  max="100"
                  defaultValue={values.percentValue}
                  className="h-9 w-24"
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">Up to (₹, optional)</Label>
                <Input
                  name="maxDiscount"
                  defaultValue={values.maxDiscount}
                  placeholder="10000"
                  className="h-9 w-32"
                />
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">Amount off (₹)</Label>
              <Input
                name="fixedAmount"
                defaultValue={values.fixedAmount}
                placeholder="5000"
                className="h-9 w-32"
              />
            </div>
          )}

          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">From</Label>
            <Input
              name="validFrom"
              type="date"
              defaultValue={values.validFrom}
              className="h-9 w-40"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Until</Label>
            <Input
              name="validUntil"
              type="date"
              defaultValue={values.validUntil}
              className="h-9 w-40"
            />
          </div>

          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Max uses</Label>
            <Input
              name="maxUses"
              type="number"
              min="1"
              step="1"
              defaultValue={values.maxUses}
              placeholder="∞"
              className="h-9 w-24"
            />
          </div>

          <label className="flex items-center gap-2 pb-2 text-sm">
            <input
              type="checkbox"
              name="isActive"
              className="size-4"
              defaultChecked={values.isActive}
            />
            On
          </label>

          <Button type="submit" size="sm" disabled={pending} className="mb-0.5">
            {values.id ? <Save className="size-4" /> : <Plus className="size-4" />}
            {pending ? "Saving…" : values.id ? "Save" : "Add offer"}
          </Button>
        </div>

        <div className="flex flex-wrap gap-6">
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Courses (blank = all)</Label>
            <div className="flex flex-wrap gap-2">
              {courses.map((course) => (
                <label key={course} className="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    className="size-3.5"
                    checked={selectedCourses.includes(course)}
                    onChange={() => toggle(selectedCourses, course, setSelectedCourses)}
                  />
                  {course}
                </label>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Centres (blank = all)</Label>
            <div className="flex flex-wrap gap-2">
              {centers.map((center) => (
                <label key={center.id} className="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    className="size-3.5"
                    checked={selectedCenters.includes(center.id)}
                    onChange={() => toggle(selectedCenters, center.id, setSelectedCenters)}
                  />
                  {center.name}
                </label>
              ))}
            </div>
          </div>
        </div>

        {values.usedCount !== undefined && values.usedCount > 0 && (
          <p className="text-xs text-muted-foreground">
            Used on {values.usedCount} admission{values.usedCount === 1 ? "" : "s"}.
          </p>
        )}

        <FormMessage error={state.error} success={state.success} />
      </form>

      {values.id && (
        <form action={removeAction}>
          <input type="hidden" name="promoId" value={values.id} />
          <Button type="submit" variant="ghost" size="sm">
            <Trash2 className="size-4" /> Retire this offer
          </Button>
          <FormMessage error={removeState.error} success={removeState.success} />
        </form>
      )}
    </div>
  );
}
