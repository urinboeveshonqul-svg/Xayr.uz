// ============================================================
// Xayr — Supabase Database types (matches supabase/schema.sql)
// Declared with `type` (not `interface`) so each Row/Insert/Update
// is assignable to Record<string, unknown> — required by supabase-js.
// ============================================================

import type { Locale } from '@/i18n/config';

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRole = 'user' | 'admin';
export type VerificationStatus = 'unverified' | 'pending' | 'verified' | 'rejected';
export type CampaignStatus =
  | 'draft' | 'pending' | 'active' | 'rejected' | 'completed' | 'paused'
  // Archive states (campaign-expiration.sql): reached its deadline, or withdrawn.
  | 'expired' | 'funded' | 'cancelled';

// Completion report moderation (completion-reports-v2.sql).
export type ReportStatus = 'pending' | 'approved' | 'changes_requested' | 'rejected';
export type BeneficiaryStatus =
  | 'successfully_completed' | 'ongoing_recovery' | 'project_finished' | 'project_delayed' | 'other';
export interface FundBreakdownItem { category: string; description: string; amount: number; }
export interface TimelineItem { label: string; date: string }

// Donor name visibility on the public donor feed (guest-donations.sql).
//
// READ type — includes the retired 'first' (first-name-only) mode. Do NOT remove
// it: the donations CHECK constraint still permits it and historical rows still
// hold it, so narrowing this would misrepresent what the column can contain.
// Those donors' privacy choice keeps being honoured by the campaign_donors view.
export type NameDisplay = 'full' | 'first' | 'anonymous';

// WRITE type — what a NEW donation may choose. 'first' is retired from the UI
// and the API (z.enum(['full','anonymous'])); keeping it out of Insert/Update
// enforces that in the type system too, so no new code can reintroduce it.
export type NewNameDisplay = Exclude<NameDisplay, 'first'>;
export type CampaignCategory =
  | 'medical' | 'education' | 'disaster' | 'community'
  | 'environment' | 'animal' | 'sport' | 'other';
export type DonationStatus = 'pending' | 'completed' | 'failed' | 'refunded';
export type PaymentMethod = 'click' | 'payme' | 'paynet' | 'uzum' | 'uzcard' | 'humo' | 'cash';
export type NotificationType =
  | 'general' | 'donation' | 'comment' | 'campaign_status' | 'update' | 'verification';
export type PayoutStatus =
  | 'pending_review' | 'approved' | 'info_requested' | 'rejected' | 'paid' | 'cancelled';
export type PayoutEventAction =
  | 'created' | 'approved' | 'rejected' | 'info_requested' | 'paid' | 'cancelled';
export type PayoutMethod = 'bank' | 'card';
export type CardType = 'uzcard' | 'humo';
export type TeamRole = 'owner' | 'manager' | 'editor';

