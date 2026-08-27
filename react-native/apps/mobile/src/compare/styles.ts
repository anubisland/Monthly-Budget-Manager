import { StyleSheet } from 'react-native';

/**
 * Styles for the comparison tab. Kept apart from `screens/styles.ts` --
 * that module belongs to the summary/income/expense screens and is off
 * limits here, not because these rules differ in kind.
 */
export const styles = StyleSheet.create({
  content: {
    flex: 1,
    padding: 16,
  },
  emptyText: {
    fontSize: 15,
    color: '#5C6B63',
    marginTop: 24,
  },
  heading: {
    fontSize: 18,
    fontWeight: '600',
    color: '#212529',
    marginBottom: 16,
  },
  headlineRow: {
    backgroundColor: '#fff',
    padding: 12,
    marginBottom: 8,
    borderRadius: 6,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headlineLabel: {
    flex: 1,
    fontSize: 14,
    color: '#495057',
  },
  headlineValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#212529',
    marginEnd: 12,
  },
  chartContainer: {
    backgroundColor: '#fff',
    padding: 16,
    marginTop: 8,
    marginBottom: 20,
    borderRadius: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212529',
    marginTop: 8,
    marginBottom: 12,
  },
  categoryRow: {
    backgroundColor: '#fff',
    padding: 12,
    marginBottom: 8,
    borderRadius: 6,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  categoryName: {
    flex: 1,
    fontSize: 14,
    color: '#495057',
  },
  categoryValue: {
    fontSize: 13,
    color: '#6c757d',
    marginEnd: 12,
  },
});
