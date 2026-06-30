import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

// CSV export of the immutable financial ledger (admin only). Excel opens CSV
// natively; PDF export is a planned follow-up.
const CSV_HEADER = [
  'id', 'created_at', 'entry_type', 'amount', 'currency', 'status',
  'campaign_id', 'campaign_title', 'donation_id', 'payout_request_id', 'created_by', 'reason',
];

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  // Escape per RFC 4180; prefix risky leading chars to defuse spreadsheet formula injection.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

export async function GET() {
  // Authenticate + RBAC (server-side, never trusted from the client).
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: me } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('financial_ledger')
    .select('id, created_at, entry_type, amount, currency, status, campaign_id, donation_id, payout_request_id, created_by, reason, campaigns(title)')
    .order('created_at', { ascending: false })
    .limit(50000);

  if (error) return NextResponse.json({ error: 'export_failed' }, { status: 500 });

  const rows = (data ?? []) as unknown as Array<Record<string, unknown> & { campaigns?: { title?: string } | null }>;
  const lines = [CSV_HEADER.join(',')];
  for (const r of rows) {
    lines.push([
      csvCell(r.id), csvCell(r.created_at), csvCell(r.entry_type), csvCell(r.amount),
      csvCell(r.currency), csvCell(r.status), csvCell(r.campaign_id),
      csvCell(r.campaigns?.title ?? ''), csvCell(r.donation_id), csvCell(r.payout_request_id),
      csvCell(r.created_by), csvCell(r.reason),
    ].join(','));
  }

  const csv = '﻿' + lines.join('\r\n'); // BOM so Excel reads UTF-8 correctly
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="xayr-financial-ledger-${date}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
