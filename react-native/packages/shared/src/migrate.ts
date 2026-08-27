import { isValidMonthKey, monthKey, type MonthKey } from './month';
import { emptyStore, upsertEntry } from './store';
import { categoriesFor, OTHER_CATEGORY_ID } from './categories';
import type { BudgetStore, Entry, EntryKind } from './model';

export interface MigrationResult {
  store: BudgetStore;
  /** The original payload, verbatim. The storage layer must persist this first. */
  backup: string;
  migrated: boolean;
  entriesMoved: number;
}

interface V0Entry {
  name?: unknown;
  category?: unknown;
  amount?: unknown;
  date?: unknown;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** True only for a v0 shape: an object with incomes/expenses and no version. */
export function needsMigration(raw: unknown): boolean {
  if (!isRecord(raw)) return false;
  if (raw.version === 1) return false;
  return 'incomes' in raw || 'expenses' in raw || 'meta' in raw;
}

/** Map a free-text v0 category onto a taxonomy slug, or fall back to `other`. */
function mapCategory(kind: EntryKind, raw: unknown): string {
  const text = String(raw ?? '').trim().toLowerCase();
  if (!text) return OTHER_CATEGORY_ID;
  const hit = categoriesFor(kind).find((c) => c.id === text);
  return hit ? hit.id : OTHER_CATEGORY_ID;
}

function fallbackDate(
  meta: Record<string, unknown> | undefined,
  today: Date,
): string {
  const year = Number(meta?.year);
  const month = Number(meta?.month);
  const y = Number.isFinite(year) && year > 0 ? year : today.getFullYear();
  const m = Number.isFinite(month) && month >= 1 && month <= 12 ? month : 1;
  return `${y}-${String(m).padStart(2, '0')}-01`;
}

/**
 * Resolve which month an entry belongs to.
 *
 * The entry's own date always wins over meta. Finding F3 showed that meta
 * could be relabelled while entries kept their original dates, so meta is
 * only a last resort.
 */
function resolve(
  entry: V0Entry,
  meta: Record<string, unknown> | undefined,
  today: Date,
): { key: MonthKey; date: string } {
  const raw = typeof entry.date === 'string' ? entry.date.trim() : '';
  const fromEntry = raw ? monthKey(raw) : null;
  if (fromEntry) {
    return { key: fromEntry, date: raw.length === 10 ? raw : `${fromEntry}-01` };
  }
  const date = fallbackDate(meta, today);
  return { key: date.slice(0, 7), date };
}

/**
 * Validate a payload already tagged `version: 1` before trusting it as a
 * `BudgetStore`.
 *
 * The storage layer hands migration whatever was persisted, so a truncated
 * or corrupt write that still carries `version: 1` must not pass straight
 * through -- `months` must be a non-null object and `recurring` an array,
 * or every reader downstream (`monthsWithData`, `totalsForMonth`, ...)
 * throws the moment it touches them. `currency`/`locale` are cosmetic, so
 * they default rather than fail validation.
 *
 * Returns the SAME object (not a rebuilt copy) when it is usable, so a
 * well-formed store round-trips with every field intact. Returns null when
 * it is not, so the caller can fall back to the standard empty-store path.
 */
function asUsableV1Store(
  raw: Record<string, unknown>,
  opts?: { currency?: string; locale?: 'ar' | 'en' },
): BudgetStore | null {
  if (!isRecord(raw.months) || !Array.isArray(raw.recurring)) return null;

  const hasCurrency = typeof raw.currency === 'string';
  const hasLocale = raw.locale === 'ar' || raw.locale === 'en';
  if (hasCurrency && hasLocale) {
    // Already well-formed: pass the original object through unchanged.
    return raw as unknown as BudgetStore;
  }

  return {
    ...(raw as unknown as BudgetStore),
    currency: hasCurrency ? (raw.currency as string) : (opts?.currency ?? 'SAR'),
    locale: hasLocale ? (raw.locale as 'ar' | 'en') : (opts?.locale ?? 'ar'),
  };
}

/**
 * Migrate a v0 single-document payload into a v1 month-keyed store.
 *
 * Pure: returns the backup string but writes nothing. Unusable input yields
 * an empty v1 store rather than throwing, so a corrupt payload can never
 * leave the app with no store at all.
 */
export function migrateV0toV1(
  raw: unknown,
  opts?: { currency?: string; locale?: 'ar' | 'en'; today?: Date },
): MigrationResult {
  const today = opts?.today ?? new Date();
  // JSON.stringify throws on circular input. Migration must never throw, so
  // an unserializable payload degrades to a null backup rather than crashing.
  let backup: string;
  try {
    backup = JSON.stringify(raw ?? null) ?? 'null';
  } catch {
    backup = 'null';
  }

  if (isRecord(raw) && raw.version === 1) {
    const validated = asUsableV1Store(raw, opts);
    if (validated) {
      return { store: validated, backup, migrated: false, entriesMoved: 0 };
    }
    // version: 1 but the shape underneath is unusable (truncated/corrupt
    // payload) -- fall through to the same safe empty-store path as any
    // other unusable input, rather than handing the app a store that will
    // throw the instant something reads `.months` or `.recurring`.
  }

  let store = emptyStore({ currency: opts?.currency, locale: opts?.locale });
  if (!needsMigration(raw)) {
    return { store, backup, migrated: false, entriesMoved: 0 };
  }

  const doc = raw as Record<string, unknown>;
  const meta = isRecord(doc.meta) ? doc.meta : undefined;
  let entriesMoved = 0;
  let seq = 0;

  const groups: Array<{ kind: EntryKind; rows: unknown }> = [
    { kind: 'income', rows: doc.incomes },
    { kind: 'expense', rows: doc.expenses },
  ];

  for (const { kind, rows } of groups) {
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      if (!isRecord(row)) continue;
      const v0row = row as V0Entry;
      const { key, date } = resolve(v0row, meta, today);
      if (!isValidMonthKey(key)) continue;

      seq += 1;
      const entry: Entry = {
        id: `v0-${seq}`,
        name: String(v0row.name ?? '').trim() || (kind === 'income' ? 'Income' : 'Expense'),
        category: mapCategory(kind, v0row.category),
        // Pass the raw value through -- upsertEntry's parseAmount tolerates
        // strings like "1,500.00". Pre-coercing with Number() here would
        // turn that into NaN and silently zero real money.
        amount: v0row.amount as number,
        date,
      };
      store = upsertEntry(store, key, kind, entry);
      entriesMoved += 1;
    }
  }

  return { store, backup, migrated: true, entriesMoved };
}
