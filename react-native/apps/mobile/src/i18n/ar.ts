import type { en } from './en';

/**
 * Typed against the English object, so omitting a key fails the build.
 * Category and month names do NOT live here -- categories are stable ids
 * resolved by the shared taxonomy, and month names come from monthLabel().
 */
export const ar: Record<keyof typeof en, string> = {
  'app.title': 'الميزانية الشهرية',

  'month.current': 'الشهر الحالي',
  'month.previous': 'الشهر السابق',
  'month.next': 'الشهر التالي',
  'month.empty': 'لا توجد أي حركات مسجّلة لهذا الشهر بعد',
  'month.entriesCount': '{count} حركة',

  'totals.income': 'الدخل',
  'totals.expenses': 'المصروفات',
  'totals.net': 'الصافي',
  'totals.margin': 'هامش الربح',

  'kind.income': 'دخل',
  'kind.expense': 'مصروف',

  'status.loading': 'جارٍ تحميل ميزانيتك…',
  'status.saveFailed': 'تعذّر الحفظ. تعديلاتك ما زالت ظاهرة — حاول مرة أخرى.',
  'status.loadCorrupt': 'تعذّرت قراءة بياناتك المحفوظة. تم الاحتفاظ بها ولم تُحذف.',
  'status.migrated': 'تم تنظيم بياناتك في أشهر.',

  'action.retry': 'إعادة المحاولة',
  'action.dismiss': 'إغلاق',
};
