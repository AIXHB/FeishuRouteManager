"""Read-only, exact-decimal cash ledger summary. Python standard library only."""
import argparse
import csv
import json
import re
from datetime import date
from decimal import Decimal, localcontext


def summarize(filename, start=None, end=None):
    if start and end and start > end:
        raise ValueError("start must be on or before end")
    totals, seen = {}, set()
    with localcontext() as ctx, open(filename, encoding="utf-8-sig", newline="") as stream:
        # Up to 18 integral + 8 fractional digits, at most 100,000 rows.
        ctx.prec = 40
        reader = csv.DictReader(stream)
        fields = reader.fieldnames or []
        if len(fields) != len(set(fields)) or not {"id", "date", "currency", "amount", "category"} <= set(fields):
            raise ValueError("missing or duplicate CSV columns")
        for index, row in enumerate(reader, 1):
            if index > 100000:
                raise ValueError("ledger exceeds 100000 rows")
            if None in row or any(value is None for value in row.values()):
                raise ValueError(f"row {index}: malformed CSV row")
            key = row["id"].strip()
            if not key or key in seen:
                raise ValueError(f"row {index}: missing or duplicate id")
            seen.add(key)
            raw_date = row["date"].strip()
            if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", raw_date):
                raise ValueError(f"row {index}: expected YYYY-MM-DD")
            day = date.fromisoformat(raw_date)
            currency, category = row["currency"].strip(), row["category"].strip()
            if not re.fullmatch(r"[A-Z]{3}", currency) or not category:
                raise ValueError(f"row {index}: invalid currency or empty category")
            amount = row["amount"].strip()
            if not re.fullmatch(r"[+-]?\d{1,18}(?:\.\d{1,8})?", amount):
                raise ValueError(f"row {index}: invalid decimal amount")
            value = Decimal(amount)
            # Validate all rows, including those outside the requested period.
            if (start and day < start) or (end and day > end):
                continue
            bucket = totals.setdefault(currency, {"rows": 0, "inflow": Decimal(0), "outflow": Decimal(0), "net": Decimal(0), "categories": {}})
            bucket["rows"] += 1
            bucket["inflow" if value >= 0 else "outflow"] += abs(value)
            bucket["net"] += value
            bucket["categories"][category] = bucket["categories"].get(category, Decimal(0)) + value
        return json.loads(json.dumps(totals, default=lambda v: format(v, "f")))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("csv")
    parser.add_argument("--start", type=date.fromisoformat)
    parser.add_argument("--end", type=date.fromisoformat)
    args = parser.parse_args()
    try:
        print(json.dumps(summarize(args.csv, args.start, args.end), ensure_ascii=False, indent=2))
    except (ValueError, OSError, csv.Error) as error:
        parser.exit(2, f"Invalid ledger: {error}\n")
