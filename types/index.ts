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
export type CampaignStatus = 'pending' | 'active' | 'rejected' | 'completed' | 'paused';
export type CampaignCategory =
  | 'medical' | 'education' | 'disaster' | 'community'
  | 'environment' | 'animal' | 'sport' | 'other';
export type DonationStatus = 'pending' | 'completed' | 'failed' | 'refunded';
export type PaymentMethod = 'click' | 'payme' | 'uzcard' | 'humo' | 'cash';
export type NotificationType =
  | 'general' | 'donation' | 'comment' | 'campaign_status' | 'update';

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
          bio: string | null;
          phone: string | null;
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
          bio?: string | null;
          phone?: string | null;
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
          bio?: string | null;
          phone?: string | null;
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
          status: CampaignStatus;
          is_urgent: boolean;
          deadline: string | null;
          location: string | null;
          donors_count: number;
          views: number;
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
          status?: CampaignStatus;
          is_urgent?: boolean;
          deadline?: string | null;
          location?: string | null;
          donors_count?: number;
          views?: number;
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
          status?: CampaignStatus;
          is_urgent?: boolean;
          deadline?: string | null;
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

// `Profile` intentionally maps to the `users` table so existing imports
// (`import type { Profile }`) keep working after the rename.
export type Profile = Row<'users'>;
export type Category = Row<'categories'>;
export type CampaignUpdate = Row<'campaign_updates'>;
export type Comment = Row<'comments'>;
export type Notification = Row<'notifications'>;
export type SavedCampaign = Row<'saved_campaigns'>;

// Campaign as consumed by the UI: the row + optionally embedded relations.
// Queries embed the organizer as `profiles:users(...)` and the category as
// `categories(slug)`, so those keys are available on the result.
export type Campaign = Row<'campaigns'> & {
  profiles?: Pick<Profile, 'full_name' | 'avatar_url'> | null;
  categories?: { slug: CampaignCategory } | null;
  cover_image?: string | null;
  total_donations?: number;
};

export type Donation = Row<'donations'> & {
  campaigns?: Campaign;
  profiles?: Profile;
};
