/* =============================================================
   XAYR — Crowdfunding Platform
   Supabase + Vanilla JS integration
   ============================================================= */

/* ─────────────────────────────────────────────
   1. SUPABASE CONFIG
   Replace these values if you ever rotate keys.
   ───────────────────────────────────────────── */
const SUPABASE_URL     = 'https://tyayyqjxvqarvdkboksr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR5YXl5cWp4dnFhcnZka2Jva3NyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5NzYzOTYsImV4cCI6MjA5NTU1MjM5Nn0.TdwtefG8xa8VnmjLZyoKt8V3PdIeMhbhEq_kHPjRJ2k';

// Create the Supabase client using the CDN global (window.supabase)
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Database table name — must match your Supabase table exactly
const TABLE = 'campaigns';

/* ─────────────────────────────────────────────
   2. SUPABASE CRUD FUNCTIONS
   All functions use async/await and return data
   or null on error so callers can handle both.
   ───────────────────────────────────────────── */

/**
 * FETCH all campaigns from Supabase.
 * Returns an array of campaign objects, or [] on error.
 */
async function fetchCampaignsFromDB() {
  console.log('[Supabase] Fetching campaigns...');
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')                  // select all columns
      .order('created_at', { ascending: false }); // newest first

    if (error) {
      console.error('[Supabase] Fetch error:', error.message);
      return [];
    }

    console.log(`[Supabase] Fetched ${data.length} campaigns.`);
    return data;
  } catch (err) {
    console.error('[Supabase] Unexpected fetch error:', err);
    return [];
  }
}

/**
 * CREATE a new campaign in Supabase.
 * @param {Object} campaign - { title, description, goal }
 * Returns the inserted row, or null on error.
 */
async function createCampaignInDB(campaign) {
  console.log('[Supabase] Creating campaign:', campaign.title);
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .insert([campaign])   // insert expects an array
      .select()             // return the inserted row
      .single();            // unwrap from array since we insert one row

    if (error) {
      console.error('[Supabase] Create error:', error.message);
      return null;
    }

    console.log('[Supabase] Campaign created with id:', data.id);
    return data;
  } catch (err) {
    console.error('[Supabase] Unexpected create error:', err);
    return null;
  }
}

/**
 * UPDATE an existing campaign by id.
 * @param {number|string} id - campaign id
 * @param {Object} updates  - fields to update e.g. { title, goal }
 * Returns the updated row, or null on error.
 */
async function updateCampaignInDB(id, updates) {
  console.log('[Supabase] Updating campaign id:', id);
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .update(updates)
      .eq('id', id)   // only update the row with this id
      .select()
      .single();

    if (error) {
      console.error('[Supabase] Update error:', error.message);
      return null;
    }

    console.log('[Supabase] Campaign updated:', data.id);
    return data;
  } catch (err) {
    console.error('[Supabase] Unexpected update error:', err);
    return null;
  }
}

/**
 * DELETE a campaign by id.
 * @param {number|string} id - campaign id
 * Returns true on success, false on error.
 */
async function deleteCampaignFromDB(id) {
  console.log('[Supabase] Deleting campaign id:', id);
  try {
    const { error } = await supabase
      .from(TABLE)
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[Supabase] Delete error:', error.message);
      return false;
    }

    console.log('[Supabase] Campaign deleted:', id);
    return true;
  } catch (err) {
    console.error('[Supabase] Unexpected delete error:', err);
    return false;
  }
}

/* ─────────────────────────────────────────────
   3. TRANSLATIONS (UZ / EN / RU)
   ───────────────────────────────────────────── */
