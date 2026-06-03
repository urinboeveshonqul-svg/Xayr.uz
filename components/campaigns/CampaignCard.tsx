import Link from 'next/link';
import Image from 'next/image';
import { Heart, Users, TrendingUp, AlertCircle } from 'lucide-react';
import type { Campaign } from '@/types';

interface CampaignCardProps {
  campaign: Campaign;
  featured?: boolean;
  urgent?: boolean;
}

export function CampaignCard({ campaign, featured, urgent }: CampaignCardProps) {
  const raised  = campaign.raised  ?? 0;
  const goal    = campaign.goal    ?? 1;
  const percent = Math.min(100, Math.round((raised / goal) * 100));

  const getCategoryColor = (category?: string) => {
    switch (category) {
      case 'medical': return 'from-blue-500 to-blue-600';
      case 'education': return 'from-amber-500 to-amber-600';
      case 'disaster': return 'from-red-500 to-red-600';
      case 'community': return 'from-purple-500 to-purple-600';
      default: return 'from-green-500 to-emerald-600';
    }
  };

  const getCategoryLabel = (category?: string) => {
    switch (category) {
      case 'medical': return '🏥 Tibbiyot';
      case 'education': return '📚 Ta\'lim';
      case 'disaster': return '🚨 Favqulodda';
      case 'community': return '🤝 Jamiyat';
      default: return '💚 Xayriya';
    }
  };

  const imageSrc = campaign.image_url || campaign.cover_image || 'https://images.unsplash.com/photo-1532629345422-7515f3d16bb6?w=800&h=600&fit=crop&auto=format';

  return (
    <Link
      href={`/campaigns/${campaign.slug}`}
      className={`group block bg-white rounded-3xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 hover:-translate-y-2 border border-gray-100 ${featured ? 'ring-4 ring-green-500/20' : ''}`}
    >
      {/* Image */}
      <div className="relative w-full aspect-[16/10] bg-gradient-to-br from-gray-100 to-gray-200 overflow-hidden">
        <Image
          src={imageSrc}
          alt={campaign.title}
          fill
          className="object-cover group-hover:scale-110 transition-transform duration-500"
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
        />
        
        {/* Overlay Gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-black/0"></div>
        
        {/* Category Badge */}
        <div className="absolute top-4 left-4 px-3 py-1.5 bg-white/95 backdrop-blur-md rounded-full text-xs font-bold shadow-lg">
          {getCategoryLabel(campaign.category)}
        </div>

        {/* Urgent Badge */}
        {(urgent || campaign.is_urgent) && (
          <div className="absolute top-4 right-4 px-3 py-1.5 bg-red-600 text-white rounded-full text-xs font-black shadow-lg flex items-center gap-1 animate-pulse">
            <AlertCircle className="w-3 h-3" />
            SHOSHILINCH
          </div>
        )}

        {/* Featured Badge */}
        {featured && (
          <div className="absolute top-4 right-4 px-3 py-1.5 bg-gradient-to-r from-yellow-400 to-orange-500 text-white rounded-full text-xs font-black shadow-lg">
            ⭐ TANLANGAN
          </div>
        )}

        {/* Progress Indicator */}
        <div className="absolute bottom-4 left-4 right-4">
          <div className="bg-white/20 backdrop-blur-md rounded-full h-2 overflow-hidden">
            <div 
              className={`h-full bg-gradient-to-r ${getCategoryColor(campaign.category)} transition-all duration-500`}
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-6 space-y-4">
        
        {/* Organizer */}
        {campaign.profiles?.full_name && (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center text-white font-bold text-xs shadow">
              {campaign.profiles.full_name.charAt(0).toUpperCase()}
            </div>
            <span className="font-semibold">{campaign.profiles.full_name}</span>
          </div>
        )}

        {/* Title */}
        <h3 className={`font-black text-gray-900 line-clamp-2 leading-tight group-hover:text-green-600 transition-colors ${featured ? 'text-xl' : 'text-lg'}`}>
          {campaign.title}
        </h3>

        {/* Description */}
        {campaign.description && (
          <p className="text-sm text-gray-600 line-clamp-2 leading-relaxed">
            {campaign.description}
          </p>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-100">
          <div>
            <div className="text-xs text-gray-500 font-semibold mb-1 flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              Yig'ilgan
            </div>
            <div className="text-lg font-black text-gray-900">
              {(raised / 1000000).toFixed(1)}M
            </div>
            <div className="text-xs text-gray-500">
              {goal > 0 ? `${(goal / 1000000).toFixed(1)}M dan` : ''}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 font-semibold mb-1 flex items-center gap-1">
              <Users className="w-3 h-3" />
              Xayriyachilar
            </div>
            <div className="text-lg font-black text-gray-900">
              {campaign.total_donations ?? campaign.donors_count ?? 0}
            </div>
            <div className="text-xs text-gray-500">
              {percent}% to'plandi
            </div>
          </div>
        </div>

        {/* CTA Button */}
        <button className="w-full py-3 px-4 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl font-bold text-sm hover:shadow-lg hover:scale-[1.02] transition-all duration-300 flex items-center justify-center gap-2">
          <Heart className="w-4 h-4" />
          Yordam Berish
        </button>
      </div>
    </Link>
  );
}
