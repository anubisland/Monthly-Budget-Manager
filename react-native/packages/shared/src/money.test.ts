import { parseAmount, formatMoney } from './money';

describe('parseAmount', () => {
  it('passes through a number', () => {
    expect(parseAmount(1234.56)).toBe(1234.56);
  });

  it('parses a plain numeric string', () => {
    expect(parseAmount('1234.56')).toBe(1234.56);
  });

  it('strips thousands separators and spaces', () => {
    expect(parseAmount('1,234.56')).toBe(1234.56);
    expect(parseAmount(' 1 234.56 ')).toBe(1234.56);
  });

  it('rounds to two decimals', () => {
    expect(parseAmount('2.348')).toBe(2.35);
    expect(parseAmount(1.006)).toBe(1.01);
    expect(parseAmount(1234.567)).toBe(1234.57);
  });

  // Math.round(n * 100) / 100 inherits IEEE 754 artifacts: 1.005 * 100 is
  // 100.49999999999999, so it rounds DOWN to 1, not up to 1.01. This is
  // pinned deliberately, not aspirational -- apps/desktop depends on the
  // legacy parseAmount export, so "correcting" this would be a breaking
  // behavior change. Do not fix it; it is load-bearing.
  it('rounds half-cent values down where float representation dictates', () => {
    expect(parseAmount(1.005)).toBe(1);
    expect(parseAmount(1.015)).toBe(1.01);
  });

  it('returns 0 for unparseable input', () => {
    expect(parseAmount('abc')).toBe(0);
    expect(parseAmount('')).toBe(0);
    expect(parseAmount(null)).toBe(0);
    expect(parseAmount(undefined)).toBe(0);
    expect(parseAmount(NaN)).toBe(0);
    expect(parseAmount(Infinity)).toBe(0);
  });

  it('preserves negative values -- clamping is the store layer job', () => {
    expect(parseAmount(-50)).toBe(-50);
  });
});

describe('formatMoney', () => {
  it('groups thousands and always shows two decimals', () => {
    expect(formatMoney(1234.5, 'SAR', 'en')).toBe('SAR 1,234.50');
    expect(formatMoney(0, 'SAR', 'en')).toBe('SAR 0.00');
    expect(formatMoney(1000000, 'USD', 'en')).toBe('USD 1,000,000.00');
  });

  it('puts the currency after the amount in Arabic', () => {
    expect(formatMoney(1234.5, 'SAR', 'ar')).toBe('1,234.50 SAR');
  });

  it('formats negatives with the sign before the whole value', () => {
    expect(formatMoney(-99.9, 'USD', 'en')).toBe('-USD 99.90');
    expect(formatMoney(-99.9, 'USD', 'ar')).toBe('-99.90 USD');
  });
});
