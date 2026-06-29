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
export type CampaignCategory =
  | 'medical' | 'education' | 'disaster' | 'community'
  | 'environment' | 'animal' | 'sport' | 'other';
export type DonationStatus = 'pending' | 'completed' | 'failed' | 'refunded';
export type PaymentMethod = 'click' | 'payme' | 'uzcard' | 'humo' | 'cash';
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
          created_at?: string;
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
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          title?: string;
          message?: string;
          images?: string[];
          documents?: string[];
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
    };
    Functions: {
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
