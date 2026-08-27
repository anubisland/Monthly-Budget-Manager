import React, { useState } from 'react';
import {
  SafeAreaView,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  StatusBar,
  Modal,
  FlatList,
  Dimensions,
} from 'react-native';
import { BudgetDoc, Entry, formatMoney, Locale, makeId, monthLabel, OTHER_CATEGORY_ID } from '@monthly-budget/shared';
import { ReactNativeAdapter } from './ReactNativeAdapter';
import { BudgetProvider, useBudget } from './state/BudgetProvider';
import { t } from './i18n';
import { MonthBar } from './components/MonthBar';
import { styles } from './screens/styles';
import { getDayOfMonth, formatDateDisplay } from './screens/dateDisplay';
import { Bars } from './charts/Bars';
import { Donut } from './charts/Donut';
import { colorFor } from './charts/palette';
import { rowDirection, textAlign, writingDirection } from './components/direction';

// Predefined expense categories from Python GUI
const EXPENSE_CATEGORIES = [
  "Food", "Rent", "Fuel", "Electricity", "Internet", "Water", "Transport",
  "Healthcare", "Entertainment", "Education", "Clothing", "Savings",
  "Debt", "Subscriptions", "Gifts", "Misc"
];

function BudgetScreen() {
  const {
    status, monthKey, month, totals: stats, byCategory: categoryStats,
    store, error, notice,
    goTo, goPrev, goNext, goCurrent, upsert, remove, dismissError, dismissNotice, setLocale,
  } = useBudget();

  // The displayed month, derived from the single source of truth (monthKey)
  // instead of a locally-held year/month pair.
  const displayYear = Number(monthKey.slice(0, 4));
  const displayMonth = Number(monthKey.slice(5, 7));

  const [activeTab, setActiveTab] = useState<'summary' | 'income' | 'expense'>('summary');
  const [newIncome, setNewIncome] = useState({ name: '', amount: '', day: '' });
  const [newExpense, setNewExpense] = useState({ name: '', category: '', amount: '', day: '' });
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showMonthYearPicker, setShowMonthYearPicker] = useState(false);

  const adapter = new ReactNativeAdapter();

  if (status === 'loading') {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#f8f9fa" />
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>{t('status.loading', store.locale)}</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Build a same-shaped day-of-month date within the displayed month, so
  // entries created here always belong to the month they're shown under.
  const dateForDay = (day: number): string => `${monthKey}-${String(day).padStart(2, '0')}`;

  // Snapshot of the displayed month in the legacy file-export shape. File
  // open/save/export are user-initiated one-off actions, not persistence --
  // the store itself is owned by the provider.
  const currentMonthAsDoc = (): BudgetDoc => ({
    meta: { year: displayYear, month: displayMonth },
    incomes: month.incomes.map(({ name, amount, date }) => ({ name, amount, date })),
    expenses: month.expenses.map(({ name, category, amount, date }) => ({ name, category, amount, date })),
  });

  const clearCurrentMonth = () => {
    month.incomes.forEach((income) => remove('income', income.id));
    month.expenses.forEach((expense) => remove('expense', expense.id));
  };

  const clearAllData = () => {
    Alert.alert(
      t('screen.clearThisMonth', store.locale),
      t('screen.alertClearMessage', store.locale),
      [
        { text: t('screen.cancel', store.locale), style: 'cancel' },
        {
          text: t('screen.alertClearConfirm', store.locale),
          style: 'destructive',
          onPress: clearCurrentMonth,
        },
      ]
    );
  };

  const addSampleData = () => {
    const sampleIncomes: Entry[] = [
      { id: makeId(), name: 'Salary', category: OTHER_CATEGORY_ID, amount: 5000, date: dateForDay(1) },
      { id: makeId(), name: 'Freelance', category: OTHER_CATEGORY_ID, amount: 1500, date: dateForDay(15) },
    ];

    const sampleExpenses: Entry[] = [
      { id: makeId(), name: 'Rent', category: 'Rent', amount: 1200, date: dateForDay(1) },
      { id: makeId(), name: 'Groceries', category: 'Food', amount: 400, date: dateForDay(3) },
      { id: makeId(), name: 'Gas Bill', category: 'Fuel', amount: 80, date: dateForDay(5) },
      { id: makeId(), name: 'Internet', category: 'Internet', amount: 60, date: dateForDay(10) },
      { id: makeId(), name: 'Movies', category: 'Entertainment', amount: 25, date: dateForDay(12) },
    ];

    sampleIncomes.forEach((income) => upsert('income', income));
    sampleExpenses.forEach((expense) => upsert('expense', expense));
  };

  // File operations
  const createNewBudget = () => {
    Alert.alert(
      t('screen.alertCreateNewTitle', store.locale),
      t('screen.alertCreateNewMessage', store.locale),
      [
        {
          text: t('screen.cancel', store.locale),
          style: 'cancel',
        },
        {
          text: t('screen.alertCreateNewConfirm', store.locale),
          style: 'destructive',
          onPress: clearCurrentMonth,
        },
      ]
    );
  };

  const openBudget = async () => {
    try {
      const loadedBudget = await adapter.openJSON();
      if (loadedBudget) {
        clearCurrentMonth();
        loadedBudget.incomes.forEach((income) => {
          upsert('income', {
            id: makeId(),
            name: income.name,
            // Income has no category picker in this screen yet (Phase 4 adds one).
            // Use the taxonomy's own fallback, never '' -- an empty id is not a valid
            // category and would break income suggestions and recurring detection.
            category: OTHER_CATEGORY_ID,
            amount: income.amount,
            date: income.date || dateForDay(1),
          });
        });
        loadedBudget.expenses.forEach((expense) => {
          upsert('expense', {
            id: makeId(),
            name: expense.name,
            category: expense.category,
            amount: expense.amount,
            date: expense.date || dateForDay(1),
          });
        });
        Alert.alert(t('screen.alertSuccessTitle', store.locale), t('screen.alertBudgetLoaded', store.locale));
      }
    } catch (error) {
      Alert.alert(t('screen.alertErrorTitle', store.locale), t('screen.alertOpenFailed', store.locale));
    }
  };

  const saveBudget = async () => {
    try {
      await adapter.saveJSON(currentMonthAsDoc());
    } catch (error) {
      Alert.alert(t('screen.alertErrorTitle', store.locale), t('screen.alertSaveFailed', store.locale));
    }
  };

  const exportBudget = async () => {
    try {
      await adapter.exportXLSX(currentMonthAsDoc());
    } catch (error) {
      Alert.alert(t('screen.alertErrorTitle', store.locale), t('screen.alertExportFailed', store.locale));
    }
  };

  const addIncome = () => {
    if (!newIncome.name.trim() || !newIncome.amount.trim()) {
      Alert.alert(t('screen.alertErrorTitle', store.locale), t('screen.alertFillFields', store.locale));
      return;
    }

    const amount = parseFloat(newIncome.amount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert(t('screen.alertErrorTitle', store.locale), t('screen.alertInvalidAmount', store.locale));
      return;
    }

    // Create date from the displayed month plus the chosen day, defaulting
    // to the 1st so the entry always lands in the month it's added from.
    let date = dateForDay(1);
    if (newIncome.day.trim()) {
      const day = parseInt(newIncome.day.trim());
      if (day >= 1 && day <= 31) {
        date = dateForDay(day);
      }
    }

    const income: Entry = {
      id: makeId(),
      name: newIncome.name.trim(),
      // Income has no category picker in this screen yet (Phase 4 adds one).
      // Use the taxonomy's own fallback, never '' -- an empty id is not a valid
      // category and would break income suggestions and recurring detection.
      category: OTHER_CATEGORY_ID,
      amount: amount,
      date: date,
    };

    upsert('income', income);

    setNewIncome({ name: '', amount: '', day: '' });
  };

  const addExpense = () => {
    if (!newExpense.name.trim() || !newExpense.category.trim() || !newExpense.amount.trim()) {
      Alert.alert(t('screen.alertErrorTitle', store.locale), t('screen.alertFillFields', store.locale));
      return;
    }

    const amount = parseFloat(newExpense.amount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert(t('screen.alertErrorTitle', store.locale), t('screen.alertInvalidAmount', store.locale));
      return;
    }

    // Create date from the displayed month plus the chosen day, defaulting
    // to the 1st so the entry always lands in the month it's added from.
    let date = dateForDay(1);
    if (newExpense.day.trim()) {
      const day = parseInt(newExpense.day.trim());
      if (day >= 1 && day <= 31) {
        date = dateForDay(day);
      }
    }

    const expense: Entry = {
      id: makeId(),
      name: newExpense.name.trim(),
      category: newExpense.category.trim(),
      amount: amount,
      date: date,
    };

    upsert('expense', expense);

    setNewExpense({ name: '', category: '', amount: '', day: '' });
  };

  const deleteIncome = (id: string) => {
    remove('income', id);
  };

  const deleteExpense = (id: string) => {
    remove('expense', id);
  };

  const selectCategory = (category: string) => {
    setNewExpense(prev => ({ ...prev, category }));
    setShowCategoryPicker(false);
  };

  const updateMonthYear = (year: number, month: number) => {
    goTo(`${year}-${String(month).padStart(2, '0')}`);
    setShowMonthYearPicker(false);
  };

  const renderCategoryPicker = () => (
    <Modal visible={showCategoryPicker} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={[styles.modalTitle, { textAlign: textAlign(store.locale), writingDirection: writingDirection(store.locale) }]}>
            {t('screen.selectCategory', store.locale)}
          </Text>
          <FlatList
            data={EXPENSE_CATEGORIES}
            keyExtractor={(item) => item}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.categoryOption}
                onPress={() => selectCategory(item)}
              >
                <Text style={styles.categoryOptionText}>{item}</Text>
              </TouchableOpacity>
            )}
          />
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => setShowCategoryPicker(false)}
          >
            <Text style={styles.cancelButtonText}>{t('screen.cancel', store.locale)}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  const renderMonthYearPicker = () => {
    // Month names come from the shared taxonomy's monthLabel(), never a
    // hardcoded English list -- monthLabel() always appends the year, so it
    // is stripped back off here since the year has its own picker column.
    const monthName = (monthNumber: number): string => {
      const key = `${displayYear}-${String(monthNumber).padStart(2, '0')}`;
      const withYear = monthLabel(key, store.locale);
      return withYear.replace(new RegExp(`\\s*${displayYear}$`), '');
    };
    const months = Array.from({ length: 12 }, (_, i) => monthName(i + 1));
    const years = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 5 + i);

    return (
      <Modal visible={showMonthYearPicker} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={[styles.modalTitle, { textAlign: textAlign(store.locale), writingDirection: writingDirection(store.locale) }]}>
              {t('screen.selectMonthYear', store.locale)}
            </Text>
            <Text style={styles.sectionSubtitle}>{t('screen.month', store.locale)}</Text>
            <FlatList
              data={months}
              keyExtractor={(item, index) => index.toString()}
              renderItem={({ item, index }) => (
                <TouchableOpacity
                  style={[
                    styles.monthYearOption,
                    displayMonth === index + 1 && styles.selectedOption
                  ]}
                  onPress={() => updateMonthYear(displayYear, index + 1)}
                >
                  <Text style={[
                    styles.monthYearOptionText,
                    displayMonth === index + 1 && styles.selectedOptionText
                  ]}>{item}</Text>
                </TouchableOpacity>
              )}
              style={{ maxHeight: 200 }}
            />
            <Text style={styles.sectionSubtitle}>{t('screen.year', store.locale)}</Text>
            <FlatList
              data={years}
              keyExtractor={(item) => item.toString()}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.monthYearOption,
                    displayYear === item && styles.selectedOption
                  ]}
                  onPress={() => updateMonthYear(item, displayMonth)}
                >
                  <Text style={[
                    styles.monthYearOptionText,
                    displayYear === item && styles.selectedOptionText
                  ]}>{item}</Text>
                </TouchableOpacity>
              )}
              style={{ maxHeight: 150 }}
            />
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setShowMonthYearPicker(false)}
            >
              <Text style={styles.cancelButtonText}>{t('screen.cancel', store.locale)}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  };

  const renderSummary = () => {
    const screenWidth = Dimensions.get('window').width;

    return (
      <ScrollView style={styles.content}>
        <Text style={[styles.sectionTitle, { textAlign: textAlign(store.locale), writingDirection: writingDirection(store.locale) }]}>
          {t('screen.budgetSummary', store.locale)}
        </Text>

        {/* Month/Year Selector */}
        <TouchableOpacity
          style={styles.monthYearSelector}
          onPress={() => setShowMonthYearPicker(true)}
        >
          <Text style={styles.monthTitle}>
            {monthLabel(monthKey, store.locale)}
          </Text>
          <Text style={styles.changeText}>{t('screen.tapToChange', store.locale)}</Text>
        </TouchableOpacity>

        <View style={styles.statsContainer}>
          <View style={[styles.statCard, { flexDirection: rowDirection(store.locale) }]}>
            <Text style={styles.statLabel}>{t('screen.totalIncome', store.locale)}</Text>
            <Text style={[styles.statValue, styles.incomeColor]}>
              {formatMoney(stats.income, store.currency, store.locale)}
            </Text>
          </View>

          <View style={[styles.statCard, { flexDirection: rowDirection(store.locale) }]}>
            <Text style={styles.statLabel}>{t('screen.totalExpenses', store.locale)}</Text>
            <Text style={[styles.statValue, styles.expenseColor]}>
              {formatMoney(stats.expenses, store.currency, store.locale)}
            </Text>
          </View>

          <View style={[styles.statCard, { flexDirection: rowDirection(store.locale) }]}>
            <Text style={styles.statLabel}>{t('screen.profitLoss', store.locale)}</Text>
            <Text style={[styles.statValue, stats.net >= 0 ? styles.profitColor : styles.lossColor]}>
              {formatMoney(stats.net, store.currency, store.locale)}
            </Text>
          </View>

          <View style={[styles.statCard, { flexDirection: rowDirection(store.locale) }]}>
            <Text style={styles.statLabel}>{t('screen.profitMargin', store.locale)}</Text>
            <Text style={[styles.statValue, stats.margin >= 0 ? styles.profitColor : styles.lossColor]}>
              {stats.margin.toFixed(1)}%
            </Text>
          </View>
        </View>

        {/* Charts Section */}
        <Text style={[styles.sectionTitle, { textAlign: textAlign(store.locale), writingDirection: writingDirection(store.locale) }]}>
          {t('screen.charts', store.locale)}
        </Text>

        {/* Income vs Expenses Bar Chart */}
        <View style={styles.chartContainer}>
          <Text style={styles.chartTitle}>{t('screen.incomeVsExpenses', store.locale)}</Text>
          <Bars
            width={screenWidth - 32}
            data={[
              { label: t('totals.income', store.locale), value: stats.income, colorIndex: 0 },
              { label: t('totals.expenses', store.locale), value: stats.expenses, colorIndex: 3 },
            ]}
            formatValue={(v) => formatMoney(v, store.currency, store.locale)}
          />
        </View>

        {/* Expense Categories Pie Chart */}
        {categoryStats.length > 0 && (
          <View style={styles.chartContainer}>
            <Text style={styles.chartTitle}>{t('screen.expenseCategoriesPie', store.locale)}</Text>
            <View style={[styles.donutRow, { flexDirection: rowDirection(store.locale) }]}>
              <Donut data={categoryStats.map((cat) => ({ label: cat.category, value: cat.amount }))} />
              <View style={styles.legend}>
                {categoryStats.map((cat, index) => (
                  <View key={cat.category} style={[styles.legendItem, { flexDirection: rowDirection(store.locale) }]}>
                    <View style={[styles.legendSwatch, { backgroundColor: colorFor(index) }]} />
                    <Text style={styles.legendText}>{cat.category}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        )}

        {/* Expense Categories Bar Chart */}
        {categoryStats.length > 0 && (
          <View style={styles.chartContainer}>
            <Text style={styles.chartTitle}>{t('screen.expenseCategoriesBar', store.locale)}</Text>
            <Bars
              width={screenWidth - 32}
              height={280}
              data={categoryStats.slice(0, 8).map((cat, index) => ({
                label: cat.category,
                value: cat.amount,
                colorIndex: index,
              }))}
              formatValue={(v) => formatMoney(v, store.currency, store.locale)}
            />
            {categoryStats.length > 8 && (
              <Text style={styles.chartNote}>
                {t('screen.showingTopCategories', store.locale, { count: 8 })}
              </Text>
            )}
          </View>
        )}

        {categoryStats.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { textAlign: textAlign(store.locale), writingDirection: writingDirection(store.locale) }]}>
              {t('screen.expensesByCategory', store.locale)}
            </Text>
            {categoryStats.map((cat, index) => (
              <View key={index} style={[styles.categoryCard, { flexDirection: rowDirection(store.locale) }]}>
                <Text style={styles.categoryName}>{cat.category}</Text>
                <Text style={styles.categoryAmount}>{formatMoney(cat.amount, store.currency, store.locale)}</Text>
                <Text style={styles.categoryPercent}>{cat.percent.toFixed(1)}%</Text>
              </View>
            ))}
          </>
        )}

        {/* Data Management Section */}
        <Text style={[styles.sectionTitle, { textAlign: textAlign(store.locale), writingDirection: writingDirection(store.locale) }]}>
          {t('screen.dataManagement', store.locale)}
        </Text>
        <View style={styles.dataManagementContainer}>
          <TouchableOpacity style={styles.sampleButton} onPress={addSampleData}>
            <Text style={styles.sampleButtonText}>{t('screen.addSampleData', store.locale)}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.clearButton} onPress={clearAllData}>
            <Text style={styles.clearButtonText}>{t('screen.clearThisMonth', store.locale)}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.languageButton}
            onPress={() => setLocale(store.locale === 'ar' ? 'en' : 'ar')}
            accessibilityRole="button"
            accessibilityLabel={`${t('screen.switchLanguage', store.locale)}: ${store.locale === 'ar' ? 'English' : 'العربية'}`}
          >
            <Text style={styles.languageButtonText}>
              {store.locale === 'ar' ? 'English' : 'العربية'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  };

  const renderIncomes = () => (
    <ScrollView style={styles.content}>
      <Text style={[styles.sectionTitle, { textAlign: textAlign(store.locale), writingDirection: writingDirection(store.locale) }]}>
        {t('screen.incomeManagement', store.locale)}
      </Text>

      <View style={styles.formContainer}>
        <TextInput
          style={[styles.input, { textAlign: textAlign(store.locale), writingDirection: writingDirection(store.locale) }]}
          placeholder={t('screen.incomeNamePlaceholder', store.locale)}
          value={newIncome.name}
          onChangeText={(text) => setNewIncome(prev => ({ ...prev, name: text }))}
        />
        <TextInput
          style={[styles.input, { textAlign: textAlign(store.locale), writingDirection: writingDirection(store.locale) }]}
          placeholder={t('screen.amountPlaceholder', store.locale)}
          value={newIncome.amount}
          onChangeText={(text) => setNewIncome(prev => ({ ...prev, amount: text }))}
          keyboardType="numeric"
        />
        <TextInput
          style={[styles.input, { textAlign: textAlign(store.locale), writingDirection: writingDirection(store.locale) }]}
          placeholder={t('screen.dayOfMonthPlaceholder', store.locale)}
          value={newIncome.day}
          onChangeText={(text) => setNewIncome(prev => ({ ...prev, day: text }))}
          keyboardType="numeric"
        />
        <TouchableOpacity style={styles.addButton} onPress={addIncome}>
          <Text style={styles.addButtonText}>{t('screen.addIncome', store.locale)}</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.listTitle}>{t('screen.currentIncomes', store.locale)}</Text>
      {month.incomes.map((income) => (
        <View key={income.id} style={[styles.listItem, { flexDirection: rowDirection(store.locale) }]}>
          <View style={styles.listItemContent}>
            <Text style={styles.listItemName}>{income.name}</Text>
            <Text style={styles.listItemAmount}>{formatMoney(income.amount, store.currency, store.locale)}</Text>
            {income.date && (
              <Text style={styles.listItemDate}>
                {formatDateDisplay(income.date, store.locale)}
              </Text>
            )}
          </View>
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={() => deleteIncome(income.id)}
          >
            <Text style={styles.deleteButtonText}>{t('screen.delete', store.locale)}</Text>
          </TouchableOpacity>
        </View>
      ))}
    </ScrollView>
  );

  const renderExpenses = () => (
    <ScrollView style={styles.content}>
      <Text style={[styles.sectionTitle, { textAlign: textAlign(store.locale), writingDirection: writingDirection(store.locale) }]}>
        {t('screen.expenseManagement', store.locale)}
      </Text>

      <View style={styles.formContainer}>
        <TextInput
          style={[styles.input, { textAlign: textAlign(store.locale), writingDirection: writingDirection(store.locale) }]}
          placeholder={t('screen.expenseNamePlaceholder', store.locale)}
          value={newExpense.name}
          onChangeText={(text) => setNewExpense(prev => ({ ...prev, name: text }))}
        />

        <View style={[styles.categoryInputContainer, { flexDirection: rowDirection(store.locale) }]}>
          <TextInput
            style={[styles.input, styles.categoryInput, { textAlign: textAlign(store.locale), writingDirection: writingDirection(store.locale) }]}
            placeholder={t('screen.categoryPlaceholder', store.locale)}
            value={newExpense.category}
            onChangeText={(text) => setNewExpense(prev => ({ ...prev, category: text }))}
          />
          <TouchableOpacity
            style={styles.pickButton}
            onPress={() => setShowCategoryPicker(true)}
          >
            <Text style={styles.pickButtonText}>{t('screen.pick', store.locale)}</Text>
          </TouchableOpacity>
        </View>

        <TextInput
          style={[styles.input, { textAlign: textAlign(store.locale), writingDirection: writingDirection(store.locale) }]}
          placeholder={t('screen.amountPlaceholder', store.locale)}
          value={newExpense.amount}
          onChangeText={(text) => setNewExpense(prev => ({ ...prev, amount: text }))}
          keyboardType="numeric"
        />
        <TextInput
          style={[styles.input, { textAlign: textAlign(store.locale), writingDirection: writingDirection(store.locale) }]}
          placeholder={t('screen.dayOfMonthPlaceholder', store.locale)}
          value={newExpense.day}
          onChangeText={(text) => setNewExpense(prev => ({ ...prev, day: text }))}
          keyboardType="numeric"
        />
        <TouchableOpacity style={styles.addButton} onPress={addExpense}>
          <Text style={styles.addButtonText}>{t('screen.addExpense', store.locale)}</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.listTitle}>{t('screen.currentExpenses', store.locale)}</Text>
      {month.expenses.map((expense) => (
        <View key={expense.id} style={[styles.listItem, { flexDirection: rowDirection(store.locale) }]}>
          <View style={styles.listItemContent}>
            <Text style={styles.listItemName}>{expense.name}</Text>
            <Text style={styles.listItemCategory}>{expense.category}</Text>
            <Text style={styles.listItemAmount}>{formatMoney(expense.amount, store.currency, store.locale)}</Text>
            {expense.date && (
              <Text style={styles.listItemDate}>
                {formatDateDisplay(expense.date, store.locale)}
              </Text>
            )}
          </View>
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={() => deleteExpense(expense.id)}
          >
            <Text style={styles.deleteButtonText}>{t('screen.delete', store.locale)}</Text>
          </TouchableOpacity>
        </View>
      ))}
    </ScrollView>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8f9fa" />

      {error && (
        <View style={[styles.errorBanner, { flexDirection: rowDirection(store.locale) }]}>
          <Text style={[styles.errorBannerText, { textAlign: textAlign(store.locale), writingDirection: writingDirection(store.locale) }]}>
            {t('status.saveFailed', store.locale)} ({error})
          </Text>
          <TouchableOpacity style={styles.bannerDismissButton} onPress={dismissError}>
            <Text style={styles.bannerDismissText}>{t('action.dismiss', store.locale)}</Text>
          </TouchableOpacity>
        </View>
      )}

      {notice === 'migrated' && (
        <View style={[styles.noticeBanner, { flexDirection: rowDirection(store.locale) }]}>
          <Text style={[styles.noticeBannerText, { textAlign: textAlign(store.locale), writingDirection: writingDirection(store.locale) }]}>
            {t('status.migrated', store.locale)}
          </Text>
          <TouchableOpacity style={styles.bannerDismissButton} onPress={dismissNotice}>
            <Text style={styles.bannerDismissText}>{t('action.dismiss', store.locale)}</Text>
          </TouchableOpacity>
        </View>
      )}

      {notice === 'corrupt' && (
        <View style={[styles.noticeBanner, { flexDirection: rowDirection(store.locale) }]}>
          <Text style={[styles.noticeBannerText, { textAlign: textAlign(store.locale), writingDirection: writingDirection(store.locale) }]}>
            {t('status.loadCorrupt', store.locale)}
          </Text>
          <TouchableOpacity style={styles.bannerDismissButton} onPress={dismissNotice}>
            <Text style={styles.bannerDismissText}>{t('action.dismiss', store.locale)}</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('screen.headerTitle', store.locale)}</Text>

        {/* File Operations Row */}
        <View style={[styles.fileOperationsContainer, { flexDirection: rowDirection(store.locale) }]}>
          <TouchableOpacity style={styles.fileButton} onPress={createNewBudget}>
            <Text style={styles.fileButtonText}>{t('screen.fileNew', store.locale)}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.fileButton} onPress={openBudget}>
            <Text style={styles.fileButtonText}>{t('screen.fileOpen', store.locale)}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.fileButton} onPress={saveBudget}>
            <Text style={styles.fileButtonText}>{t('screen.fileSave', store.locale)}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.fileButton} onPress={exportBudget}>
            <Text style={styles.fileButtonText}>{t('screen.fileExport', store.locale)}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <MonthBar
        monthKey={monthKey}
        locale={store.locale}
        onPrev={goPrev}
        onNext={goNext}
        onCurrent={goCurrent}
      />

      <View style={[styles.tabContainer, { flexDirection: rowDirection(store.locale) }]}>
        {[
          { key: 'summary', label: t('screen.tabSummary', store.locale) },
          { key: 'income', label: t('kind.income', store.locale) },
          { key: 'expense', label: t('totals.expenses', store.locale) },
        ].map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.activeTab]}
            onPress={() => setActiveTab(tab.key as any)}
          >
            <Text style={[styles.tabText, activeTab === tab.key && styles.activeTabText]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {activeTab === 'summary' && renderSummary()}
      {activeTab === 'income' && renderIncomes()}
      {activeTab === 'expense' && renderExpenses()}

      {renderCategoryPicker()}
      {renderMonthYearPicker()}
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <BudgetProvider>
      <BudgetScreen />
    </BudgetProvider>
  );
}

