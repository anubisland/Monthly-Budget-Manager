import React, { useState } from 'react';
import { Text, View, ScrollView, TouchableOpacity } from 'react-native';
import { formatMoney } from '@monthly-budget/shared';
import { useBudget } from '../state/BudgetProvider';
import { t } from '../i18n';
import { styles } from './styles';
import { formatDateDisplay } from './dateDisplay';
import { rowDirection, textAlign, writingDirection } from '../components/direction';
import { AddEntrySheet } from '../entry/AddEntrySheet';

export function ExpenseScreen() {
  const { store, month, remove } = useBudget();

  const [sheetVisible, setSheetVisible] = useState(false);

  const deleteExpense = (id: string) => {
    remove('expense', id);
  };

  return (
    <>
      <ScrollView style={styles.content}>
        <Text style={[styles.sectionTitle, { textAlign: textAlign(store.locale), writingDirection: writingDirection(store.locale) }]}>
          {t('screen.expenseManagement', store.locale)}
        </Text>

        <TouchableOpacity style={styles.addButton} onPress={() => setSheetVisible(true)}>
          <Text style={styles.addButtonText}>{t('screen.addExpense', store.locale)}</Text>
        </TouchableOpacity>

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

      <AddEntrySheet visible={sheetVisible} onClose={() => setSheetVisible(false)} />
    </>
  );
}
