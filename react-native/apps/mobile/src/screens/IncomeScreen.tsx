import React, { useState } from 'react';
import { Text, View, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { Entry, formatMoney, makeId, OTHER_CATEGORY_ID } from '@monthly-budget/shared';
import { useBudget } from '../state/BudgetProvider';
import { t } from '../i18n';
import { styles } from './styles';
import { formatDateDisplay, dateForDay } from './dateDisplay';
import { rowDirection, textAlign, writingDirection } from '../components/direction';

export function IncomeScreen() {
  const { store, monthKey, month, upsert, remove } = useBudget();

  const [newIncome, setNewIncome] = useState({ name: '', amount: '', day: '' });

  // Build a same-shaped day-of-month date within the displayed month, so
  // entries created here always belong to the month they're shown under.

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
    let date = dateForDay(monthKey, 1);
    if (newIncome.day.trim()) {
      const day = parseInt(newIncome.day.trim());
      if (day >= 1 && day <= 31) {
        date = dateForDay(monthKey, day);
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

  const deleteIncome = (id: string) => {
    remove('income', id);
  };

  return (
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
}
