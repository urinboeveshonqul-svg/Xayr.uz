import { formatMoney } from '@/lib/utils';

export interface ChartPoint {
  label: string;
  values: number[]; // one per series
}

/**
 * Lightweight grouped-bar chart rendered as inline SVG — no chart library, no
 * client JS, so it adds nothing to the bundle. Used for the monthly money-flow
 * trends on the admin finance dashboard and the public transparency page.
 */
export function MoneyBarChart({
  points,
  seriesLabels,
  colors,
  title,
  emptyLabel,
}: {
  points: ChartPoint[];
  seriesLabels: string[];
  colors: string[];
  title?: string;
  emptyLabel?: string;
}) {
  const max = Math.max(1, ...points.flatMap((p) => p.values));
  const hasData = points.some((p) => p.values.some((v) => v > 0));

  // viewBox geometry (responsive via width:100%).
  const W = 720;
  const H = 240;
  const padL = 8;
  const padR = 8;
  const padB = 28;
  const padT = 8;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const groupW = plotW / Math.max(points.length, 1);
  const seriesN = Math.max(seriesLabels.length, 1);
  const barW = Math.max(2, (groupW * 0.6) / seriesN);

  return (
    <div>
      {title && <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">{title}</h3>}
      {hasData ? (
        <>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={title ?? 'chart'}>
            {/* baseline */}
            <line x1={padL} y1={padT + plotH} x2={W - padR} y2={padT + plotH} stroke="currentColor" className="text-gray-200 dark:text-gray-800" strokeWidth={1} />
            {points.map((p, i) => {
              const gx = padL + i * groupW;
              return (
                <g key={i}>
                  {p.values.map((v, s) => {
                    const h = (v / max) * plotH;
                    const x = gx + groupW * 0.2 + s * barW;
                    const y = padT + plotH - h;
                    return <rect key={s} x={x} y={y} width={barW} height={h} rx={1.5} fill={colors[s] ?? '#16a34a'} />;
                  })}
                  <text x={gx + groupW / 2} y={H - 10} textAnchor="middle" className="fill-gray-400" fontSize={11}>
                    {p.label}
                  </text>
                </g>
              );
            })}
          </svg>
          {/* legend */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 mt-2">
            {seriesLabels.map((l, s) => (
              <span key={s} className="inline-flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: colors[s] ?? '#16a34a' }} />
                {l}
              </span>
            ))}
            <span className="text-xs text-gray-400 ml-auto">max {formatMoney(max)} so&apos;m</span>
          </div>
        </>
      ) : (
        <div className="h-40 flex items-center justify-center text-sm text-gray-400 border border-dashed border-gray-200 dark:border-gray-800 rounded-2xl">
          {emptyLabel ?? '—'}
        </div>
      )}
    </div>
  );
}
