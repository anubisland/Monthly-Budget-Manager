import React, { useState } from 'react';
import { Text, View, ScrollView, TouchableOpacity, TextInput, Alert, Modal, FlatList } from 'react-native';
import { Entry, formatMoney, makeId } from '@monthly-budget/shared';
import { useBudget } from '../state/BudgetProvider';
import { t } from '../i18n';
import { styles } from './styles';
import { formatDateDisplay, dateForDay } from './dateDisplay';
import { rowDirection, textAlign, writingDirection } from '../components/direction';

// Predefined expense categories from Python GUI
const EXPENSE_CATEGORIES = [
  "Food", "Rent", "Fuel", "Electricity", "Internet", "Water", "Transport",
  "Healthcare", "Entertainment", "Education", "Clothing", "Savings",
  "Debt", "Subscriptions", "Gifts", "Misc"
];

export function ExpenseScreen() {
  const { store, monthKey, month, upsert, remove } = useBudget();

  const [newExpense, setNewExpense] = useState({ name: '', category: '', amount: '', day: '' });
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

  // Build a same-shaped day-of-month date within the displayed month, so
  // entries created here always belong to the month they're shown under.

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
    let date = dateForDay(monthKey, 1);
    if (newExpense.day.trim()) {
      const day = parseInt(newExpense.day.trim());
      if (day >= 1 && day <= 31) {
        date = dateForDay(monthKey, day);
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

  const deleteExpense = (id: string) => {
    remove('expense', id);
  };

  const selectCategory = (category: string) => {
    setNewExpense(prev => ({ ...prev, category }));
    setShowCategoryPicker(false);
  };

  return (
    <>
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
    </>
  );
}
