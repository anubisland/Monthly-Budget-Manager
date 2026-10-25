"""Find one entry among every month the app has kept.

The app shows one month at a time, which is the right default — a budget is a
month. But "how much was that fridge?" is a question about the year, and the
only way to answer it was to walk the months with the arrows and remember what
you saw.

Matching is a case-insensitive substring over the description, the category,
and the category's Arabic name, because the same purchase can be remembered
either way: the screen says «طعام» while the file says ``Food``.

Nothing is scored or ranked. The newest match is what is being looked for in
almost every case, and a relevance number would be a guess dressed as an
answer. So the result is a plain list, newest first, and the caller is told
when there were more matches than fit.
"""

from __future__ import annotations

from typing import Dict, List, Optional

#: Results are capped. Four hundred hits is not a search, it is the whole file;
#: the screen shows the newest and says how many were left out.
DEFAULT_LIMIT = 60

#: The Arabic category names the screen shows, so a search for «طعام» finds the
#: expenses stored as ``Food``. This mirrors ``CAT_TRANS.ar`` in the page, and a
#: test holds the two together — the category label is a UI string, but the
#: stored value is not, and searching should not require knowing the difference.
AR_CATEGORY = {
    "Food": "طعام",
    "Rent": "إيجار",
    "Fuel": "وقود",
    "Electricity": "كهرباء",
    "Internet": "إنترنت",
    "Water": "مياه",
    "Transport": "مواصلات",
    "Healthcare": "رعاية صحية",
    "Entertainment": "ترفيه",
    "Education": "تعليم",
    "Clothing": "ملابس",
    "Savings": "ادخار",
    "Debt": "ديون",
    "Subscriptions": "اشتراكات",
    "Gifts": "هدايا",
    "Misc": "متنوعات",
    "Uncategorized": "بدون تصنيف",
}


def _haystack(name: str, category: str) -> str:
    parts = [name or "", category or "", AR_CATEGORY.get(category, "")]
    return " ".join(parts).lower()


def find(
    months: Dict[str, object],
    query: str,
    limit: int = DEFAULT_LIMIT,
) -> Dict[str, object]:
    """Every entry whose text contains ``query``, newest first.

    Returns ``{"rows": [...], "total": n, "shown": m}`` so the screen can say
    "showing 60 of 214" rather than silently truncating.
    """
    needle = (query or "").strip().lower()
    if not needle:
        return {"rows": [], "total": 0, "shown": 0}

    rows: List[Dict[str, object]] = []
    for month_key in sorted(months, reverse=True):
        budget = months[month_key]
        for item in getattr(budget, "incomes", []):
            if needle in _haystack(getattr(item, "name", ""), ""):
                rows.append({
                    "month": month_key,
                    "kind": "income",
                    "name": item.name,
                    "category": "",
                    "amount": item.amount,
                    "date": item.date or "",
                })
        for item in getattr(budget, "expenses", []):
            if needle in _haystack(getattr(item, "name", ""), getattr(item, "category", "")):
                rows.append({
                    "month": month_key,
                    "kind": "expense",
                    "name": item.name,
                    "category": item.category,
                    "amount": item.amount,
                    "date": item.date or "",
                })

    # Newest first, by date, and the month as the tie-break — a month key sorts
    # correctly as text, which is why it is stored in that form.
    rows.sort(key=lambda r: (str(r["date"]), str(r["month"])), reverse=True)
    return limited(rows, limit)


def limited(rows: List[Dict[str, object]], limit: int = DEFAULT_LIMIT) -> Dict[str, object]:
    """Shape an already-built list like :func:`find`'s result."""
    total = len(rows)
    return {"rows": rows[:limit], "total": total, "shown": min(total, limit)}


def parse_query(raw: object, limit: int = DEFAULT_LIMIT) -> Optional[str]:
    """The query text, or None when nothing usable was sent.

    Deliberately permissive: a search box is typed into, so a single character
    is a legitimate query and the only thing worth refusing is nothing at all.
    """
    if not isinstance(raw, str):
        return None
    text = raw.strip()
    if not text:
        return None
    return text[:80]
