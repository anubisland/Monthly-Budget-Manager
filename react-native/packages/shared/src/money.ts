export type Locale = 'ar' | 'en';

/**
 * Parse an arbitrary value into an amount rounded to 2 decimals.
 * Returns 0 for anything unparseable. Negatives pass through -- clamping
 * to non-negative is the store layer's job, not the parser's.
 */
export function parseAmount(v: unknown): number {
  const n =
    typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/[,\s]/g, ''));
  if (!isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

/** Group the integer part with commas: 1234567 -> "1,234,567" */
function groupThousands(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Format an amount with its currency code.
 * English places the code first, Arabic places it last.
 * Hand-rolled rather than Intl.NumberFormat: Hermes on Android has shipped
 * incomplete Intl support, and this is deterministic across platforms.
 */
export function formatMoney(amount: number, currency: string, locale: Locale): string {
  const negative = amount < 0;
  const fixed = Math.abs(amount).toFixed(2);
  const [intPart, decPart] = fixed.split('.');
  const value = `${groupThousands(intPart)}.${decPart}`;
  const body = locale === 'ar' ? `${value} ${currency}` : `${currency} ${value}`;
  return negative ? `-${body}` : body;
}
