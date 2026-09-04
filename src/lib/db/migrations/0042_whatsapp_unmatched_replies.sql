ALTER TABLE "whatsapp_messages" ALTER COLUMN "lead_id" DROP NOT NULL;--> statement-breakpoint
-- The WhatsApp Business API number is a broadcasting channel, not a way
-- in: enquiries reach AFD on the counsellors' own WhatsApp Business apps
-- and are entered by hand. So an inbound message is matched to an
-- existing lead and never creates one, and a reply from a number nobody
-- has entered yet has no lead to inherit visibility from.
--
-- Those rows go to whoever runs campaigns — the person who sent the
-- broadcast being replied to, and the only person who can act on it by
-- adding the sender as a lead. Every other row keeps the exact policy it
-- had: visibility inherited from the lead.
drop policy whatsapp_messages_select on whatsapp_messages;--> statement-breakpoint

create policy whatsapp_messages_select on whatsapp_messages for select
  to authenticated
  using (
    (
      whatsapp_messages.lead_id is not null
      and exists (
        select 1 from leads l
        where l.id = whatsapp_messages.lead_id
          and can_access_center('whatsapp.read', l.center_id, l.assigned_to)
      )
    )
    or (
      whatsapp_messages.lead_id is null
      and auth_scope('whatsapp.campaign') is not null
    )
  );
