import React from 'react';
import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import { useLanguage } from './LanguageContext';

export function LanguageToggle() {
  const { language, toggleLanguage } = useLanguage();

  const isArabic = language === 'ar';

  return (
    <TouchableOpacity
      style={styles.pill}
      onPress={toggleLanguage}
      activeOpacity={0.8}
      accessibilityRole="switch"
      accessibilityState={{ checked: isArabic }}
      accessibilityLabel={isArabic ? 'Switch to English / التبديل إلى الإنجليزية' : 'Switch to Arabic / التبديل إلى العربية'}
    >
      <View style={[styles.option, !isArabic && styles.activeOption]}>
        <Text style={[styles.optionText, !isArabic && styles.activeText]}>EN</Text>
      </View>
      <View style={[styles.option, isArabic && styles.activeOption]}>
        <Text style={[styles.optionText, isArabic && styles.activeText]}>عر</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    width: 64,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#007bff',
    overflow: 'hidden',
    alignSelf: 'center',
  },
  option: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  activeOption: {
    backgroundColor: '#007bff',
  },
  optionText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#007bff',
  },
  activeText: {
    color: '#fff',
  },
});