const i18n = {
  uz: {
    nav_campaigns: "Kampaniyalar",
    nav_how: "Qanday ishlaydi",
    nav_start: "Boshlash",
    hero_badge: "🇺🇿 O'zbekiston №1 Xayriya Platformasi",
    hero_title: "Yaxshilik qilish<br><span class='highlight'>hech qachon oson bo'lmagan</span>",
    hero_sub: "Sevganlaringizga yordam bering, muhim sabablarga hissa qo'shing va o'zgarish yarating — barchasi bir joyda.",
    hero_btn1: "Kampaniya boshlash",
    hero_btn2: "Kampaniyalarni ko'rish",
    stat1: "Muvaffaqiyatli kampaniya",
    stat2: "Yig'ilgan mablag'",
    stat3: "Xayriya qiluvchilar",
    float1_title: "Tibbiy yordam", float1_sub: "Muvaffaqiyatli yig'ildi",
    float2_title: "Ta'lim fondi",  float2_sub: "Faol kampaniya",
    float3_title: "Ekologiya",     float3_sub: "Yangi kampaniya",
    cat_title: "Kategoriyalar",
    cat_all: "Barchasi", cat_medical: "🏥 Tibbiyot", cat_edu: "📚 Ta'lim",
    cat_disaster: "🆘 Favqulodda", cat_community: "🤝 Jamiyat", cat_env: "🌱 Ekologiya",
    campaigns_title: "Faol Kampaniyalar",
    search_placeholder: "Qidirish...",
    how_title: "Qanday ishlaydi?",
    step1_title: "Kampaniya yarating", step1_desc: "Maqsadingizni, mablag' miqdorini va hikoyangizni kiriting. Bu bepul va tez!",
    step2_title: "Ulashing",          step2_desc: "Kampaniyangizni ijtimoiy tarmoqlarda, do'stlar va oila a'zolari bilan ulashing.",
    step3_title: "Mablag' yig'ing",   step3_desc: "Xayriya qiluvchilar to'g'ridan-to'g'ri sizning hisobingizga pul o'tkazadi.",
    step4_title: "Maqsadga erishing", step4_desc: "Yig'ilgan mablag'ni maqsadingiz uchun ishlating va natijalarni ulashing.",
    cta_title: "Bugun o'zgarish yarating",
    cta_sub: "Kampaniyangizni boshlash bepul. Faqat muvaffaqiyatli yig'ilgan mablag'dan 5% komissiya olinadi.",
    cta_btn: "Kampaniya boshlash →",
    footer_desc: "O'zbekistondagi eng ishonchli xayriya platformasi.",
    footer_platform: "Platforma", footer_how: "Qanday ishlaydi", footer_fees: "Komissiyalar", footer_safety: "Xavfsizlik",
    footer_support: "Yordam", footer_faq: "Ko'p so'raladigan savollar", footer_contact: "Bog'lanish", footer_blog: "Blog",
    footer_legal: "Huquqiy", footer_privacy: "Maxfiylik siyosati", footer_terms: "Foydalanish shartlari",
    footer_copy: "© 2026 Xayr. Barcha huquqlar himoyalangan.",
    modal_title: "Yangi Kampaniya",
    form_name: "Kampaniya nomi", form_name_ph: "Kampaniya nomini kiriting",
    form_category: "Kategoriya",
    form_goal: "Maqsad miqdor (so'm)",
    form_desc: "Hikoya / Tavsif", form_desc_ph: "Kampaniyangiz haqida batafsil yozing...",
    form_organizer: "Tashkilotchi ismi",
    form_submit: "Kampaniya yaratish",
    donate_title: "Xayriya qilish", donate_amount: "Miqdor (so'm)",
    donate_name: "Ismingiz (ixtiyoriy)", donate_anon: "Anonim",
    donate_message: "Xabar (ixtiyoriy)", donate_msg_ph: "Rag'batlantiruvchi xabar...",
    donate_payment: "To'lov usuli", donate_btn: "Xayriya qilish 💚",
    btn_donate: "Xayriya qilish", btn_share: "Ulashish",
    days_left: "kun qoldi", donors: "xayriyachi", urgent: "SHOSHILINCH",
    toast_campaign: "Kampaniya muvaffaqiyatli yaratildi! 🎉",
    toast_donate: "Xayriyangiz uchun rahmat! 💚",
    toast_share: "Havola nusxalandi! 📋",
    toast_delete: "Kampaniya o'chirildi.",
    toast_error: "Xatolik yuz berdi. Qayta urinib ko'ring.",
    empty: "Hech qanday kampaniya topilmadi",
    loading: "Yuklanmoqda...",
    db_badge: "Supabase",
  },
  en: {
    nav_campaigns: "Campaigns", nav_how: "How it works", nav_start: "Get Started",
    hero_badge: "🇺🇿 Uzbekistan's #1 Fundraising Platform",
    hero_title: "Doing good has<br><span class='highlight'>never been easier</span>",
    hero_sub: "Help your loved ones, support important causes, and make a difference — all in one place.",
    hero_btn1: "Start a Campaign", hero_btn2: "Browse Campaigns",
    stat1: "Successful campaigns", stat2: "Funds raised", stat3: "Donors",
    float1_title: "Medical Aid",      float1_sub: "Successfully funded",
    float2_title: "Education Fund",   float2_sub: "Active campaign",
    float3_title: "Environment",      float3_sub: "New campaign",
    cat_title: "Categories",
    cat_all: "All", cat_medical: "🏥 Medical", cat_edu: "📚 Education",
    cat_disaster: "🆘 Emergency", cat_community: "🤝 Community", cat_env: "🌱 Environment",
    campaigns_title: "Active Campaigns", search_placeholder: "Search...",
    how_title: "How does it work?",
    step1_title: "Create a Campaign", step1_desc: "Enter your goal, target amount, and story. It's free and fast!",
    step2_title: "Share It",          step2_desc: "Share your campaign on social media, with friends and family.",
    step3_title: "Raise Funds",       step3_desc: "Donors transfer money directly to your account.",
    step4_title: "Reach Your Goal",   step4_desc: "Use the raised funds for your purpose and share the results.",
    cta_title: "Make a difference today",
    cta_sub: "Starting a campaign is free. Only a 5% commission is taken from successfully raised funds.",
    cta_btn: "Start a Campaign →",
    footer_desc: "Uzbekistan's most trusted fundraising platform.",
    footer_platform: "Platform", footer_how: "How it works", footer_fees: "Fees", footer_safety: "Safety",
    footer_support: "Support", footer_faq: "FAQ", footer_contact: "Contact", footer_blog: "Blog",
    footer_legal: "Legal", footer_privacy: "Privacy Policy", footer_terms: "Terms of Service",
    footer_copy: "© 2026 Xayr. All rights reserved.",
    modal_title: "New Campaign",
    form_name: "Campaign title", form_name_ph: "Enter campaign title",
    form_category: "Category", form_goal: "Goal amount (UZS)",
    form_desc: "Story / Description", form_desc_ph: "Write in detail about your campaign...",
    form_organizer: "Organizer name", form_submit: "Create Campaign",
    donate_title: "Make a Donation", donate_amount: "Amount (UZS)",
    donate_name: "Your name (optional)", donate_anon: "Anonymous",
    donate_message: "Message (optional)", donate_msg_ph: "Leave an encouraging message...",
    donate_payment: "Payment method", donate_btn: "Donate 💚",
    btn_donate: "Donate", btn_share: "Share",
    days_left: "days left", donors: "donors", urgent: "URGENT",
    toast_campaign: "Campaign created successfully! 🎉",
    toast_donate: "Thank you for your donation! 💚",
    toast_share: "Link copied! 📋",
    toast_delete: "Campaign deleted.",
    toast_error: "Something went wrong. Please try again.",
    empty: "No campaigns found",
    loading: "Loading...",
    db_badge: "Supabase",
  },
  ru: {
    nav_campaigns: "Кампании", nav_how: "Как это работает", nav_start: "Начать",
    hero_badge: "🇺🇿 Платформа №1 для сбора средств в Узбекистане",
    hero_title: "Делать добро<br><span class='highlight'>никогда не было так просто</span>",
    hero_sub: "Помогайте близким, поддерживайте важные дела и меняйте мир — всё в одном месте.",
    hero_btn1: "Начать кампанию", hero_btn2: "Смотреть кампании",
    stat1: "Успешных кампаний", stat2: "Собрано средств", stat3: "Жертвователей",
    float1_title: "Медицинская помощь", float1_sub: "Успешно собрано",
    float2_title: "Образовательный фонд", float2_sub: "Активная кампания",
    float3_title: "Экология", float3_sub: "Новая кампания",
    cat_title: "Категории",
    cat_all: "Все", cat_medical: "🏥 Медицина", cat_edu: "📚 Образование",
    cat_disaster: "🆘 Экстренная помощь", cat_community: "🤝 Сообщество", cat_env: "🌱 Экология",
    campaigns_title: "Активные Кампании", search_placeholder: "Поиск...",
    how_title: "Как это работает?",
    step1_title: "Создайте кампанию", step1_desc: "Укажите цель, сумму и историю. Это бесплатно и быстро!",
    step2_title: "Поделитесь",        step2_desc: "Поделитесь кампанией в соцсетях, с друзьями и семьёй.",
    step3_title: "Собирайте средства",step3_desc: "Жертвователи переводят деньги напрямую на ваш счёт.",
    step4_title: "Достигните цели",   step4_desc: "Используйте собранные средства по назначению и поделитесь результатами.",
    cta_title: "Измените мир сегодня",
    cta_sub: "Создание кампании бесплатно. Комиссия 5% берётся только с успешно собранных средств.",
    cta_btn: "Начать кампанию →",
    footer_desc: "Самая надёжная платформа для сбора средств в Узбекистане.",
    footer_platform: "Платформа", footer_how: "Как это работает", footer_fees: "Комиссии", footer_safety: "Безопасность",
    footer_support: "Поддержка", footer_faq: "Частые вопросы", footer_contact: "Контакты", footer_blog: "Блог",
    footer_legal: "Правовая информация", footer_privacy: "Политика конфиденциальности", footer_terms: "Условия использования",
    footer_copy: "© 2026 Xayr. Все права защищены.",
    modal_title: "Новая Кампания",
    form_name: "Название кампании", form_name_ph: "Введите название кампании",
    form_category: "Категория", form_goal: "Целевая сумма (сум)",
    form_desc: "История / Описание", form_desc_ph: "Подробно опишите вашу кампанию...",
    form_organizer: "Имя организатора", form_submit: "Создать кампанию",
    donate_title: "Сделать пожертвование", donate_amount: "Сумма (сум)",
    donate_name: "Ваше имя (необязательно)", donate_anon: "Анонимно",
    donate_message: "Сообщение (необязательно)", donate_msg_ph: "Оставьте слова поддержки...",
    donate_payment: "Способ оплаты", donate_btn: "Пожертвовать 💚",
    btn_donate: "Пожертвовать", btn_share: "Поделиться",
    days_left: "дней осталось", donors: "жертвователей", urgent: "СРОЧНО",
    toast_campaign: "Кампания успешно создана! 🎉",
    toast_donate: "Спасибо за ваше пожертвование! 💚",
    toast_share: "Ссылка скопирована! 📋",
    toast_delete: "Кампания удалена.",
    toast_error: "Что-то пошло не так. Попробуйте снова.",
    empty: "Кампании не найдены",
    loading: "Загрузка...",
    db_badge: "Supabase",
  },
};

