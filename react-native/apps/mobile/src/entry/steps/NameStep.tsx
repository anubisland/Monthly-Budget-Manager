import React from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import type { Locale } from '@monthly-budget/shared';
import type { DraftAction, EntryDraft } from '../entryDraft';
import { Chip } from '../Chip';
import { t } from '../../i18n';
import { rowDirection, textAlign, writingDirection } from '../../components/direction';

/**
 * Third step: a chip per suggested name, plus "other" for a custom one.
 *
 * The text field renders only when `draft.nameIsCustom` is true -- that is
 * the one condition that governs this sheet's second keyboard. When there
 * are no suggestions at all, an empty step with only an "other" chip would
 * be a dead end, so the effect below reaches the same state the "other" chip
 * would by dispatching the same action, rather than rendering differently.
 */
export function NameStep({
  draft,
  options,
  locale,
  dispatch,
}: {
  draft: EntryDraft;
  options: { names: string[] };
  locale: Locale;
  dispatch: (action: DraftAction) => void;
}) {
  const hasSuggestions = options.names.length > 0;

  if (draft.nameIsCustom) {
    return (
      <TextInput
        style={[styles.input, { textAlign: textAlign(locale), writingDirection: writingDirection(locale) }]}
        placeholder={t('entry.namePlaceholder', locale)}
        value={draft.name}
        onChangeText={(text) => dispatch({ type: 'setName', name: text })}
        onSubmitEditing={() => dispatch({ type: 'confirmName' })}
        autoFocus
      />
    );
  }

  return (
    <View style={[styles.row, { flexDirection: rowDirection(locale) }]}>
      {options.names.map((name) => (
        <Chip
          key={name}
          label={name}
          selected={draft.name === name}
          onPress={() => dispatch({ type: 'pickName', name })}
        />
      ))}
      <Chip
        label={t('entry.other', locale)}
        onPress={() => dispatch({ type: 'chooseCustomName' })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexWrap: 'wrap',
  },
  input: {
    borderWidth: 1,
    borderColor: '#d0d5dd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
});
