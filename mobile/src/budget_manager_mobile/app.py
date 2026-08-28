import http.server
import json
import socket
import sys
import threading
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse

sys.path.insert(0, str(Path(__file__).parent.resolve()))

import api
import goals as goals_module
import pace
import recurring
import store
import toga
import trend
from budget_data import BudgetData
from toga.style import Pack

from monthly_budget.i18n import I18n

_web_dir = Path(__file__).parent / 'web'


CAT_COLORS = {
    "Food":"#FF6B6B","Rent":"#4ECDC4","Fuel":"#FFE66D","Electricity":"#FFD93D",
    "Internet":"#6BCB77","Water":"#4D96FF","Transport":"#FF6B35","Healthcare":"#FF4757",
    "Entertainment":"#A29BFE","Education":"#00CEC9","Clothing":"#FD79A8","Savings":"#00B894",
    "Debt":"#E17055","Subscriptions":"#0984E3","Gifts":"#E84393","Misc":"#636E72",
    "Uncategorized":"#B2BEC3",
}


class BudgetAPIHandler(http.server.BaseHTTPRequestHandler):
    app = None

    def do_GET(self):
        p = urlparse(self.path).path
        if p in ('/api/data', '/api/backup'):
            return self._json(self.app.api_state())
        f = _web_dir / (p.lstrip('/') or 'index.html')
        if f.exists() and f.is_file() and _web_dir in f.resolve().parents:
            return self._file(f)
        return self._json({"error": "not found"}, 404)

    def do_POST(self):
        """Read, dispatch, answer. All three can fail, and each says why.

        Routing and validation live in api.py; this method's only job is
        turning an HTTP request into a call and an exception into a status.
        """
        try:
            payload = api.read_payload(self._body())
            api.dispatch(self.app, urlparse(self.path).path, payload)
        except api.ApiError as err:
            return self._json({"error": err.message}, err.status)
        except OSError as err:
            # A failed save. The previous code discarded this, so a full disk
            # was indistinguishable from a successful write.
            print(f"[budget] save failed: {err}")
            return self._json({"error": "could not save", "detail": str(err)}, 507)
        return self._json(self.app.api_state())

    def _body(self):
        try:
            length = int(self.headers.get('Content-Length') or 0)
        except (TypeError, ValueError):
            raise api.ApiError("bad Content-Length")
        if length < 0 or length > 1_000_000:
            raise api.ApiError("body too large", 413)
        return self.rfile.read(length) if length else b""

    def _json(self, data, status=200):
        self.send_response(status)
        self.send_header('Content-Type','application/json')
        self.send_header('Access-Control-Allow-Origin','*')
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode())

    def _file(self, path):
        self.send_response(200)
        ext = path.suffix.lower()
        mt = {
            '.html':'text/html;charset=utf-8','.css':'text/css','.js':'text/javascript',
            '.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon',
            '.json':'application/json','.txt':'text/plain',
        }.get(ext, 'application/octet-stream')
        self.send_header('Content-Type', mt)
        self.send_header('Access-Control-Allow-Origin','*')
        self.end_headers()
        self.wfile.write(path.read_bytes())

    def log_message(self, fmt, *a):
        print(f"[server] {fmt%a}")


