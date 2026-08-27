import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Locale, MonthKey } from '@monthly-budget/shared';
import type { DraftAction, EntryDraft } from '../entryDraft';
import { dayShortcuts, daysInMonth, type ShortcutKey } from '../dayOptions';
import { Chip } from '../Chip';
import { t, type StringKey } from '../../i18n';
import { rowDirection, textAlign, writingDirection } from '../../components/direction';

const SHORTCUT_KEYS: Record<ShortcutKey, StringKey> = {
  today: 'entry.dayToday',
  yesterday: 'entry.dayYesterday',
  firstOfMonth: 'entry.dayFirstOfMonth',
  lastOfMonth: 'entry.dayLastOfMonth',
};

/**
 * Fifth step: quick shortcuts for common days, then every day in the
 * displayed month. The month comes from `monthKey`, never from today's
 * date, so a past month offers its own days rather than the current one's.
 */
export function DateStep({
  draft,
  monthKey,
  locale,
  dispatch,
}: {
  draft: EntryDraft;
  monthKey: MonthKey;
  locale: Locale;
  dispatch: (action: DraftAction) => void;
}) {
  const shortcuts = dayShortcuts(monthKey);
  const days = Array.from({ length: daysInMonth(monthKey) }, (_, i) => i + 1);

  return (
    <View>
      {shortcuts.length > 0 && (
        <View style={[styles.row, { flexDirection: rowDirection(locale) }]}>
          {shortcuts.map(({ key, day }) => (
            <Chip
              key={key}
              label={t(SHORTCUT_KEYS[key], locale)}
              selected={draft.day === day}
              onPress={() => dispatch({ type: 'pickDay', day })}
            />
          ))}
        </View>
      )}
      <Text style={[styles.heading, { textAlign: textAlign(locale), writingDirection: writingDirection(locale) }]}>
        {t('entry.chooseDay', locale)}
      </Text>
      <View style={[styles.row, { flexDirection: rowDirection(locale) }]}>
        {days.map((day) => (
          <Chip
            key={day}
            label={String(day)}
            selected={draft.day === day}
            onPress={() => dispatch({ type: 'pickDay', day })}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexWrap: 'wrap',
  },
  heading: {
    fontSize: 14,
    fontWeight: '600',
    marginVertical: 8,
    color: '#1f2430',
  },
});
