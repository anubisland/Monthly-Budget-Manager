import React from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';

/**
 * A tappable pill used throughout the entry sheet for chip-style choices
 * (categories, suggested names, suggested amounts, day shortcuts).
 *
 * Selection is shown with both a fill and a heavier border, never colour
 * alone -- colour-blind users and low-contrast screens still need to tell
 * a selected chip from an unselected one.
 */
export function Chip({
  label,
  icon,
  selected = false,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  icon?: string;
  selected?: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  return (
    <TouchableOpacity
      style={[styles.chip, selected && styles.chipSelected]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel ?? label}
    >
      {icon ? <Text style={styles.icon}>{icon}</Text> : null}
      <Text style={[styles.label, selected && styles.labelSelected]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#d0d5dd',
    backgroundColor: '#f5f6f8',
    marginEnd: 8,
    marginBottom: 8,
  },
  chipSelected: {
    borderWidth: 2,
    borderColor: '#2f6fed',
    backgroundColor: '#e8f0fe',
  },
  icon: {
    fontSize: 16,
    marginEnd: 6,
  },
  label: {
    fontSize: 14,
    color: '#1f2430',
  },
  labelSelected: {
    color: '#1a4fc4',
    fontWeight: '600',
  },
});
