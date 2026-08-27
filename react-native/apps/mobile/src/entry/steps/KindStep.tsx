import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { EntryKind, Locale } from '@monthly-budget/shared';
import type { DraftAction } from '../entryDraft';
import { t } from '../../i18n';
import { rowDirection, writingDirection } from '../../components/direction';

/**
 * First step: is this money coming in or going out. Two large buttons and
 * nothing else -- the reducer decides what comes next.
 */
export function KindStep({
  locale,
  dispatch,
}: {
  locale: Locale;
  dispatch: (action: DraftAction) => void;
}) {
  const pick = (kind: EntryKind) => dispatch({ type: 'pickKind', kind });

  return (
    <View style={[styles.row, { flexDirection: rowDirection(locale) }]}>
      <TouchableOpacity
        style={[styles.button, styles.income]}
        onPress={() => pick('income')}
        accessibilityRole="button"
      >
        <Text style={[styles.label, { writingDirection: writingDirection(locale) }]}>
          {t('kind.income', locale)}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.button, styles.expense]}
        onPress={() => pick('expense')}
        accessibilityRole="button"
      >
        <Text style={[styles.label, { writingDirection: writingDirection(locale) }]}>
          {t('kind.expense', locale)}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 28,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  income: {
    backgroundColor: '#e6f4ea',
  },
  expense: {
    backgroundColor: '#fce8e6',
  },
  label: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1f2430',
  },
});