/* ─────────────────────────────────────────────
   4. APP STATE
   ───────────────────────────────────────────── */
let currentLang   = 'uz';   // active language
let currentFilter = 'all';  // active category filter
let currentDonateId = null; // id of campaign being donated to
let campaigns = [];         // in-memory cache of DB rows + local extras

/* ─────────────────────────────────────────────
   5. LANGUAGE HELPERS
   ───────────────────────────────────────────── */
function setLang(lang) {
  currentLang = lang;
  // Update active button highlight
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.classList.toggle('active', btn.textContent.toLowerCase() === lang);
  });
  applyTranslations();
  renderCampaigns();
}

// Shorthand: get translation string for current language
function t(key) {
  return i18n[currentLang][key] || i18n['uz'][key] || key;
}

// Walk the DOM and replace all data-i18n text / placeholders
function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const val = t(el.getAttribute('data-i18n'));
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      el.placeholder = val;
    } else {
      el.innerHTML = val;
    }
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
  });
  const si = document.getElementById('searchInput');
  if (si) si.placeholder = t('search_placeholder');
}

/* ─────────────────────────────────────────────
   6. RENDER CAMPAIGNS
   Reads from the in-memory `campaigns` array.
   ───────────────────────────────────────────── */

// Visual helpers — map category to emoji / background colour
const EMOJI_MAP = { medical:'🏥', education:'📚', disaster:'🆘', community:'🤝', environment:'🌱' };
const COLOR_MAP = { medical:'#fee2e2', education:'#dbeafe', disaster:'#fef3c7', community:'#d1fae5', environment:'#dcfce7' };
const CAT_KEY   = { medical:'medical', education:'edu', disaster:'disaster', community:'community', environment:'env' };

