import React from 'react';
import { Text, View, ScrollView, TouchableOpacity, Alert, Dimensions } from 'react-native';
import { Entry, formatMoney, makeId, monthLabel, OTHER_CATEGORY_ID } from '@monthly-budget/shared';
import { useBudget } from '../state/BudgetProvider';
import { t } from '../i18n';
import { dateForDay } from './dateDisplay';
import { styles } from './styles';
import { Bars } from '../charts/Bars';
import { Donut } from '../charts/Donut';
import { colorFor } from '../charts/palette';
import { rowDirection, textAlign, writingDirection } from '../components/direction';

type SummaryScreenProps = {
  onOpenMonthPicker: () => void;
};

export function SummaryScreen({ onOpenMonthPicker }: SummaryScreenProps) {
  const {
    store, monthKey, month, totals: stats, byCategory: categoryStats,
    upsert, remove, setLocale,
  } = useBudget();

  // Build a same-shaped day-of-month date within the displayed month, so
  // entries created here always belong to the month they're shown under.

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
      { id: makeId(), name: 'Salary', category: OTHER_CATEGORY_ID, amount: 5000, date: dateForDay(monthKey, 1) },
      { id: makeId(), name: 'Freelance', category: OTHER_CATEGORY_ID, amount: 1500, date: dateForDay(monthKey, 15) },
    ];

    const sampleExpenses: Entry[] = [
      { id: makeId(), name: 'Rent', category: 'Rent', amount: 1200, date: dateForDay(monthKey, 1) },
      { id: makeId(), name: 'Groceries', category: 'Food', amount: 400, date: dateForDay(monthKey, 3) },
      { id: makeId(), name: 'Gas Bill', category: 'Fuel', amount: 80, date: dateForDay(monthKey, 5) },
      { id: makeId(), name: 'Internet', category: 'Internet', amount: 60, date: dateForDay(monthKey, 10) },
      { id: makeId(), name: 'Movies', category: 'Entertainment', amount: 25, date: dateForDay(monthKey, 12) },
    ];

    sampleIncomes.forEach((income) => upsert('income', income));
    sampleExpenses.forEach((expense) => upsert('expense', expense));
  };

  const screenWidth = Dimensions.get('window').width;

  return (
    <ScrollView style={styles.content}>
      <Text style={[styles.sectionTitle, { textAlign: textAlign(store.locale), writingDirection: writingDirection(store.locale) }]}>
        {t('screen.budgetSummary', store.locale)}
      </Text>

      {/* Month/Year Selector */}
      <TouchableOpacity
        style={styles.monthYearSelector}
        onPress={onOpenMonthPicker}
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
}
