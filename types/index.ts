export type UserRole = 'user' | 'admin';
export type CampaignStatus = 'pending' | 'active' | 'rejected' | 'completed' | 'paused';
export type CampaignCategory = 'medical' | 'education' | 'disaster' | 'community' | 'environment' | 'animal' | 'sport' | 'other';
export type DonationStatus = 'pending' | 'completed' | 'failed' | 'refunded';
export type PaymentMethod = 'click' | 'payme' | 'uzcard' | 'humo' | 'cash';

export interface Profile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  phone: string | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export interface Campaign {
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
}

export interface Donation {
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
}

export interface CampaignUpdate {
  id: string;
  campaign_id: string;
  user_id: string;
  title: string;
  content: string;
  created_at: string;
}

export interface Database {
  public: {
    Tables: {
      profiles:         { Row: Profile;        Insert: Partial<Profile>;        Update: Partial<Profile> };
      campaigns:        { Row: Campaign;       Insert: Partial<Campaign>;       Update: Partial<Campaign> };
      donations:        { Row: Donation;       Insert: Partial<Donation>;       Update: Partial<Donation> };
      campaign_updates: { Row: CampaignUpdate; Insert: Partial<CampaignUpdate>; Update: Partial<CampaignUpdate> };
    };
  };
}
