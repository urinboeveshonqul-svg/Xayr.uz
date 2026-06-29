-- ============================================================
-- XAYR — Completion Reports v2: admin-moderated fund-usage verification
-- ============================================================
-- Upgrades campaign_reports from "public the instant it's created" to a MODERATED
-- report: owner submits → 'pending' → admin approves / requests changes / rejects.
-- Only 'approved' reports are public. Adds the fund-usage breakdown, beneficiary
-- status, timeline, before/after + video media, and admin feedback.
--
--   Existing reports are GRANDFATHERED as 'approved' so the homepage Success
--   Stories and detail-page reports keep showing without interruption.
--
--   Security: a guard trigger stops owners from self-approving or editing the
--   review fields (mirrors guard_campaign_protected_fields). Admin decisions go
--   through review_completion_report() (SECURITY DEFINER), which also notifies
--   the owner and — on approval — the donors (donor notification MOVES from
--   submit to approval, so a pending report never pings donors).
--
-- Run in: Supabase Dashboard → SQL Editor (after campaign-completion-reports.sql
-- and donor-notifications.sql). Idempotent — safe to re-run.
-- ============================================================

-- ── 1. Status workflow (grandfather existing rows as approved) ──────────────
alter table public.campaign_reports add column if not exists status text;
update public.campaign_reports set status = 'approved' where status is null;
alter table public.campaign_reports alter column status set default 'pending';
alter table public.campaign_reports alter column status set not null;
alter table public.campaign_reports drop constraint if exists campaign_reports_status_check;
alter table public.campaign_reports add constraint campaign_reports_status_check
  check (status in ('pending','approved','changes_requested','rejected'));

-- ── 2. New report fields ────────────────────────────────────────────────────
alter table public.campaign_reports add column if not exists beneficiary_status text;
alter table public.campaign_reports drop constraint if exists campaign_reports_beneficiary_check;
alter table public.campaign_reports add constraint campaign_reports_beneficiary_check
  check (beneficiary_status is null or beneficiary_status in
    ('successfully_completed','ongoing_recovery','project_finished','project_delayed','other'));

-- fund_breakdown: [{ "category": text, "description": text, "amount": number }]
alter table public.campaign_reports add column if not exists fund_breakdown jsonb not null default '[]'::jsonb;
-- timeline: [{ "label": text, "date": "YYYY-MM-DD" }]
alter table public.campaign_reports add column if not exists timeline       jsonb not null default '[]'::jsonb;
alter table public.campaign_reports add column if not exists videos         text[] not null default '{}';
alter table public.campaign_reports add column if not exists before_images  text[] not null default '{}';
alter table public.campaign_reports add column if not exists after_images   text[] not null default '{}';
alter table public.campaign_reports add column if not exists admin_feedback text;
alter table public.campaign_reports add column if not exists reviewed_by    uuid references public.users(id) on delete set null;
alter table public.campaign_reports add column if not exists reviewed_at    timestamptz;
alter table public.campaign_reports add column if not exists submitted_at   timestamptz;

create index if not exists idx_creports_status on public.campaign_reports(status, created_at desc);
-- NOTE: the workflow is one report per campaign, but that is enforced in the app
-- (the POST handler rejects a second report) — NOT a DB unique index, because v1
-- data may already contain multiple reports per campaign and the index would fail.

-- ── 3. RLS: public sees only APPROVED; owner sees own; admin sees all ───────
drop policy if exists creports_select_all on public.campaign_reports;
drop policy if exists creports_select_public on public.campaign_reports;
create policy creports_select_public on public.campaign_reports for select
  using (status = 'approved' or user_id = auth.uid() or public.is_admin());
-- (creports_owner_write + creports_admin_all from v1 remain; the guard trigger
--  below stops owners from writing the review fields / self-approving.)

-- ── 4. Guard: owners can't self-approve or touch review fields ──────────────
create or replace function public.guard_report_protected_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() then
    return new; -- admins (review flow) may set anything
  end if;

  if tg_op = 'INSERT' then
    new.status         := 'pending';
    new.admin_feedback := null;
    new.reviewed_by    := null;
    new.reviewed_at    := null;
    new.submitted_at   := now();
  elsif tg_op = 'UPDATE' then
    -- Editing is disabled once approved (an admin must request changes first).
    if old.status = 'approved' then
      raise exception 'report_locked';
    end if;
    -- Any owner edit re-enters moderation; review fields are preserved as-is.
    new.status         := 'pending';
    new.submitted_at   := now();
    new.admin_feedback := old.admin_feedback;
    new.reviewed_by    := old.reviewed_by;
    new.reviewed_at    := old.reviewed_at;
  end if;
  return new;
