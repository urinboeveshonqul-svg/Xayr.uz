-- ============================================================
-- XAYR — Storage bucket size + MIME enforcement (migration #56, audit HIGH: file uploads)
-- ============================================================
-- PROBLEM
--   The four storage buckets were created with NO file_size_limit and NO
--   allowed_mime_types. The only size/type checks lived client-side (React
--   MAX_IMAGE_SIZE + <input accept=…>), which a caller bypasses trivially by
--   hitting the Supabase Storage API directly with the public anon key + their
--   own JWT. The RLS insert policies only pin the first path segment to
--   auth.uid() — never size or content type — so any authenticated user could
--   upload arbitrary files of arbitrary size to the public-read buckets (storage
--   / bandwidth cost abuse; hosting arbitrary content under a *.supabase.co URL).
--
-- FIX
--   Set file_size_limit + allowed_mime_types on each bucket. Supabase Storage
--   enforces BOTH on the server for every upload, regardless of the client — so
--   the limits hold even for a direct Storage/PostgREST call, not just the app.
--
--   Limits mirror the existing client-side rules so no legitimate upload breaks:
--     • campaign-images         5 MB · images only
--     • profile-photos          5 MB · images only (avatars re-encoded to webp)
--     • campaign-reports       10 MB · images + PDF/DOC/DOCX
--                                       (completion-report media AND
--                                        campaign-update attachments both land
--                                        here — components/campaigns/
--                                        {CompletionReportForm,CampaignUpdates}.tsx)
--     • verification-documents  5 MB · images only (ID front/back + selfie)
--
-- COMPATIBILITY
--   • Pure UPDATE on storage.buckets — no bucket recreated, no policy touched,
--     no object moved. Existing files are untouched (limits apply to new uploads).
--   • The buckets must already exist (created by #1/#8/#22/#2). Missing rows are
--     simply not updated — re-run after the owning migration.
--
-- Idempotent — safe to re-run. No data is modified.
-- Run in: Supabase Dashboard -> SQL Editor.
-- ============================================================

-- Image-only buckets — 5 MB cap.
update storage.buckets
   set file_size_limit    = 5242880,  -- 5 * 1024 * 1024
       allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif','image/avif']
 where id in ('campaign-images', 'profile-photos', 'verification-documents');

-- Reports/update attachments — images + documents, 10 MB (PDFs run larger).
update storage.buckets
   set file_size_limit    = 10485760, -- 10 * 1024 * 1024
       allowed_mime_types = array[
         'image/jpeg','image/png','image/webp','image/gif','image/avif',
         'application/pdf',
         'application/msword',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
       ]
 where id = 'campaign-reports';

-- ============================================================
-- VERIFY (read-only):
--   select id, file_size_limit, allowed_mime_types
--     from storage.buckets
--    where id in ('campaign-images','profile-photos','campaign-reports','verification-documents')
--    order by id;
--   -- expect a non-null size limit + mime list on every row.
-- ============================================================
