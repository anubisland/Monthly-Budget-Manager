import React, { useReducer } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useBudget } from '../state/BudgetProvider';
import { t } from '../i18n';
import { rowDirection, textAlign, writingDirection } from '../components/direction';
import { canCommit, draftReducer, emptyDraft, stepOptions, toEntry, type EntryStep } from './entryDraft';
import { KindStep } from './steps/KindStep';
import { CategoryStep } from './steps/CategoryStep';
import { NameStep } from './steps/NameStep';
import { AmountStep } from './steps/AmountStep';
import { DateStep } from './steps/DateStep';

const STEP_TITLES: Record<EntryStep, 'entry.stepKind' | 'entry.stepCategory' | 'entry.stepName' | 'entry.stepAmount' | 'entry.stepDate'> = {
  kind: 'entry.stepKind',
  category: 'entry.stepCategory',
  name: 'entry.stepName',
  amount: 'entry.stepAmount',
  date: 'entry.stepDate',
};

/**
 * The entry sheet: a state machine (`entryDraft.ts`) rendered one step at a
 * time. This component and the steps below it decide nothing about ordering
 * -- every transition is a dispatched action, and the reducer, which is
 * fully tested, is what decides what comes next.
 */
export function AddEntrySheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { store, monthKey, upsert } = useBudget();
  const [draft, dispatch] = useReducer(draftReducer, undefined, emptyDraft);
  const locale = store.locale;
  const options = stepOptions(draft, store);

  const handleClose = () => {
    dispatch({ type: 'reset' });
    onClose();
  };

  const handleSave = () => {
    const entry = toEntry(draft, monthKey);
    if (!entry || !draft.kind) return;
    upsert(draft.kind, entry);
    dispatch({ type: 'reset' });
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <View style={styles.container}>
        <View style={[styles.header, { flexDirection: rowDirection(locale) }]}>
          {draft.step !== 'kind' && (
            <TouchableOpacity onPress={() => dispatch({ type: 'back' })} accessibilityRole="button">
              <Text style={styles.headerAction}>{t('entry.back', locale)}</Text>
            </TouchableOpacity>
          )}
          <Text
            style={[styles.title, { textAlign: textAlign(locale), writingDirection: writingDirection(locale) }]}
          >
            {t(STEP_TITLES[draft.step], locale)}
          </Text>
        </View>

        <View style={styles.body}>
          {draft.step === 'kind' && <KindStep locale={locale} dispatch={dispatch} />}
          {draft.step === 'category' && (
            <CategoryStep draft={draft} options={options} locale={locale} dispatch={dispatch} />
          )}
          {draft.step === 'name' && (
            <NameStep draft={draft} options={options} locale={locale} dispatch={dispatch} />
          )}
          {draft.step === 'amount' && (
            <AmountStep
              draft={draft}
              options={options}
              currency={store.currency}
              locale={locale}
              dispatch={dispatch}
            />
          )}
          {draft.step === 'date' && (
            <DateStep draft={draft} monthKey={monthKey} locale={locale} dispatch={dispatch} />
          )}
        </View>

        <View style={[styles.footer, { flexDirection: rowDirection(locale) }]}>
          <TouchableOpacity onPress={handleClose} accessibilityRole="button">
            <Text style={styles.footerCancel}>{t('entry.cancel', locale)}</Text>
          </TouchableOpacity>
          {canCommit(draft) && (
            <TouchableOpacity onPress={handleSave} accessibilityRole="button" style={styles.saveButton}>
              <Text style={styles.footerSave}>{t('entry.save', locale)}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
    padding: 16,
  },
  header: {
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  headerAction: {
    fontSize: 16,
    color: '#2f6fed',
  },
  title: {
    flex: 1,
    fontSize: 20,
    fontWeight: '700',
    color: '#1f2430',
  },
  body: {
    flex: 1,
  },
  footer: {
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
  },
  footerCancel: {
    fontSize: 16,
    color: '#6b7280',
  },
  saveButton: {
    backgroundColor: '#2f6fed',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  footerSave: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },
});
