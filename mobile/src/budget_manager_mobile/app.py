import json, io, sys, threading, http.server, socket, os
from dataclasses import dataclass, asdict
from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import urlparse

sys.path.insert(0, str(Path(__file__).parent.resolve()))

import toga
from toga.style import Pack
from monthly_budget.core import BudgetMonth
from monthly_budget.i18n import I18n

_web_dir = Path(__file__).parent / 'web'


@dataclass
class Goal:
    name: str; target: float; current: float = 0.0
    icon: str = "🎯"; target_month: str = ""


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
        if p == '/api/data':
            return self._json(self.app._get_api_data())
        if p == '/api/backup':
            return self._json(self.app._get_api_data())
        f = _web_dir / (p.lstrip('/') or 'index.html')
        if f.exists() and f.is_file():
            return self._file(f)
        return self._json({"error":"not found"}, 404)

    def do_POST(self):
        d = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        p = urlparse(self.path).path; a = self.app
        if p == '/api/add-income':
            a.bm.add_income(d['name'], d['amount'], d.get('date',''))
        elif p == '/api/add-expense':
            a.bm.add_expense(d['name'], d['amount'], d.get('category','Uncategorized'), d.get('date',''))
        elif p == '/api/delete-income':
            idx = d['index']; a.bm.incomes.pop(idx)
        elif p == '/api/delete-expense':
            idx = d['index']; a.bm.expenses.pop(idx)
        elif p == '/api/edit-income':
            idx = d['index']; inc = a.bm.incomes[idx]
            if 'name' in d: inc.name = d['name']
            if 'amount' in d: inc.amount = float(d['amount'])
            if 'date' in d: inc.date = d['date']
        elif p == '/api/edit-expense':
            idx = d['index']; exp = a.bm.expenses[idx]
            if 'name' in d: exp.name = d['name']
            if 'amount' in d: exp.amount = float(d['amount'])
            if 'category' in d: exp.category = d['category']
            if 'date' in d: exp.date = d['date']
        elif p == '/api/add-goal':
            a.goals.append(Goal(**{k:d[k] for k in ['name','target','current','icon','target_month'] if k in d}))
        elif p == '/api/delete-goal':
            idx = d.get('index', -1)
            if 0 <= idx < len(a.goals): a.goals.pop(idx)
        elif p == '/api/set-budget':
            a.bm.total_budget = float(d.get('total_budget', 0.0))
        elif p == '/api/toggle-theme':
            a._dark = not a._dark; a._save_settings()
            return self._json(self.app._get_api_data())
        elif p == '/api/set-language':
            a._lang = d['lang']; a._i18n.set_language(d['lang']); a._save_settings()
        elif p == '/api/set-currency':
            a._currency = d['currency']; a._save_settings()
        elif p == '/api/reset':
            a.bm = BudgetMonth(); a.goals = []; a._save_data()
            return self._json(self.app._get_api_data())
        a._save_data()
        return self._json(self.app._get_api_data())

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
        self._dark = False; self._lang = "en"; self._currency = "USD"
        self._year = datetime.now().year; self._month = datetime.now().month
        self.bm = BudgetMonth(); self.goals = []
        self._i18n = I18n.get_instance()
        self._setup_storage()
        self._load_settings()
        self._load_data()
        self._start_server()
        self.main_window = toga.MainWindow(title="Budget")
        self._web = toga.WebView(
            url=f'http://127.0.0.1:{self._port}/',
            style=Pack(flex=1)
        )
        self.main_window.content = self._web
        print(f"[budget] WebView loading http://127.0.0.1:{self._port}/")
        self.main_window.show()

    def _start_server(self):
        handler = BudgetAPIHandler; handler.app = self
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.bind(('127.0.0.1', 0))
        self._port = s.getsockname()[1]; s.close()
        print(f"[budget] Server starting on port {self._port}")
        server = http.server.HTTPServer(('127.0.0.1', self._port), handler)
        t = threading.Thread(target=server.serve_forever, daemon=True)
        t.start()
        print(f"[budget] Server started on port {self._port}")

    def _get_api_data(self):
        cats = {}
        for c, a in self.bm.expenses_by_category().items():
            cats[c] = {'amount': a, 'color': CAT_COLORS.get(c, '#B2BEC3')}
        return {
            'year': self._year, 'month': self._month,
            'incomes': [{'name':i.name,'amount':i.amount,'date':i.date or ''} for i in self.bm.incomes],
            'expenses': [{'name':e.name,'amount':e.amount,'category':e.category,'date':e.date or ''} for e in self.bm.expenses],
            'total_income': self.bm.total_income(),
            'total_expenses': self.bm.total_expenses(),
            'net': self.bm.net(),
            'margin': self.bm.profit_margin(),
            'categories': cats,
            'total_budget': self.bm.total_budget,
            'goals': [{'name':g.name,'target':g.target,'current':g.current,'icon':g.icon,'target_month':g.target_month} for g in self.goals],
            'dark': self._dark, 'lang': self._lang, 'currency': self._currency,
            'today': datetime.now().strftime('%Y-%m-%d'),
        }

    def _setup_storage(self):
        try: d = Path(self.paths.data)
        except: d = Path.home()/".budget_mobile"
        d.mkdir(parents=True,exist_ok=True)
        self._dd=d; self._sp=d/"settings.json"; self._dp=d/"data.json"

    def _load_settings(self):
        try:
            s=json.loads(self._sp.read_text("utf-8"))
            self._dark=s.get("dark",False); self._lang=s.get("lang","en"); self._currency=s.get("currency","USD")
            self._i18n.set_language(self._lang)
        except: pass

    def _save_settings(self):
        try: self._sp.write_text(json.dumps({"dark":self._dark,"lang":self._lang,"currency":self._currency}),"utf-8")
        except: pass

    def _load_data(self):
        try:
            d=json.loads(self._dp.read_text("utf-8"))
            self.bm=BudgetMonth(); self.bm.from_dict(d.get("budget",{}))
            self.goals=[Goal(**g) for g in d.get("goals",[])]
            self._year=d.get("year",self._year); self._month=d.get("month",self._month)
        except: pass

    def _save_data(self):
        try:
            self._dp.write_text(json.dumps({
                "year":self._year,"month":self._month,
                "budget":self.bm.to_dict(),
                "goals":[asdict(g) for g in self.goals]
            }, indent=2, ensure_ascii=False), "utf-8")
        except: pass


def main():
    return App("Budget Manager","com.example.budget_manager_mobile")
