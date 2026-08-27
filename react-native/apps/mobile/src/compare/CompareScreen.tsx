import React from 'react';
import { Text, View, ScrollView, Dimensions } from 'react-native';
import { formatMoney, monthLabel, type Metric } from '@monthly-budget/shared';
import { useBudget } from '../state/BudgetProvider';
import { t, en, type StringKey } from '../i18n';
import { rowDirection, textAlign, writingDirection } from '../components/direction';
import { colorFor } from '../charts/palette';
import { GroupedBars } from '../charts/GroupedBars';
import { comparisonView } from './comparisonModel';
import { DeltaBadge } from './DeltaBadge';
import { styles } from './styles';

const METRIC_LABEL_KEY: Record<Metric, StringKey> = {
  income: 'totals.income',
  expenses: 'totals.expenses',
  net: 'totals.net',
  margin: 'totals.margin',
};

/**
 * Category ids are stable and untranslated (see categories.ts); the display
 * name comes from `category.<id>` when that key exists, and falls back to
 * the raw id otherwise -- an entry can carry a free-typed category that
 * predates the fixed taxonomy.
 */
function categoryLabel(category: string, locale: Parameters<typeof t>[1]): string {
  const key = `category.${category}` as StringKey;
  return key in en ? t(key, locale) : category;
}

export function CompareScreen() {
  const { store, monthKey } = useBudget();
  const locale = store.locale;
  const view = comparisonView(store, monthKey);

  // A month with nothing before it gets an explicit empty state, never a
  // comparison against zeros -- that is the entire reason hasPrevious exists.
  if (!view.hasPrevious || !view.previousKey) {
    return (
      <ScrollView style={styles.content}>
        <Text
          style={[
            styles.emptyText,
            { textAlign: textAlign(locale), writingDirection: writingDirection(locale) },
          ]}
        >
          {t('compare.noPrevious', locale)}
        </Text>
      </ScrollView>
    );
  }

  const heading = t('compare.heading', locale, {
    current: monthLabel(view.currentKey, locale),
    previous: monthLabel(view.previousKey, locale),
  });

  const seriesColors = [colorFor(0), colorFor(2)];
  const seriesLabels = [t('compare.seriesCurrent', locale), t('compare.seriesPrevious', locale)];
  const chartGroups = view.categories.map((row) => ({
    label: categoryLabel(row.category, locale),
    values: [row.current, row.previous],
  }));
  const screenWidth = Dimensions.get('window').width - 32;

  return (
    <ScrollView style={styles.content}>
      <Text
        style={[styles.heading, { textAlign: textAlign(locale), writingDirection: writingDirection(locale) }]}
      >
        {heading}
      </Text>

      {view.headline.map((row) => (
        <View key={row.key} style={[styles.headlineRow, { flexDirection: rowDirection(locale) }]}>
          <Text style={[styles.headlineLabel, { textAlign: textAlign(locale), writingDirection: writingDirection(locale) }]}>
            {t(METRIC_LABEL_KEY[row.key], locale)}
          </Text>
          <Text style={styles.headlineValue}>{formatMoney(row.current, store.currency, locale)}</Text>
          <DeltaBadge view={row.view} locale={locale} currency={store.currency} />
        </View>
      ))}

      {chartGroups.length > 0 && (
        <View style={styles.chartContainer}>
          <GroupedBars
            groups={chartGroups}
            seriesColors={seriesColors}
            seriesLabels={seriesLabels}
            width={screenWidth}
            formatValue={(v) => formatMoney(v, store.currency, locale)}
          />
        </View>
      )}

      {view.categories.length > 0 && (
        <>
          <Text
            style={[styles.sectionTitle, { textAlign: textAlign(locale), writingDirection: writingDirection(locale) }]}
          >
            {t('compare.categoriesHeading', locale)}
          </Text>
          {view.categories.map((row) => (
            <View key={row.category} style={[styles.categoryRow, { flexDirection: rowDirection(locale) }]}>
              <Text style={[styles.categoryName, { textAlign: textAlign(locale), writingDirection: writingDirection(locale) }]}>
                {categoryLabel(row.category, locale)}
              </Text>
              <Text style={styles.categoryValue}>{formatMoney(row.current, store.currency, locale)}</Text>
              <DeltaBadge view={row.view} locale={locale} currency={store.currency} compact />
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}
