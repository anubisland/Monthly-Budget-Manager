import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { Category, Locale } from '@monthly-budget/shared';
import type { DraftAction, EntryDraft } from '../entryDraft';
import { Chip } from '../Chip';
import { categoryLabel } from '../../i18n/categoryLabel';
import { t } from '../../i18n';
import { rowDirection } from '../../components/direction';

/**
 * Second step: a wrapped grid of category chips, one per option the reducer
 * offers for the chosen kind.
 */
export function CategoryStep({
  draft,
  options,
  locale,
  dispatch,
  hasNames,
}: {
  draft: EntryDraft;
  options: { categories: readonly Category[] };
  locale: Locale;
  dispatch: (action: DraftAction) => void;
  /**
   * Whether a category already has item names to suggest. Supplied by the
   * sheet, which holds the store, so the reducer can send someone straight to
   * the text field instead of showing a name step with nothing on it.
   */
  hasNames: (categoryId: string) => boolean;
}) {
  return (
    <View style={[styles.grid, { flexDirection: rowDirection(locale) }]}>
      {options.categories.map((category) => (
        <Chip
          key={category.id}
          icon={category.icon}
          label={categoryLabel(category.id, locale)}
          selected={draft.category === category.id}
          onPress={() =>
            dispatch({
              type: 'pickCategory',
              category: category.id,
              hasSuggestions: hasNames(category.id),
            })
          }
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexWrap: 'wrap',
  },
});
