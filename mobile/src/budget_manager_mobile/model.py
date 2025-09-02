from collections import defaultdict


def parse_amount(value: str) -> float:
    try:
        if value is None:
            return 0.0
        return float(str(value).strip())
    except Exception:
        return 0.0


def totals(incomes, expenses):
    inc_total = sum(parse_amount(r.get("amount", 0)) for r in incomes)
    exp_total = sum(parse_amount(r.get("amount", 0)) for r in expenses)
    profit = inc_total - exp_total
    margin = (profit / inc_total * 100.0) if inc_total > 0 else 0.0
    return {
        "income_total": inc_total,
        "expense_total": exp_total,
        "profit": profit,
        "profit_margin": margin,
    }


def expenses_by_category(expenses):
    by_cat = defaultdict(float)
    for r in expenses:
        cat = (r.get("category") or "Uncategorized").strip() or "Uncategorized"
        by_cat[cat] += parse_amount(r.get("amount", 0))
    total = sum(by_cat.values()) or 1.0
    result = []
    for cat, amt in sorted(by_cat.items(), key=lambda kv: (-kv[1], kv[0])):
        pct = (amt / total) * 100.0
        result.append({"category": cat, "amount": amt, "percent": pct})
    return result
