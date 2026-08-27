import { StyleSheet } from 'react-native';

/**
 * Styles for the recurring-item suggestion strip. Kept apart from
 * `screens/styles.ts` -- that module belongs to the summary/income/expense
 * screens and is off limits here, not because these rules differ in kind.
 */
export const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 6,
    padding: 12,
    marginBottom: 16,
  },
  heading: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212529',
    marginBottom: 4,
  },
  explainer: {
    fontSize: 13,
    color: '#5C6B63',
    marginBottom: 12,
  },
  row: {
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#E9ECEF',
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#212529',
  },
  itemMeta: {
    fontSize: 12,
    color: '#5C6B63',
  },
  actions: {
    alignItems: 'center',
  },
  acceptButton: {
    backgroundColor: '#1B6B57',
    borderRadius: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginStart: 8,
  },
  acceptButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  declineButton: {
    borderRadius: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginStart: 8,
  },
  declineButtonText: {
    color: '#5C6B63',
    fontSize: 13,
  },
});
