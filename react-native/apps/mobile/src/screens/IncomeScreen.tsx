import React, { useState } from 'react';
import { Text, View, ScrollView, TouchableOpacity } from 'react-native';
import { formatMoney } from '@monthly-budget/shared';
import { useBudget } from '../state/BudgetProvider';
import { t } from '../i18n';
import { styles } from './styles';
import { formatDateDisplay } from './dateDisplay';
import { rowDirection, textAlign, writingDirection } from '../components/direction';
import { AddEntrySheet } from '../entry/AddEntrySheet';

export function IncomeScreen() {
  const { store, month, remove } = useBudget();

  const [sheetVisible, setSheetVisible] = useState(false);

  const deleteIncome = (id: string) => {
    remove('income', id);
  };

  return (
    <>
      <ScrollView style={styles.content}>
        <Text style={[styles.sectionTitle, { textAlign: textAlign(store.locale), writingDirection: writingDirection(store.locale) }]}>
          {t('screen.incomeManagement', store.locale)}
        </Text>

        <TouchableOpacity style={styles.addButton} onPress={() => setSheetVisible(true)}>
          <Text style={styles.addButtonText}>{t('screen.addIncome', store.locale)}</Text>
        </TouchableOpacity>

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

      <AddEntrySheet visible={sheetVisible} onClose={() => setSheetVisible(false)} />
    </>
  );
}
