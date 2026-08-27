import { niceTicks, barLayout, donutArcs, groupedBarLayout } from './scale';
import { colorFor, CATEGORY_COLORS } from './palette';

describe('niceTicks', () => {
  it('starts at zero and ends at or above the max', () => {
    const t = niceTicks(87);
    expect(t[0]).toBe(0);
    expect(t[t.length - 1]).toBeGreaterThanOrEqual(87);
  });

  it('returns evenly spaced values', () => {
    const t = niceTicks(1000);
    const gaps = t.slice(1).map((v, i) => v - t[i]);
    expect(new Set(gaps).size).toBe(1);
  });

  it('produces round numbers, not raw fractions of the max', () => {
    for (const tick of niceTicks(87)) {
      expect(Number.isInteger(tick)).toBe(true);
    }
  });

  it('handles a max of zero without dividing by it', () => {
    const t = niceTicks(0);
    expect(t[0]).toBe(0);
    expect(t.every((v) => Number.isFinite(v))).toBe(true);
  });

  it('handles a negative max by treating it as zero', () => {
    expect(niceTicks(-50)[0]).toBe(0);
    expect(niceTicks(-50).every(Number.isFinite)).toBe(true);
  });

  it('honours the requested tick count', () => {
    expect(niceTicks(1000, 3)).toHaveLength(4); // count intervals + the zero
  });

  it('never returns a non-ascending series', () => {
    for (const max of [0, 1, 7, 87, 1000, 999999]) {
      const t = niceTicks(max);
      for (let i = 1; i < t.length; i++) {
        expect(t[i]).toBeGreaterThan(t[i - 1]);
      }
    }
  });

  it('picks a step of 1 when the raw step already lands on a power of ten', () => {
    // rawStep = 400 / 4 = 100, magnitude = 100, normalized = 1.
    expect(niceTicks(400)).toEqual([0, 100, 200, 300, 400]);
  });

  it('picks a step of 2 when the normalized raw step is just above 1', () => {
    // rawStep = 600 / 4 = 150, magnitude = 100, normalized = 1.5.
    expect(niceTicks(600)).toEqual([0, 200, 400, 600, 800]);
  });

  it('picks a step of 10 when the normalized raw step is above 5', () => {
    // rawStep = 3200 / 4 = 800, magnitude = 100, normalized = 8.
    expect(niceTicks(3200)).toEqual([0, 1000, 2000, 3000, 4000]);
  });
});

describe('barLayout', () => {
  const opts = { width: 300, height: 200, gap: 10 };

  it('returns one rect per value', () => {
    expect(barLayout([1, 2, 3], opts)).toHaveLength(3);
  });

  it('gives the largest value the full height', () => {
    const bars = barLayout([50, 100], opts);
    expect(bars[1].height).toBe(200);
  });

  it('scales the others proportionally', () => {
    const bars = barLayout([50, 100], opts);
    expect(bars[0].height).toBe(100);
  });

  it('keeps every bar inside the box', () => {
    for (const b of barLayout([3, 7, 1, 9], opts)) {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(opts.width + 0.001);
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.y + b.height).toBeLessThanOrEqual(opts.height + 0.001);
    }
  });

  it('anchors bars to the bottom, so y + height is the baseline', () => {
    for (const b of barLayout([3, 7], opts)) {
      expect(b.y + b.height).toBeCloseTo(opts.height, 5);
    }
  });

  it('gives all-zero values zero height rather than NaN', () => {
    for (const b of barLayout([0, 0], opts)) {
      expect(b.height).toBe(0);
      expect(Number.isNaN(b.height)).toBe(false);
    }
  });

  it('returns an empty array for no values', () => {
    expect(barLayout([], opts)).toEqual([]);
  });

  it('scales against an explicit max when given one', () => {
    // 50 against an axis max of 200 is a quarter of the height, even though
    // it is the largest value present.
    expect(barLayout([50], { ...opts, max: 200 })[0].height).toBe(50);
  });

  it('ignores a zero or negative explicit max and falls back to the data max', () => {
    expect(barLayout([50], { ...opts, max: 0 })[0].height).toBe(200);
    expect(barLayout([50], { ...opts, max: -5 })[0].height).toBe(200);
  });

  it('handles a single value', () => {
    const bars = barLayout([42], opts);
    expect(bars).toHaveLength(1);
    expect(bars[0].height).toBe(200);
  });

  it('clamps negative values to zero height instead of a negative one', () => {
    const bars = barLayout([-10, 20], opts);
    expect(bars[0].height).toBe(0);
    expect(bars[1].height).toBe(200);
  });

  it('defaults the gap when none is given', () => {
    const bars = barLayout([1, 1], { width: 300, height: 200 });
    expect(bars[0].width).toBe(300 / 2 - 8);
  });
});

