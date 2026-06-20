'use client';

// Lightweight pure-SVG charts (donut + horizontal bars) so we don't pull in a
// charting dependency — keeps the Vercel build small and React-19 safe.

interface Slice {
  label: string;
  value: number;
  color: string;
}

export function Donut({
  slices,
  centerTop,
  centerBottom,
  size = 200,
}: {
  slices: Slice[];
  centerTop?: string;
  centerBottom?: string;
  size?: number;
}) {
  const total = slices.reduce((s, d) => s + d.value, 0);
  const r = size / 2;
  const stroke = size * 0.18;
  const radius = r - stroke / 2;
  const circ = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
        <g transform={`rotate(-90 ${r} ${r})`}>
          {total === 0 ? (
            <circle cx={r} cy={r} r={radius} fill="none" stroke="#1e293b" strokeWidth={stroke} />
          ) : (
            slices.map((d, i) => {
              const frac = d.value / total;
              const dash = frac * circ;
              const seg = (
                <circle
                  key={i}
                  cx={r}
                  cy={r}
                  r={radius}
                  fill="none"
                  stroke={d.color}
                  strokeWidth={stroke}
                  strokeDasharray={`${dash} ${circ - dash}`}
                  strokeDashoffset={-offset}
                />
              );
              offset += dash;
              return seg;
            })
          )}
        </g>
        <text x={r} y={r - 4} textAnchor="middle" fontSize={size * 0.13} fontWeight="800" fill="#f1f5f9">
          {centerTop}
        </text>
        <text x={r} y={r + size * 0.11} textAnchor="middle" fontSize={size * 0.07} fill="#94a3b8">
          {centerBottom}
        </text>
      </svg>
      <div className="flex flex-col gap-1.5 text-xs">
        {slices.map((d, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: d.color }} />
            <span className="text-slate-300">{d.label}</span>
            <span className="text-slate-500">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function HBars({
  items,
  color = '#3b82f6',
}: {
  items: { label: string; value: number }[];
  color?: string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="flex flex-col gap-2">
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-28 text-xs text-slate-300 truncate text-right">{it.label}</div>
          <div className="flex-1 h-5 rounded" style={{ background: '#16304d' }}>
            <div
              className="h-5 rounded flex items-center justify-end pr-1 text-[0.7rem] text-white"
              style={{ width: `${(it.value / max) * 100}%`, background: color, minWidth: 18 }}
            >
              {it.value}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
