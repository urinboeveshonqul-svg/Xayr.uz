// ============================================================
// Financial data access — server-only aggregation helpers backed by the
// financial-ledger.sql (#45) views/functions. All heavy aggregation runs in
// Postgres (financial_summary view, RPCs), so pages read a single row instead
// of scanning the donations table. Every fetcher fails closed (safe zeros), so
// a missing migration or network blip never 500s a page.
// ============================================================

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export interface FinancialSummary {
  total_donations_amount: number;
  donations_count: number;
  refunded_amount: number;
  pending_payments_amount: number;
  pending_payments_count: number;
  withdrawn_gross: number;
  net_to_creators: number;
  platform_fees_collected: number;
  provider_fees_collected: number;
  pending_withdrawals_amount: number;
  pending_withdrawals_count: number;
  available_for_withdrawal: number;
  largest_donation: number;
  avg_donation: number;
  today_amount: number;
  today_count: number;
  week_amount: number;
  month_amount: number;
  year_amount: number;
}

export interface IntegrityIssue {
  campaign_id: string;
  campaign_title: string;
  raised: number;
  committed: number;
  paid_gross: number;
  ledger_net: number;
  expected_ledger: number;
  discrepancy: number;
}

export type LedgerEntryType =
  | 'donation' | 'refund' | 'platform_fee' | 'provider_fee'
  | 'withdrawal' | 'adjustment' | 'admin_correction';

export interface LedgerEntry {
  id: string;
  entry_type: LedgerEntryType;
  amount: number;
  currency: string;
  campaign_id: string | null;
  donation_id: string | null;
  payout_request_id: string | null;
  status: string;
  created_by: string | null;
  reason: string | null;
  created_at: string;
}

export interface CampaignFinancials {
  goal: number;
  raised: number;
  platform_fee: number;
  provider_fee: number;
  net_amount: number;
  total_withdrawn: number;
  available_balance: number;
  pending_withdrawal: number;
  remaining_balance: number;
}

export interface PublicFinancialStats {
  total_donations: number;
  total_raised: number;
  total_delivered: number;
  successful_campaigns: number;
  active_campaigns: number;
  verified_campaigns: number;
  registered_users: number;
}

const ZERO_SUMMARY: FinancialSummary = {
  total_donations_amount: 0, donations_count: 0, refunded_amount: 0,
  pending_payments_amount: 0, pending_payments_count: 0,
  withdrawn_gross: 0, net_to_creators: 0, platform_fees_collected: 0,
  provider_fees_collected: 0, pending_withdrawals_amount: 0, pending_withdrawals_count: 0,
  available_for_withdrawal: 0, largest_donation: 0, avg_donation: 0,
  today_amount: 0, today_count: 0, week_amount: 0, month_amount: 0, year_amount: 0,
};

const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v ?? 0)) || 0;

/** Platform-wide financial totals (admin). One DB row, no table scan in app code. */
export async function getFinancialSummary(): Promise<FinancialSummary> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.from('financial_summary').select('*').single();
    if (error || !data) return ZERO_SUMMARY;
    const d = data as Record<string, unknown>;
    return {
      total_donations_amount: num(d.total_donations_amount),
      donations_count: num(d.donations_count),
      refunded_amount: num(d.refunded_amount),
      pending_payments_amount: num(d.pending_payments_amount),
      pending_payments_count: num(d.pending_payments_count),
      withdrawn_gross: num(d.withdrawn_gross),
      net_to_creators: num(d.net_to_creators),
      platform_fees_collected: num(d.platform_fees_collected),
      provider_fees_collected: num(d.provider_fees_collected),
      pending_withdrawals_amount: num(d.pending_withdrawals_amount),
      pending_withdrawals_count: num(d.pending_withdrawals_count),
      available_for_withdrawal: num(d.available_for_withdrawal),
      largest_donation: num(d.largest_donation),
      avg_donation: num(d.avg_donation),
      today_amount: num(d.today_amount),
      today_count: num(d.today_count),
      week_amount: num(d.week_amount),
      month_amount: num(d.month_amount),
      year_amount: num(d.year_amount),
    };
  } catch {
    return ZERO_SUMMARY;
  }
}

/** Campaigns whose books don't reconcile (admin). Empty array = healthy. */
export async function getIntegrityIssues(): Promise<IntegrityIssue[]> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc('check_financial_integrity');
    if (error || !Array.isArray(data)) return [];
    return (data as Record<string, unknown>[]).map((r) => ({
      campaign_id: String(r.campaign_id ?? ''),
      campaign_title: String(r.campaign_title ?? ''),
      raised: num(r.raised),
      committed: num(r.committed),
      paid_gross: num(r.paid_gross),
      ledger_net: num(r.ledger_net),
      expected_ledger: num(r.expected_ledger),
      discrepancy: num(r.discrepancy),
    }));
  } catch {
    return [];
  }
}

/** Most recent ledger entries (admin). */
export async function getRecentLedger(limit = 50): Promise<LedgerEntry[]> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('financial_ledger')
      .select('id, entry_type, amount, currency, campaign_id, donation_id, payout_request_id, status, created_by, reason, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error || !Array.isArray(data)) return [];
    return data as unknown as LedgerEntry[];
  } catch {
    return [];
  }
}

/** Per-campaign breakdown (owner via RLS, or admin). Null if unavailable/denied. */
export async function getCampaignFinancials(campaignId: string): Promise<CampaignFinancials | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('campaign_financials', { p_campaign_id: campaignId });
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row) return null;
    const r = row as Record<string, unknown>;
    return {
      goal: num(r.goal),
      raised: num(r.raised),
      platform_fee: num(r.platform_fee),
      provider_fee: num(r.provider_fee),
      net_amount: num(r.net_amount),
      total_withdrawn: num(r.total_withdrawn),
      available_balance: num(r.available_balance),
      pending_withdrawal: num(r.pending_withdrawal),
      remaining_balance: num(r.remaining_balance),
    };
  } catch {
    return null;
  }
}

/** Public, aggregated, PII-free stats for the Transparency page + homepage. */
export async function getPublicFinancialStats(): Promise<PublicFinancialStats> {
  const zero: PublicFinancialStats = {
    total_donations: 0, total_raised: 0, total_delivered: 0,
    successful_campaigns: 0, active_campaigns: 0, verified_campaigns: 0, registered_users: 0,
  };
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc('public_financial_stats');
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row) return zero;
    const r = row as Record<string, unknown>;
    return {
      total_donations: num(r.total_donations),
      total_raised: num(r.total_raised),
      total_delivered: num(r.total_delivered),
      successful_campaigns: num(r.successful_campaigns),
      active_campaigns: num(r.active_campaigns),
      verified_campaigns: num(r.verified_campaigns),
      registered_users: num(r.registered_users),
    };
  } catch {
    return zero;
  }
}
