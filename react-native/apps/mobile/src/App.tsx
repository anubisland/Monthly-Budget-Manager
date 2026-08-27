import React, { useState } from 'react';
import {
  SafeAreaView,
  Text,
  View,
  TouchableOpacity,
  Alert,
  StatusBar,
  Modal,
  FlatList,
} from 'react-native';
import {
  BudgetDoc,
  isKnownCategory,
  monthLabel,
  monthKey as monthKeyForDate,
  OTHER_CATEGORY_ID,
  makeId,
} from '@monthly-budget/shared';
import { ReactNativeAdapter } from './ReactNativeAdapter';
import { BudgetProvider, useBudget } from './state/BudgetProvider';
import { t } from './i18n';
import { MonthBar } from './components/MonthBar';
import { dateForDay } from './screens/dateDisplay';
import { styles } from './screens/styles';
import { SummaryScreen } from './screens/SummaryScreen';
import { IncomeScreen } from './screens/IncomeScreen';
import { ExpenseScreen } from './screens/ExpenseScreen';
import { CompareScreen } from './compare/CompareScreen';
import { rowDirection, textAlign, writingDirection } from './components/direction';

function BudgetScreen() {
  const {
    status, monthKey, month, store, error, notice,
    goTo, goPrev, goNext, goCurrent, upsert, upsertToMonth, remove, dismissError, dismissNotice,
  } = useBudget();

  // The displayed month, derived from the single source of truth (monthKey)
  // instead of a locally-held year/month pair.
  const displayYear = Number(monthKey.slice(0, 4));
  const displayMonth = Number(monthKey.slice(5, 7));

  const [activeTab, setActiveTab] = useState<'summary' | 'compare' | 'income' | 'expense'>('summary');
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

  // File each imported entry into the month its own date names, not the
  // displayed month -- otherwise opening a backup from another month would
  // have upsertEntry's coherentDate silently rewrite every entry onto day 1
  // of whatever month happens to be on screen. Mirrors migrateV0toV1, which
  // trusts the entry's own date over any surrounding label for the same
  // reason. Falls back to the displayed month only when the entry carries
  // no usable date of its own.
  const targetMonthKey = (date: string | undefined) => (date && monthKeyForDate(date)) || monthKey;

  const openBudget = async () => {
    try {
      const loadedBudget = await adapter.openJSON();
      if (loadedBudget) {
        clearCurrentMonth();
        loadedBudget.incomes.forEach((income) => {
          upsertToMonth(targetMonthKey(income.date), 'income', {
            id: makeId(),
            name: income.name,
            // Income has no category picker in this screen yet (Phase 4 adds one).
            // Use the taxonomy's own fallback, never '' -- an empty id is not a valid
            // category and would break income suggestions and recurring detection.
            category: OTHER_CATEGORY_ID,
            amount: income.amount,
            date: income.date || dateForDay(monthKey, 1),
          });
        });
        loadedBudget.expenses.forEach((expense) => {
          upsertToMonth(targetMonthKey(expense.date), 'expense', {
            id: makeId(),
            name: expense.name,
            // An imported file can carry any free-text category (or one from
            // an older taxonomy). Anything not in the current taxonomy is
            // mapped to 'other' here -- the same fallback migration uses --
            // rather than stored as-is, which would make it untranslatable
            // by categoryLabel and invisible to nameSuggestions,
            // amountSuggestions and detectRecurring (all of which key off
            // real taxonomy ids).
            category: isKnownCategory('expense', expense.category) ? expense.category : OTHER_CATEGORY_ID,
            amount: expense.amount,
            date: expense.date || dateForDay(monthKey, 1),
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

  const updateMonthYear = (year: number, month: number) => {
    goTo(`${year}-${String(month).padStart(2, '0')}`);
    setShowMonthYearPicker(false);
  };

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
          { key: 'compare', label: t('screen.tabCompare', store.locale) },
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

      {activeTab === 'summary' && <SummaryScreen onOpenMonthPicker={() => setShowMonthYearPicker(true)} />}
      {activeTab === 'compare' && <CompareScreen />}
      {activeTab === 'income' && <IncomeScreen />}
      {activeTab === 'expense' && <ExpenseScreen />}

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