function renderCampaigns(filter, query) {
  const grid = document.getElementById('campaignsGrid');
  if (!grid) return;

  const activeFilter  = filter !== undefined ? filter : currentFilter;
  const searchQuery   = query  !== undefined ? query  : (document.getElementById('searchInput')?.value || '');

  // Filter the in-memory list
  const list = campaigns.filter(c => {
    const matchCat    = activeFilter === 'all' || c.category === activeFilter;
    const title       = c.title || '';
    const matchSearch = !searchQuery || title.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCat && matchSearch;
  });

  if (list.length === 0) {
    grid.innerHTML = `<div class="empty-state"><span>🔍</span><p>${t('empty')}</p></div>`;
    return;
  }

  grid.innerHTML = list.map(c => {
    // Supabase rows only have `title`, `description`, `goal`.
    // raised / donors / days are local UI extras (default 0 / 30).
    const raised  = c.raised  || 0;
    const goal    = c.goal    || 1;
    const donors  = c.donors  || 0;
    const days    = c.days    || 30;
    const pct     = Math.min(100, Math.round((raised / goal) * 100));
    const emoji   = EMOJI_MAP[c.category] || '💚';
    const color   = COLOR_MAP[c.category] || '#f0fdf4';
    const catKey  = CAT_KEY[c.category]   || c.category;
    const urgent  = c.urgent || false;

    return `
      <div class="campaign-card" data-id="${c.id}" data-category="${c.category || ''}">
        <div class="card-image" style="background:${color}">
          <span style="font-size:72px">${emoji}</span>
          <span class="card-badge">${t('cat_' + catKey)}</span>
          ${urgent ? `<span class="card-urgent">${t('urgent')}</span>` : ''}
          <!-- DB badge shows this card came from Supabase -->
          ${c._fromDB ? `<span class="db-badge">🗄 ${t('db_badge')}</span>` : ''}
        </div>
        <div class="card-body">
          <div class="card-organizer">👤 ${c.organizer || '—'}</div>
          <h3 class="card-title">${c.title}</h3>
          <p class="card-desc">${c.description || ''}</p>
          <div class="progress-section">
            <div class="progress-bar">
              <div class="progress-fill" style="width:${pct}%"></div>
            </div>
            <div class="progress-info">
              <span class="progress-raised">${formatMoney(raised)} so'm</span>
              <span class="progress-goal">${pct}%</span>
            </div>
          </div>
          <div class="card-meta">
            <span>🎯 ${formatMoney(goal)} so'm</span>
            <span>👥 ${donors} ${t('donors')}</span>
            <span>⏰ ${days} ${t('days_left')}</span>
          </div>
          <div class="card-actions">
            <button class="btn-donate" onclick="openDonate('${c.id}')">${t('btn_donate')}</button>
            <button class="btn-share"  onclick="shareCampaign('${c.id}')" title="${t('btn_share')}">🔗</button>
            ${c._fromDB ? `<button class="btn-delete" onclick="deleteCampaign('${c.id}')" title="Delete">🗑</button>` : ''}
          </div>
        </div>
      </div>`;
  }).join('');
}

