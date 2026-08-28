"""A stand-in for the Toga app, so api.py can be tested without one.

Deliberately holds the same small surface api.py actually uses. If a route
starts reaching for something else, this fails loudly rather than the test
quietly exercising a mock that agrees with everything.
"""

from datetime import date

from tests.mobile_app_modules import BudgetData


class FakeApp:
    def __init__(self, tmp_path, today=date(2026, 8, 27)):
        self.data = BudgetData(tmp_path / "data.json", today=today)
        self._today = today
        self.dark = False
        self.lang = "en"
        self.currency = "USD"
        self.last_export = None
        self.export_dir = tmp_path / "exports"
        self.saved_data = 0
        self.saved_settings = 0
        self.save_error = None

    def export_path(self, name):
        self.export_dir.mkdir(parents=True, exist_ok=True)
        return self.export_dir / name

    def today_iso(self):
        return self._today.strftime("%Y-%m-%d")

    def save_data(self):
        if self.save_error:
            raise self.save_error
        self.saved_data += 1
        self.data.save()

    def save_settings(self):
        self.saved_settings += 1

    def set_dark(self, value):
        self.dark = value

    def set_language(self, lang):
        self.lang = lang

    def set_currency(self, currency):
        self.currency = currency
