import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { Locale, MonthKey } from '@monthly-budget/shared';
import { t } from '../i18n';
import { monthBarModel } from './monthBarModel';
import { rowDirection, writingDirection } from './direction';

export interface MonthBarProps {
  monthKey: MonthKey;
  locale: Locale;
  onPrev(): void;
  onNext(): void;
  onCurrent(): void;
  today?: Date;
}

export function MonthBar({ monthKey, locale, onPrev, onNext, onCurrent, today }: MonthBarProps) {
  const m = monthBarModel(monthKey, locale, today);
  // In a right-to-left layout the row itself reverses, so the control that
  // means "back" stays on the side the reader expects without swapping the
  // handlers -- swapping those would break the arrows for screen readers.
  const row = rowDirection(locale);

  return (
    <View style={[styles.bar, { flexDirection: row }]}>
      <TouchableOpacity
        style={styles.arrow}
        onPress={onPrev}
        accessibilityRole="button"
        accessibilityLabel={`${t('month.previous', locale)}: ${m.prevLabel}`}
      >
        <Text style={styles.arrowText}>‹</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.center}
        onPress={onCurrent}
        disabled={m.isCurrent}
        accessibilityRole="button"
        accessibilityLabel={m.isCurrent ? m.label : t('month.current', locale)}
      >
        <Text style={[styles.label, { writingDirection: writingDirection(locale) }]}>
          {m.label}
        </Text>
        {!m.isCurrent && <Text style={styles.jump}>{t('month.current', locale)}</Text>}
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.arrow, !m.canGoNext && styles.arrowDisabled]}
        onPress={onNext}
        disabled={!m.canGoNext}
        accessibilityRole="button"
        accessibilityState={{ disabled: !m.canGoNext }}
        accessibilityLabel={`${t('month.next', locale)}: ${m.nextLabel}`}
      >
        <Text style={[styles.arrowText, !m.canGoNext && styles.arrowTextDisabled]}>›</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10 },
  arrow: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  arrowDisabled: { opacity: 0.3 },
  arrowText: { fontSize: 28, color: '#1B6B57' },
  arrowTextDisabled: { color: '#5C6B63' },
  center: { flex: 1, alignItems: 'center' },
  label: { fontSize: 18, fontWeight: '600', color: '#141F1A' },
  jump: { fontSize: 12, color: '#1B6B57', marginTop: 2 },
});
