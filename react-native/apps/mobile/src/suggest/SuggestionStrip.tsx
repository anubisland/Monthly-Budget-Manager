import React from 'react';
import { Text, View, TouchableOpacity } from 'react-native';
import { formatMoney } from '@monthly-budget/shared';
import { useBudget } from '../state/BudgetProvider';
import { t } from '../i18n';
import { categoryLabel } from '../i18n/categoryLabel';
import { rowDirection, writingDirection } from '../components/direction';
import { openSuggestions, suggestionToEntry } from './suggestionModel';
import { styles } from './styles';

/**
 * Offers the recurring items missing from the open month, one row per item.
 *
 * Renders nothing at all -- not even the heading -- when `openSuggestions`
 * has nothing to offer. A heading over an empty space is worse than no
 * heading.
 */
export function SuggestionStrip() {
  const { store, monthKey, acceptSuggestion, dismissSuggestion } = useBudget();
  const suggestions = openSuggestions(store, monthKey);

  if (suggestions.length === 0) return null;

  const dir = writingDirection(store.locale);

  return (
    <View style={styles.container}>
      <Text style={[styles.heading, { writingDirection: dir }]}>
        {t('suggest.heading', store.locale)}
      </Text>
      <Text style={[styles.explainer, { writingDirection: dir }]}>
        {t('suggest.explainer', store.locale)}
      </Text>

      {suggestions.map((s) => (
        <View key={s.id} style={[styles.row, { flexDirection: rowDirection(store.locale) }]}>
          <View style={styles.itemInfo}>
            <Text style={[styles.itemName, { writingDirection: dir }]}>{s.name}</Text>
            <Text style={[styles.itemMeta, { writingDirection: dir }]}>
              {categoryLabel(s.category, store.locale)} · {formatMoney(s.amount, store.currency, store.locale)}
            </Text>
          </View>

          <View style={[styles.actions, { flexDirection: rowDirection(store.locale) }]}>
            <TouchableOpacity
              style={styles.acceptButton}
              onPress={() => acceptSuggestion(s.kind, suggestionToEntry(s, monthKey))}
              accessibilityRole="button"
              accessibilityLabel={t('suggest.acceptLabel', store.locale, { name: s.name })}
            >
              <Text style={styles.acceptButtonText}>{t('suggest.accept', store.locale)}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.declineButton}
              onPress={() => dismissSuggestion(s.id)}
              accessibilityRole="button"
              accessibilityLabel={t('suggest.declineLabel', store.locale, { name: s.name })}
            >
              <Text style={styles.declineButtonText}>{t('suggest.decline', store.locale)}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}
    </View>
  );
}