function formatMoney(n) {
  return Number(n).toLocaleString('uz-UZ');
}

/* ─────────────────────────────────────────────
   7. LOAD CAMPAIGNS ON PAGE START
   Fetches from Supabase, merges with demo data.
   ───────────────────────────────────────────── */
async function loadCampaigns() {
  const grid = document.getElementById('campaignsGrid');
  if (grid) grid.innerHTML = `<div class="empty-state"><span>⏳</span><p>${t('loading')}</p></div>`;

  // Fetch real rows from Supabase
  const dbRows = await fetchCampaignsFromDB();

  // Tag each DB row so we can show the badge + delete button
  const tagged = dbRows.map(row => ({ ...row, _fromDB: true }));

  // Merge: DB rows first, then demo data (demo rows won't have _fromDB)
  campaigns = [...tagged, ...DEMO_CAMPAIGNS];

  renderCampaigns();
}

/* ─────────────────────────────────────────────
   8. DEMO / SEED DATA  (shown when DB is empty)
   ───────────────────────────────────────────── */
const DEMO_CAMPAIGNS = [
  {
    id: 'd1', category: 'medical',
    title: 'Abdullayev Sardor uchun yurak operatsiyasi',
    description: '7 yoshli Sardorga tug\'ma yurak kasalligi tashxisi qo\'yildi. Operatsiya uchun 45 million so\'m kerak.',
    goal: 45000000, raised: 32500000, donors: 284, days: 12,
    organizer: 'Abdullayeva Malika', urgent: true, _fromDB: false,
  },
  {
    id: 'd2', category: 'education',
    title: 'Qishloq maktabi uchun kutubxona',
    description: 'Surxondaryo viloyatidagi maktabga 500 ta kitob va o\'quv materiallari kerak.',
    goal: 12000000, raised: 9800000, donors: 156, days: 25,
    organizer: 'Toshmatov Jasur', urgent: false, _fromDB: false,
  },
  {
    id: 'd3', category: 'disaster',
    title: 'Sel ofati jabrdiydalariga yordam',
    description: 'Namangan viloyatida sel natijasida 40 oila uy-joysiz qoldi.',
    goal: 80000000, raised: 61000000, donors: 512, days: 5,
    organizer: 'Rahimov Bobur', urgent: true, _fromDB: false,
  },
  {
    id: 'd4', category: 'community',
    title: 'Mahalla bog\'i — yashil hudud',
    description: 'Toshkentdagi mahallada bolalar uchun zamonaviy o\'yin maydoni va bog\' barpo etish.',
    goal: 25000000, raised: 8200000, donors: 93, days: 45,
    organizer: 'Yusupova Dilnoza', urgent: false, _fromDB: false,
  },
  {
    id: 'd5', category: 'environment',
    title: '10,000 daraxt ekish kampaniyasi',
    description: 'O\'zbekiston bo\'ylab 10,000 ta daraxt ekib, iqlim o\'zgarishiga qarshi kurashaylik.',
    goal: 18000000, raised: 5400000, donors: 67, days: 60,
    organizer: 'Karimov Sherzod', urgent: false, _fromDB: false,
  },
  {
    id: 'd6', category: 'medical',
    title: 'Nogironlar uchun arava va protez',
    description: 'Imkoniyati cheklangan 15 nafar fuqaroga arava va protez sotib olishda yordam bering.',
    goal: 35000000, raised: 22000000, donors: 198, days: 30,
    organizer: 'Nazarova Feruza', urgent: false, _fromDB: false,
  },
];

