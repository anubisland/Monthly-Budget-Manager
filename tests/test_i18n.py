"""
Tests for monthly_budget.i18n — translation engine.
"""
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest
from monthly_budget.i18n import I18n, _SUPPORTED_LANGUAGES


class TestI18nBasic:
    def test_default_language(self):
        i18n = I18n()
        assert i18n.lang in _SUPPORTED_LANGUAGES

    def test_english_language(self):
        i18n = I18n(lang="en")
        assert i18n.lang == "en"
        assert not i18n.is_rtl

    def test_arabic_language(self):
        i18n = I18n(lang="ar")
        assert i18n.lang == "ar"
        assert i18n.is_rtl

    def test_unsupported_language_falls_back(self):
        i18n = I18n(lang="fr")
        assert i18n.lang in _SUPPORTED_LANGUAGES


class TestI18nTranslation:
    def test_app_title_en(self):
        i18n = I18n(lang="en")
        assert i18n.t("app.title") == "Monthly Budget Manager"

    def test_app_title_ar(self):
        i18n = I18n(lang="ar")
        assert i18n.t("app.title") == "مدير الميزانية الشهرية"

    def test_nav_dashboard_en(self):
        i18n = I18n(lang="en")
        assert i18n.t("nav.dashboard") == "Dashboard"

    def test_nav_dashboard_ar(self):
        i18n = I18n(lang="ar")
        assert i18n.t("nav.dashboard") == "لوحة المعلومات"

    def test_missing_key_returns_key(self):
        i18n = I18n(lang="en")
        assert i18n.t("nonexistent.key") == "nonexistent.key"

    def test_format_params(self):
        i18n = I18n(lang="en")
        result = i18n.t("dashboard.income_count", count=5)
        assert result == "5 incomes"

    def test_format_params_ar(self):
        i18n = I18n(lang="ar")
        result = i18n.t("dashboard.income_count", count=3)
        assert result == "3 إيراد"

    def test_report_total_income_format(self):
        i18n = I18n(lang="en")
        result = i18n.t("report.total_income", amount="$5,000.00")
        assert result == "Total Income: $5,000.00"


class TestI18nRTL:
    def test_rtl_property_en(self):
        i18n = I18n(lang="en")
        assert not i18n.is_rtl

    def test_rtl_property_ar(self):
        i18n = I18n(lang="ar")
        assert i18n.is_rtl

    def test_anchor_en(self):
        i18n = I18n(lang="en")
        assert i18n.anchor() == "w"

    def test_anchor_ar(self):
        i18n = I18n(lang="ar")
        assert i18n.anchor() == "e"

    def test_justify_en(self):
        i18n = I18n(lang="en")
        assert i18n.justify() == "left"

    def test_justify_ar(self):
        i18n = I18n(lang="ar")
        assert i18n.justify() == "right"

    def test_opposite_anchor_en(self):
        i18n = I18n(lang="en")
        assert i18n.opposite_anchor() == "e"

    def test_opposite_anchor_ar(self):
        i18n = I18n(lang="ar")
        assert i18n.opposite_anchor() == "w"

    def test_column_swap_ltr(self):
        i18n = I18n(lang="en")
        assert i18n.column_swap(4, 0) == 0
        assert i18n.column_swap(4, 3) == 3

    def test_column_swap_rtl(self):
        i18n = I18n(lang="ar")
        assert i18n.column_swap(4, 0) == 3
        assert i18n.column_swap(4, 3) == 0


class TestI18nSingleton:
    def test_get_instance_returns_same(self):
        i1 = I18n.get_instance()
        i2 = I18n.get_instance()
        assert i1 is i2

    def test_get_instance_with_lang_change(self):
        i18n = I18n.get_instance(lang="en")
        assert i18n.lang == "en"

    def test_set_language(self):
        i18n = I18n()
        i18n.set_language("ar")
        assert i18n.lang == "ar"
        assert i18n.is_rtl

    def test_supported_languages(self):
        i18n = I18n()
        langs = i18n.supported_languages()
        assert len(langs) == 2
        assert ("en", "English") in langs
        assert ("ar", "العربية") in langs
