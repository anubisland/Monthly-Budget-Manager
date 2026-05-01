import React, { useState, useEffect } from 'react';
import {
  SafeAreaView,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  StyleSheet,
  StatusBar,
  Modal,
  FlatList,
  Dimensions,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { BudgetDoc, Income, Expense, totals, expensesByCategory, serialize, deserialize } from '@monthly-budget/shared';
import { BarChart, PieChart } from 'react-native-chart-kit';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ReactNativeAdapter } from './ReactNativeAdapter';
import { useLanguage } from './LanguageContext';
import { LanguageToggle } from './LanguageToggle';

const EXPENSE_CATEGORY_KEYS = [
  'Food', 'Rent', 'Fuel', 'Electricity', 'Internet', 'Water', 'Transport',
  'Healthcare', 'Entertainment', 'Education', 'Clothing', 'Savings',
  'Debt', 'Subscriptions', 'Gifts', 'Misc',
] as const;

const WEEKDAY_KEYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

const getDayOfWeekKey = (dateStr: string): string => WEEKDAY_KEYS[new Date(dateStr).getDay()];
const getDayOfMonth = (dateStr: string): number => new Date(dateStr).getDate();

export default function App() {
  const { t } = useTranslation();
  const { isRTL } = useLanguage();
  const textAlign = isRTL ? 'right' : 'left';
  const writingDirection = isRTL ? 'rtl' : 'ltr';

  const [budget, setBudget] = useState<BudgetDoc>({
    meta: { year: new Date().getFullYear(), month: new Date().getMonth() + 1 },
    incomes: [],
    expenses: [],
  });
  const [activeTab, setActiveTab] = useState<'summary' | 'income' | 'expense'>('summary');
  const [newIncome, setNewIncome] = useState({ name: '', amount: '', day: '' });
  const [newExpense, setNewExpense] = useState({ name: '', category: '', amount: '', day: '' });
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showMonthYearPicker, setShowMonthYearPicker] = useState(false);

  const adapter = new ReactNativeAdapter();
  const stats = totals(budget.incomes, budget.expenses);
  const categoryStats = expensesByCategory(budget.expenses);

  useEffect(() => {
    (async () => {
      try {
        const stored = await adapter.loadFromStorage();
        if (stored) setBudget(stored);
      } catch (e) { console.error('[BudgetApp] loadFromStorage failed', e); }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try { await adapter.saveToStorage(budget); }
      catch (e) { console.error('[BudgetApp] saveToStorage failed', e); }
    })();
  }, [budget]);

  useEffect(() => { loadBudgetData(); }, []);
  useEffect(() => { saveBudgetData(); }, [budget]);

  const saveBudgetData = async () => {
    try {
      const updated = { ...budget, meta: { ...budget.meta, saved_at: new Date().toISOString() } };
      await AsyncStorage.setItem('budget_data', serialize(updated));
    } catch (e) { console.error('[BudgetApp] saveBudgetData failed', e); }
  };

  const loadBudgetData = async () => {
    try {
      const raw = await AsyncStorage.getItem('budget_data');
      if (raw) setBudget(deserialize(raw));
    } catch (e) { console.error('[BudgetApp] loadBudgetData failed', e); }
  };

  const formatDateDisplay = (dateStr: string): string => {
    if (!dateStr) return '';
    return `${getDayOfMonth(dateStr)} (${t(`weekdays.${getDayOfWeekKey(dateStr)}`)})`;
  };

  const clearAllData = () => {
    Alert.alert(t('alert.clearAllTitle'), t('alert.clearAllMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('alert.clearButton'),
        style: 'destructive',
        onPress: () => setBudget({ meta: { year: new Date().getFullYear(), month: new Date().getMonth() + 1 }, incomes: [], expenses: [] }),
      },
    ]);
  };

  const addSampleData = () => {
    const pad = (n: number) => n.toString().padStart(2, '0');
    const dateFor = (d: number) => `${budget.meta.year}-${pad(budget.meta.month)}-${pad(d)}`;
    setBudget(prev => ({
      ...prev,
      incomes: [...prev.incomes,
        { name: 'Salary', amount: 5000, date: dateFor(1) },
        { name: 'Freelance', amount: 1500, date: dateFor(15) },
      ],
      expenses: [...prev.expenses,
        { name: 'Rent', category: 'Rent', amount: 1200, date: dateFor(1) },
        { name: 'Groceries', category: 'Food', amount: 400, date: dateFor(3) },
        { name: 'Gas Bill', category: 'Fuel', amount: 80, date: dateFor(5) },
        { name: 'Internet', category: 'Internet', amount: 60, date: dateFor(10) },
        { name: 'Movies', category: 'Entertainment', amount: 25, date: dateFor(12) },
      ],
    }));
  };

  const createNewBudget = () => {
    Alert.alert(t('alert.newBudgetTitle'), t('alert.newBudgetMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('alert.newButton'),
        style: 'destructive',
        onPress: () => setBudget({ meta: { year: new Date().getFullYear(), month: new Date().getMonth() + 1 }, incomes: [], expenses: [] }),
      },
    ]);
  };

  const openBudget = async () => {
    try {
      const loaded = await adapter.openJSON();
      if (loaded) { setBudget(loaded); Alert.alert(t('alert.successTitle'), t('alert.loadSuccess')); }
    } catch (e) { console.error('[BudgetApp] openBudget failed', e); Alert.alert(t('alert.errorTitle'), t('alert.openError')); }
  };

  const saveBudget = async () => {
    try { await adapter.saveJSON(budget); }
    catch (e) { console.error('[BudgetApp] saveBudget failed', e); Alert.alert(t('alert.errorTitle'), t('alert.saveError')); }
  };

  const exportBudget = async () => {
    try { await adapter.exportXLSX(budget); }
    catch (e) { console.error('[BudgetApp] exportBudget failed', e); Alert.alert(t('alert.errorTitle'), t('alert.exportError')); }
  };

  const addIncome = () => {
    if (!newIncome.name.trim() || !newIncome.amount.trim()) {
      return Alert.alert(t('alert.errorTitle'), t('alert.fillAllFields'));
    }
    const amount = parseFloat(newIncome.amount);
    if (isNaN(amount) || amount <= 0) return Alert.alert(t('alert.errorTitle'), t('alert.validAmount'));
    let date = new Date().toISOString().split('T')[0];
    if (newIncome.day.trim()) {
      const d = parseInt(newIncome.day.trim());
      if (d >= 1 && d <= 31)
        date = `${budget.meta.year}-${budget.meta.month.toString().padStart(2,'0')}-${d.toString().padStart(2,'0')}`;
    }
    setBudget(prev => ({ ...prev, incomes: [...prev.incomes, { name: newIncome.name.trim(), amount, date }] }));
    setNewIncome({ name: '', amount: '', day: '' });
  };

  const addExpense = () => {
    if (!newExpense.name.trim() || !newExpense.category.trim() || !newExpense.amount.trim()) {
      return Alert.alert(t('alert.errorTitle'), t('alert.fillAllFields'));
    }
    const amount = parseFloat(newExpense.amount);
    if (isNaN(amount) || amount <= 0) return Alert.alert(t('alert.errorTitle'), t('alert.validAmount'));
    let date = new Date().toISOString().split('T')[0];
    if (newExpense.day.trim()) {
      const d = parseInt(newExpense.day.trim());
      if (d >= 1 && d <= 31)
        date = `${budget.meta.year}-${budget.meta.month.toString().padStart(2,'0')}-${d.toString().padStart(2,'0')}`;
    }
    setBudget(prev => ({
      ...prev,
      expenses: [...prev.expenses, { name: newExpense.name.trim(), category: newExpense.category.trim(), amount, date }],
    }));
    setNewExpense({ name: '', category: '', amount: '', day: '' });
  };

  const renderCategoryPicker = () => (
    <Modal visible={showCategoryPicker} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={[styles.modalTitle, { textAlign: 'center' }]}>{t('modal.selectCategory')}</Text>
          <FlatList
            data={EXPENSE_CATEGORY_KEYS}
            keyExtractor={(item) => item}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.categoryOption} onPress={() => { setNewExpense(p => ({ ...p, category: item })); setShowCategoryPicker(false); }}>
                <Text style={[styles.categoryOptionText, { textAlign }]}>{t(`categories.${item}`)}</Text>
              </TouchableOpacity>
            )}
          />
          <TouchableOpacity style={styles.cancelButton} onPress={() => setShowCategoryPicker(false)}>
            <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  const renderMonthYearPicker = () => {
    const monthKeys = ['1','2','3','4','5','6','7','8','9','10','11','12'] as const;
    const years = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 5 + i);
    return (
      <Modal visible={showMonthYearPicker} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={[styles.modalTitle, { textAlign: 'center' }]}>{t('modal.selectMonthYear')}</Text>
            <Text style={[styles.sectionSubtitle, { textAlign }]}>{t('modal.month')}</Text>
            <FlatList
              data={monthKeys}
              keyExtractor={(item) => item}
              renderItem={({ item, index }) => (
                <TouchableOpacity
                  style={[styles.monthYearOption, budget.meta.month === index + 1 && styles.selectedOption]}
                  onPress={() => { setBudget(p => ({ ...p, meta: { ...p.meta, month: index + 1 } })); setShowMonthYearPicker(false); }}
                >
                  <Text style={[styles.monthYearOptionText, budget.meta.month === index + 1 && styles.selectedOptionText, { textAlign }]}>
                    {t(`months.${item}`)}
                  </Text>
                </TouchableOpacity>
              )}
              style={{ maxHeight: 200 }}
            />
            <Text style={[styles.sectionSubtitle, { textAlign }]}>{t('modal.year')}</Text>
            <FlatList
              data={years}
              keyExtractor={(item) => item.toString()}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.monthYearOption, budget.meta.year === item && styles.selectedOption]}
                  onPress={() => { setBudget(p => ({ ...p, meta: { ...p.meta, year: item } })); setShowMonthYearPicker(false); }}
                >
                  <Text style={[styles.monthYearOptionText, budget.meta.year === item && styles.selectedOptionText, { textAlign }]}>{item}</Text>
                </TouchableOpacity>
              )}
              style={{ maxHeight: 150 }}
            />
            <TouchableOpacity style={styles.cancelButton} onPress={() => setShowMonthYearPicker(false)}>
              <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
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
        <Text style={[styles.sectionTitle, { textAlign }]}>{t('summary.title')}</Text>

        <TouchableOpacity style={styles.monthYearSelector} onPress={() => setShowMonthYearPicker(true)}>
          <Text style={styles.monthTitle}>
            {new Date(budget.meta.year, budget.meta.month - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </Text>
          <Text style={styles.changeText}>{t('summary.tapToChange')}</Text>
        </TouchableOpacity>

        <View style={styles.statsContainer}>
          {[
            { label: t('summary.totalIncome'),    value: `$${stats.income_total.toFixed(2)}`,  color: styles.incomeColor },
            { label: t('summary.totalExpenses'),  value: `$${stats.expense_total.toFixed(2)}`, color: styles.expenseColor },
            { label: t('summary.profitLoss'),     value: `$${stats.profit.toFixed(2)}`,        color: stats.profit >= 0 ? styles.profitColor : styles.lossColor },
            { label: t('summary.profitMargin'),   value: `${stats.profit_margin.toFixed(1)}%`, color: stats.profit_margin >= 0 ? styles.profitColor : styles.lossColor },
          ].map(({ label, value, color }) => (
            <View key={label} style={styles.statCard}>
              <Text style={[styles.statLabel, { textAlign }]}>{label}</Text>
              <Text style={[styles.statValue, color]}>{value}</Text>
            </View>
          ))}
        </View>

        <Text style={[styles.sectionTitle, { textAlign }]}>{t('summary.charts')}</Text>

        <View style={styles.chartContainer}>
          <Text style={[styles.chartTitle, { textAlign: 'center' }]}>{t('summary.chartIncomeVsExpenses')}</Text>
          <BarChart
            data={{ labels: [t('summary.chartLabelIncome'), t('summary.chartLabelExpenses')], datasets: [{ data: [stats.income_total, stats.expense_total] }] }}
            width={screenWidth - 32} height={220} yAxisLabel="$" yAxisSuffix=""
            chartConfig={{ backgroundColor:'#fff', backgroundGradientFrom:'#fff', backgroundGradientTo:'#fff', decimalPlaces:0, color:(o=1)=>`rgba(0,123,255,${o})`, labelColor:(o=1)=>`rgba(33,37,41,${o})`, style:{borderRadius:8}, propsForLabels:{fontSize:12} }}
            style={styles.chart} showValuesOnTopOfBars
          />
        </View>

        {categoryStats.length > 0 && (
          <View style={styles.chartContainer}>
            <Text style={[styles.chartTitle, { textAlign: 'center' }]}>{t('summary.chartExpensePie')}</Text>
            <PieChart
              data={categoryStats.map((cat, i) => ({
                name: t(`categories.${cat.category}`, cat.category),
                amount: cat.amount,
                color: ['#FF6384','#36A2EB','#FFCE56','#4BC0C0','#9966FF','#FF9F40','#FF6384','#C9CBCF','#4BC0C0','#36A2EB'][i % 10],
                legendFontColor: '#495057', legendFontSize: 12,
              }))}
              width={screenWidth - 32} height={220}
              chartConfig={{ color:(o=1)=>`rgba(0,0,0,${o})`, labelColor:(o=1)=>`rgba(33,37,41,${o})` }}
              accessor="amount" backgroundColor="transparent" paddingLeft="15" style={styles.chart}
            />
          </View>
        )}

        {categoryStats.length > 0 && (
          <View style={styles.chartContainer}>
            <Text style={[styles.chartTitle, { textAlign: 'center' }]}>{t('summary.chartExpenseBar')}</Text>
            <BarChart
              data={{
                labels: categoryStats.slice(0, 8).map(cat => { const l = t(`categories.${cat.category}`, cat.category); return l.length > 8 ? l.slice(0,8)+'…' : l; }),
                datasets: [{ data: categoryStats.slice(0, 8).map(c => c.amount) }],
              }}
              width={screenWidth - 32} height={280} yAxisLabel="$" yAxisSuffix=""
              chartConfig={{ backgroundColor:'#fff', backgroundGradientFrom:'#fff', backgroundGradientTo:'#fff', decimalPlaces:0, color:(o=1)=>`rgba(220,53,69,${o})`, labelColor:(o=1)=>`rgba(33,37,41,${o})`, style:{borderRadius:8}, propsForLabels:{fontSize:10} }}
              style={styles.chart} showValuesOnTopOfBars fromZero
            />
            {categoryStats.length > 8 && <Text style={[styles.chartNote, { textAlign: 'center' }]}>{t('summary.chartTopNote')}</Text>}
          </View>
        )}

        {categoryStats.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { textAlign }]}>{t('summary.expensesByCategory')}</Text>
            {categoryStats.map((cat, i) => (
              <View key={i} style={styles.categoryCard}>
                <Text style={[styles.categoryName, { textAlign }]}>{t(`categories.${cat.category}`, cat.category)}</Text>
                <Text style={styles.categoryAmount}>${cat.amount.toFixed(2)}</Text>
                <Text style={styles.categoryPercent}>{cat.percent.toFixed(1)}%</Text>
              </View>
            ))}
          </>
        )}

        <Text style={[styles.sectionTitle, { textAlign }]}>{t('summary.dataManagement')}</Text>
        <View style={styles.dataManagementContainer}>
          {budget.meta.saved_at && (
            <Text style={[styles.lastSavedText, { textAlign: 'center' }]}>
              {t('summary.lastSaved')} {new Date(budget.meta.saved_at).toLocaleString()}
            </Text>
          )}
          <TouchableOpacity style={styles.sampleButton} onPress={addSampleData}>
            <Text style={styles.sampleButtonText}>{t('summary.addSampleData')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.clearButton} onPress={clearAllData}>
            <Text style={styles.clearButtonText}>{t('summary.clearAllData')}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  };

  const renderIncomes = () => (
    <ScrollView style={styles.content}>
      <Text style={[styles.sectionTitle, { textAlign }]}>{t('income.title')}</Text>
      <View style={styles.formContainer}>
        <TextInput style={[styles.input, { textAlign, writingDirection }]} placeholder={t('income.namePlaceholder')}
          value={newIncome.name} onChangeText={(v) => setNewIncome(p => ({ ...p, name: v }))} />
        <TextInput style={[styles.input, { textAlign: 'left' }]} placeholder={t('income.amountPlaceholder')}
          value={newIncome.amount} onChangeText={(v) => setNewIncome(p => ({ ...p, amount: v }))} keyboardType="numeric" />
        <TextInput style={[styles.input, { textAlign: 'left' }]} placeholder={t('income.dayPlaceholder')}
          value={newIncome.day} onChangeText={(v) => setNewIncome(p => ({ ...p, day: v }))} keyboardType="numeric" />
        <TouchableOpacity style={styles.addButton} onPress={addIncome}>
          <Text style={styles.addButtonText}>{t('income.addButton')}</Text>
        </TouchableOpacity>
      </View>
      <Text style={[styles.listTitle, { textAlign }]}>{t('income.listTitle')}</Text>
      {budget.incomes.map((income, i) => (
        <View key={i} style={styles.listItem}>
          <View style={styles.listItemContent}>
            <Text style={[styles.listItemName, { textAlign }]}>{income.name}</Text>
            <Text style={styles.listItemAmount}>${income.amount.toFixed(2)}</Text>
            {income.date && <Text style={styles.listItemDate}>{formatDateDisplay(income.date)}</Text>}
          </View>
          <TouchableOpacity style={styles.deleteButton} onPress={() => setBudget(p => ({ ...p, incomes: p.incomes.filter((_, j) => j !== i) }))}>
            <Text style={styles.deleteButtonText}>{t('common.delete')}</Text>
          </TouchableOpacity>
        </View>
      ))}
    </ScrollView>
  );

  const renderExpenses = () => (
    <ScrollView style={styles.content}>
      <Text style={[styles.sectionTitle, { textAlign }]}>{t('expense.title')}</Text>
      <View style={styles.formContainer}>
        <TextInput style={[styles.input, { textAlign, writingDirection }]} placeholder={t('expense.namePlaceholder')}
          value={newExpense.name} onChangeText={(v) => setNewExpense(p => ({ ...p, name: v }))} />
        <View style={styles.categoryInputContainer}>
          <TextInput
            style={[styles.input, styles.categoryInput, { textAlign, writingDirection }]}
            placeholder={t('expense.categoryPlaceholder')}
            value={newExpense.category ? t(`categories.${newExpense.category}`, newExpense.category) : ''}
            editable={false}
          />
          <TouchableOpacity style={styles.pickButton} onPress={() => setShowCategoryPicker(true)}>
            <Text style={styles.pickButtonText}>{t('expense.pickButton')}</Text>
          </TouchableOpacity>
        </View>
        <TextInput style={[styles.input, { textAlign: 'left' }]} placeholder={t('expense.amountPlaceholder')}
          value={newExpense.amount} onChangeText={(v) => setNewExpense(p => ({ ...p, amount: v }))} keyboardType="numeric" />
        <TextInput style={[styles.input, { textAlign: 'left' }]} placeholder={t('expense.dayPlaceholder')}
          value={newExpense.day} onChangeText={(v) => setNewExpense(p => ({ ...p, day: v }))} keyboardType="numeric" />
        <TouchableOpacity style={styles.addButton} onPress={addExpense}>
          <Text style={styles.addButtonText}>{t('expense.addButton')}</Text>
        </TouchableOpacity>
      </View>
      <Text style={[styles.listTitle, { textAlign }]}>{t('expense.listTitle')}</Text>
      {budget.expenses.map((exp, i) => (
        <View key={i} style={styles.listItem}>
          <View style={styles.listItemContent}>
            <Text style={[styles.listItemName, { textAlign }]}>{exp.name}</Text>
            <Text style={[styles.listItemCategory, { textAlign }]}>{t(`categories.${exp.category}`, exp.category)}</Text>
            <Text style={styles.listItemAmount}>${exp.amount.toFixed(2)}</Text>
            {exp.date && <Text style={styles.listItemDate}>{formatDateDisplay(exp.date)}</Text>}
          </View>
          <TouchableOpacity style={styles.deleteButton} onPress={() => setBudget(p => ({ ...p, expenses: p.expenses.filter((_, j) => j !== i) }))}>
            <Text style={styles.deleteButtonText}>{t('common.delete')}</Text>
          </TouchableOpacity>
        </View>
      ))}
    </ScrollView>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8f9fa" />

      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Text style={[styles.headerTitle, { flex: 1, textAlign: 'center' }]}>{t('appTitle')}</Text>
          <LanguageToggle />
        </View>
        <View style={styles.fileOperationsContainer}>
          {(['header.new', 'header.open', 'header.save', 'header.export'] as const).map((key, i) => {
            const handlers = [createNewBudget, openBudget, saveBudget, exportBudget];
            return (
              <TouchableOpacity key={key} style={styles.fileButton} onPress={handlers[i]}>
                <Text style={styles.fileButtonText}>{t(key)}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={styles.tabContainer}>
        {[
          { key: 'summary', label: t('nav.summary') },
          { key: 'income',  label: t('nav.income')  },
          { key: 'expense', label: t('nav.expenses') },
        ].map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.activeTab]}
            onPress={() => setActiveTab(tab.key as 'summary' | 'income' | 'expense')}
          >
            <Text style={[styles.tabText, activeTab === tab.key && styles.activeTabText]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {activeTab === 'summary' && renderSummary()}
      {activeTab === 'income'  && renderIncomes()}
      {activeTab === 'expense' && renderExpenses()}

      {renderCategoryPicker()}
      {renderMonthYearPicker()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:              { flex: 1, backgroundColor: '#f8f9fa' },
  header:                 { backgroundColor: '#fff', paddingVertical: 20, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#e9ecef' },
  headerRow:              { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  headerTitle:            { fontSize: 24, fontWeight: 'bold', color: '#212529' },
  tabContainer:           { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e9ecef' },
  tab:                    { flex: 1, paddingVertical: 16, alignItems: 'center' },
  activeTab:              { borderBottomWidth: 2, borderBottomColor: '#007bff' },
  tabText:                { fontSize: 16, color: '#6c757d' },
  activeTabText:          { color: '#007bff', fontWeight: '600' },
  content:                { flex: 1, padding: 16 },
  sectionTitle:           { fontSize: 20, fontWeight: 'bold', color: '#212529', marginBottom: 16 },
  monthTitle:             { fontSize: 16, color: '#6c757d', marginBottom: 4, textAlign: 'center' },
  monthYearSelector:      { backgroundColor: '#fff', padding: 16, borderRadius: 8, marginBottom: 20, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
  changeText:             { fontSize: 12, color: '#007bff', marginTop: 4 },
  statsContainer:         { marginBottom: 24 },
  statCard:               { backgroundColor: '#fff', padding: 16, marginBottom: 12, borderRadius: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
  statLabel:              { fontSize: 16, color: '#495057' },
  statValue:              { fontSize: 18, fontWeight: 'bold' },
  incomeColor:            { color: '#28a745' },
  expenseColor:           { color: '#dc3545' },
  profitColor:            { color: '#28a745' },
  lossColor:              { color: '#dc3545' },
  chartContainer:         { backgroundColor: '#fff', padding: 16, marginBottom: 20, borderRadius: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
  chartTitle:             { fontSize: 16, fontWeight: '600', color: '#212529', marginBottom: 12 },
  chart:                  { borderRadius: 8 },
  chartNote:              { fontSize: 12, color: '#6c757d', marginTop: 8, fontStyle: 'italic' },
  categoryCard:           { backgroundColor: '#fff', padding: 12, marginBottom: 8, borderRadius: 6, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  categoryName:           { flex: 1, fontSize: 14, color: '#495057' },
  categoryAmount:         { fontSize: 14, fontWeight: '600', color: '#dc3545', marginRight: 8 },
  categoryPercent:        { fontSize: 12, color: '#6c757d', width: 50, textAlign: 'right' },
  formContainer:          { backgroundColor: '#fff', padding: 16, borderRadius: 8, marginBottom: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
  input:                  { borderWidth: 1, borderColor: '#ced4da', borderRadius: 6, padding: 12, marginBottom: 12, fontSize: 16, backgroundColor: '#fff' },
  categoryInputContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  categoryInput:          { flex: 1, marginRight: 8, marginBottom: 0 },
  pickButton:             { backgroundColor: '#6c757d', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 6 },
  pickButtonText:         { color: '#fff', fontSize: 14, fontWeight: '600' },
  addButton:              { backgroundColor: '#007bff', padding: 14, borderRadius: 6, alignItems: 'center' },
  addButtonText:          { color: '#fff', fontSize: 16, fontWeight: '600' },
  listTitle:              { fontSize: 18, fontWeight: '600', color: '#212529', marginBottom: 12 },
  listItem:               { backgroundColor: '#fff', padding: 12, marginBottom: 8, borderRadius: 6, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 1, elevation: 1 },
  listItemContent:        { flex: 1 },
  listItemName:           { fontSize: 16, fontWeight: '600', color: '#212529', marginBottom: 2 },
  listItemCategory:       { fontSize: 14, color: '#6c757d', marginBottom: 2 },
  listItemAmount:         { fontSize: 14, fontWeight: '600', color: '#dc3545' },
  listItemDate:           { fontSize: 12, color: '#6c757d', marginTop: 2 },
  deleteButton:           { backgroundColor: '#dc3545', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 4 },
  deleteButtonText:       { color: '#fff', fontSize: 12, fontWeight: '600' },
  modalOverlay:           { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent:           { backgroundColor: '#fff', margin: 20, borderRadius: 8, padding: 20, maxHeight: '80%', width: '90%' },
  modalTitle:             { fontSize: 18, fontWeight: 'bold', color: '#212529', marginBottom: 16 },
  sectionSubtitle:        { fontSize: 16, fontWeight: '600', color: '#495057', marginTop: 16, marginBottom: 8 },
  categoryOption:         { padding: 12, borderBottomWidth: 1, borderBottomColor: '#e9ecef' },
  categoryOptionText:     { fontSize: 16, color: '#212529' },
  monthYearOption:        { padding: 10, borderBottomWidth: 1, borderBottomColor: '#e9ecef' },
  monthYearOptionText:    { fontSize: 16, color: '#212529' },
  selectedOption:         { backgroundColor: '#e3f2fd' },
  selectedOptionText:     { color: '#007bff', fontWeight: '600' },
  cancelButton:           { backgroundColor: '#6c757d', padding: 12, borderRadius: 6, alignItems: 'center', marginTop: 16 },
  cancelButtonText:       { color: '#fff', fontSize: 16, fontWeight: '600' },
  dataManagementContainer:{ backgroundColor: '#fff', padding: 16, borderRadius: 8, marginBottom: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
  lastSavedText:          { fontSize: 12, color: '#6c757d', marginBottom: 12 },
  sampleButton:           { backgroundColor: '#28a745', padding: 12, borderRadius: 6, alignItems: 'center', marginBottom: 12 },
  sampleButtonText:       { color: '#fff', fontSize: 14, fontWeight: '600' },
  clearButton:            { backgroundColor: '#dc3545', padding: 12, borderRadius: 6, alignItems: 'center' },
  clearButtonText:        { color: '#fff', fontSize: 14, fontWeight: '600' },
  fileOperationsContainer:{ flexDirection: 'row', justifyContent: 'space-around', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#e9ecef' },
  fileButton:             { backgroundColor: '#6c757d', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 6, minWidth: 60, alignItems: 'center' },
  fileButtonText:         { color: '#fff', fontSize: 14, fontWeight: '600' },
});