end; $$;

drop trigger if exists trg_report_field_guard on public.campaign_reports;
create trigger trg_report_field_guard
  before insert or update on public.campaign_reports
  for each row execute function public.guard_report_protected_fields();

-- ── 5. Donor notification moves from submit → approval ──────────────────────
-- v1 pinged donors on INSERT; with moderation that would notify on a pending
-- report. Drop the insert trigger; the review fn notifies on approval instead.
drop trigger if exists trg_notify_report on public.campaign_reports;

-- ── 6. Admin review: approve / request_changes / reject ─────────────────────
create or replace function public.review_completion_report(
  p_id       uuid,
  p_action   text,      -- 'approve' | 'request_changes' | 'reject'
  p_feedback text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_owner    uuid;
  v_campaign uuid;
  v_title    text;
  v_slug     text;
  v_new      text;
begin
  if not public.is_admin() then raise exception 'admin_required'; end if;
  if p_action not in ('approve','request_changes','reject') then raise exception 'invalid_action'; end if;
  if p_action in ('request_changes','reject') and coalesce(btrim(p_feedback),'') = '' then
    raise exception 'feedback_required';
  end if;

  select r.user_id, r.campaign_id, c.title, c.slug
    into v_owner, v_campaign, v_title, v_slug
    from public.campaign_reports r
    join public.campaigns c on c.id = r.campaign_id
   where r.id = p_id
   for update of r;
  if not found then raise exception 'report_not_found'; end if;

  v_new := case p_action when 'approve' then 'approved'
                         when 'request_changes' then 'changes_requested'
                         else 'rejected' end;

  update public.campaign_reports
     set status         = v_new,
         admin_feedback = case when p_action = 'approve' then null else btrim(p_feedback) end,
         reviewed_by    = auth.uid(),
         reviewed_at    = now()
   where id = p_id;

  -- Owner copy.
  insert into public.notifications (user_id, type, title, body, link)
  values (
    v_owner, 'campaign_status',
    case p_action when 'approve'         then 'Hisobot tasdiqlandi'
                  when 'request_changes' then 'Hisobotga o''zgartirish kerak'
                  else 'Hisobot rad etildi' end,
    case p_action when 'approve'
            then 'Yakuniy hisobotingiz tasdiqlandi: ' || v_title
         when 'request_changes'
            then 'Yakuniy hisobotingizga o''zgartirish so''raldi: ' || v_title ||
                 case when coalesce(btrim(p_feedback),'')<>'' then '. ' || p_feedback else '' end
         else 'Yakuniy hisobotingiz rad etildi: ' || v_title ||
                 case when coalesce(btrim(p_feedback),'')<>'' then '. Sabab: ' || p_feedback else '' end end,
    '/campaigns/' || v_slug
  );

  -- On approval, notify previous donors (campaign_updates push category, which
  -- they can disable in notification settings).
  if p_action = 'approve' then
    insert into public.notifications (user_id, type, title, body, link)
    select distinct d.donor_id, 'update', 'Yakuniy hisobot chop etildi',
           'Siz qo''llab-quvvatlagan kampaniya yakuniy hisobotini chop etdi: ' || v_title,
           '/campaigns/' || v_slug
      from public.donations d
     where d.campaign_id = v_campaign
       and d.status = 'completed'
       and d.donor_id is not null
       and d.donor_id <> v_owner;
  end if;
end; $$;

grant execute on function public.review_completion_report(uuid, text, text) to authenticated;

-- ── 7. Public total-withdrawn (the transparency block is public) ────────────
-- payout_requests is owner/admin-only via RLS, but the completion report shows
-- "Funds Withdrawn" publicly, so expose just the aggregate via a definer fn.
create or replace function public.campaign_total_withdrawn(p_campaign_id uuid)
returns bigint language sql stable security definer set search_path = public as $$
  select coalesce(sum(amount), 0)::bigint
    from public.payout_requests
   where campaign_id = p_campaign_id and status = 'paid';
$$;
grant execute on function public.campaign_total_withdrawn(uuid) to anon, authenticated;

-- ============================================================
-- VERIFY:
--   -- as owner: insert a report → status defaults to 'pending', not public.
--   -- as admin: select public.review_completion_report('<id>', 'approve');
--   -- → status 'approved', public, owner + donors notified.
-- ============================================================
