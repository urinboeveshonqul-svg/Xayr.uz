import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CheckCircle2, FileText } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { isLocale, type Locale } from '@/i18n/config';
import { pageMetadata } from '@/lib/seo';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { CampaignDetail } from '@/components/campaigns/CampaignDetail';
import { CompletionReportForm } from '@/components/campaigns/CompletionReportForm';
import { CampaignUpdates } from '@/components/campaigns/CampaignUpdates';
import { SimilarCampaigns } from '@/components/campaigns/SimilarCampaigns';
import { Comments } from '@/components/campaigns/Comments';
import type { Campaign, Donor, CampaignReport, CampaignUpdate } from '@/types';

interface Props {
  params: Promise<{ locale: string; slug: string }>;
}

async function getCampaign(slug: string): Promise<Campaign | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('campaigns')
      .select('*, profiles:users(full_name, avatar_url, bio), categories(slug)')
      .eq('slug', slug)
      .single();

    if (error || !data) return null;
    return data as unknown as Campaign;
  } catch {
    return null;
  }
}

async function getDonors(campaignId: string): Promise<Donor[]> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from('campaign_donors')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: false })
      .limit(10);
    return (data as unknown as Donor[]) ?? [];
  } catch {
    return [];
  }
}

// Completion reports are public (creports_select_all RLS). If the migration
// isn't applied yet, the query errors → we return [] and the section stays hidden.
async function getUpdates(campaignId: string): Promise<CampaignUpdate[]> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from('campaign_updates')
      .select('id, campaign_id, user_id, title, content, created_at')
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: false });
    return (data as unknown as CampaignUpdate[]) ?? [];
  } catch {
    return [];
  }
}

async function getReports(campaignId: string): Promise<CampaignReport[]> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from('campaign_reports')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: false });
    return (data as unknown as CampaignReport[]) ?? [];
  } catch {
    return [];
  }
}

async function getSimilar(campaign: Campaign): Promise<Campaign[]> {
  if (!campaign.category_id) return [];
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from('campaigns')
      .select('*, profiles:users(full_name, avatar_url), categories(slug)')
      .eq('status', 'active')
      .eq('category_id', campaign.category_id)
      .neq('id', campaign.id)
      .order('created_at', { ascending: false })
      .limit(3);
    return (data as unknown as Campaign[]) ?? [];
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const loc: Locale = isLocale(locale) ? locale : 'uz';
  const campaign = await getCampaign(slug);

  // Unknown campaign → noindex, still locale-aware.
  if (!campaign) {
    return pageMetadata({
      locale: loc,
      path: `/campaigns/${slug}`,
      title: 'Kampaniya topilmadi',
      noindex: true,
    });
  }

  // OpenGraph image is supplied by the colocated opengraph-image.tsx route, so
  // we deliberately omit `images` here and let Next.js merge in the file image.
  return pageMetadata({
    locale: loc,
    path: `/campaigns/${slug}`,
    title: campaign.title,
    description: campaign.description,
  });
}

export default async function CampaignDetailPage({ params }: Props) {
  const { slug } = await params;
  const campaign = await getCampaign(slug);

  if (!campaign) notFound();

  // Identify the viewer so the report form is shown only to the campaign owner.
  let isOwner = false;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    isOwner = !!user && user.id === campaign.user_id;
  } catch {
    isOwner = false;
  }

  const [donors, similar, reports, updates] = await Promise.all([
    getDonors(campaign.id),
    getSimilar(campaign),
    getReports(campaign.id),
    getUpdates(campaign.id),
  ]);

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-gray-50 dark:bg-gray-950 py-8">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <CampaignDetail campaign={campaign} donors={donors} />

          <div className="max-w-5xl mx-auto">
            {/* Completion reports — read-only, shown only on completed campaigns */}
            {campaign.status === 'completed' && reports.length > 0 && (
              <section className="mt-8">
                <h2 className="text-xl font-black text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  Yakuniy hisobot
                </h2>
                <div className="space-y-4">
                  {reports.map((r) => (
                    <article key={r.id} className="card p-6">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <h3 className="font-bold text-gray-900 dark:text-white">{r.title}</h3>
                        <time className="text-xs text-gray-400 flex-shrink-0">
                          {new Date(r.created_at).toLocaleDateString('uz-UZ')}
                        </time>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-line leading-relaxed">
                        {r.message}
                      </p>
                      {r.images.length > 0 && (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
                          {r.images.map((src, i) => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img key={i} src={src} alt="" className="w-full h-32 object-cover rounded-xl" />
                          ))}
                        </div>
                      )}
                      {r.documents.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-4">
                          {r.documents.map((doc, i) => (
                            <a
                              key={i}
                              href={doc}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-sm text-brand-600 hover:underline"
                            >
                              <FileText className="w-4 h-4" /> Hujjat {i + 1}
                            </a>
                          ))}
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              </section>
            )}

            {/* Creator-only publish form — owner of a completed campaign */}
            {isOwner && campaign.status === 'completed' && (
              <CompletionReportForm campaignId={campaign.id} userId={campaign.user_id} />
            )}

            <CampaignUpdates
              campaignId={campaign.id}
              campaignUserId={campaign.user_id}
              isOwner={isOwner}
              initialUpdates={updates}
            />

            <Comments campaignId={campaign.id} />
            <SimilarCampaigns campaigns={similar} />
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
