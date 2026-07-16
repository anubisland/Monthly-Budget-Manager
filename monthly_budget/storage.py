from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Dict, List, Optional

from .core import BudgetMonth, Income, Expense, RecurringTransaction, TransactionRule


class Storage:
    def __init__(self, db_path: Optional[Path] = None) -> None:
        if db_path:
            self.db_dir = db_path.parent
            self.db_path = db_path
        else:
            self.db_dir = Path.home() / ".monthly_budget"
            self.db_path = self.db_dir / "budgets.db"
        self.db_dir.mkdir(parents=True, exist_ok=True)
        self._conn: Optional[sqlite3.Connection] = None
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        if self._conn is None:
            self._conn = sqlite3.connect(str(self.db_path))
            self._conn.row_factory = sqlite3.Row
            self._conn.execute("PRAGMA journal_mode=WAL")
            self._conn.execute("PRAGMA foreign_keys=ON")
        return self._conn

    def _init_db(self) -> None:
        conn = self._connect()
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS budgets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                month TEXT NOT NULL,
                budget_name TEXT NOT NULL DEFAULT 'Default',
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now')),
                UNIQUE(month, budget_name)
            );
            CREATE TABLE IF NOT EXISTS incomes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                budget_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                amount REAL NOT NULL,
                date TEXT,
                FOREIGN KEY (budget_id) REFERENCES budgets(id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS expenses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                budget_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                amount REAL NOT NULL,
                category TEXT NOT NULL DEFAULT 'Uncategorized',
                date TEXT,
                FOREIGN KEY (budget_id) REFERENCES budgets(id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS budget_limits (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                budget_id INTEGER NOT NULL,
                category TEXT NOT NULL,
                limit_amount REAL NOT NULL,
                UNIQUE(budget_id, category),
                FOREIGN KEY (budget_id) REFERENCES budgets(id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT
            );
            CREATE TABLE IF NOT EXISTS recurring_transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                category TEXT NOT NULL,
                description TEXT NOT NULL,
                amount REAL NOT NULL,
                frequency TEXT NOT NULL,
                day INTEGER NOT NULL,
                start_date TEXT NOT NULL,
                end_date TEXT,
                active INTEGER NOT NULL DEFAULT 1
            );
            CREATE TABLE IF NOT EXISTS transaction_rules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                pattern TEXT NOT NULL,
                category TEXT NOT NULL,
                enabled INTEGER NOT NULL DEFAULT 1
            );
        """)
        conn.commit()

    def close(self) -> None:
        if self._conn:
            self._conn.close()
            self._conn = None

    def save_budget(self, bm: BudgetMonth, budget_name: str = "Default") -> None:
        conn = self._connect()
        month = bm.month or "unknown"
        cur = conn.execute("SELECT id FROM budgets WHERE month = ? AND budget_name = ?",
                           (month, budget_name))
        row = cur.fetchone()
        if row:
            budget_id = row["id"]
            conn.execute("DELETE FROM incomes WHERE budget_id = ?", (budget_id,))
            conn.execute("DELETE FROM expenses WHERE budget_id = ?", (budget_id,))
            conn.execute("DELETE FROM budget_limits WHERE budget_id = ?", (budget_id,))
            conn.execute(
                "UPDATE budgets SET updated_at = datetime('now') WHERE id = ?",
                (budget_id,),
            )
        else:
            cur = conn.execute(
                "INSERT INTO budgets (month, budget_name) VALUES (?, ?)", (month, budget_name)
            )
            budget_id = cur.lastrowid

        for inc in bm.incomes:
            conn.execute(
                "INSERT INTO incomes (budget_id, name, amount, date) VALUES (?, ?, ?, ?)",
                (budget_id, inc.name, inc.amount, inc.date),
            )
        for exp in bm.expenses:
            conn.execute(
                "INSERT INTO expenses (budget_id, name, amount, category, date) VALUES (?, ?, ?, ?, ?)",
                (budget_id, exp.name, exp.amount, exp.category, exp.date),
            )
        for cat, limit in bm.budget_limits.items():
            conn.execute(
                "INSERT OR REPLACE INTO budget_limits (budget_id, category, limit_amount) VALUES (?, ?, ?)",
                (budget_id, cat, limit),
            )
        conn.commit()

    def load_budget(self, month: str, budget_name: str = "Default") -> Optional[BudgetMonth]:
        conn = self._connect()
        cur = conn.execute("SELECT id FROM budgets WHERE month = ? AND budget_name = ?",
                           (month, budget_name))
        row = cur.fetchone()
        if not row:
            return None
        budget_id = row["id"]
        bm = BudgetMonth(month=month)

        for r in conn.execute(
            "SELECT name, amount, date FROM incomes WHERE budget_id = ? ORDER BY id",
            (budget_id,),
        ):
            bm.incomes.append(Income(name=r["name"], amount=r["amount"], date=r["date"]))

        for r in conn.execute(
            "SELECT name, amount, category, date FROM expenses WHERE budget_id = ? ORDER BY id",
            (budget_id,),
        ):
            bm.expenses.append(
                Expense(name=r["name"], amount=r["amount"], category=r["category"], date=r["date"])
            )

        for r in conn.execute(
            "SELECT category, limit_amount FROM budget_limits WHERE budget_id = ?",
            (budget_id,),
        ):
            bm.budget_limits[r["category"]] = r["limit_amount"]

        return bm

    def list_months(self, budget_name: str = "Default") -> List[str]:
        conn = self._connect()
        cur = conn.execute(
            "SELECT month FROM budgets WHERE budget_name = ? ORDER BY month DESC",
            (budget_name,),
        )
        return [r["month"] for r in cur.fetchall()]

    def list_budget_names(self) -> List[str]:
        conn = self._connect()
        cur = conn.execute("SELECT DISTINCT budget_name FROM budgets ORDER BY budget_name")
        return [r["budget_name"] for r in cur.fetchall()]

    def delete_budget(self, month: str, budget_name: str = "Default") -> None:
        conn = self._connect()
        conn.execute("DELETE FROM budgets WHERE month = ? AND budget_name = ?",
                     (month, budget_name))
        conn.commit()

    def save_setting(self, key: str, value: str) -> None:
        conn = self._connect()
        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
            (key, value),
        )
        conn.commit()

    def load_setting(self, key: str) -> Optional[str]:
        conn = self._connect()
        cur = conn.execute("SELECT value FROM settings WHERE key = ?", (key,))
        row = cur.fetchone()
        return row["value"] if row else None

    def load_all_settings(self) -> Dict[str, str]:
        conn = self._connect()
        cur = conn.execute("SELECT key, value FROM settings")
        return {r["key"]: r["value"] for r in cur.fetchall()}

    def budget_exists(self, month: str, budget_name: str = "Default") -> bool:
        conn = self._connect()
        cur = conn.execute("SELECT 1 FROM budgets WHERE month = ? AND budget_name = ?",
                           (month, budget_name))
        return cur.fetchone() is not None

    # ── Recurring Transactions ──────────────────────────────────────

    def save_recurring(self, rt: RecurringTransaction) -> int:
        conn = self._connect()
        if rt.id > 0:
            conn.execute(
                "UPDATE recurring_transactions SET category=?, description=?, amount=?, "
                "frequency=?, day=?, start_date=?, end_date=?, active=? WHERE id=?",
                (rt.category, rt.description, rt.amount, rt.frequency, rt.day,
                 rt.start_date, rt.end_date, int(rt.active), rt.id),
            )
        else:
            cur = conn.execute(
                "INSERT INTO recurring_transactions (category, description, amount, frequency, day, start_date, end_date, active) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (rt.category, rt.description, rt.amount, rt.frequency, rt.day,
                 rt.start_date, rt.end_date, int(rt.active)),
            )
            rt.id = cur.lastrowid
        conn.commit()
        return rt.id

    def load_recurring(self, rt_id: int) -> Optional[RecurringTransaction]:
        conn = self._connect()
        cur = conn.execute(
            "SELECT * FROM recurring_transactions WHERE id = ?", (rt_id,)
        )
        row = cur.fetchone()
        if not row:
            return None
        return self._row_to_recurring(row)

    def list_recurring(self) -> List[RecurringTransaction]:
        conn = self._connect()
        cur = conn.execute(
            "SELECT * FROM recurring_transactions ORDER BY id"
        )
        return [self._row_to_recurring(r) for r in cur.fetchall()]

    def delete_recurring(self, rt_id: int) -> None:
        conn = self._connect()
        conn.execute("DELETE FROM recurring_transactions WHERE id = ?", (rt_id,))
        conn.commit()

    # ── Transaction Rules ───────────────────────────────────────────

    def save_rule(self, rule: TransactionRule) -> int:
        conn = self._connect()
        if rule.id > 0:
            conn.execute(
                "UPDATE transaction_rules SET pattern=?, category=?, enabled=? WHERE id=?",
                (rule.pattern, rule.category, int(rule.enabled), rule.id),
            )
        else:
            cur = conn.execute(
                "INSERT INTO transaction_rules (pattern, category, enabled) VALUES (?, ?, ?)",
                (rule.pattern, rule.category, int(rule.enabled)),
            )
            rule.id = cur.lastrowid
        conn.commit()
        return rule.id

    def load_rule(self, rule_id: int) -> Optional[TransactionRule]:
        conn = self._connect()
        cur = conn.execute("SELECT * FROM transaction_rules WHERE id = ?", (rule_id,))
        row = cur.fetchone()
        if not row:
            return None
        return TransactionRule(
            id=row["id"],
            pattern=row["pattern"],
            category=row["category"],
            enabled=bool(row["enabled"]),
        )

    def list_rules(self) -> List[TransactionRule]:
        conn = self._connect()
        cur = conn.execute("SELECT * FROM transaction_rules ORDER BY id")
        return [
            TransactionRule(
                id=r["id"], pattern=r["pattern"],
                category=r["category"], enabled=bool(r["enabled"]),
            )
            for r in cur.fetchall()
        ]

    def delete_rule(self, rule_id: int) -> None:
        conn = self._connect()
        conn.execute("DELETE FROM transaction_rules WHERE id = ?", (rule_id,))
        conn.commit()

    @staticmethod
    def _row_to_recurring(row) -> RecurringTransaction:
        return RecurringTransaction(
            id=row["id"],
            category=row["category"],
            description=row["description"],
            amount=row["amount"],
            frequency=row["frequency"],
            day=row["day"],
            start_date=row["start_date"],
            end_date=row["end_date"],
            active=bool(row["active"]),
        )
