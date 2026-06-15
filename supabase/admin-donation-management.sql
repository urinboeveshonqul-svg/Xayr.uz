-- ============================================================
-- XAYR — Admin donation management
-- ============================================================
-- Backs the /admin/donations tool: an audit trail of admin actions + donor
-- notifications when a donation is confirmed/rejected.
--
-- The campaign OWNER is already notified of a completed donation by the existing
-- apply_donation trigger (schema.sql), which also credits current_amount /
-- donors_count. This migration adds the DONOR side + an audit log. The donor
-- trigger fires on ANY pending->completed/failed transition, so it also covers a
-- future real-gateway webhook, not just the admin tool.
--
-- Run in: Supabase Dashboard -> SQL Editor (after schema.sql). Idempotent.
-- ============================================================

-- ── 1. Admin audit log ──────────────────────────────────────────────────────
create table if not exists public.admin_audit_log (
  id          uuid        primary key default gen_random_uuid(),
  admin_id    uuid        references public.users(id) on delete set null,
  action      text        not null,          -- e.g. 'donation_confirm', 'donation_reject'
  entity_type text        not null,          -- e.g. 'donation'
  entity_id   uuid,
  meta        jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists idx_admin_audit_created on public.admin_audit_log (created_at desc);
create index if not exists idx_admin_audit_entity  on public.admin_audit_log (entity_type, entity_id);

alter table public.admin_audit_log enable row level security;

-- Admins may read the log; writes happen via the service role (RLS bypassed),
-- so no insert policy is needed.
drop policy if exists audit_select_admin on public.admin_audit_log;
create policy audit_select_admin on public.admin_audit_log
  for select using (public.is_admin());

-- ── 2. Donor notification on confirm / reject ───────────────────────────────
create or replace function public.notify_on_donation_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare c_slug text;
begin
  -- Only react to a real transition out of 'pending', and only for known donors
  -- (anonymous/guest donations have no donor_id to notify).
  if new.status is distinct from old.status
     and old.status = 'pending'
     and new.donor_id is not null then

    select slug into c_slug from public.campaigns where id = new.campaign_id;

    if new.status = 'completed' then
      insert into public.notifications (user_id, type, title, body, link)
      values (new.donor_id, 'donation', 'Xayriyangiz tasdiqlandi',
              'Xayriyangiz muvaffaqiyatli tasdiqlandi. Qo''llab-quvvatlaganingiz uchun rahmat!',
              case when c_slug is not null then '/campaigns/' || c_slug else null end);

    elsif new.status = 'failed' then
      insert into public.notifications (user_id, type, title, body, link)
      values (new.donor_id, 'donation', 'Xayriya qabul qilinmadi',
              'Xayriyangiz tasdiqlanmadi. Iltimos, qayta urinib ko''ring yoki biz bilan bog''laning.',
              case when c_slug is not null then '/campaigns/' || c_slug else null end);
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists trg_notify_donation_status on public.donations;
create trigger trg_notify_donation_status
  after update on public.donations
  for each row execute function public.notify_on_donation_status();
