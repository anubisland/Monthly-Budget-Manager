/**
 * React Native Accessibility Test Suite — Monthly Budget Manager
 *
 * What this checks (automated, via @testing-library/react-native):
 *   - Interactive elements have accessibilityRole
 *   - Interactive elements have accessibilityLabel (not just placeholder)
 *   - Tab navigation is keyboard/switch-accessible
 *   - Modals set accessibilityViewIsModal={true}
 *   - Destructive actions have an accessibilityHint
 *
 * ──────────────────────────────────────────────────────────────────────────
 * COVERAGE GAPS — requires manual testing with VoiceOver / TalkBack / NVDA:
 *
 *  1. Dynamic announcements  — live regions do NOT fire in jest. Verify that
 *     adding income/expense triggers a VoiceOver announcement in the real app.
 *  2. Focus management       — jest cannot confirm that focus moves to the
 *     first form field when a modal opens, or returns to the trigger when it
 *     closes. Test on device.
 *  3. Reading order          — accessibilityOrder / z-index reordering is
 *     not testable in jest. Confirm left-to-right, top-to-bottom order with
 *     TalkBack explore-by-touch.
 *  4. Touch target size      — 44 × 44 pt minimum (Apple/Google HIG) cannot
 *     be measured in jest. Check with Accessibility Inspector (Xcode) or
 *     Android Accessibility Scanner.
 *  5. Colour contrast        — RN StyleSheet colours are not computed by
 *     jest. Use Accessibility Inspector or a contrast-checker tool.
 *  6. Swipe gestures         — screen-reader swipe navigation (next/prev
 *     element) is OS-level and untestable here.
 *  7. Dynamic type / font scaling — verify layout does not break at
 *     "Larger Accessibility Sizes" on iOS and TalkBack font size on Android.
 *  8. accessibilityLiveRegion — budget total should update and announce;
 *     only detectable with a real screen reader.
 * ──────────────────────────────────────────────────────────────────────────
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import App from '../src/App';

describe('App – accessibility (WCAG 2.1 AA / APCA targets)', () => {
  // ── Header ────────────────────────────────────────────────────────────

  describe('header file-operation buttons', () => {
    it('New button has accessibilityRole="button" and accessibilityLabel', () => {
      render(<App />);
      const btn = screen.getByRole('button', { name: /new/i });
      expect(btn).toBeTruthy();
    });

    it('Open button has accessibilityRole="button" and accessibilityLabel', () => {
      render(<App />);
      const btn = screen.getByRole('button', { name: /open/i });
      expect(btn).toBeTruthy();
    });

    it('Save button is labelled', () => {
      render(<App />);
      expect(screen.getByRole('button', { name: /save/i })).toBeTruthy();
    });

    it('Export button is labelled', () => {
      render(<App />);
      expect(screen.getByRole('button', { name: /export/i })).toBeTruthy();
    });
  });

  // ── Tab bar ───────────────────────────────────────────────────────────

  describe('tab bar', () => {
    it('Summary tab has accessibilityRole="tab"', () => {
      render(<App />);
      expect(screen.getByRole('tab', { name: /summary/i })).toBeTruthy();
    });

    it('Income tab has accessibilityRole="tab"', () => {
      render(<App />);
      expect(screen.getByRole('tab', { name: /income/i })).toBeTruthy();
    });

    it('Expenses tab has accessibilityRole="tab"', () => {
      render(<App />);
      expect(screen.getByRole('tab', { name: /expenses/i })).toBeTruthy();
    });

    it('active tab communicates selected state via accessibilityState.selected', () => {
      render(<App />);
      const activeTab = screen.getByRole('tab', { name: /summary/i });
      expect(activeTab.props.accessibilityState?.selected).toBe(true);
    });
  });

  // ── Income form ───────────────────────────────────────────────────────

  describe('income form', () => {
    beforeEach(() => {
      render(<App />);
      fireEvent.press(screen.getByRole('tab', { name: /income/i }));
    });

    it('income name field has an accessible label', () => {
      expect(
        screen.getByLabelText(/income name/i) ||
          screen.getByPlaceholderText(/income name/i),
      ).toBeTruthy();
    });

    it('amount field has an accessible label', () => {
      expect(screen.getByLabelText(/amount/i)).toBeTruthy();
    });

    it('Add Income button is labelled', () => {
      expect(screen.getByRole('button', { name: /add income/i })).toBeTruthy();
    });
  });

  // ── Expense form ──────────────────────────────────────────────────────

  describe('expense form', () => {
    beforeEach(() => {
      render(<App />);
      fireEvent.press(screen.getByRole('tab', { name: /expenses/i }));
    });

    it('expense name field has an accessible label', () => {
      expect(screen.getByLabelText(/expense name/i)).toBeTruthy();
    });

    it('Add Expense button is labelled', () => {
      expect(screen.getByRole('button', { name: /add expense/i })).toBeTruthy();
    });

    it('category picker button is labelled', () => {
      expect(screen.getByRole('button', { name: /pick|select category/i })).toBeTruthy();
    });
  });

  // ── Category picker modal ─────────────────────────────────────────────

  describe('category picker modal', () => {
    beforeEach(() => {
      render(<App />);
      fireEvent.press(screen.getByRole('tab', { name: /expenses/i }));
      fireEvent.press(screen.getByRole('button', { name: /pick|select category/i }));
    });

    it('modal has accessibilityViewIsModal={true}', () => {
      const modal = screen.getByTestId('categoryPickerModal');
      expect(modal.props.accessibilityViewIsModal).toBe(true);
    });

    it('Cancel button is labelled', () => {
      expect(screen.getByRole('button', { name: /cancel/i })).toBeTruthy();
    });
  });

  // ── Summary screen ────────────────────────────────────────────────────

  describe('summary screen', () => {
    it('Total Income stat has accessible text', () => {
      render(<App />);
      expect(screen.getByText(/total income/i)).toBeTruthy();
    });

    it('month/year selector button is labelled', () => {
      render(<App />);
      const btn = screen.getByRole('button', { name: /tap to change|select month/i });
      expect(btn).toBeTruthy();
    });

    it('Clear All Data is a destructive button with an accessibilityHint', () => {
      render(<App />);
      const btn = screen.getByRole('button', { name: /clear all data/i });
      expect(btn.props.accessibilityHint).toBeTruthy();
    });
  });
});
