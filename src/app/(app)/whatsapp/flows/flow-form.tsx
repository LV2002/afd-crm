"use client";

import { Save } from "lucide-react";
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
import { FLOW_TRIGGERS, type FlowTrigger } from "@/lib/whatsapp/flow-engine";

import { saveFlow, type FlowFormState } from "./actions";

const initialState: FlowFormState = {};

const ANY = "__any__";

/** Plain English for each trigger, since "stage_entered" is not a thing anybody says. */
const TRIGGER_LABELS: Record<FlowTrigger, string> = {
  lead_created: "A new lead arrives",
  stage_entered: "A lead moves into a stage",
  tag_added: "A tag is put on a lead",
  inbound_keyword: "Somebody messages us a word",
  manual: "Only when somebody starts it by hand",
};

export interface FlowValues {
  id?: string;
  name: string;
  description: string;
  triggerType: FlowTrigger;
  stageId: string;
  tagId: string;
  keywords: string;
  centerId: string;
}

export function FlowForm({
  values,
  stages,
  tags,
  centers,
}: {
  values: FlowValues;
  stages: Array<{ id: string; name: string }>;
  tags: Array<{ id: string; name: string }>;
  centers: Array<{ id: string; name: string }>;
}) {
  const [state, action, pending] = useActionState(saveFlow, initialState);
  const [trigger, setTrigger] = useState<FlowTrigger>(values.triggerType);
  const [stageId, setStageId] = useState(values.stageId);
  const [tagId, setTagId] = useState(values.tagId);
  const [keywords, setKeywords] = useState(values.keywords);
  const [centerId, setCenterId] = useState(values.centerId);

  // The trigger's own settings travel as one JSON field, because their
  // shape depends entirely on which trigger it is.
  const triggerConfig = JSON.stringify(
    trigger === "stage_entered"
      ? { stageId }
      : trigger === "tag_added"
        ? { tagId }
        : trigger === "inbound_keyword"
          ? {
              keywords: keywords
                .split(",")
                .map((word) => word.trim())
                .filter(Boolean),
            }
          : {},
  );

  return (
    <form action={action} className="flex max-w-2xl flex-col gap-4 rounded-lg border p-4">
      {values.id && <input type="hidden" name="flowId" value={values.id} />}
      <input type="hidden" name="triggerConfig" value={triggerConfig} />
      <input type="hidden" name="centerId" value={centerId} />

      <div className="flex flex-col gap-2">
        <Label htmlFor="flow-name">Name</Label>
        <Input
          id="flow-name"
          name="name"
          required
          defaultValue={values.name}
          placeholder="NIFT enquiry follow-up"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="flow-description">What it&rsquo;s for (optional)</Label>
        <Input
          id="flow-description"
          name="description"
          defaultValue={values.description}
          placeholder="Three messages over a week, then hand back to the counsellor"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>What starts it</Label>
        <Select
          name="triggerType"
          value={trigger}
          onValueChange={(v) => setTrigger(v as FlowTrigger)}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FLOW_TRIGGERS.map((key) => (
              <SelectItem key={key} value={key}>
                {TRIGGER_LABELS[key]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {trigger === "stage_entered" && (
        <div className="flex flex-col gap-2">
          <Label>Which stage</Label>
          <Select value={stageId || ANY} onValueChange={(v) => setStageId(v === ANY ? "" : v)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Pick a stage" />
            </SelectTrigger>
            <SelectContent>
              {stages.map((stage) => (
                <SelectItem key={stage.id} value={stage.id}>
                  {stage.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {trigger === "tag_added" && (
        <div className="flex flex-col gap-2">
          <Label>Which tag</Label>
          <Select value={tagId || ANY} onValueChange={(v) => setTagId(v === ANY ? "" : v)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Pick a tag" />
            </SelectTrigger>
            <SelectContent>
              {tags.map((tag) => (
                <SelectItem key={tag.id} value={tag.id}>
                  {tag.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {trigger === "inbound_keyword" && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="flow-keywords">Words to listen for</Label>
          <Input
            id="flow-keywords"
            value={keywords}
            onChange={(event) => setKeywords(event.target.value)}
            placeholder="fees, brochure, admission"
          />
          <p className="text-xs text-muted-foreground">
            Separated by commas. Matched anywhere in what they send, ignoring case — so
            &ldquo;fees&rdquo; catches &ldquo;what are the fees?&rdquo;. Only for people who are
            already leads: this number never creates one.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Label>Centre</Label>
        <Select value={centerId || ANY} onValueChange={(v) => setCenterId(v === ANY ? "" : v)}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Every centre</SelectItem>
            {centers.map((center) => (
              <SelectItem key={center.id} value={center.id}>
                {center.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <FormMessage error={state.error} success={state.success} />
      <Button type="submit" disabled={pending} className="w-fit">
        <Save className="size-4" />
        {pending ? "Saving…" : values.id ? "Save" : "Create"}
      </Button>
    </form>
  );
}