describe('donutArcs', () => {
  const opts = { size: 200, thickness: 30 };

  it('returns one arc per value', () => {
    expect(donutArcs([1, 2, 3], opts)).toHaveLength(3);
  });

  it('fractions sum to 1', () => {
    const total = donutArcs([25, 25, 50], opts).reduce((s, a) => s + a.fraction, 0);
    expect(total).toBeCloseTo(1, 6);
  });

  it('fractions sum to 1 for many tiny values against one huge one', () => {
    const values = [...Array(50).fill(0.0001), 1_000_000];
    const total = donutArcs(values, opts).reduce((s, a) => s + a.fraction, 0);
    expect(total).toBeCloseTo(1, 6);
  });

  it('computes each fraction from the total', () => {
    const arcs = donutArcs([25, 75], opts);
    expect(arcs[0].fraction).toBeCloseTo(0.25, 6);
    expect(arcs[1].fraction).toBeCloseTo(0.75, 6);
  });

  it('emits a path string for each arc', () => {
    for (const a of donutArcs([1, 1], opts)) {
      expect(a.d.length).toBeGreaterThan(0);
      expect(a.d.startsWith('M')).toBe(true);
    }
  });

  it('never emits NaN inside a path', () => {
    for (const a of donutArcs([1, 2, 3], opts)) {
      expect(a.d).not.toContain('NaN');
    }
  });

  it('returns an empty array when every value is zero, rather than dividing by zero', () => {
    expect(donutArcs([0, 0], opts)).toEqual([]);
  });

  it('returns an empty array for no values', () => {
    expect(donutArcs([], opts)).toEqual([]);
  });

  it('ignores negative values when computing the total and fractions', () => {
    const arcs = donutArcs([-5, 15], opts);
    expect(arcs).toHaveLength(2);
    expect(arcs[0].fraction).toBeCloseTo(0, 6);
    expect(arcs[1].fraction).toBeCloseTo(1, 6);
  });

  it('draws a single value as a full ring without NaN', () => {
    const arcs = donutArcs([5], opts);
    expect(arcs).toHaveLength(1);
    expect(arcs[0].fraction).toBeCloseTo(1, 6);
    expect(arcs[0].d).not.toContain('NaN');
  });
});

describe('groupedBarLayout', () => {
  const opts = { width: 300, height: 200, groupGap: 12, barGap: 2 };

  it('returns one inner array per group', () => {
    expect(groupedBarLayout([[1, 2], [3, 4], [5, 6]], opts)).toHaveLength(3);
  });

  it('returns one rect per series in each group', () => {
    for (const g of groupedBarLayout([[1, 2], [3, 4]], opts)) {
      expect(g).toHaveLength(2);
    }
  });

  it('scales every group against the SAME maximum, so groups are comparable', () => {
    // The whole point of a grouped chart is comparing across groups. Scaling
    // each group to its own max would make every group look identical.
    const g = groupedBarLayout([[50, 100], [25, 50]], opts);
    expect(g[0][1].height).toBe(200);
    expect(g[1][1].height).toBe(100);
    expect(g[0][0].height).toBe(100);
  });

  it('anchors every bar to the bottom', () => {
    for (const group of groupedBarLayout([[1, 2], [3, 4]], opts)) {
      for (const b of group) {
        expect(b.y + b.height).toBeCloseTo(opts.height, 5);
      }
    }
  });

  it('keeps every bar inside the box', () => {
    for (const group of groupedBarLayout([[1, 9], [4, 2], [7, 3]], opts)) {
      for (const b of group) {
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.x + b.width).toBeLessThanOrEqual(opts.width + 0.001);
        expect(b.height).toBeLessThanOrEqual(opts.height + 0.001);
      }
    }
  });

  it('never overlaps two bars', () => {
    const flat = groupedBarLayout([[1, 2], [3, 4], [5, 6]], opts).flat();
    const sorted = [...flat].sort((a, b) => a.x - b.x);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].x).toBeGreaterThanOrEqual(sorted[i - 1].x + sorted[i - 1].width - 0.001);
    }
  });

  it('orders bars within a group left to right by series index', () => {
    const g = groupedBarLayout([[1, 2]], opts);
    expect(g[0][0].x).toBeLessThan(g[0][1].x);
  });

  it('honours an explicit max, so it can share an axis with the tick labels', () => {
    const g = groupedBarLayout([[50]], { ...opts, max: 200 });
    expect(g[0][0].height).toBe(50);
  });

  it('gives all-zero groups zero height rather than NaN', () => {
    for (const b of groupedBarLayout([[0, 0], [0, 0]], opts).flat()) {
      expect(b.height).toBe(0);
      expect(Number.isNaN(b.height)).toBe(false);
    }
  });

  it('survives non-finite values, like the other layouts', () => {
    for (const b of groupedBarLayout([[NaN, 1], [Infinity, -5]], opts).flat()) {
      for (const n of [b.x, b.y, b.width, b.height]) {
        expect(Number.isFinite(n)).toBe(true);
      }
    }
  });

  it('returns an empty array for no groups', () => {
    expect(groupedBarLayout([], opts)).toEqual([]);
  });

  it('handles a single group of a single bar', () => {
    const g = groupedBarLayout([[42]], opts);
    expect(g).toHaveLength(1);
    expect(g[0][0].height).toBe(200);
  });

  it('handles groups of differing length without producing NaN', () => {
    // Ragged input should not happen from compareMonths, but a chart that
    // renders garbage is worse than one that renders something sane.
    for (const b of groupedBarLayout([[1, 2], [3]], opts).flat()) {
      expect(Number.isFinite(b.width)).toBe(true);
      expect(b.width).toBeGreaterThanOrEqual(0);
    }
  });

  it('defaults the groupGap and barGap when none are given', () => {
    const g = groupedBarLayout([[1, 2]], { width: 300, height: 200 });
    expect(g).toHaveLength(1);
    expect(g[0]).toHaveLength(2);
    for (const b of g.flat()) {
      expect(Number.isFinite(b.width)).toBe(true);
      expect(b.width).toBeGreaterThan(0);
    }
  });
});

