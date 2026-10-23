"""Synthetic financial fixtures; never opens real bot or financial data."""
import importlib.util
import tempfile
import unittest
from datetime import date
from pathlib import Path

script = Path(__file__).resolve().parents[1] / "skill-packages/dangdang/finance-management/scripts/summarize_ledger.py"
spec = importlib.util.spec_from_file_location("ledger", script)
ledger = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ledger)


class LedgerTests(unittest.TestCase):
    def run_csv(self, rows, **kwargs):
        with tempfile.TemporaryDirectory() as folder:
            file = Path(folder) / "synthetic.csv"
            text = "id,date,currency,amount,category\n" + rows
            file.write_text(text, encoding="utf-8-sig")
            result = ledger.summarize(file, **kwargs)
            self.assertEqual(file.read_text(encoding="utf-8-sig"), text)
            return result

    def test_decimal_currency_refund_and_date_filter(self):
        result = self.run_csv("1,2026-10-01,CNY,0.10,sales\n2,2026-10-02,CNY,0.20,sales\n3,2026-10-03,CNY,-0.10,refund\n4,2026-10-01,USD,8,sales\n5,2026-09-01,CNY,100,sales\n", start=date(2026, 10, 1))
        self.assertEqual(result["CNY"]["net"], "0.20")
        self.assertEqual(result["CNY"]["inflow"], "0.30")
        self.assertEqual(result["CNY"]["outflow"], "0.10")
        self.assertEqual(result["CNY"]["rows"], 3)
        self.assertEqual(result["USD"]["net"], "8")

    def test_duplicate_id_rejected(self):
        with self.assertRaisesRegex(ValueError, "duplicate id"):
            self.run_csv("1,2026-10-01,CNY,1,sales\n1,2026-10-02,CNY,2,sales\n")

    def test_invalid_values_rejected(self):
        for row in ["1,2026-10-01,CNY,NaN,sales\n", "1,2026-10-01,CNY,1e4,sales\n", "1,2026-02-30,CNY,1,sales\n", "1,2026-10-01,cny,1,sales\n", "1,2026-10-01,CNY,1,\n", "1,2026-10-01,CNY,0.123456789,sales\n"]:
            with self.subTest(row=row), self.assertRaises(ValueError):
                self.run_csv(row)

    def test_invalid_outside_period_is_not_silently_dropped(self):
        with self.assertRaises(ValueError):
            self.run_csv("1,2026-09-01,CNY,NaN,sales\n", start=date(2026, 10, 1))

    def test_malformed_row_rejected(self):
        with self.assertRaisesRegex(ValueError, "malformed"):
            self.run_csv("1,2026-10-01,CNY,1,sales,extra\n")

    def test_empty_and_reversed_range(self):
        self.assertEqual(self.run_csv(""), {})
        with self.assertRaisesRegex(ValueError, "start"):
            self.run_csv("", start=date(2026, 10, 2), end=date(2026, 10, 1))


if __name__ == "__main__":
    unittest.main()
