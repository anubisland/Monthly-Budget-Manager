import React from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { formatMoney, type Locale } from '@monthly-budget/shared';
import type { DraftAction, EntryDraft } from '../entryDraft';
import { Chip } from '../Chip';
import { t } from '../../i18n';
import { rowDirection, textAlign, writingDirection } from '../../components/direction';

/**
 * Fourth step: the one typed field in the whole sheet, plus chips for
 * amounts seen before for this name.
 */
export function AmountStep({
  draft,
  options,
  currency,
  locale,
  dispatch,
}: {
  draft: EntryDraft;
  options: { amounts: number[] };
  currency: string;
  locale: Locale;
  dispatch: (action: DraftAction) => void;
}) {
  return (
    <View>
      <TextInput
        style={[styles.input, { textAlign: textAlign(locale), writingDirection: writingDirection(locale) }]}
        placeholder={t('entry.amountPlaceholder', locale)}
        value={draft.amountText}
        onChangeText={(text) => dispatch({ type: 'setAmount', text })}
        onSubmitEditing={() => dispatch({ type: 'confirmAmount' })}
        keyboardType="decimal-pad"
        autoFocus
      />
      <View style={[styles.row, { flexDirection: rowDirection(locale) }]}>
        {options.amounts.map((amount) => (
          <Chip
            key={amount}
            label={formatMoney(amount, currency, locale)}
            selected={draft.amountText === String(amount)}
            onPress={() => dispatch({ type: 'pickAmount', amount })}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderColor: '#d0d5dd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    marginBottom: 12,
  },
  row: {
    flexWrap: 'wrap',
  },
});