describe('palette', () => {
  it('gives every colour as a hex string', () => {
    for (const c of CATEGORY_COLORS) expect(c).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it('has no duplicate colours, so adjacent categories stay distinguishable', () => {
    expect(new Set(CATEGORY_COLORS).size).toBe(CATEGORY_COLORS.length);
  });

  it('wraps around rather than returning undefined past the end', () => {
    expect(colorFor(CATEGORY_COLORS.length)).toBe(CATEGORY_COLORS[0]);
    expect(colorFor(CATEGORY_COLORS.length * 3 + 2)).toBe(CATEGORY_COLORS[2]);
  });

  it('is stable — the same index always gives the same colour', () => {
    expect(colorFor(4)).toBe(colorFor(4));
  });

  it('handles a negative index without returning undefined', () => {
    expect(colorFor(-1)).toBe(CATEGORY_COLORS[CATEGORY_COLORS.length - 1]);
  });
});

// `total <= 0` does not catch NaN -- `NaN <= 0` is false -- so a single
// non-finite value slipped past the empty guard and wrote NaN into an SVG
// path, which renders as nothing at all. Amounts are sanitised upstream today,
// so this was not reachable through the app; these charts are reused in later
// phases, and a silently blank chart is a bad way to find that out.
describe('non-finite values cannot reach the output', () => {
  const hostile: [string, number[]][] = [
    ['a lone NaN', [NaN]],
    ['a NaN among real values', [1, NaN, 2]],
    ['Infinity', [Infinity]],
    ['negative Infinity', [-Infinity]],
    ['a mix of every bad kind', [NaN, Infinity, -Infinity, -5, 0]],
  ];

  it.each(hostile)('barLayout survives %s', (_label, values) => {
    for (const b of barLayout(values, { width: 300, height: 200 })) {
      for (const n of [b.x, b.y, b.width, b.height]) {
        expect(Number.isFinite(n)).toBe(true);
      }
    }
  });

  it.each(hostile)('donutArcs never writes NaN into a path for %s', (_label, values) => {
    for (const a of donutArcs(values, { size: 200, thickness: 30 })) {
      expect(a.d).not.toMatch(/NaN|Infinity|undefined/);
      expect(Number.isFinite(a.fraction)).toBe(true);
    }
  });

  it('treats an all-non-finite set as empty rather than drawing garbage', () => {
    expect(donutArcs([NaN, Infinity], { size: 200, thickness: 30 })).toEqual([]);
    for (const b of barLayout([NaN, Infinity], { width: 300, height: 200 })) {
      expect(b.height).toBe(0);
    }
  });

  it('still ignores the finite negatives it always did', () => {
    expect(donutArcs([-5, -10], { size: 200, thickness: 30 })).toEqual([]);
    expect(barLayout([-5, 10], { width: 300, height: 200 })[0].height).toBe(0);
  });
});
