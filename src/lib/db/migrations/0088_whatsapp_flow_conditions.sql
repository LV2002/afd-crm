-- Who a WhatsApp automation is for, beyond what started it.
--
-- A flow had a trigger and a centre and nothing else, so "send the NID
-- fee reminder sequence, but only to leads from Meta who are in Class
-- 12" was not expressible: the only way to approximate it was a separate
-- flow per combination, each triggered by a tag somebody had to remember
-- to apply by hand.
--
-- Same `{"all": [...]}` shape as assignment rules, temperature rules and
-- SLA policies, read by the same `evaluateConditions()` and built by the
-- same picker. Null means every lead the trigger fires for, which is
-- exactly what every existing flow means today — so this is additive and
-- no existing automation changes behaviour.
alter table whatsapp_flows
  add column if not exists applies_to jsonb;

comment on column whatsapp_flows.applies_to is
  'Rule conditions the lead must match for a run to start. Null = no extra narrowing. Same shape as assignment_rules.conditions.';