/* ─────────────────────────────────────────────
   9. FILTER & SEARCH
   ───────────────────────────────────────────── */
function filterCampaigns(cat) {
  currentFilter = cat;
  document.querySelectorAll('.cat-btn').forEach(btn => btn.classList.remove('active'));
  event.target.classList.add('active');
  renderCampaigns(cat);
}

function searchCampaigns() {
  renderCampaigns(currentFilter, document.getElementById('searchInput').value);
}

/* ─────────────────────────────────────────────
   10. MODALS
   ───────────────────────────────────────────── */
function openModal(type) {
  document.getElementById(type + 'Modal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal(type) {
  document.getElementById(type + 'Modal').classList.remove('open');
  document.body.style.overflow = '';
}

function closeModalOutside(e) {
  if (e.target === e.currentTarget) {
    e.currentTarget.classList.remove('open');
    document.body.style.overflow = '';
  }
}

/* ─────────────────────────────────────────────
   11. CREATE CAMPAIGN  →  Supabase INSERT
   ───────────────────────────────────────────── */
async function submitCampaign(e) {
  e.preventDefault();

  const title       = document.getElementById('campName').value.trim();
  const category    = document.getElementById('campCategory').value;
  const goal        = parseInt(document.getElementById('campGoal').value);
  const description = document.getElementById('campDesc').value.trim();
  const organizer   = document.getElementById('campOrganizer').value.trim();

  // Disable submit button while saving
  const submitBtn = e.target.querySelector('[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = '⏳ Saqlanmoqda...';

  // Build the object that matches the Supabase table columns
  const newRow = { title, description, goal };

  // Save to Supabase
  const saved = await createCampaignInDB(newRow);

  submitBtn.disabled = false;
  submitBtn.textContent = t('form_submit');

  if (!saved) {
    showToast(t('toast_error'), 'error');
    return;
  }

  // Add the saved row (with real DB id) to the top of our local list
  campaigns.unshift({
    ...saved,
    category,
    organizer,
    raised: 0,
    donors: 0,
    days: 30,
    urgent: false,
    _fromDB: true,
  });

  closeModal('create');
  document.getElementById('campaignForm').reset();

  // Reset category filter to "all" so the new card is visible
  currentFilter = 'all';
  document.querySelectorAll('.cat-btn').forEach((b, i) => b.classList.toggle('active', i === 0));

  renderCampaigns();
  showToast(t('toast_campaign'), 'success');
  document.getElementById('campaigns').scrollIntoView({ behavior: 'smooth' });
}

/* ─────────────────────────────────────────────
   12. DELETE CAMPAIGN  →  Supabase DELETE
   ───────────────────────────────────────────── */
async function deleteCampaign(id) {
  if (!confirm('Bu kampaniyani o\'chirishni xohlaysizmi?')) return;

  const ok = await deleteCampaignFromDB(id);

  if (!ok) {
    showToast(t('toast_error'), 'error');
    return;
  }

  // Remove from local cache
  campaigns = campaigns.filter(c => String(c.id) !== String(id));
  renderCampaigns();
  showToast(t('toast_delete'), 'success');
}

/* ─────────────────────────────────────────────
   13. DONATE  (local UI — no payment gateway)
   ───────────────────────────────────────────── */
function openDonate(id) {
  currentDonateId = id;
  const c = campaigns.find(x => String(x.id) === String(id));
  if (!c) return;
  document.getElementById('donateTarget').innerHTML = `💚 ${c.title}`;
  openModal('donate');
}

function setAmount(val) {
  document.getElementById('donateAmount').value = val;
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.classList.toggle('selected', parseInt(btn.textContent.replace(/,/g, '')) === val);
  });
}

