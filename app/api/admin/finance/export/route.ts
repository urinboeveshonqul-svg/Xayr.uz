import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

// Export the immutable financial ledger (admin only). format=csv (default) or
// format=xls (Excel-readable HTML table). PDF is the print-styled report page.
const HEADER = [
  'id', 'created_at', 'entry_type', 'amount', 'currency', 'status',
  'campaign_id', 'campaign_title', 'donation_id', 'payout_request_id', 'user_id', 'reference_id', 'created_by', 'reason',
];

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  // Escape per RFC 4180; prefix risky leading chars to defuse spreadsheet formula injection.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

function htmlCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return safe.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export async function GET(request: Request) {
  // Authenticate + RBAC (server-side, never trusted from the client).
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: me } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const format = new URL(request.url).searchParams.get('format') === 'xls' ? 'xls' : 'csv';

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('financial_ledger')
    .select('id, created_at, entry_type, amount, currency, status, campaign_id, donation_id, payout_request_id, user_id, reference_id, created_by, reason, campaigns(title)')
    .order('created_at', { ascending: false })
    .limit(50000);

  if (error) return NextResponse.json({ error: 'export_failed' }, { status: 500 });

  const rows = (data ?? []) as unknown as Array<Record<string, unknown> & { campaigns?: { title?: string } | null }>;
  const cells = (r: typeof rows[number]) => [
    r.id, r.created_at, r.entry_type, r.amount, r.currency, r.status, r.campaign_id,
    r.campaigns?.title ?? '', r.donation_id, r.payout_request_id, r.user_id, r.reference_id, r.created_by, r.reason,
  ];
  const date = new Date().toISOString().slice(0, 10);

  if (format === 'xls') {
    // Excel-readable HTML table (no dependency; Excel opens .xls HTML natively).
    const head = `<tr>${HEADER.map((h) => `<th>${htmlCell(h)}</th>`).join('')}</tr>`;
    const body = rows.map((r) => `<tr>${cells(r).map((c) => `<td>${htmlCell(c)}</td>`).join('')}</tr>`).join('');
    const html = `<html><head><meta charset="utf-8"></head><body><table border="1">${head}${body}</table></body></html>`;
    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.ms-excel; charset=utf-8',
        'Content-Disposition': `attachment; filename="xayr-financial-ledger-${date}.xls"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  const lines = [HEADER.join(',')];
  for (const r of rows) lines.push(cells(r).map(csvCell).join(','));
  const csv = '﻿' + lines.join('\r\n'); // BOM so Excel reads UTF-8 correctly
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="xayr-financial-ledger-${date}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
