// ============================================================
// Xayr — Supabase Database types
//
// This mirrors the output of `supabase gen types typescript`.
// IMPORTANT: the schema is declared with `type` (object literals),
// never `interface`. @supabase/supabase-js requires every table's
// Row/Insert/Update to be assignable to `Record<string, unknown>`.
// A `type` object literal satisfies that constraint; an `interface`
// does NOT (interfaces are open to declaration merging), which makes
// query and mutation argument types collapse to `never`.
// ============================================================

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRole = 'user' | 'admin';
export type CampaignStatus = 'pending' | 'active' | 'rejected' | 'completed' | 'paused';
export type CampaignCategory =
  | 'medical' | 'education' | 'disaster' | 'community'
  | 'environment' | 'animal' | 'sport' | 'other';
export type DonationStatus = 'pending' | 'completed' | 'failed' | 'refunded';
export type PaymentMethod = 'click' | 'payme' | 'uzcard' | 'humo' | 'cash';

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          avatar_url: string | null;
          bio: string | null;
          phone: string | null;
          role: UserRole;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          avatar_url?: string | null;
          bio?: string | null;
          phone?: string | null;
          role?: UserRole;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string | null;
          avatar_url?: string | null;
          bio?: string | null;
          phone?: string | null;
          role?: UserRole;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      campaigns: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          slug: string;
          description: string;
          story: string | null;
          category: CampaignCategory;
          goal: number;
          raised: number;
          image_url: string | null;
          status: CampaignStatus;
          is_urgent: boolean;
          deadline: string | null;
          organizer: string | null;
          location: string | null;
          donors_count: number;
          views: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          slug: string;
          description: string;
          story?: string | null;
          category: CampaignCategory;
          goal: number;
          raised?: number;
          image_url?: string | null;
          status?: CampaignStatus;
          is_urgent?: boolean;
          deadline?: string | null;
          organizer?: string | null;
          location?: string | null;
          donors_count?: number;
          views?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          slug?: string;
          description?: string;
          story?: string | null;
          category?: CampaignCategory;
          goal?: number;
          raised?: number;
          image_url?: string | null;
          status?: CampaignStatus;
          is_urgent?: boolean;
          deadline?: string | null;
          organizer?: string | null;
          location?: string | null;
          donors_count?: number;
          views?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      donations: {
        Row: {
          id: string;
          campaign_id: string;
          user_id: string | null;
          amount: number;
          message: string | null;
          is_anonymous: boolean;
          donor_name: string | null;
          payment_method: PaymentMethod | null;
          payment_id: string | null;
          status: DonationStatus;
          created_at: string;
        };
        Insert: {
          id?: string;
          campaign_id: string;
          user_id?: string | null;
          amount: number;
          message?: string | null;
          is_anonymous?: boolean;
          donor_name?: string | null;
          payment_method?: PaymentMethod | null;
          payment_id?: string | null;
          status?: DonationStatus;
          created_at?: string;
        };
        Update: {
          id?: string;
          campaign_id?: string;
          user_id?: string | null;
          amount?: number;
          message?: string | null;
          is_anonymous?: boolean;
          donor_name?: string | null;
          payment_method?: PaymentMethod | null;
          payment_id?: string | null;
          status?: DonationStatus;
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
          created_at: string;
        };
        Insert: {
          id?: string;
          campaign_id: string;
          user_id: string;
          title: string;
          content: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          campaign_id?: string;
          user_id?: string;
          title?: string;
          content?: string;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

// ─── Convenience aliases used across the app ────────────────
type Row<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];

export type Profile = Row<'profiles'>;
export type CampaignUpdate = Row<'campaign_updates'>;

// Campaign as consumed by the UI: the table row, plus the optionally
// embedded organizer profile (from `select('*, profiles(...)')`) and
// client-only fallback aliases read by CampaignCard.
export type Campaign = Row<'campaigns'> & {
  profiles?: Profile;
  cover_image?: string | null;
  total_donations?: number;
};

// Donation as consumed by the UI, with optional embedded relations.
export type Donation = Row<'donations'> & {
  campaigns?: Campaign;
  profiles?: Profile;
};
