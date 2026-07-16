from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Dict, List, Optional

from .core import BudgetMonth, Income, Expense


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
                month TEXT UNIQUE NOT NULL,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
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
        """)
        conn.commit()

    def close(self) -> None:
        if self._conn:
            self._conn.close()
            self._conn = None

    def save_budget(self, bm: BudgetMonth) -> None:
        conn = self._connect()
        month = bm.month or "unknown"
        cur = conn.execute("SELECT id FROM budgets WHERE month = ?", (month,))
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
                "INSERT INTO budgets (month) VALUES (?)", (month,)
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

    def load_budget(self, month: str) -> Optional[BudgetMonth]:
        conn = self._connect()
        cur = conn.execute("SELECT id FROM budgets WHERE month = ?", (month,))
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

    def list_months(self) -> List[str]:
        conn = self._connect()
        cur = conn.execute("SELECT month FROM budgets ORDER BY month DESC")
        return [r["month"] for r in cur.fetchall()]

    def delete_budget(self, month: str) -> None:
        conn = self._connect()
        conn.execute("DELETE FROM budgets WHERE month = ?", (month,))
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

    def budget_exists(self, month: str) -> bool:
        conn = self._connect()
        cur = conn.execute("SELECT 1 FROM budgets WHERE month = ?", (month,))
        return cur.fetchone() is not None
