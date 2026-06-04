import { Shield } from 'lucide-react';

export interface LegalSection {
  id: string;
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
}

export interface LegalDocumentProps {
  title: string;
  subtitle?: string;
  lastUpdatedLabel: string;
  effectiveDate: string;
  intro?: string;
  tocTitle: string;
  sections: LegalSection[];
}

/**
 * Presentational long-form legal document (Privacy / Terms / Cookies).
 * Server component — content is provided by the caller from the locale
 * dictionary, so it is fully translatable via the existing i18n system.
 */
export function LegalDocument({
  title,
  subtitle,
  lastUpdatedLabel,
  effectiveDate,
  intro,
  tocTitle,
  sections,
}: LegalDocumentProps) {
  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-10">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-sm font-bold mb-4">
          <Shield className="w-4 h-4" />
          <span>{lastUpdatedLabel}: {effectiveDate}</span>
        </div>
        <h1 className="text-4xl sm:text-5xl font-black text-gray-900 dark:text-white tracking-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-4 text-lg text-gray-600 dark:text-gray-400 leading-relaxed">
            {subtitle}
          </p>
        )}
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-sm ring-1 ring-gray-100 dark:ring-gray-800 p-6 sm:p-10">
        {intro && (
          <p className="text-base text-gray-700 dark:text-gray-300 leading-relaxed mb-8">
            {intro}
          </p>
        )}

        {/* Table of contents */}
        <nav aria-label={tocTitle} className="mb-10 rounded-2xl bg-gray-50 dark:bg-gray-800/50 p-5">
          <h2 className="text-sm font-black uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3">
            {tocTitle}
          </h2>
          <ol className="space-y-1.5">
            {sections.map((section, i) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  className="text-sm text-green-700 dark:text-green-400 hover:underline font-medium"
                >
                  {i + 1}. {section.heading}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {/* Sections */}
        <div className="space-y-10">
          {sections.map((section, i) => (
            <section key={section.id} id={section.id} className="scroll-mt-24">
              <h2 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white mb-4">
                {i + 1}. {section.heading}
              </h2>
              {section.paragraphs?.map((p, idx) => (
                <p
                  key={idx}
                  className="text-base text-gray-700 dark:text-gray-300 leading-relaxed mb-4"
                >
                  {p}
                </p>
              ))}
              {section.bullets && section.bullets.length > 0 && (
                <ul className="mt-2 space-y-2">
                  {section.bullets.map((b, idx) => (
                    <li
                      key={idx}
                      className="flex items-start gap-3 text-base text-gray-700 dark:text-gray-300 leading-relaxed"
                    >
                      <span className="mt-2 w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
