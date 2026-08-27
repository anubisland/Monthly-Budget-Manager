import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { Category, Locale } from '@monthly-budget/shared';
import type { DraftAction, EntryDraft } from '../entryDraft';
import { Chip } from '../Chip';
import { t, type StringKey } from '../../i18n';
import { rowDirection } from '../../components/direction';

/**
 * Category ids are a closed taxonomy (see `@monthly-budget/shared/categories`),
 * each mirrored by an `entry.category.<id>`-style i18n key -- see Step 1 of
 * the task brief, which names them `category.<id>`. The cast is safe because
 * every id in the taxonomy has a matching key; a mismatch would fail the
 * typecheck the moment a category is added without its translation.
 */
function categoryLabel(category: Category, locale: Locale): string {
  return t(`category.${category.id}` as StringKey, locale);
}

/**
 * Second step: a wrapped grid of category chips, one per option the reducer
 * offers for the chosen kind.
 */
export function CategoryStep({
  draft,
  options,
  locale,
  dispatch,
}: {
  draft: EntryDraft;
  options: { categories: readonly Category[] };
  locale: Locale;
  dispatch: (action: DraftAction) => void;
}) {
  return (
    <View style={[styles.grid, { flexDirection: rowDirection(locale) }]}>
      {options.categories.map((category) => (
        <Chip
          key={category.id}
          icon={category.icon}
          label={categoryLabel(category, locale)}
          selected={draft.category === category.id}
          onPress={() => dispatch({ type: 'pickCategory', category: category.id })}
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
