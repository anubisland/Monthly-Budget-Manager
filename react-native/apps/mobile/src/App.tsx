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
import { BudgetDoc, Income, Expense, totals, expensesByCategory, serialize, deserialize } from '@monthly-budget/shared';
import { BarChart, PieChart } from 'react-native-chart-kit';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ReactNativeAdapter } from './ReactNativeAdapter';

// Predefined expense categories from Python GUI
const EXPENSE_CATEGORIES = [
  "Food", "Rent", "Fuel", "Electricity", "Internet", "Water", "Transport",
  "Healthcare", "Entertainment", "Education", "Clothing", "Savings",
  "Debt", "Subscriptions", "Gifts", "Misc"
];

// Helper function to get day of week
const getDayOfWeek = (dateStr: string): string => {
  const date = new Date(dateStr);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days[date.getDay()];
};

// Helper function to get day of month
const getDayOfMonth = (dateStr: string): number => {
  const date = new Date(dateStr);
  return date.getDate();
};

// Helper function to format date for display
const formatDateDisplay = (dateStr: string): string => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const day = date.getDate();
  const dayOfWeek = getDayOfWeek(dateStr);
  return `${day} (${dayOfWeek})`;
};

export default function App() {
  const [budget, setBudget] = useState<BudgetDoc>({
    meta: {
      year: new Date().getFullYear(),
      month: new Date().getMonth() + 1,
    },
    incomes: [],
    expenses: [],
  });

  const [activeTab, setActiveTab] = useState<'summary' | 'income' | 'expense'>('summary');
  const [newIncome, setNewIncome] = useState({ name: '', amount: '', day: '' });
  const [newExpense, setNewExpense] = useState({ name: '', category: '', amount: '', day: '' });
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showMonthYearPicker, setShowMonthYearPicker] = useState(false);
  
  const adapter = new ReactNativeAdapter();

  // Load from storage on app start
  useEffect(() => {
    const loadStoredBudget = async () => {
      try {
        const stored = await adapter.loadFromStorage();
        if (stored) {
          setBudget(stored);
        }
      } catch (error) {
        console.error('Failed to load stored budget:', error);
      }
    };
    
    loadStoredBudget();
  }, []);

  // Auto-save to storage when budget changes
  useEffect(() => {
    const saveToStorage = async () => {
      try {
        await adapter.saveToStorage(budget);
      } catch (error) {
        console.error('Failed to auto-save budget:', error);
      }
    };
    
    saveToStorage();
  }, [budget]);

  const stats = totals(budget.incomes, budget.expenses);
  const categoryStats = expensesByCategory(budget.expenses);

  // Load budget data on app start
  useEffect(() => {
    loadBudgetData();
  }, []);

  // Save budget data whenever it changes
  useEffect(() => {
    saveBudgetData();
  }, [budget]);

  const saveBudgetData = async () => {
    try {
      const updatedBudget = {
        ...budget,
        meta: {
          ...budget.meta,
          saved_at: new Date().toISOString(),
        },
      };
      const jsonData = serialize(updatedBudget);
      await AsyncStorage.setItem('budget_data', jsonData);
    } catch (error) {
      console.error('Failed to save budget data:', error);
    }
  };

  const loadBudgetData = async () => {
    try {
      const jsonData = await AsyncStorage.getItem('budget_data');
      if (jsonData) {
        const loadedBudget = deserialize(jsonData);
        setBudget(loadedBudget);
      }
    } catch (error) {
      console.error('Failed to load budget data:', error);
    }
  };

  const clearAllData = () => {
    Alert.alert(
      'Clear All Data',
      'Are you sure you want to clear all income and expense data? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Clear',
  // File operations
  const createNewBudget = () => {
    Alert.alert(
      'Create New Budget',
      'This will clear all current data. Are you sure?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Create New',
          style: 'destructive',
          onPress: () => {
            setBudget({
              meta: {
                year: new Date().getFullYear(),
                month: new Date().getMonth() + 1,
              },
              incomes: [],
              expenses: [],
            });
          }
        },
        },
      ]
    );
  };

  const addSampleData = () => {
    const sampleIncomes: Income[] = [
      { name: 'Salary', amount: 5000, date: `${budget.meta.year}-${budget.meta.month.toString().padStart(2, '0')}-01` },
      { name: 'Freelance', amount: 1500, date: `${budget.meta.year}-${budget.meta.month.toString().padStart(2, '0')}-15` },
    ];

    const sampleExpenses: Expense[] = [
      { name: 'Rent', category: 'Rent', amount: 1200, date: `${budget.meta.year}-${budget.meta.month.toString().padStart(2, '0')}-01` },
      { name: 'Groceries', category: 'Food', amount: 400, date: `${budget.meta.year}-${budget.meta.month.toString().padStart(2, '0')}-03` },
      { name: 'Gas Bill', category: 'Fuel', amount: 80, date: `${budget.meta.year}-${budget.meta.month.toString().padStart(2, '0')}-05` },
      { name: 'Internet', category: 'Internet', amount: 60, date: `${budget.meta.year}-${budget.meta.month.toString().padStart(2, '0')}-10` },
      { name: 'Movies', category: 'Entertainment', amount: 25, date: `${budget.meta.year}-${budget.meta.month.toString().padStart(2, '0')}-12` },
    ];

    setBudget(prev => ({
      ...prev,
      incomes: [...prev.incomes, ...sampleIncomes],
      expenses: [...prev.expenses, ...sampleExpenses],
    }));

  const openBudget = async () => {
    try {
      const loadedBudget = await adapter.openJSON();
      if (loadedBudget) {
        setBudget(loadedBudget);
        Alert.alert('Success', 'Budget loaded successfully!');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to open budget file');
    }
  };

  const saveBudget = async () => {
    try {
      await adapter.saveJSON(budget);
    } catch (error) {
      Alert.alert('Error', 'Failed to save budget file');
    }
  };

  const exportBudget = async () => {
    try {
      await adapter.exportXLSX(budget);
    } catch (error) {
      Alert.alert('Error', 'Failed to export budget file');
    }
  };

  const addIncome = () => {
    if (!newIncome.name.trim() || !newIncome.amount.trim()) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    
    const amount = parseFloat(newIncome.amount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }

    // Create date from year-month-day or current date
    let date = new Date().toISOString().split('T')[0];
    if (newIncome.day.trim()) {
      const day = parseInt(newIncome.day.trim());
      if (day >= 1 && day <= 31) {
        const year = budget.meta.year;
        const month = budget.meta.month;
        date = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
      }
    }

    const income: Income = {
      name: newIncome.name.trim(),
      amount: amount,
      date: date,
    };

    setBudget(prev => ({
      ...prev,
      incomes: [...prev.incomes, income],
    }));

    setNewIncome({ name: '', amount: '', day: '' });
  };

  const addExpense = () => {
    if (!newExpense.name.trim() || !newExpense.category.trim() || !newExpense.amount.trim()) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    
    const amount = parseFloat(newExpense.amount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }

    // Create date from year-month-day or current date
    let date = new Date().toISOString().split('T')[0];
    if (newExpense.day.trim()) {
      const day = parseInt(newExpense.day.trim());
      if (day >= 1 && day <= 31) {
        const year = budget.meta.year;
        const month = budget.meta.month;
        date = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
      }
    }

    const expense: Expense = {
      name: newExpense.name.trim(),
      category: newExpense.category.trim(),
      amount: amount,
      date: date,
    };

    setBudget(prev => ({
      ...prev,
      expenses: [...prev.expenses, expense],
    }));

    setNewExpense({ name: '', category: '', amount: '', day: '' });
  };

  const deleteIncome = (index: number) => {
    setBudget(prev => ({
      ...prev,
      incomes: prev.incomes.filter((_, i) => i !== index),
    }));
  };

  const deleteExpense = (index: number) => {
    setBudget(prev => ({
      ...prev,
      expenses: prev.expenses.filter((_, i) => i !== index),
    }));
  };

  const selectCategory = (category: string) => {
    setNewExpense(prev => ({ ...prev, category }));
    setShowCategoryPicker(false);
  };

  const updateMonthYear = (year: number, month: number) => {
    setBudget(prev => ({
      ...prev,
      meta: { ...prev.meta, year, month }
    }));
    setShowMonthYearPicker(false);
  };

  const renderCategoryPicker = () => (
    <Modal visible={showCategoryPicker} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Select Category</Text>
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
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  const renderMonthYearPicker = () => {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const years = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 5 + i);

    return (
      <Modal visible={showMonthYearPicker} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Month & Year</Text>
            <Text style={styles.sectionSubtitle}>Month</Text>
            <FlatList
              data={months}
              keyExtractor={(item, index) => index.toString()}
              renderItem={({ item, index }) => (
                <TouchableOpacity
                  style={[
                    styles.monthYearOption,
                    budget.meta.month === index + 1 && styles.selectedOption
                  ]}
                  onPress={() => updateMonthYear(budget.meta.year, index + 1)}
                >
                  <Text style={[
                    styles.monthYearOptionText,
                    budget.meta.month === index + 1 && styles.selectedOptionText
                  ]}>{item}</Text>
                </TouchableOpacity>
              )}
              style={{ maxHeight: 200 }}
            />
            <Text style={styles.sectionSubtitle}>Year</Text>
            <FlatList
              data={years}
              keyExtractor={(item) => item.toString()}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.monthYearOption,
                    budget.meta.year === item && styles.selectedOption
                  ]}
                  onPress={() => updateMonthYear(item, budget.meta.month)}
                >
                  <Text style={[
                    styles.monthYearOptionText,
                    budget.meta.year === item && styles.selectedOptionText
                  ]}>{item}</Text>
                </TouchableOpacity>
              )}
              style={{ maxHeight: 150 }}
            />
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setShowMonthYearPicker(false)}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
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
        <Text style={styles.sectionTitle}>Budget Summary</Text>
        
        {/* Month/Year Selector */}
        <TouchableOpacity 
          style={styles.monthYearSelector}
          onPress={() => setShowMonthYearPicker(true)}
        >
          <Text style={styles.monthTitle}>
            {new Date(budget.meta.year, budget.meta.month - 1).toLocaleDateString('en-US', { 
              month: 'long', 
              year: 'numeric' 
            })}
          </Text>
          <Text style={styles.changeText}>Tap to change</Text>
        </TouchableOpacity>
        
        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Total Income</Text>
            <Text style={[styles.statValue, styles.incomeColor]}>
              ${stats.income_total.toFixed(2)}
            </Text>
          </View>
          
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Total Expenses</Text>
            <Text style={[styles.statValue, styles.expenseColor]}>
              ${stats.expense_total.toFixed(2)}
            </Text>
          </View>
          
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Profit/Loss</Text>
            <Text style={[styles.statValue, stats.profit >= 0 ? styles.profitColor : styles.lossColor]}>
              ${stats.profit.toFixed(2)}
            </Text>
          </View>
          
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Profit Margin</Text>
            <Text style={[styles.statValue, stats.profit_margin >= 0 ? styles.profitColor : styles.lossColor]}>
              {stats.profit_margin.toFixed(1)}%
            </Text>
          </View>
        </View>

        {/* Charts Section */}
        <Text style={styles.sectionTitle}>Charts</Text>
        
        {/* Income vs Expenses Bar Chart */}
        <View style={styles.chartContainer}>
          <Text style={styles.chartTitle}>Income vs Expenses</Text>
          <BarChart
            data={{
              labels: ['Income', 'Expenses'],
              datasets: [{
                data: [stats.income_total, stats.expense_total]
              }]
            }}
            width={screenWidth - 32}
            height={220}
            yAxisLabel="$"
            yAxisSuffix=""
            chartConfig={{
              backgroundColor: '#ffffff',
              backgroundGradientFrom: '#ffffff',
              backgroundGradientTo: '#ffffff',
              decimalPlaces: 0,
              color: (opacity = 1) => `rgba(0, 123, 255, ${opacity})`,
              labelColor: (opacity = 1) => `rgba(33, 37, 41, ${opacity})`,
              style: {
                borderRadius: 8
              },
              propsForLabels: {
                fontSize: 12
              }
            }}
            style={styles.chart}
            showValuesOnTopOfBars
          />
        </View>

        {/* Expense Categories Pie Chart */}
        {categoryStats.length > 0 && (
          <View style={styles.chartContainer}>
            <Text style={styles.chartTitle}>Expense Categories</Text>
            <PieChart
              data={categoryStats.map((cat, index) => ({
                name: cat.category,
                amount: cat.amount,
                color: [
                  '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF',
                  '#FF9F40', '#FF6384', '#C9CBCF', '#4BC0C0', '#36A2EB'
                ][index % 10],
                legendFontColor: '#495057',
                legendFontSize: 12,
              }))}
              width={screenWidth - 32}
              height={220}
              chartConfig={{
                color: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
                labelColor: (opacity = 1) => `rgba(33, 37, 41, ${opacity})`,
              }}
              accessor="amount"
              backgroundColor="transparent"
              paddingLeft="15"
              style={styles.chart}
            />
          </View>
        )}

        {categoryStats.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Expenses by Category</Text>
            {categoryStats.map((cat, index) => (
              <View key={index} style={styles.categoryCard}>
                <Text style={styles.categoryName}>{cat.category}</Text>
                <Text style={styles.categoryAmount}>${cat.amount.toFixed(2)}</Text>
                <Text style={styles.categoryPercent}>{cat.percent.toFixed(1)}%</Text>
              </View>
            ))}
          </>
        )}

        {/* Data Management Section */}
        <Text style={styles.sectionTitle}>Data Management</Text>
        <View style={styles.dataManagementContainer}>
          {budget.meta.saved_at && (
            <Text style={styles.lastSavedText}>
              Last saved: {new Date(budget.meta.saved_at).toLocaleString()}
            </Text>
          )}
          <TouchableOpacity style={styles.sampleButton} onPress={addSampleData}>
            <Text style={styles.sampleButtonText}>Add Sample Data</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.clearButton} onPress={clearAllData}>
            <Text style={styles.clearButtonText}>Clear All Data</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  };

  const renderIncomes = () => (
    <ScrollView style={styles.content}>
      <Text style={styles.sectionTitle}>Income Management</Text>
      
      <View style={styles.formContainer}>
        <TextInput
          style={styles.input}
          placeholder="Income name (e.g., Salary)"
          value={newIncome.name}
          onChangeText={(text) => setNewIncome(prev => ({ ...prev, name: text }))}
        />
        <TextInput
          style={styles.input}
          placeholder="Amount"
          value={newIncome.amount}
          onChangeText={(text) => setNewIncome(prev => ({ ...prev, amount: text }))}
          keyboardType="numeric"
        />
        <TextInput
          style={styles.input}
          placeholder="Day of month (1-31, optional)"
          value={newIncome.day}
          onChangeText={(text) => setNewIncome(prev => ({ ...prev, day: text }))}
          keyboardType="numeric"
        />
        <TouchableOpacity style={styles.addButton} onPress={addIncome}>
          <Text style={styles.addButtonText}>Add Income</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.listTitle}>Current Incomes</Text>
      {budget.incomes.map((income, index) => (
        <View key={index} style={styles.listItem}>
          <View style={styles.listItemContent}>
            <Text style={styles.listItemName}>{income.name}</Text>
            <Text style={styles.listItemAmount}>${income.amount.toFixed(2)}</Text>
            {income.date && (
              <Text style={styles.listItemDate}>
                {formatDateDisplay(income.date)}
              </Text>
            )}
          </View>
          <TouchableOpacity 
            style={styles.deleteButton} 
            onPress={() => deleteIncome(index)}
          >
            <Text style={styles.deleteButtonText}>Delete</Text>
          </TouchableOpacity>
        </View>
      ))}
    </ScrollView>
  );

  const renderExpenses = () => (
    <ScrollView style={styles.content}>
      <Text style={styles.sectionTitle}>Expense Management</Text>
      
      <View style={styles.formContainer}>
        <TextInput
          style={styles.input}
          placeholder="Expense name"
          value={newExpense.name}
          onChangeText={(text) => setNewExpense(prev => ({ ...prev, name: text }))}
        />
        
        <View style={styles.categoryInputContainer}>
          <TextInput
            style={[styles.input, styles.categoryInput]}
            placeholder="Category"
            value={newExpense.category}
            onChangeText={(text) => setNewExpense(prev => ({ ...prev, category: text }))}
          />
          <TouchableOpacity 
            style={styles.pickButton}
            onPress={() => setShowCategoryPicker(true)}
          >
            <Text style={styles.pickButtonText}>Pick</Text>
          </TouchableOpacity>
        </View>
        
        <TextInput
          style={styles.input}
          placeholder="Amount"
          value={newExpense.amount}
          onChangeText={(text) => setNewExpense(prev => ({ ...prev, amount: text }))}
          keyboardType="numeric"
        />
        <TextInput
          style={styles.input}
          placeholder="Day of month (1-31, optional)"
          value={newExpense.day}
          onChangeText={(text) => setNewExpense(prev => ({ ...prev, day: text }))}
          keyboardType="numeric"
        />
        <TouchableOpacity style={styles.addButton} onPress={addExpense}>
          <Text style={styles.addButtonText}>Add Expense</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.listTitle}>Current Expenses</Text>
      {budget.expenses.map((expense, index) => (
        <View key={index} style={styles.listItem}>
          <View style={styles.listItemContent}>
            <Text style={styles.listItemName}>{expense.name}</Text>
            <Text style={styles.listItemCategory}>{expense.category}</Text>
            <Text style={styles.listItemAmount}>${expense.amount.toFixed(2)}</Text>
            {expense.date && (
              <Text style={styles.listItemDate}>
                {formatDateDisplay(expense.date)}
              </Text>
            )}
          </View>
          <TouchableOpacity 
            style={styles.deleteButton} 
            onPress={() => deleteExpense(index)}
          >
            <Text style={styles.deleteButtonText}>Delete</Text>
          </TouchableOpacity>
        </View>
      ))}
    </ScrollView>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8f9fa" />
      
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Monthly Budget Manager</Text>
        
        {/* File Operations Row */}
        <View style={styles.fileOperationsContainer}>
          <TouchableOpacity style={styles.fileButton} onPress={createNewBudget}>
            <Text style={styles.fileButtonText}>New</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.fileButton} onPress={openBudget}>
            <Text style={styles.fileButtonText}>Open</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.fileButton} onPress={saveBudget}>
            <Text style={styles.fileButtonText}>Save</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.fileButton} onPress={exportBudget}>
            <Text style={styles.fileButtonText}>Export</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.tabContainer}>
        {[
          { key: 'summary', label: 'Summary' },
          { key: 'income', label: 'Income' },
          { key: 'expense', label: 'Expenses' },
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    backgroundColor: '#fff',
    paddingVertical: 20,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#212529',
    textAlign: 'center',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  tab: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: '#007bff',
  },
  tabText: {
    fontSize: 16,
    color: '#6c757d',
  },
  activeTabText: {
    color: '#007bff',
    fontWeight: '600',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#212529',
    marginBottom: 16,
  },
  monthTitle: {
    fontSize: 16,
    color: '#6c757d',
    marginBottom: 20,
    textAlign: 'center',
  },
  monthYearSelector: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 8,
    marginBottom: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  changeText: {
    fontSize: 12,
    color: '#007bff',
    marginTop: 4,
  },
  statsContainer: {
    marginBottom: 24,
  },
  statCard: {
    backgroundColor: '#fff',
    padding: 16,
    marginBottom: 12,
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  statLabel: {
    fontSize: 16,
    color: '#495057',
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  incomeColor: {
    color: '#28a745',
  },
  expenseColor: {
    color: '#dc3545',
  },
  profitColor: {
    color: '#28a745',
  },
  lossColor: {
    color: '#dc3545',
  },
  chartContainer: {
    backgroundColor: '#fff',
    padding: 16,
    marginBottom: 20,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  chartTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212529',
    marginBottom: 12,
    textAlign: 'center',
  },
  chart: {
    borderRadius: 8,
  },
  categoryCard: {
    backgroundColor: '#fff',
    padding: 12,
    marginBottom: 8,
    borderRadius: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  categoryName: {
    flex: 1,
    fontSize: 14,
    color: '#495057',
  },
  categoryAmount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#dc3545',
    marginRight: 8,
  },
  categoryPercent: {
    fontSize: 12,
    color: '#6c757d',
    width: 50,
    textAlign: 'right',
  },
  formContainer: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 8,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ced4da',
    borderRadius: 6,
    padding: 12,
    marginBottom: 12,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  categoryInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  categoryInput: {
    flex: 1,
    marginRight: 8,
    marginBottom: 0,
  },
  pickButton: {
    backgroundColor: '#6c757d',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 6,
  },
  pickButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  addButton: {
    backgroundColor: '#007bff',
    padding: 14,
    borderRadius: 6,
    alignItems: 'center',
  },
  addButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  listTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#212529',
    marginBottom: 12,
  },
  listItem: {
    backgroundColor: '#fff',
    padding: 12,
    marginBottom: 8,
    borderRadius: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 1,
    elevation: 1,
  },
  listItemContent: {
    flex: 1,
  },
  listItemName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212529',
    marginBottom: 2,
  },
  listItemCategory: {
    fontSize: 14,
    color: '#6c757d',
    marginBottom: 2,
  },
  listItemAmount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#dc3545',
  },
  listItemDate: {
    fontSize: 12,
    color: '#6c757d',
    marginTop: 2,
  },
  deleteButton: {
    backgroundColor: '#dc3545',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 4,
  },
  deleteButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    margin: 20,
    borderRadius: 8,
    padding: 20,
    maxHeight: '80%',
    width: '90%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#212529',
    marginBottom: 16,
    textAlign: 'center',
  },
  sectionSubtitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#495057',
    marginTop: 16,
    marginBottom: 8,
  },
  categoryOption: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  categoryOptionText: {
    fontSize: 16,
    color: '#212529',
  },
  monthYearOption: {
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  monthYearOptionText: {
    fontSize: 16,
    color: '#212529',
  },
  selectedOption: {
    backgroundColor: '#e3f2fd',
  },
  selectedOptionText: {
    color: '#007bff',
    fontWeight: '600',
  },
  cancelButton: {
    backgroundColor: '#6c757d',
    padding: 12,
    borderRadius: 6,
    alignItems: 'center',
    marginTop: 16,
  },
  cancelButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  dataManagementContainer: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 8,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  lastSavedText: {
    fontSize: 12,
    color: '#6c757d',
    marginBottom: 12,
    textAlign: 'center',
  },
  sampleButton: {
    backgroundColor: '#28a745',
    padding: 12,
    borderRadius: 6,
    alignItems: 'center',
    marginBottom: 12,
  },
  sampleButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  clearButton: {
    backgroundColor: '#dc3545',
    padding: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  clearButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    margin: 20,
    borderRadius: 8,
    padding: 20,
    maxHeight: '80%',
    width: '90%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#212529',
    marginBottom: 16,
    textAlign: 'center',
  },
  sectionSubtitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#495057',
    marginTop: 16,
    marginBottom: 8,
  },
  categoryOption: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  categoryOptionText: {
    fontSize: 16,
    color: '#212529',
  },
  monthYearOption: {
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  monthYearOptionText: {
    fontSize: 16,
    color: '#212529',
  },
  selectedOption: {
    backgroundColor: '#e3f2fd',
  },
  selectedOptionText: {
    color: '#007bff',
    fontWeight: '600',
  },
  cancelButton: {
    backgroundColor: '#6c757d',
    padding: 12,
    borderRadius: 6,
    alignItems: 'center',
    marginTop: 16,
  },
  cancelButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  dataManagementContainer: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 8,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  lastSavedText: {
    fontSize: 12,
    color: '#6c757d',
    marginBottom: 12,
    textAlign: 'center',
  },
  sampleButton: {
    backgroundColor: '#28a745',
    padding: 12,
    borderRadius: 6,
    alignItems: 'center',
    marginBottom: 12,
  },
  sampleButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  clearButton: {
    backgroundColor: '#dc3545',
    padding: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  fileOperationsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e9ecef',
  },
  fileButton: {
    backgroundColor: '#6c757d',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    minWidth: 60,
    alignItems: 'center',
  },
  fileButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
