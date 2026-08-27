import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { formatMoney, type Locale } from '@monthly-budget/shared';
import { t } from '../i18n';
import { rowDirection, writingDirection } from '../components/direction';
import type { DeltaView } from './comparisonModel';

export interface DeltaBadgeProps {
  view: DeltaView;
  locale: Locale;
  currency: string;
  compact?: boolean;
}

const GLYPH: Record<DeltaView['direction'], string> = { up: '▲', down: '▼', flat: '–' };
const TONE_COLOR: Record<DeltaView['tone'], string> = {
  good: '#1B6B57',
  bad: '#A0322D',
  neutral: '#5C6B63',
};

/**
 * Renders exactly what `view` already decided, and nothing it decides itself.
 *
 * `view.percent` is never read directly for display -- only `showPercent`
 * gates whether a percentage appears at all. That is what keeps a -300% (a
 * loss turning into a profit) or a +999,900% (a near-zero base) off screen.
 * The glyph is drawn from `view.direction` regardless of tone, so colour is
 * never the only signal a favourable/unfavourable reader has to go on.
 */
export function DeltaBadge({ view, locale, currency, compact }: DeltaBadgeProps) {
  const color = TONE_COLOR[view.tone];
  const glyph = GLYPH[view.direction];

  const absoluteText = view.isPoints
    ? `${view.absolute >= 0 ? '+' : ''}${view.absolute.toFixed(1)} ${t('compare.pointsSuffix', locale)}`
    : formatMoney(view.absolute, currency, locale);

  const trailingText =
    view.status === 'new'
      ? t('compare.statusNew', locale)
      : view.status === 'gone'
        ? t('compare.statusGone', locale)
        : view.showPercent && view.percent !== null
          ? `${view.percent >= 0 ? '+' : ''}${view.percent.toFixed(1)}%`
          : null;

  const dir = writingDirection(locale);

  return (
    <View style={[styles.row, { flexDirection: rowDirection(locale) }]}>
      <Text style={[styles.glyph, { color }]}>{glyph}</Text>
      {!compact && (
        <Text style={[styles.absolute, { color, writingDirection: dir }]} numberOfLines={1}>
          {absoluteText}
        </Text>
      )}
      {trailingText && (
        <Text style={[styles.trailing, { color, writingDirection: dir }]} numberOfLines={1}>
          {trailingText}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
  },
  glyph: {
    fontSize: 13,
    fontWeight: '700',
    marginEnd: 4,
  },
  absolute: {
    fontSize: 13,
    fontWeight: '600',
    marginEnd: 4,
  },
  trailing: {
    fontSize: 12,
  },
});
