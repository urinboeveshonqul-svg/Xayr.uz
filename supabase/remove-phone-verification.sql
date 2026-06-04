-- ============================================================
-- XAYR — Remove PHONE verification only (keep KYC / identity)
-- Run in: Supabase Dashboard → SQL Editor on EXISTING databases that
-- already ran the older verification.sql. Idempotent & safe to re-run.
--
-- KEEPS: verification_requests, identity_documents, verification_status,
--        the verification-documents storage bucket, is_verified(),
--        enforce_campaign_publish() — i.e. the entire KYC workflow.
-- REMOVES: phone OTP only.
--   • Drops the phone_otps table (SMS/OTP storage).
--   • Drops verification_requests.phone_verified (OTP artifact).
--   • Makes verification_requests.phone optional (no longer SMS-verified).
-- ============================================================

-- 1) Drop the phone OTP table (CASCADE clears its policies/indexes).
drop table if exists public.phone_otps cascade;

-- 2) Phone in a KYC request is now optional contact info, not OTP-verified.
alter table public.verification_requests drop column if exists phone_verified;
alter table public.verification_requests alter column phone drop not null;
