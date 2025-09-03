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
} from 'react-native';
import { BudgetDoc, Income, Expense, totals, expensesByCategory, serialize, deserialize } from '@monthly-budget/shared';

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
  const [newIncome, setNewIncome] = useState({ name: '', amount: '' });
  const [newExpense, setNewExpense] = useState({ name: '', category: '', amount: '' });

  const stats = totals(budget.incomes, budget.expenses);
  const categoryStats = expensesByCategory(budget.expenses);

  // File operations
  const handleNew = () => {
    Alert.alert(
      'New Budget',
      'This will clear all current data. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes',
          onPress: () => {
            setBudget({
              meta: {
                year: new Date().getFullYear(),
                month: new Date().getMonth() + 1,
              },
              incomes: [],
              expenses: [],
            });
            setNewIncome({ name: '', amount: '' });
            setNewExpense({ name: '', category: '', amount: '' });
            Alert.alert('Success', 'New budget created');
          },
        },
      ]
    );
  };

  const handleOpen = () => {
    // For demo purposes, we'll simulate loading sample data
    Alert.alert(
      'Open Budget',
      'Load sample budget data?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Load Sample',
          onPress: () => {
            const sampleData: BudgetDoc = {
              meta: {
                year: new Date().getFullYear(),
                month: new Date().getMonth() + 1,
              },
              incomes: [
                { name: 'Salary', amount: 5000, date: new Date().toISOString().split('T')[0] },
                { name: 'Freelance', amount: 1000, date: new Date().toISOString().split('T')[0] },
              ],
              expenses: [
                { name: 'Rent', category: 'Housing', amount: 1500, date: new Date().toISOString().split('T')[0] },
                { name: 'Groceries', category: 'Food', amount: 400, date: new Date().toISOString().split('T')[0] },
                { name: 'Gas', category: 'Transportation', amount: 200, date: new Date().toISOString().split('T')[0] },
                { name: 'Internet', category: 'Utilities', amount: 80, date: new Date().toISOString().split('T')[0] },
              ],
            };
            setBudget(sampleData);
            Alert.alert('Success', 'Sample budget data loaded');
          },
        },
      ]
    );
  };

  const handleSave = () => {
    try {
      const updatedBudget = {
        ...budget,
        meta: {
          ...budget.meta,
          saved_at: new Date().toISOString(),
        },
      };
      const jsonData = serialize(updatedBudget);
      
      // In a real desktop app, this would save to a file
      // For demo purposes, we'll show the JSON data
      Alert.alert(
        'Save Budget',
        'Budget saved successfully!\n\nJSON data:\n' + jsonData.substring(0, 200) + '...',
        [{ text: 'OK' }]
      );
    } catch (error) {
      Alert.alert('Error', 'Failed to save budget: ' + String(error));
    }
  };

  const handleExport = () => {
    Alert.alert(
      'Export Budget',
      'Choose export format:',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'JSON',
          onPress: () => {
            try {
              const jsonData = serialize(budget);
              Alert.alert('Export JSON', 'Exported to JSON:\n' + jsonData.substring(0, 300) + '...');
            } catch (error) {
              Alert.alert('Error', 'Failed to export JSON: ' + String(error));
            }
          },
        },
        {
          text: 'CSV',
          onPress: () => {
            try {
              let csv = 'type,name,category,amount,date\n';
              budget.incomes.forEach(income => {
                csv += `income,"${income.name}",,"${income.amount}","${income.date || ''}"\n`;
              });
              budget.expenses.forEach(expense => {
                csv += `expense,"${expense.name}","${expense.category}","${expense.amount}","${expense.date || ''}"\n`;
              });
              Alert.alert('Export CSV', 'Exported to CSV:\n' + csv.substring(0, 300) + '...');
            } catch (error) {
              Alert.alert('Error', 'Failed to export CSV: ' + String(error));
            }
          },
        },
        {
          text: 'Excel',
          onPress: () => {
            Alert.alert('Export Excel', 'Excel export would be available with proper desktop integration');
          },
        },
      ]
    );
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

    const income: Income = {
      name: newIncome.name.trim(),
      amount: amount,
      date: new Date().toISOString().split('T')[0],
    };

    setBudget(prev => ({
      ...prev,
      incomes: [...prev.incomes, income],
    }));

    setNewIncome({ name: '', amount: '' });
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

    const expense: Expense = {
      name: newExpense.name.trim(),
      category: newExpense.category.trim(),
      amount: amount,
      date: new Date().toISOString().split('T')[0],
    };

    setBudget(prev => ({
      ...prev,
      expenses: [...prev.expenses, expense],
    }));

    setNewExpense({ name: '', category: '', amount: '' });
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

  const renderToolbar = () => (
    <View style={styles.toolbar}>
      <TouchableOpacity style={styles.toolbarButton} onPress={handleNew}>
        <Text style={styles.toolbarButtonText}>New</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.toolbarButton} onPress={handleOpen}>
        <Text style={styles.toolbarButtonText}>Open</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.toolbarButton} onPress={handleSave}>
        <Text style={styles.toolbarButtonText}>Save</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.toolbarButton} onPress={handleExport}>
        <Text style={styles.toolbarButtonText}>Export</Text>
      </TouchableOpacity>
    </View>
  );

  const renderSummary = () => (
    <ScrollView style={styles.content}>
      <Text style={styles.sectionTitle}>Budget Summary</Text>
      <Text style={styles.monthTitle}>
        {new Date(budget.meta.year, budget.meta.month - 1).toLocaleDateString('en-US', { 
          month: 'long', 
          year: 'numeric' 
        })}
      </Text>
      
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
    </ScrollView>
  );

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
        <TextInput
          style={styles.input}
          placeholder="Category"
          value={newExpense.category}
          onChangeText={(text) => setNewExpense(prev => ({ ...prev, category: text }))}
        />
        <TextInput
          style={styles.input}
          placeholder="Amount"
          value={newExpense.amount}
          onChangeText={(text) => setNewExpense(prev => ({ ...prev, amount: text }))}
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
        <Text style={styles.headerTitle}>Monthly Budget Manager (Desktop)</Text>
      </View>

      {renderToolbar()}

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
  toolbar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
    justifyContent: 'flex-start',
  },
  toolbarButton: {
    backgroundColor: '#007bff',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    marginRight: 12,
  },
  toolbarButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
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
});
