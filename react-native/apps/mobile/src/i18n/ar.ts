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

  'screen.tabSummary': 'ملخص',
  'screen.headerTitle': 'مدير الميزانية الشهرية',
  'screen.fileNew': 'جديد',
  'screen.fileOpen': 'فتح',
  'screen.fileSave': 'حفظ',
  'screen.fileExport': 'تصدير',

  'screen.budgetSummary': 'ملخص الميزانية',
  'screen.tapToChange': 'اضغط للتغيير',
  'screen.totalIncome': 'إجمالي الدخل',
  'screen.totalExpenses': 'إجمالي المصروفات',
  'screen.profitLoss': 'الربح/الخسارة',
  'screen.profitMargin': 'هامش الربح',

  'screen.charts': 'الرسوم البيانية',
  'screen.incomeVsExpenses': 'الدخل مقابل المصروفات',
  'screen.expenseCategoriesPie': 'فئات المصروفات (رسم دائري)',
  'screen.expenseCategoriesBar': 'فئات المصروفات (رسم بياني شريطي)',
  'screen.showingTopCategories': 'عرض أعلى {count} فئات. اطّلع على التفاصيل الكاملة أدناه.',

  'screen.expensesByCategory': 'المصروفات حسب الفئة',

  'screen.dataManagement': 'إدارة البيانات',
  'screen.addSampleData': 'إضافة بيانات تجريبية',
  'screen.clearThisMonth': 'مسح هذا الشهر',
  'screen.switchLanguage': 'تبديل اللغة',

  'screen.incomeManagement': 'إدارة الدخل',
  'screen.incomeNamePlaceholder': 'اسم الدخل (مثال: الراتب)',
  'screen.amountPlaceholder': 'المبلغ',
  'screen.dayOfMonthPlaceholder': 'يوم الشهر (1-31، اختياري)',
  'screen.addIncome': 'إضافة دخل',
  'screen.currentIncomes': 'المداخيل الحالية',

  'screen.expenseManagement': 'إدارة المصروفات',
  'screen.expenseNamePlaceholder': 'اسم المصروف',
  'screen.categoryPlaceholder': 'الفئة',
  'screen.pick': 'اختيار',
  'screen.addExpense': 'إضافة مصروف',
  'screen.currentExpenses': 'المصروفات الحالية',
  'screen.delete': 'حذف',

  'screen.selectCategory': 'اختر الفئة',
  'screen.cancel': 'إلغاء',

  'screen.selectMonthYear': 'اختر الشهر والسنة',
  'screen.month': 'الشهر',
  'screen.year': 'السنة',

  'screen.alertClearMessage':
    'هل تريد مسح جميع الدخل والمصروفات المسجّلة للشهر المعروض؟ لن تتأثر الأشهر الأخرى. لا يمكن التراجع عن هذا الإجراء.',
  'screen.alertClearConfirm': 'مسح',
  'screen.alertCreateNewTitle': 'إنشاء ميزانية جديدة',
  'screen.alertCreateNewMessage':
    'سيؤدي هذا إلى مسح الشهر المعروض. لن تتأثر الأشهر الأخرى. هل أنت متأكد؟',
  'screen.alertCreateNewConfirm': 'إنشاء جديد',
  'screen.alertSuccessTitle': 'تم بنجاح',
  'screen.alertBudgetLoaded': 'تم تحميل الميزانية بنجاح!',
  'screen.alertErrorTitle': 'خطأ',
  'screen.alertOpenFailed': 'تعذّر فتح ملف الميزانية',
  'screen.alertSaveFailed': 'تعذّر حفظ ملف الميزانية',
  'screen.alertExportFailed': 'تعذّر تصدير ملف الميزانية',
  'screen.alertFillFields': 'يرجى تعبئة جميع الحقول',
  'screen.alertInvalidAmount': 'يرجى إدخال مبلغ صحيح',

  'screen.daySun': 'الأحد',
  'screen.dayMon': 'الإثنين',
  'screen.dayTue': 'الثلاثاء',
  'screen.dayWed': 'الأربعاء',
  'screen.dayThu': 'الخميس',
  'screen.dayFri': 'الجمعة',
  'screen.daySat': 'السبت',
};