export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string | null;
          full_name: string | null;
          avatar_url: string | null;
          preferred_language: Locale;
          role: UserRole;
          verification_status: VerificationStatus;
          verified_at: string | null;
          rejection_reason: string | null;
          email_confirmed: boolean;
          username: string | null;
          username_changed_at: string | null;
          bio: string | null;
          phone: string | null;
          donor_stats_public: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          full_name?: string | null;
          avatar_url?: string | null;
          preferred_language?: Locale;
          role?: UserRole;
          verification_status?: VerificationStatus;
          verified_at?: string | null;
          rejection_reason?: string | null;
          bio?: string | null;
          phone?: string | null;
          donor_stats_public?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string | null;
          full_name?: string | null;
          avatar_url?: string | null;
          preferred_language?: Locale;
          role?: UserRole;
          verification_status?: VerificationStatus;
          verified_at?: string | null;
          rejection_reason?: string | null;
          bio?: string | null;
          phone?: string | null;
          donor_stats_public?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      categories: {
        Row: {
          id: string;
          slug: CampaignCategory;
          name_uz: string;
          name_ru: string;
          name_en: string;
          icon: string | null;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          slug: CampaignCategory;
          name_uz: string;
          name_ru: string;
          name_en: string;
          icon?: string | null;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          slug?: CampaignCategory;
          name_uz?: string;
          name_ru?: string;
          name_en?: string;
          icon?: string | null;
          sort_order?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      campaigns: {
        Row: {
          id: string;
          user_id: string;
          category_id: string | null;
          title: string;
          slug: string;
          description: string;
          story: string | null;
          goal_amount: number;
          current_amount: number;
          image_url: string | null;
          images: string[];
          status: CampaignStatus;
          is_urgent: boolean;
          deadline: string | null;
          location: string | null;
          donors_count: number;
          views: number;
          rejection_reason: string | null;
          extension_count: number;
          original_deadline: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          category_id?: string | null;
          title: string;
          slug: string;
          description: string;
          story?: string | null;
          goal_amount: number;
          current_amount?: number;
          image_url?: string | null;
          images?: string[];
          status?: CampaignStatus;
          is_urgent?: boolean;
          deadline?: string | null;
          location?: string | null;
          donors_count?: number;
          views?: number;
          rejection_reason?: string | null;
          extension_count?: number;
          original_deadline?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          category_id?: string | null;
          title?: string;
          slug?: string;
          description?: string;
          story?: string | null;
          goal_amount?: number;
          current_amount?: number;
          image_url?: string | null;
          images?: string[];
          status?: CampaignStatus;
          is_urgent?: boolean;
          deadline?: string | null;
          location?: string | null;
          donors_count?: number;
          views?: number;
          rejection_reason?: string | null;
          extension_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      campaign_extension_requests: {
        Row: {
          id: string;
          campaign_id: string;
          user_id: string;
          requested_deadline: string;
          previous_deadline: string | null;
          reason: string | null;
          reason_category: string | null;
          status: 'pending' | 'approved' | 'rejected' | 'cancelled';
          admin_note: string | null;
          reviewed_by: string | null;
          reviewed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          campaign_id: string;
          user_id: string;
          requested_deadline: string;
          previous_deadline?: string | null;
          reason?: string | null;
          reason_category?: string | null;
          status?: 'pending' | 'approved' | 'rejected' | 'cancelled';
          admin_note?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          status?: 'pending' | 'approved' | 'rejected' | 'cancelled';
          admin_note?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      donations: {
        Row: {
          id: string;
          campaign_id: string;
          donor_id: string | null;
          amount: number;
          anonymous: boolean;
          message: string | null;
          status: DonationStatus;
          payment_method: PaymentMethod | null;
          payment_ref: string | null;
          donor_name: string | null;
          donor_email: string | null;
          donor_phone: string | null;
          name_display: NameDisplay;
          created_at: string;
        };
        Insert: {
          id?: string;
          campaign_id: string;
          donor_id?: string | null;
          amount: number;
          anonymous?: boolean;
          message?: string | null;
          status?: DonationStatus;
          payment_method?: PaymentMethod | null;
          payment_ref?: string | null;
          donor_name?: string | null;
          donor_email?: string | null;
          donor_phone?: string | null;
          name_display?: NewNameDisplay;
          created_at?: string;
        };
        Update: {
          id?: string;
          campaign_id?: string;
          donor_id?: string | null;
          amount?: number;
          anonymous?: boolean;
          message?: string | null;
          status?: DonationStatus;
          payment_method?: PaymentMethod | null;
          payment_ref?: string | null;
          donor_name?: string | null;
          donor_email?: string | null;
          donor_phone?: string | null;
          name_display?: NewNameDisplay;
          created_at?: string;
        };
        Relationships: [];
      };
      campaign_updates: {
        Row: {
          id: string;
          campaign_id: string;
          user_id: string;
          title: string;
          content: string;
          images: string[];
          documents: string[];
          created_at: string;
        };
        Insert: {
          id?: string;
          campaign_id: string;
          user_id: string;
          title: string;
          content: string;
          images?: string[];
          documents?: string[];
          created_at?: string;
        };
        Update: {
          id?: string;
          campaign_id?: string;
          user_id?: string;
          title?: string;
          content?: string;
          images?: string[];
          documents?: string[];
          created_at?: string;
        };
        Relationships: [];
      };
      campaign_reports: {
        Row: {
          id: string;
          campaign_id: string;
          user_id: string;
          title: string;
          message: string;
          images: string[];
          documents: string[];
          status: ReportStatus;
          beneficiary_status: BeneficiaryStatus | null;
          fund_breakdown: FundBreakdownItem[];
          timeline: TimelineItem[];
          videos: string[];
          before_images: string[];
          after_images: string[];
          admin_feedback: string | null;
          reviewed_by: string | null;
          reviewed_at: string | null;
          submitted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          campaign_id: string;
          user_id: string;
          title: string;
          message: string;
          images?: string[];
          documents?: string[];
          beneficiary_status?: BeneficiaryStatus | null;
          fund_breakdown?: FundBreakdownItem[];
          timeline?: TimelineItem[];
          videos?: string[];
          before_images?: string[];
          after_images?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          title?: string;
          message?: string;
          images?: string[];
          documents?: string[];
          beneficiary_status?: BeneficiaryStatus | null;
          fund_breakdown?: FundBreakdownItem[];
          timeline?: TimelineItem[];
          videos?: string[];
          before_images?: string[];
          after_images?: string[];
          updated_at?: string;
        };
        Relationships: [];
      };
      campaign_flags: {
        Row: {
          id: string;
          campaign_id: string;
          reporter_id: string | null;
          reason: 'fraud' | 'misleading' | 'spam' | 'other';
          details: string | null;
          status: 'pending' | 'resolved';
          resolved_by: string | null;
          resolved_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          campaign_id: string;
          reporter_id?: string | null;
          reason: 'fraud' | 'misleading' | 'spam' | 'other';
          details?: string | null;
          status?: 'pending' | 'resolved';
          resolved_by?: string | null;
          resolved_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          campaign_id?: string;
          reporter_id?: string | null;
          reason?: 'fraud' | 'misleading' | 'spam' | 'other';
          details?: string | null;
          status?: 'pending' | 'resolved';
          resolved_by?: string | null;
          resolved_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'campaign_flags_campaign_id_fkey';
            columns: ['campaign_id'];
            isOneToOne: false;
            referencedRelation: 'campaigns';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'campaign_flags_reporter_id_fkey';
            columns: ['reporter_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      comments: {
        Row: {
          id: string;
          campaign_id: string;
          user_id: string;
          parent_id: string | null;
          content: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          campaign_id: string;
          user_id: string;
          parent_id?: string | null;
          content: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          campaign_id?: string;
          user_id?: string;
          parent_id?: string | null;
          content?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      creator_followers: {
        Row: {
          id: string;
          follower_id: string;
          creator_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          follower_id: string;
          creator_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          follower_id?: string;
          creator_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      campaign_team_members: {
        Row: {
          id: string;
          campaign_id: string;
          user_id: string;
          role: TeamRole;
          created_at: string;
        };
        Insert: {
          id?: string;
          campaign_id: string;
          user_id: string;
          role: TeamRole;
          created_at?: string;
        };
        Update: {
          id?: string;
          campaign_id?: string;
          user_id?: string;
          role?: TeamRole;
          created_at?: string;
        };
        Relationships: [];
      };
      contact_messages: {
        Row: {
          id: string;
          name: string;
          email: string;
          subject: string | null;
          message: string;
          is_read: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          email: string;
          subject?: string | null;
          message: string;
          is_read?: boolean;
          created_at?: string;
        };
        Update: {
          is_read?: boolean;
        };
        Relationships: [];
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          type: NotificationType;
          title: string;
          body: string | null;
          link: string | null;
          is_read: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          type?: NotificationType;
          title: string;
          body?: string | null;
          link?: string | null;
          is_read?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          type?: NotificationType;
          title?: string;
          body?: string | null;
          link?: string | null;
          is_read?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      admin_audit_log: {
        Row: {
          id: string;
          admin_id: string | null;
          action: string;
          entity_type: string;
          entity_id: string | null;
          meta: Record<string, unknown> | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          admin_id?: string | null;
          action: string;
          entity_type: string;
          entity_id?: string | null;
          meta?: Record<string, unknown> | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          admin_id?: string | null;
          action?: string;
          entity_type?: string;
          entity_id?: string | null;
          meta?: Record<string, unknown> | null;
          created_at?: string;
        };
        Relationships: [];
      };
      payment_events: {
        Row: {
          id: string;
          provider: string;
          provider_event_id: string | null;
          payment_ref: string | null;
          donation_id: string | null;
          status: string | null;
          amount: number | null;
          currency: string | null;
          raw_payload: Record<string, unknown> | null;
          signature_valid: boolean | null;
          processed: boolean;
          processed_at: string | null;
          received_at: string;
          error_message: string | null;
        };
        Insert: {
          id?: string;
          provider: string;
          provider_event_id?: string | null;
          payment_ref?: string | null;
          donation_id?: string | null;
          status?: string | null;
          amount?: number | null;
          currency?: string | null;
          raw_payload?: Record<string, unknown> | null;
          signature_valid?: boolean | null;
          processed?: boolean;
          processed_at?: string | null;
          received_at?: string;
          error_message?: string | null;
        };
        Update: {
          id?: string;
          provider?: string;
          provider_event_id?: string | null;
          payment_ref?: string | null;
          donation_id?: string | null;
          status?: string | null;
          amount?: number | null;
          currency?: string | null;
          raw_payload?: Record<string, unknown> | null;
          signature_valid?: boolean | null;
          processed?: boolean;
          processed_at?: string | null;
          received_at?: string;
          error_message?: string | null;
        };
        Relationships: [];
      };
      payme_transactions: {
        Row: {
          id: string;
          paycom_id: string;
          donation_id: string;
          order_ref: string;
          amount: number;
          state: number;
          create_time: number;
          perform_time: number;
          cancel_time: number;
          reason: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          paycom_id: string;
          donation_id: string;
          order_ref: string;
          amount: number;
          state?: number;
          create_time: number;
          perform_time?: number;
          cancel_time?: number;
          reason?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          paycom_id?: string;
          donation_id?: string;
          order_ref?: string;
          amount?: number;
          state?: number;
          create_time?: number;
          perform_time?: number;
          cancel_time?: number;
          reason?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      payment_provider_settings: {
        Row: {
          id: string;
          enabled: boolean;
          coming_soon: boolean;
          priority: number;
          is_default: boolean;
          updated_at: string;
        };
        Insert: {
          id: string;
          enabled?: boolean;
          coming_soon?: boolean;
          priority?: number;
          is_default?: boolean;
          updated_at?: string;
        };
        Update: {
          id?: string;
          enabled?: boolean;
          coming_soon?: boolean;
          priority?: number;
          is_default?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      campaign_shares: {
        Row: {
          id: string;
          campaign_id: string;
          source: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          campaign_id: string;
          source: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          campaign_id?: string;
          source?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      notification_preferences: {
        Row: {
          user_id: string;
          push_enabled: boolean;
          donations: boolean;
          campaign_updates: boolean;
          verification: boolean;
          marketing: boolean;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          push_enabled?: boolean;
          donations?: boolean;
          campaign_updates?: boolean;
          verification?: boolean;
          marketing?: boolean;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          push_enabled?: boolean;
          donations?: boolean;
          campaign_updates?: boolean;
          verification?: boolean;
          marketing?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      saved_campaigns: {
        Row: {
          id: string;
          user_id: string;
          campaign_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          campaign_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          campaign_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      recently_viewed: {
        Row: {
          id: string;
          user_id: string;
          campaign_id: string;
          viewed_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          campaign_id: string;
          viewed_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          campaign_id?: string;
          viewed_at?: string;
        };
        Relationships: [];
      };
      payout_requests: {
        Row: {
          id: string;
          campaign_id: string;
          user_id: string;
          amount: number;
          commission_amount: number;
          payout_amount: number;
          method: PayoutMethod;
          account_details: string;
          notes: string | null;
          status: PayoutStatus;
          reviewed_by: string | null;
          admin_note: string | null;
          payout_reference: string | null;
          // Snapshot of the payout account at request time (immutable history).
          snap_card_type: CardType | null;
          snap_card_number: string | null;
          snap_cardholder_name: string | null;
          snap_phone: string | null;
          snap_bank_name: string | null;
          // Encrypted snapshot (#56) — byte-copied from payout_accounts.
          snap_instrument_type: string | null;
          snap_secret_enc: string | null;
          snap_secret_last4: string | null;
          snap_key_version: number | null;
          created_at: string;
          updated_at: string;
          reviewed_at: string | null;
          paid_at: string | null;
        };
        Insert: {
          id?: string;
          campaign_id: string;
          user_id: string;
          amount: number;
          commission_amount?: number;
          payout_amount?: number;
          method: PayoutMethod;
          account_details: string;
          notes?: string | null;
          status?: PayoutStatus;
          reviewed_by?: string | null;
          admin_note?: string | null;
          payout_reference?: string | null;
          snap_card_type?: CardType | null;
          snap_card_number?: string | null;
          snap_cardholder_name?: string | null;
          snap_phone?: string | null;
          snap_bank_name?: string | null;
          snap_instrument_type?: string | null;
          snap_secret_enc?: string | null;
          snap_secret_last4?: string | null;
          snap_key_version?: number | null;
          created_at?: string;
          updated_at?: string;
          reviewed_at?: string | null;
          paid_at?: string | null;
        };
        Update: {
          status?: PayoutStatus;
          reviewed_by?: string | null;
          admin_note?: string | null;
          payout_reference?: string | null;
          reviewed_at?: string | null;
          paid_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      payout_accounts: {
        Row: {
          user_id: string;
          full_legal_name: string;
          phone_number: string;
          card_type: CardType;
          card_number: string;
          cardholder_name: string;
          bank_name: string | null;
          // Encrypted payout payload (#56). AES-256-GCM, key is server-only.
          instrument_type: string;
          secret_enc: string | null;
          secret_last4: string | null;
          key_version: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          full_legal_name: string;
          phone_number: string;
          card_type: CardType;
          card_number: string;
          cardholder_name: string;
          bank_name?: string | null;
          instrument_type?: string;
          secret_enc?: string | null;
          secret_last4?: string | null;
          key_version?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          full_legal_name?: string;
          phone_number?: string;
          card_type?: CardType;
          card_number?: string;
          cardholder_name?: string;
          bank_name?: string | null;
          instrument_type?: string;
          secret_enc?: string | null;
          secret_last4?: string | null;
          key_version?: number | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      payout_request_events: {
        Row: {
          id: string;
          request_id: string;
          actor_id: string | null;
          action: PayoutEventAction;
          from_status: string | null;
          to_status: string;
          note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          request_id: string;
          actor_id?: string | null;
          action: PayoutEventAction;
          from_status?: string | null;
          to_status: string;
          note?: string | null;
          created_at?: string;
        };
        Update: {
          note?: string | null;
        };
        Relationships: [];
      };
      financial_ledger: {
        Row: {
          id: string;
          entry_type: 'donation' | 'refund' | 'platform_fee' | 'provider_fee' | 'campaign_credit' | 'withdrawal' | 'withdrawal_requested' | 'withdrawal_approved' | 'withdrawal_completed' | 'withdrawal_cancelled' | 'adjustment' | 'admin_correction' | 'chargeback';
          amount: number;
          currency: string;
          campaign_id: string | null;
          donation_id: string | null;
          payout_request_id: string | null;
          status: string;
          created_by: string | null;
          user_id: string | null;
          reason: string | null;
          reference_id: string | null;
          metadata: Record<string, unknown>;
          source_key: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          entry_type: 'donation' | 'refund' | 'platform_fee' | 'provider_fee' | 'campaign_credit' | 'withdrawal' | 'withdrawal_requested' | 'withdrawal_approved' | 'withdrawal_completed' | 'withdrawal_cancelled' | 'adjustment' | 'admin_correction' | 'chargeback';
          amount: number;
          currency?: string;
          campaign_id?: string | null;
          donation_id?: string | null;
          payout_request_id?: string | null;
          status?: string;
          created_by?: string | null;
          user_id?: string | null;
          reason?: string | null;
          reference_id?: string | null;
          metadata?: Record<string, unknown>;
          source_key?: string | null;
          created_at?: string;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      financial_snapshots: {
        Row: {
          snapshot_date: string;
          total_donations: number;
          donation_count: number;
          total_withdrawn: number;
          pending_withdrawals: number;
          available_funds: number;
          platform_fees: number;
          provider_fees: number;
          refunds: number;
          chargebacks: number;
          registered_users: number;
          verified_campaigns: number;
          active_campaigns: number;
          completed_campaigns: number;
          successful_campaigns: number;
          avg_donation: number;
          largest_donation: number;
          created_at: string;
        };
        Insert: {
          snapshot_date: string;
          [key: string]: unknown;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      verification_requests: {
        Row: {
          id: string;
          user_id: string;
          legal_name: string;
          date_of_birth: string;
          address: string;
          phone: string | null;
          status: 'pending' | 'verified' | 'rejected';
          rejection_reason: string | null;
          reviewed_by: string | null;
          reviewed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          legal_name: string;
          date_of_birth: string;
          address: string;
          phone?: string | null;
          status?: 'pending' | 'verified' | 'rejected';
          rejection_reason?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          created_at?: string;
        };
        Update: {
          status?: 'pending' | 'verified' | 'rejected';
          rejection_reason?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
        };
        Relationships: [];
      };
      identity_documents: {
        Row: {
          id: string;
          request_id: string;
          user_id: string;
          doc_type: 'id_front' | 'id_back' | 'passport' | 'selfie';
          storage_path: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          request_id: string;
          user_id: string;
          doc_type: 'id_front' | 'id_back' | 'passport' | 'selfie';
          storage_path: string;
          created_at?: string;
        };
        Update: { storage_path?: string };
        Relationships: [];
      };
    };
    Views: {
      campaign_donors: {
        Row: {
          id: string;
          campaign_id: string;
          amount: number;
          message: string | null;
          created_at: string;
          anonymous: boolean;
          donor_name: string | null;
          donor_avatar: string | null;
        };
        Relationships: [];
      };
      admin_stats: {
        Row: {
          users_count: number;
          campaigns_count: number;
          active_count: number;
          pending_count: number;
          completed_count: number;
          donations_count: number;
          total_raised: number;
          revenue: number;
        };
        Relationships: [];
      };
      financial_summary: {
        Row: {
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
        };
        Relationships: [];
      };
    };
    Functions: {
      /**
       * Own-row private profile fields (users-pii-hardening.sql / #53).
       * SECURITY DEFINER, filtered to auth.uid() — email/phone/rejection_reason
       * are no longer selectable directly by anon/authenticated.
       */
      my_private_profile: {
        Args: Record<string, never>;
        Returns: { email: string | null; phone: string | null; rejection_reason: string | null }[];
      };
      increment_campaign_views: {
        Args: { p_campaign_id: string };
        Returns: undefined;
      };
      record_campaign_view: {
        Args: { p_campaign_id: string };
        Returns: undefined;
      };
      resubmit_campaign: {
        Args: { p_campaign_id: string };
        Returns: undefined;
      };
      get_donor_stats: {
        Args: { p_user_id: string };
        Returns: {
          donations_count: number;
          total_amount: number;
          campaigns_count: number;
          first_donation: string | null;
        }[];
      };
      get_share_stats: {
        Args: { p_campaign_id: string };
        Returns: {
          source: string;
          total: number;
        }[];
      };
      is_username_available: {
        Args: { candidate: string };
        Returns: boolean;
      };
      change_username: {
        Args: { new_name: string };
        Returns: string;
      };
      campaign_available_balance: {
        Args: { p_campaign_id: string };
        Returns: number;
      };
      create_payout_request: {
        Args: {
          p_campaign_id: string;
          p_amount: number;
          p_notes: string;
        };
        Returns: string;
      };
      approve_payout_request: {
        Args: { p_request_id: string; p_note?: string };
        Returns: undefined;
      };
      reject_payout_request: {
        Args: { p_request_id: string; p_note: string };
        Returns: undefined;
      };
      request_payout_info: {
        Args: { p_request_id: string; p_note: string };
        Returns: undefined;
      };
      mark_payout_paid: {
        Args: { p_request_id: string; p_reference: string; p_paid_at?: string };
        Returns: undefined;
      };
      expire_due_campaigns: {
        Args: Record<string, never>;
        Returns: number;
      };
      request_campaign_extension: {
        Args: { p_campaign_id: string; p_new_deadline: string; p_reason: string; p_reason_category: string };
        Returns: string;
      };
      approve_campaign_extension: {
        Args: { p_request_id: string };
        Returns: undefined;
      };
      reject_campaign_extension: {
        Args: { p_request_id: string; p_note: string };
        Returns: undefined;
      };
      cancel_campaign_extension: {
        Args: { p_request_id: string };
        Returns: undefined;
      };
      close_campaign: {
        Args: { p_campaign_id: string };
        Returns: undefined;
      };
      get_campaign_extension_history: {
        Args: { p_campaign_id: string };
        Returns: {
          approved_at: string | null;
          previous_deadline: string | null;
          new_deadline: string;
        }[];
      };
      review_completion_report: {
        Args: { p_id: string; p_action: string; p_feedback?: string };
        Returns: undefined;
      };
      campaign_total_withdrawn: {
        Args: { p_campaign_id: string };
        Returns: number;
      };
      check_financial_integrity: {
        Args: Record<string, never>;
        Returns: {
          campaign_id: string;
          campaign_title: string;
          raised: number;
          committed: number;
          paid_gross: number;
          ledger_net: number;
          expected_ledger: number;
          discrepancy: number;
        }[];
      };
      public_financial_stats: {
        Args: Record<string, never>;
        Returns: {
          total_donations: number;
          total_raised: number;
          total_delivered: number;
          successful_campaigns: number;
          active_campaigns: number;
          verified_campaigns: number;
          registered_users: number;
          avg_donation: number;
          largest_donation: number;
        }[];
      };
      public_financial_series: {
        Args: { p_months?: number };
        Returns: {
          month: string;
          donations: number;
          withdrawals: number;
          fees: number;
        }[];
      };
      generate_financial_snapshot: {
        Args: { p_date?: string };
        Returns: boolean;
      };
      reconciliation_report: {
        Args: Record<string, never>;
        Returns: {
          campaign_id: string;
          campaign_title: string;
          total_donations: number;
          campaign_credits: number;
          platform_fees: number;
          provider_fees: number;
          withdrawals: number;
          refunds: number;
          available_balance: number;
          discrepancy: number;
          is_balanced: boolean;
        }[];
      };
      campaign_financials: {
        Args: { p_campaign_id: string };
        Returns: {
          goal: number;
          raised: number;
          platform_fee: number;
          provider_fee: number;
          net_amount: number;
          total_withdrawn: number;
          available_balance: number;
          pending_withdrawal: number;
          remaining_balance: number;
        }[];
      };
      record_ledger_adjustment: {
        Args: { p_campaign_id: string; p_entry_type: string; p_amount: number; p_reason: string };
        Returns: string;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

// ─── Convenience aliases used across the app ────────────────
type Row<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];

// `Profile` intentionally maps to the `users` table so existing imports
// (`import type { Profile }`) keep working after the rename.
export type Profile = Row<'users'>;
export type Category = Row<'categories'>;
export type CampaignUpdate = Row<'campaign_updates'>;
export type CampaignReport = Row<'campaign_reports'> & {
  profiles?: Pick<Profile, 'full_name' | 'avatar_url'> | null;
};
export type Comment = Row<'comments'>;
export type Notification = Row<'notifications'>;
export type NotificationPreferences = Row<'notification_preferences'>;
export type PaymentEvent = Row<'payment_events'>;
export type SavedCampaign = Row<'saved_campaigns'>;
export type PayoutRequest = Row<'payout_requests'>;
export type PayoutRequestEvent = Row<'payout_request_events'>;
export type PayoutAccount = Row<'payout_accounts'>;
export type CampaignExtensionRequest = Row<'campaign_extension_requests'>;

// Campaign as consumed by the UI: the row + optionally embedded relations.
// Queries embed the organizer as `profiles:users(...)` and the category as
// `categories(slug)`, so those keys are available on the result.
export type Donor = Database['public']['Views']['campaign_donors']['Row'];

export type Campaign = Row<'campaigns'> & {
  profiles?: (Pick<Profile, 'full_name' | 'avatar_url'> & { bio?: string | null; username?: string | null }) | null;
  categories?: { slug: CampaignCategory } | null;
  cover_image?: string | null;
  total_donations?: number;
};

// Fields a campaign OWNER may edit. Protected fields (status, current_amount,
// donors_count, views) are admin-only and enforced at the DB layer by the
// guard_campaign_protected_fields() trigger — never put them in an owner-facing
// update payload. Type any owner edit form's submit handler with this so the
// protected columns are a compile-time error, not just a silent DB no-op.
export type CampaignOwnerUpdate = Pick<
  Database['public']['Tables']['campaigns']['Update'],
  'title' | 'description' | 'goal_amount' | 'category_id' | 'images' | 'image_url' | 'story'
>;

export type Donation = Row<'donations'> & {
  campaigns?: Campaign;
  profiles?: Profile;
};
