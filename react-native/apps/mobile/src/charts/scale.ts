/**
 * Chart geometry. Pure functions returning plain data.
 *
 * Kept apart from the components on purpose: `testEnvironment: node` cannot
 * render React, so anything that lives in a .tsx file cannot be tested. All of
 * the arithmetic a chart can get wrong lives here instead, where it can be.
 */

export interface BarRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Arc {
  d: string;
  fraction: number;
}

/**
 * Coerce a value to a finite, non-negative number.
 *
 * `total <= 0` does NOT catch NaN -- `NaN <= 0` is false -- so a single
 * non-finite value slipped past the empty guard and put `NaN` into an SVG path,
 * which renders as nothing at all. Sanitising at the boundary is the fix; the
 * guards downstream then mean what they say.
 */
function finite(v: number): number {
  return Number.isFinite(v) && v > 0 ? v : 0;
}

/** Round axis values from 0 up to at least `max`, evenly spaced. */
export function niceTicks(max: number, count = 4): number[] {
  const safeMax = Number.isFinite(max) && max > 0 ? max : 0;
  if (safeMax === 0) return Array.from({ length: count + 1 }, (_, i) => i);

  const rawStep = safeMax / count;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const normalized = rawStep / magnitude;
  // 1, 2, 5, 10 give humans round numbers to read.
  const niceStep = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude;

  return Array.from({ length: count + 1 }, (_, i) => Math.round(niceStep * i * 1e6) / 1e6);
}

/**
 * Bars anchored to the bottom of the box. The tallest value fills the height;
 * an all-zero set yields zero-height bars rather than NaN from a 0/0 scale.
 */
export function barLayout(
  values: number[],
  opts: { width: number; height: number; gap?: number; max?: number },
): BarRect[] {
  if (values.length === 0) return [];
  const safe = values.map(finite);
  const gap = opts.gap ?? 8;
  // An explicit max lets a caller scale bars against an AXIS maximum rather
  // than the data maximum, so the tallest bar meets the top gridline instead
  // of overshooting it. Without this the caller has to recompute every height.
  const max = opts.max !== undefined && opts.max > 0 ? opts.max : Math.max(...safe, 0);
  const slot = opts.width / values.length;
  const width = Math.max(0, slot - gap);

  return safe.map((v, i) => {
    const height = max > 0 ? (v / max) * opts.height : 0;
    return {
      x: i * slot + gap / 2,
      y: opts.height - height,
      width,
      height,
    };
  });
}

/**
 * Bars grouped by category, two or more series per group.
 *
 * Every group is scaled against ONE maximum across the whole data set. Scaling
 * each group to its own maximum would make every group look the same height,
 * which defeats the only reason to draw a grouped chart.
 *
 * `react-native-chart-kit` could not do this, which is why it was replaced.
 */
export function groupedBarLayout(
  groups: number[][],
  opts: {
    width: number;
    height: number;
    groupGap?: number;
    barGap?: number;
    max?: number;
  },
): BarRect[][] {
  if (groups.length === 0) return [];
  const groupGap = opts.groupGap ?? 12;
  const barGap = opts.barGap ?? 2;

  const safe = groups.map((g) => g.map(finite));
  const dataMax = Math.max(...safe.flat(), 0);
  const max = opts.max !== undefined && opts.max > 0 ? opts.max : dataMax;

  const slot = opts.width / groups.length;
  const inner = Math.max(0, slot - groupGap);

  return safe.map((group, gi) => {
    const n = Math.max(1, group.length);
    const barWidth = Math.max(0, (inner - barGap * (n - 1)) / n);
    const left = gi * slot + groupGap / 2;

    return group.map((v, si) => {
      const height = max > 0 ? (v / max) * opts.height : 0;
      return {
        x: left + si * (barWidth + barGap),
        y: opts.height - height,
        width: barWidth,
        height,
      };
    });
  });
}

function polar(cx: number, cy: number, r: number, angle: number): [number, number] {
  return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
}

/**
 * Donut segments as SVG path strings, starting at twelve o'clock.
 *
 * A single value would otherwise degenerate: a 360° arc has identical start and
 * end points, which SVG draws as nothing. It is emitted as two half arcs.
 */
export function donutArcs(
  values: number[],
  opts: { size: number; thickness: number },
): Arc[] {
  const safe = values.map(finite);
  const total = safe.reduce((s, v) => s + v, 0);
  if (safe.length === 0 || !(total > 0)) return [];

  const outer = opts.size / 2;
  const inner = outer - opts.thickness;
  const cx = outer;
  const cy = outer;

  let angle = -Math.PI / 2;
  return safe.map((v) => {
    const fraction = v / total;
    const sweep = fraction * Math.PI * 2;
    const end = angle + sweep;

    const d =
      fraction >= 1
        ? ringPath(cx, cy, outer, inner)
        : segmentPath(cx, cy, outer, inner, angle, end);

    angle = end;
    return { d, fraction };
  });
}

function segmentPath(
  cx: number, cy: number, outer: number, inner: number, from: number, to: number,
): string {
  const large = to - from > Math.PI ? 1 : 0;
  const [ox1, oy1] = polar(cx, cy, outer, from);
  const [ox2, oy2] = polar(cx, cy, outer, to);
  const [ix2, iy2] = polar(cx, cy, inner, to);
  const [ix1, iy1] = polar(cx, cy, inner, from);
  return [
    `M ${ox1} ${oy1}`,
    `A ${outer} ${outer} 0 ${large} 1 ${ox2} ${oy2}`,
    `L ${ix2} ${iy2}`,
    `A ${inner} ${inner} 0 ${large} 0 ${ix1} ${iy1}`,
    'Z',
  ].join(' ');
}

/** A full ring, drawn as two half arcs so it is not a degenerate zero-length arc. */
function ringPath(cx: number, cy: number, outer: number, inner: number): string {
  return [
    `M ${cx} ${cy - outer}`,
    `A ${outer} ${outer} 0 1 1 ${cx} ${cy + outer}`,
    `A ${outer} ${outer} 0 1 1 ${cx} ${cy - outer}`,
    `M ${cx} ${cy - inner}`,
    `A ${inner} ${inner} 0 1 0 ${cx} ${cy + inner}`,
    `A ${inner} ${inner} 0 1 0 ${cx} ${cy - inner}`,
    'Z',
  ].join(' ');
}
