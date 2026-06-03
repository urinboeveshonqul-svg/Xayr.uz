export type UserRole = 'user' | 'admin';
export type CampaignStatus = 'pending' | 'active' | 'rejected' | 'completed' | 'paused';
export type CampaignCategory = 'medical' | 'education' | 'disaster' | 'community' | 'environment' | 'animal' | 'sport' | 'other';
export type DonationStatus = 'pending' | 'completed' | 'failed' | 'refunded';
export type PaymentMethod = 'click' | 'payme' | 'uzcard' | 'humo' | 'cash';

// NOTE: These entity shapes are declared with `type` (not `interface`) on purpose.
// @supabase/supabase-js requires each table's Row/Insert/Update to be assignable to
// `Record<string, unknown>`. A `type` object literal satisfies that; an `interface`
// does not (interfaces are open to declaration merging), which makes query/mutation
// types collapse to `never`. Keep these as `type`.

export type Profile = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  phone: string | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
};

export type Campaign = {
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
  profiles?: Profile;
  // Optional client-side fallback aliases (not stored in the DB).
  // CampaignCard reads these as alternates for image_url / donors_count.
  cover_image?: string | null;
  total_donations?: number;
};

export type Donation = {
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
  campaigns?: Campaign;
  profiles?: Profile;
};

export type CampaignUpdate = {
  id: string;
  campaign_id: string;
  user_id: string;
  title: string;
  content: string;
  created_at: string;
};

export type Database = {
  public: {
    Tables: {
      profiles:         { Row: Profile;        Insert: Partial<Profile>;        Update: Partial<Profile>;        Relationships: [] };
      campaigns:        { Row: Campaign;       Insert: Partial<Campaign>;       Update: Partial<Campaign>;       Relationships: [] };
      donations:        { Row: Donation;       Insert: Partial<Donation>;       Update: Partial<Donation>;       Relationships: [] };
      campaign_updates: { Row: CampaignUpdate; Insert: Partial<CampaignUpdate>; Update: Partial<CampaignUpdate>; Relationships: [] };
    };
    Views:          { [_ in never]: never };
    Functions:      { [_ in never]: never };
    Enums:          { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
