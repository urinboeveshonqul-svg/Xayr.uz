import { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { SearchX } from 'lucide-react';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { CampaignGrid } from '@/components/campaigns/CampaignGrid';
import { CampaignFilters } from '@/components/campaigns/CampaignFilters';
import { Pagination } from '@/components/campaigns/Pagination';
import { getDictionary } from '@/i18n/dictionaries';
import { isLocale, type Locale } from '@/i18n/config';
import { pageMetadata } from '@/lib/seo';
import { getSuccessStoryIds } from '@/lib/success-stories';
import type { Campaign, CampaignCategory } from '@/types';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const loc: Locale = isLocale(locale) ? locale : 'uz';
  const dict = await getDictionary(loc);
  return pageMetadata({
    locale: loc,
    path: '/campaigns',
    title: dict.nav.campaigns,
    description: dict.meta.description,
  });
}

// Listing depends on searchParams (filters/pagination) → always dynamic.
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 12;
const CATEGORIES: CampaignCategory[] = [
  'medical', 'education', 'disaster', 'community',
  'environment', 'animal', 'sport', 'other',
];

interface SearchParams {
  q?: string;
  category?: string;
  sort?: string;
  urgent?: string;
  page?: string;
  filter?: string; // 'success' = verified Success Stories only
}

/**
 * Single optimized, paginated query. All filtering/sorting/searching happens
 * in Postgres (indexed columns: status, category_id, created_at, current_amount),
 * and only one page (PAGE_SIZE rows) is transferred — never the whole table.
 */
async function getCampaigns(sp: SearchParams): Promise<{
  campaigns: Campaign[];
  total: number;
  page: number;
}> {
  const page = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  // Verified Success Stories filter: resolve the qualifying campaign ids
  // server-side (goal reached + completed/funded + approved report), then the
  // paginated query is scoped to them instead of active campaigns.
  const isSuccess = sp.filter === 'success';
  let successIds: string[] = [];
  if (isSuccess) {
    successIds = await getSuccessStoryIds();
    if (successIds.length === 0) return { campaigns: [], total: 0, page };
  }

  try {
    const supabase = await createClient();
    const hasCategory = !!sp.category && CATEGORIES.includes(sp.category as CampaignCategory);

    let query = supabase
      .from('campaigns')
      .select(
        hasCategory
          ? '*, profiles:users(full_name, avatar_url), categories!inner(slug)'
          : '*, profiles:users(full_name, avatar_url), categories(slug)',
        { count: 'exact' }
      );

    query = isSuccess ? query.in('id', successIds) : query.eq('status', 'active');

    if (hasCategory) query = query.eq('categories.slug', sp.category!);
    if (sp.urgent === '1') query = query.eq('is_urgent', true);

    // Sanitize the search term for the PostgREST `or` filter grammar.
    const q = (sp.q ?? '').replace(/[,()%*]/g, ' ').trim();
    if (q) {
      // Creator name lives on the joined users table, which PostgREST can't
      // OR against the base table in one filter. Resolve matching creators to
      // their ids first, then add `user_id.in.(...)` to the campaigns OR clause.
      // UUIDs are grammar-safe (no commas/parens), so no extra escaping needed.
      const { data: creators } = await supabase
        .from('users')
        .select('id')
        .ilike('full_name', `%${q}%`)
        .limit(200);
      const creatorIds = (creators ?? []).map((c) => c.id);

      const orParts = [
        `title.ilike.%${q}%`,
        `description.ilike.%${q}%`,
        `location.ilike.%${q}%`,
      ];
      if (creatorIds.length > 0) {
        orParts.push(`user_id.in.(${creatorIds.join(',')})`);
      }
      query = query.or(orParts.join(','));
    }

    const orderColumn =
      sp.sort === 'most_raised' ? 'current_amount'
      : sp.sort === 'most_donors' ? 'donors_count'
      : sp.sort === 'deadline' ? 'deadline'
      : 'created_at';
    // Only the deadline sort is ascending (soonest first); the rest are newest/highest first.
    const ascending = sp.sort === 'deadline';

    const { data, count, error } = await query
      .order(orderColumn, { ascending, nullsFirst: false })
      .range(from, to);

    if (error) {
      console.error('campaigns query:', error.message);
      return { campaigns: [], total: 0, page };
    }
    return { campaigns: (data as unknown as Campaign[]) ?? [], total: count ?? 0, page };
  } catch {
    return { campaigns: [], total: 0, page };
  }
}

export default async function CampaignsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  const dict = await getDictionary(isLocale(locale) ? locale : 'uz');

  const { campaigns, total, page } = await getCampaigns(sp);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-gray-50 dark:bg-gray-950">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="mb-10">
            <h1 className="section-title">{sp.filter === 'success' ? dict.filters.successStories : dict.campaign.allCampaigns}</h1>
            <p className="section-sub">
              {total} {dict.campaign.found}
            </p>
            {sp.filter === 'success' && (
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 max-w-2xl">{dict.filters.successStoriesNote}</p>
            )}
          </div>

          <CampaignFilters />

          {campaigns.length > 0 ? (
            <>
              <CampaignGrid campaigns={campaigns} />
              <Pagination page={page} totalPages={totalPages} />
            </>
          ) : (
            <div className="text-center py-20">
              <div className="flex justify-center mb-4">
                <SearchX className="w-14 h-14 text-gray-300" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                {dict.filters.noResults}
              </h3>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