class App(toga.App):
    def startup(self):
        self.dark = False; self.lang = "en"; self.currency = "USD"
        #: Outcome of the last export, for the UI to report. See api._export.
        self.last_export = None
        self._i18n = I18n.get_instance()
        self._setup_storage()
        self._load_settings()
        self.data = BudgetData(self._dp)
        self.data.load()
        if self.data.note:
            print(f"[budget] data loaded with note: {self.data.note}")
        self._start_server()
        self.main_window = toga.MainWindow(title="Budget")
        self._web = toga.WebView(
            url=f'http://127.0.0.1:{self._port}/',
            style=Pack(flex=1)
        )
        self.main_window.content = self._web
        print(f"[budget] WebView loading http://127.0.0.1:{self._port}/")
        self.main_window.show()

    @property
    def bm(self):
        """The budget for the month on screen.

        Kept as a property so month-keying was not a rewrite: everything that
        used to touch a single budget now touches the current one.
        """
        return self.data.month

    def export_path(self, name):
        """Where an export goes.

        A dedicated subdirectory, not the data directory: the only thing a
        share sheet should ever be able to reach is a file the user asked for,
        and data.json sitting beside it would be one mis-selection away from
        being sent somewhere.
        """
        folder = self._dd / "exports"
        folder.mkdir(parents=True, exist_ok=True)
        return folder / name

    def today_iso(self):
        return datetime.now().strftime('%Y-%m-%d')

    def set_dark(self, value):
        self.dark = bool(value)

    def set_language(self, lang):
        self.lang = lang
        self._i18n.set_language(lang)

    def set_currency(self, currency):
        self.currency = currency

    def _start_server(self):
        handler = BudgetAPIHandler; handler.app = self
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.bind(('127.0.0.1', 0))
        self._port = s.getsockname()[1]; s.close()
        print(f"[budget] Server starting on port {self._port}")
        # Held so the server can be shut down deliberately rather than only by
        # the process exiting.
        self._server = http.server.HTTPServer(('127.0.0.1', self._port), handler)
        t = threading.Thread(target=self._server.serve_forever, daemon=True)
        t.start()
        print(f"[budget] Server started on port {self._port}")

    def api_state(self):
        """Everything the WebView renders from, for the month on screen."""
        bm = self.data.month
        year, month = store.parse_month_key(self.data.current)
        return {
            'year': year, 'month': month,
            'month_key': self.data.current,
            'is_current_month': self.data.current == self.data.this_month(),
            'can_go_back': self.data.can_go_back(),
            'can_go_forward': self.data.can_go_forward(),
            'known_months': self.data.known_months(),
            'previous': self._previous_summary(),
            'incomes': [{'name': i.name, 'amount': i.amount, 'date': i.date or ''} for i in bm.incomes],
            'expenses': [{'name': e.name, 'amount': e.amount, 'category': e.category, 'date': e.date or ''} for e in bm.expenses],
            'total_income': bm.total_income(),
            'total_expenses': bm.total_expenses(),
            'net': bm.net(),
            'margin': bm.profit_margin(),
            'categories': self._categories(bm),
            'total_budget': bm.total_budget,
            'goals': self._goals_state(),
            'dark': self.dark, 'lang': self.lang, 'currency': self.currency,
            'today': self.today_iso(),
            'note': self.data.note,
            'dropped': self.data.dropped,
            'last_export': self.last_export,
            'rules': [{'pattern': r.pattern, 'category': r.category} for r in self.data.rules],
            'recurring': self._recurring_state(),
            'pending_recurring': self._pending_state(),
            'pace': self._pace_state(bm),
            'trend': trend.series(self.data.months, self.data.current),
            'trend_avg': trend.averages(trend.series(self.data.months, self.data.current)),
        }

    def _categories(self, bm):
        return {
            c: {'amount': a, 'color': CAT_COLORS.get(c, '#B2BEC3')}
            for c, a in bm.expenses_by_category().items()
        }

    def _goals_state(self):
        """Each goal with its derived progress, so the UI does no arithmetic."""
        result = []
        for g in self.data.goals:
            status = goals_module.status(g, self.data.months, self.data.current)
            result.append({
                'name': g.name, 'target': g.target, 'icon': g.icon,
                'current': status['funded'],
                'remaining': status['remaining'],
                'pct': status['pct'],
                'done': status['done'],
                'this_month': status['this_month'],
                'carried_over': status['carried_over'],
                'target_month': g.target_month,
            })
        return result

    def _recurring_state(self):
        return [
            {'id': t.id, 'description': t.description, 'category': t.category,
             'amount': t.amount, 'frequency': t.frequency, 'day': t.day,
             'start_date': t.start_date}
            for t in self.data.recurring
        ]

    def _pending_state(self):
        """Templates the month on screen has not accepted or skipped yet.

        The total is computed here so the UI can show what accepting will cost
        without knowing how a frequency expands into dates.
        """
        result = []
        for template in recurring.pending(
            self.data.recurring, self.data.current,
            self.data.settled_in(self.data.current),
        ):
            occurrences = recurring.expenses_for(template, self.data.current)
            result.append({
                'id': template.id, 'description': template.description,
                'category': template.category, 'amount': template.amount,
                'count': len(occurrences),
                'total': round(sum(e.amount for e in occurrences), 2),
            })
        return result

    def _pace_state(self, bm):
        """Whether the month on screen is on track, and where it lands."""
        year, month = store.parse_month_key(self.data.current)
        return pace.status(
            bm.total_expenses(), bm.total_budget, year, month, datetime.now().date(),
        )

    def _previous_summary(self):
        """The month before the one on screen, for the comparison section.

        None when there is no earlier month with data — a comparison against
        nothing is zeros dressed up as a finding.
        """
        key = self.data.previous()
        bm = self.data.months.get(key)
        if bm is None or (not bm.incomes and not bm.expenses):
            return None
        return {
            'month_key': key,
            'total_income': bm.total_income(),
            'total_expenses': bm.total_expenses(),
            'net': bm.net(),
            'categories': {c: a for c, a in bm.expenses_by_category().items()},
        }

    def _setup_storage(self):
        """Decide where the data lives, and make sure we can write there.

        A bare ``except`` here used to swallow anything at all, including the
        interpreter shutting down, and the following mkdir was unguarded — so a
        read-only directory crashed the app at startup instead of falling back.
        """
        self._dd = self._writable_dir()
        self._sp = self._dd / "settings.json"
        self._dp = self._dd / "data.json"
        print(f"[budget] data directory: {self._dd}")

    def _writable_dir(self):
        candidates = []
        try:
            candidates.append(Path(self.paths.data))
        except (AttributeError, TypeError, OSError):
            pass
        candidates.append(Path.home() / ".budget_mobile")

        for candidate in candidates:
            try:
                candidate.mkdir(parents=True, exist_ok=True)
                return candidate
            except OSError as err:
                print(f"[budget] cannot use {candidate}: {err}")
        raise RuntimeError("no writable directory for the budget data")

    def _load_settings(self):
        try:
            s=json.loads(self._sp.read_text("utf-8"))
            self.dark = bool(s.get("dark", False))
            self.lang = s.get("lang") if s.get("lang") in ("en", "ar") else "en"
            self.currency = s.get("currency") or "USD"
            self._i18n.set_language(self.lang)
        except (OSError, ValueError, AttributeError) as err:
            print(f"[budget] settings not loaded ({err}); using defaults")

    def save_settings(self):
        """Theme, language and currency. A failure here is not data loss, but
        it is still worth a line in the log rather than nothing at all."""
        try:
            self._sp.write_text(json.dumps({
                "dark": self.dark, "lang": self.lang, "currency": self.currency,
            }), "utf-8")
        except OSError as err:
            print(f"[budget] could not save settings: {err}")

    def save_data(self):
        """Write the data file. Deliberately unguarded: see do_POST."""
        self.data.save()

def main():
    return App("Budget Manager","com.example.budget_manager_mobile")
