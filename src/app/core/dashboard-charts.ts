export interface IncomeMonthPt {
  year_month: string;
  income: number;
  expenses: number;
}

export function ymShortLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m) return ym;
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, {
    month: 'short',
    year: 'numeric',
  });
}

export interface IncomeChartModel {
  incomeLineD: string;
  incomeAreaD: string;
  expLineD: string;
  labels: string[];
  maxY: number;
  gridLines: { y: number; label: string }[];
  w: number;
  h: number;
}

/** SVG path for polyline / area under income & expenses (last points months). */
export function buildIncomeChart(
  months: IncomeMonthPt[],
  w = 520,
  h = 200
): IncomeChartModel {
  const pad = { t: 14, r: 10, b: 28, l: 42 };
  const iw = w - pad.l - pad.r;
  const ih = h - pad.t - pad.b;
  const n = Math.max(1, months.length);
  const maxRaw = Math.max(
    1,
    ...months.map((m) => Math.max(m.income, m.expenses))
  );
  const maxY = Math.ceil(maxRaw / 500) * 500 || 1;
  const labels = months.map((m) => ymShortLabel(m.year_month));

  const xDenom = Math.max(1, n - 1);
  const xs = (i: number) => pad.l + (iw * i) / xDenom;
  const yv = (v: number) => pad.t + ih * (1 - v / maxY);

  const ptsI = months.map((m, i) => ({ x: xs(i), y: yv(m.income) }));
  const ptsE = months.map((m, i) => ({ x: xs(i), y: yv(m.expenses) }));

  const lineD = (pts: { x: number; y: number }[]) =>
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');

  const areaUnder = (pts: { x: number; y: number }[]) => {
    if (!pts.length) return '';
    const baseY = pad.t + ih;
    let d = `M ${pts[0].x.toFixed(1)} ${baseY.toFixed(1)}`;
    for (const p of pts) {
      d += ` L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
    }
    d += ` L ${pts[pts.length - 1].x.toFixed(1)} ${baseY.toFixed(1)} Z`;
    return d;
  };

  const gridSteps = maxY <= 1000 ? 2 : maxY <= 5000 ? 4 : 6;
  const gridLines: { y: number; label: string }[] = [];
  for (let g = 0; g <= gridSteps; g++) {
    const v = (maxY * g) / gridSteps;
    gridLines.push({ y: yv(v), label: String(Math.round(v)) });
  }

  return {
    incomeLineD: lineD(ptsI),
    incomeAreaD: areaUnder(ptsI),
    expLineD: lineD(ptsE),
    labels,
    maxY,
    gridLines,
    w,
    h,
  };
}

export function donutStrokeDash(
  fraction: number,
  r = 44,
  gap = 8
): { dash: number; gapLen: number; circum: number } {
  const circum = 2 * Math.PI * r;
  const f = Math.max(0, Math.min(1, fraction));
  const dash = circum * f;
  const gapLen = circum - dash + gap;
  return { dash, gapLen, circum };
}

export interface ClassCountRow {
  class_name: string;
  count: number;
}

export function studentsPerClass(
  students: { class_name: string }[]
): ClassCountRow[] {
  const m = new Map<string, number>();
  for (const s of students) {
    const c = (s.class_name || '').trim() || '—';
    m.set(c, (m.get(c) ?? 0) + 1);
  }
  return [...m.entries()]
    .map(([class_name, count]) => ({ class_name, count }))
    .sort((a, b) => a.class_name.localeCompare(b.class_name));
}