async function submitDonation(e) {
  e.preventDefault();
  const amount = parseInt(document.getElementById('donateAmount').value);
  if (!amount || amount < 1000) return;

  // Update local cache for instant UI feedback
  const c = campaigns.find(x => String(x.id) === String(currentDonateId));
  if (c) {
    c.raised  = Math.min(c.goal, (c.raised || 0) + amount);
    c.donors  = (c.donors || 0) + 1;

    // If this is a real DB row, persist the updated raised amount
    if (c._fromDB) {
      await updateCampaignInDB(c.id, { raised: c.raised });
    }
  }

  closeModal('donate');
  document.getElementById('donateForm').reset();
  document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('selected'));
  renderCampaigns();
  showToast(t('toast_donate'), 'success');
}

/* ─────────────────────────────────────────────
   14. SHARE
   ───────────────────────────────────────────── */
function shareCampaign(id) {
  const url = window.location.href.split('#')[0] + '#campaign-' + id;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(url).then(() => showToast(t('toast_share'), 'success'));
  } else {
    showToast(t('toast_share'), 'success');
  }
}

/* ─────────────────────────────────────────────
   15. TOAST NOTIFICATION
   ───────────────────────────────────────────── */
function showToast(msg, type = '') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = 'toast show ' + type;
  setTimeout(() => { toast.className = 'toast'; }, 3500);
}

/* ─────────────────────────────────────────────
   16. MOBILE MENU
   ───────────────────────────────────────────── */
function toggleMenu() {
  document.getElementById('mobileMenu').classList.toggle('open');
}

/* ─────────────────────────────────────────────
   17. INIT — runs when the page is ready
   ───────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  // Apply translations first so the page text is correct
  applyTranslations();

  // Load campaigns from Supabase (+ demo fallback)
  await loadCampaigns();

  // Close mobile menu when a link is clicked
  document.querySelectorAll('.mobile-menu a').forEach(a => {
    a.addEventListener('click', () => document.getElementById('mobileMenu').classList.remove('open'));
  });

  // Close modals with Escape key
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeModal('create');
      closeModal('donate');
    }
  });
});
