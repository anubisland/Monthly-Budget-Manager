/**
 * Category colours, in one place so a chart and a legend cannot drift apart.
 * Indexes wrap, so a month with more categories than colours still renders.
 */
export const CATEGORY_COLORS = [
  '#1B6B57',
  '#8A6A3B',
  '#3D6E8F',
  '#A0522D',
  '#5B7553',
  '#7A5C8E',
  '#B0761C',
  '#4A6E6E',
  '#8C5A6E',
  '#5C6B63',
] as const;

export function colorFor(index: number): string {
  const n = CATEGORY_COLORS.length;
  return CATEGORY_COLORS[((index % n) + n) % n];
}
